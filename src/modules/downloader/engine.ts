import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveBinary } from '@/lib/capabilities';
import { AppError } from '@/lib/errors';
import { MAX_DOWNLOAD_BYTES, formatBytes } from '@/lib/limits';
import { logger } from '@/lib/logger';
import { run } from '@/lib/subprocess';
import { withWorkspace } from '@/lib/tempfiles';
import type { Detection } from './platforms';

/**
 * Extraction-engine adapter.
 *
 * The downloader intentionally does NOT implement per-platform scraping itself.
 * Re-implementing four platforms' private endpoints would break constantly and
 * would be dishonest to ship as "supported". Instead this wraps yt-dlp, which is
 * the maintained tool for the job, and the whole module reports itself as
 * unavailable — loudly, in the UI and the API — when yt-dlp is not installed.
 */

export interface EngineStatus {
  id: 'yt-dlp';
  available: boolean;
  version?: string;
  installHint: string;
  /** Whether merged high-quality video and MP3 audio are possible. */
  ffmpegAvailable: boolean;
}

export async function engineStatus(): Promise<EngineStatus> {
  const [ytdlp, ffmpeg] = await Promise.all([resolveBinary('ytdlp'), resolveBinary('ffmpeg')]);
  return {
    id: 'yt-dlp',
    available: Boolean(ytdlp.bin),
    version: ytdlp.version,
    installHint: 'pipx install yt-dlp  (or: python3 -m pip install --user yt-dlp), then restart the server.',
    ffmpegAvailable: Boolean(ffmpeg.bin),
  };
}

export interface MediaFormat {
  id: string;
  ext: string;
  label: string;
  resolution?: string;
  filesize?: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

export interface MediaInfo {
  title: string;
  uploader?: string;
  durationSeconds?: number;
  thumbnail?: string;
  isLive: boolean;
  formats: MediaFormat[];
}

interface RawFormat {
  format_id?: string;
  ext?: string;
  format_note?: string;
  resolution?: string;
  height?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesize_approx?: number;
  tbr?: number;
}

function toFormat(raw: RawFormat): MediaFormat | null {
  if (!raw.format_id) return null;
  const hasVideo = Boolean(raw.vcodec && raw.vcodec !== 'none');
  const hasAudio = Boolean(raw.acodec && raw.acodec !== 'none');
  if (!hasVideo && !hasAudio) return null;
  const resolution = raw.resolution ?? (raw.height ? `${raw.height}p` : undefined);
  const kind = hasVideo && hasAudio ? 'video+audio' : hasVideo ? 'video only' : 'audio only';
  const bitrate = raw.tbr ? `${Math.round(raw.tbr)}kbps` : undefined;
  const size = raw.filesize ?? raw.filesize_approx;
  return {
    id: raw.format_id,
    ext: raw.ext ?? 'bin',
    resolution,
    filesize: size,
    hasVideo,
    hasAudio,
    label: [raw.ext?.toUpperCase(), resolution, raw.format_note, bitrate, kind, size ? formatBytes(size) : undefined]
      .filter(Boolean)
      .join(' · '),
  };
}

async function ytdlpBinary(): Promise<string> {
  const { bin } = await resolveBinary('ytdlp');
  if (!bin) {
    throw new AppError('DEPENDENCY_MISSING', 'The extraction engine (yt-dlp) is not installed on this server.', {
      hint:
        'Install it with: pipx install yt-dlp — then restart the app. Until then the downloader can detect and ' +
        'explain URLs but cannot fetch media, and it will not pretend otherwise.',
    });
  }
  return bin;
}

/** Baseline flags applied to every invocation. */
function baseArgs(): string[] {
  return ['--no-playlist', '--no-warnings', '--no-progress', '--socket-timeout', '20', '--retries', '2'];
}

export async function probeMedia(detection: Detection): Promise<MediaInfo> {
  const bin = await ytdlpBinary();
  const url = detection.canonicalUrl!;
  const result = await run(bin, [...baseArgs(), '--dump-single-json', url], { timeoutMs: 60_000 });

  if (result.code !== 0) {
    logger.warn('downloader.probe_failed', { url, code: result.code, stderr: result.stderr.slice(0, 500) });
    throw new AppError('UPSTREAM_BLOCKED', 'The extraction engine could not read that URL.', {
      hint: firstUsefulLine(result.stderr) ?? 'The platform may have blocked the request, or the media may be private or removed.',
    });
  }

  let data: {
    title?: string;
    uploader?: string;
    duration?: number;
    thumbnail?: string;
    is_live?: boolean;
    formats?: RawFormat[];
  };
  try {
    data = JSON.parse(result.stdout);
  } catch {
    throw new AppError('INTERNAL', 'The extraction engine returned output this app could not read.');
  }

  const formats = (data.formats ?? []).map(toFormat).filter((f): f is MediaFormat => f !== null);
  return {
    title: data.title ?? 'Untitled',
    uploader: data.uploader,
    durationSeconds: data.duration,
    thumbnail: data.thumbnail,
    isLive: Boolean(data.is_live),
    formats,
  };
}

export type DownloadMode = 'video' | 'audio';

export interface DownloadResult {
  bytes: Buffer;
  filename: string;
  contentType: string;
}

const CONTENT_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  opus: 'audio/opus',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  jpg: 'image/jpeg',
  png: 'image/png',
};

