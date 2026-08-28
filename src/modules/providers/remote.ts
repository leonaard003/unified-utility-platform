import { AppError } from '@/lib/errors';
import { MAX_DOWNLOAD_BYTES, formatBytes } from '@/lib/limits';
import { logger } from '@/lib/logger';
import { parseHttpUrl, sanitizeFilename } from '@/lib/validate';

/**
 * Fetch a media URL handed back by a download provider.
 *
 * Provider-supplied URLs are untrusted input, so they go through the same
 * `parseHttpUrl` guard as user input (blocking private/loopback hosts) and the
 * same `MAX_DOWNLOAD_BYTES` cap as the local downloader. The body is read
 * incrementally and abandoned the moment it crosses the cap, so an oversized or
 * endless stream cannot fill the box.
 */

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/wav': 'wav',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

function filenameFrom(url: URL, contentType: string, disposition: string | null, fallbackBase: string): string {
  const fromDisposition = disposition ? /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1] : undefined;
  const fromPath = url.pathname.split('/').filter(Boolean).pop();
  const candidate = fromDisposition ? decodeURIComponent(fromDisposition) : fromPath;
  const cleaned = sanitizeFilename(candidate || fallbackBase, fallbackBase);
  if (/\.[A-Za-z0-9]{2,5}$/.test(cleaned)) return cleaned;
  const ext = EXT_BY_CONTENT_TYPE[contentType.split(';')[0]!.trim().toLowerCase()] ?? 'bin';
  return `${cleaned}.${ext}`;
}

export interface RemoteMedia {
  bytes: Buffer;
  filename: string;
  contentType: string;
}

export async function fetchRemoteMedia(
  rawUrl: string,
  options: { fallbackBase?: string; timeoutMs?: number; maxBytes?: number } = {},
): Promise<RemoteMedia> {
  const url = parseHttpUrl(rawUrl, 'provider media URL');
  const maxBytes = options.maxBytes ?? MAX_DOWNLOAD_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 300_000);

  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', redirect: 'follow' });
    if (!response.ok) {
      throw new AppError('UPSTREAM_BLOCKED', `The provider's media URL answered HTTP ${response.status}.`, {
        hint: 'Provider links are usually short-lived. Try again, or let the local pipeline handle it.',
      });
    }

    const declared = Number(response.headers.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new AppError('TOO_LARGE', `That media is ${formatBytes(declared)}, over the ${formatBytes(maxBytes)} limit.`, {
        hint: 'Raise UUP_MAX_DOWNLOAD_MB on the server to allow it.',
      });
    }

    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    const reader = response.body?.getReader();
    if (!reader) throw new AppError('UPSTREAM_BLOCKED', 'The provider returned a media URL with no body.');

    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AppError('TOO_LARGE', `That media is over the ${formatBytes(maxBytes)} limit.`, {
          hint: 'Raise UUP_MAX_DOWNLOAD_MB on the server to allow it.',
        });
      }
      chunks.push(value);
    }

    if (total === 0) throw new AppError('UPSTREAM_BLOCKED', 'The provider media URL returned an empty file.');

    logger.info('providers.remote_media_fetched', { host: url.hostname, bytes: total, contentType });
    return {
      bytes: Buffer.concat(chunks),
      filename: filenameFrom(url, contentType, response.headers.get('content-disposition'), options.fallbackBase ?? 'media'),
      contentType: contentType.split(';')[0]!.trim() || 'application/octet-stream',
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AppError('TIMEOUT', 'The provider media download did not finish in time.');
    }
    throw new AppError('UPSTREAM_BLOCKED', 'Could not download the media the provider pointed at.', {
      hint: err instanceof Error ? err.message : undefined,
    });
  } finally {
    clearTimeout(timer);
  }
}
