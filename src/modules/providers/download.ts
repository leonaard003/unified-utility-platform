import { logger } from '@/lib/logger';
import { runActorForItems } from './apify';
import { buildActorInput, featureAvailability, providerConfig } from './config';
import { readMediaInfo } from './metadata';
import { fetchRemoteMedia } from './remote';
import type { DownloadAdapter, DownloadRequest, ProviderMediaFormat } from './types';

/**
 * Download providers.
 *
 * Primary: `agentx/all-video-scraper`, per docs/provider-priority-matrix.md.
 * The actor returns media URLs; this adapter picks the right one, then streams
 * it through `fetchRemoteMedia` under the same size cap as the local path.
 *
 * Audio-only requests are handed back to the local pipeline unless the provider
 * genuinely offers an audio-only file: this layer has no transcoder, and
 * relabelling an MP4 as audio would be a lie the browser would then have to
 * play.
 */

function pickFormat(formats: ProviderMediaFormat[], request: DownloadRequest): ProviderMediaFormat | null {
  const withUrl = formats.filter((format) => Boolean(format.url));
  if (withUrl.length === 0) return null;

  if (request.formatId) {
    const exact = withUrl.find((format) => format.id === request.formatId);
    if (exact) return exact;
    // The id came from this provider's own probe; if it is gone, the run is
    // stale — fall through to the mode-based choice rather than guessing wrong.
    logger.warn('providers.download_format_missing', { formatId: request.formatId, available: withUrl.length });
  }

  if (request.mode === 'audio') {
    return withUrl.find((format) => format.hasAudio && !format.hasVideo) ?? null;
  }

  const largest = (candidates: ProviderMediaFormat[]) =>
    [...candidates].sort((a, b) => (b.filesize ?? 0) - (a.filesize ?? 0))[0] ?? null;

  const muxed = withUrl.filter((format) => format.hasVideo && format.hasAudio);
  return largest(muxed.length > 0 ? muxed : withUrl.filter((format) => format.hasVideo));
}

export function downloadAdapters(): DownloadAdapter[] {
  const config = providerConfig();
  const availability = featureAvailability('download', config);
  const actor = availability.actor;

  return [
    {
      id: actor,
      label: `External download provider (${actor})`,
      feature: 'download',
      supports(request: DownloadRequest) {
        if (!availability.enabled) return availability.reason;
        if (!request.detection.matched || !request.detection.canonicalUrl) {
          return 'The URL was not recognised as a single media page.';
        }
        if (request.cookiesText) {
          return 'A cookies file was supplied, which only the local engine can use.';
        }
        return true;
      },
      async run(request: DownloadRequest) {
        const url = request.detection.canonicalUrl!;
        const input = buildActorInput('download', { videoUrl: url, url }, { url, mode: request.mode });
        const items = await runActorForItems(actor, input);
        const info = readMediaInfo(items, actor, { detection: request.detection });
        if (!info) return null;

        const format = pickFormat(info.formats, request);
        if (!format?.url) {
          logger.warn('providers.download_no_usable_url', { actor, mode: request.mode, formats: info.formats.length });
          return null;
        }

        const base = (info.title || request.detection.mediaId || 'media').replace(/[^\w.-]+/g, '_').slice(0, 80);
        const media = await fetchRemoteMedia(format.url, { fallbackBase: base || 'media' });
        return {
          provider: actor,
          filename: media.filename,
          contentType: media.contentType,
          bytes: media.bytes,
        };
      },
    },
  ];
}