export async function downloadMedia(
  detection: Detection,
  options: { mode: DownloadMode; formatId?: string },
): Promise<DownloadResult> {
  const bin = await ytdlpBinary();
  const { ffmpegAvailable } = await engineStatus();
  const url = detection.canonicalUrl!;

  return withWorkspace('download', async (ws) => {
    const template = path.join(ws.dir, 'media.%(ext)s');
    const args = [...baseArgs(), '-o', template];

    if (options.formatId) {
      args.push('-f', options.formatId);
    } else if (options.mode === 'audio') {
      args.push('-f', 'bestaudio/best');
      if (ffmpegAvailable) args.push('--extract-audio', '--audio-format', 'mp3');
    } else {
      // Without ffmpeg only a pre-muxed stream is usable, so ask for one explicitly.
      args.push('-f', ffmpegAvailable ? 'bv*+ba/b' : 'b[acodec!=none][vcodec!=none]/b');
    }

    args.push('--max-filesize', String(MAX_DOWNLOAD_BYTES), url);

    const result = await run(bin, args, { timeoutMs: 600_000 });
    if (result.code !== 0) {
      logger.warn('downloader.fetch_failed', { url, code: result.code, stderr: result.stderr.slice(0, 500) });
      throw new AppError('UPSTREAM_BLOCKED', 'The download did not complete.', {
        hint: firstUsefulLine(result.stderr) ?? 'The platform refused the request or the media is unavailable.',
      });
    }

    const produced = (await fs.readdir(ws.dir)).filter((name) => name.startsWith('media.'));
    if (produced.length === 0) {
      throw new AppError('UPSTREAM_BLOCKED', 'Nothing was downloaded.', {
        hint:
          result.stdout.includes('max-filesize') || result.stderr.includes('max-filesize')
            ? `The media is larger than the ${formatBytes(MAX_DOWNLOAD_BYTES)} cap. Raise UUP_MAX_DOWNLOAD_MB to allow it.`
            : 'The engine reported success but wrote no file. Try a different format.',
      });
    }

    const file = path.join(ws.dir, produced[0]!);
    const stat = await fs.stat(file);
    if (stat.size > MAX_DOWNLOAD_BYTES) {
      throw new AppError('TOO_LARGE', `That file is ${formatBytes(stat.size)}, over the ${formatBytes(MAX_DOWNLOAD_BYTES)} limit.`);
    }

    const ext = produced[0]!.split('.').pop()?.toLowerCase() ?? 'bin';
    return {
      bytes: await fs.readFile(file),
      filename: produced[0]!,
      contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream',
    };
  });
}

/** Surface the engine's own explanation rather than a generic message. */
function firstUsefulLine(stderr: string): string | null {
  const line = stderr
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('ERROR:') || l.includes('Unsupported URL') || l.includes('Sign in'));
  return line ? line.replace(/^ERROR:\s*/, '').slice(0, 300) : null;
}
