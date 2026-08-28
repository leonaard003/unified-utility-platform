import { formatBytes } from '@/lib/limits';
import { logger } from '@/lib/logger';
import { runActorForItems } from './apify';
import { buildActorInput, featureAvailability, providerConfig } from './config';
import { isRecord, pickArray, pickBoolean, pickNumber, pickString, pickUrl } from './normalize';
import type { MediaInfoAdapter, MediaInfoRequest, ProviderMediaFormat, ProviderMediaInfoResult } from './types';

/**
 * Metadata / quality providers.
 *
 * Primary: `scrapearchitect/youtube-video-formats-scraper` for YouTube quality
 * listings; `agentx/all-video-scraper` is the general metadata fallback for the
 * other platforms, per docs/provider-priority-matrix.md. A local yt-dlp probe
 * remains the final fallback and is run by the router.
 */

const FORMAT_ARRAY_KEYS = ['formats', 'videoFormats', 'streams', 'medias', 'media', 'downloads', 'qualities', 'videos', 'items', 'data'];
const URL_KEYS = ['url', 'downloadUrl', 'download_url', 'videoUrl', 'video_url', 'mediaUrl', 'media_url', 'link', 'src'];
const TITLE_KEYS = ['title', 'videoTitle', 'name', 'caption'];
const UPLOADER_KEYS = ['uploader', 'author', 'channel', 'channelName', 'ownerUsername', 'username'];
const THUMB_KEYS = ['thumbnail', 'thumbnailUrl', 'thumb', 'cover', 'coverUrl', 'displayUrl'];
const DURATION_KEYS = ['duration', 'durationSeconds', 'lengthSeconds', 'videoDuration'];

const VIDEO_EXTS = new Set(['mp4', 'webm', 'mkv', 'mov', 'm4v', 'avi']);
const AUDIO_EXTS = new Set(['mp3', 'm4a', 'aac', 'opus', 'ogg', 'wav', 'flac']);

function extFrom(row: unknown, mime: string | undefined, url: string | undefined): string | undefined {
  const explicit = pickString(row, ['ext', 'extension', 'container', 'fileType', 'format']);
  if (explicit && /^[A-Za-z0-9]{2,5}$/.test(explicit)) return explicit.toLowerCase();
  if (mime) {
    const subtype = mime.split(';')[0]!.split('/')[1]?.trim().toLowerCase();
    if (subtype && /^[a-z0-9]{2,5}$/.test(subtype)) return subtype === 'mpeg' ? 'mp3' : subtype;
  }
  if (url) {
    const match = /\.([A-Za-z0-9]{2,5})(?:\?|$)/.exec(url);
    if (match) return match[1]!.toLowerCase();
  }
  return undefined;
}

function resolutionFrom(row: unknown): string | undefined {
  const explicit = pickString(row, ['resolution', 'qualityLabel', 'quality', 'definition', 'label']);
  if (explicit) return explicit;
  const height = pickNumber(row, ['height', 'videoHeight']);
  return height ? `${height}p` : undefined;
}

/**
 * Decide what a format actually contains. Codec/mime evidence first, extension
 * second; when nothing says either way, treat it as a playable video+audio file
 * (what these scrapers overwhelmingly return) — and never claim audio-only on a
 * guess, because the download path relies on that distinction.
 */
function tracksIn(row: unknown, mime: string | undefined, ext: string | undefined): { hasVideo: boolean; hasAudio: boolean } {
  const explicitVideo = pickBoolean(row, ['hasVideo', 'has_video', 'isVideo']);
  const explicitAudio = pickBoolean(row, ['hasAudio', 'has_audio', 'isAudio', 'audioOnly']);
  if (explicitVideo !== undefined || explicitAudio !== undefined) {
    return { hasVideo: explicitVideo ?? !explicitAudio, hasAudio: explicitAudio ?? true };
  }

  const vcodec = pickString(row, ['vcodec', 'videoCodec']);
  const acodec = pickString(row, ['acodec', 'audioCodec']);
  if (vcodec || acodec) {
    return { hasVideo: Boolean(vcodec && vcodec !== 'none'), hasAudio: Boolean(acodec && acodec !== 'none') };
  }

  const kind = (mime ?? '').split('/')[0]?.toLowerCase();
  if (kind === 'audio' || (ext && AUDIO_EXTS.has(ext))) return { hasVideo: false, hasAudio: true };
  if (kind === 'video' || (ext && VIDEO_EXTS.has(ext))) return { hasVideo: true, hasAudio: true };
  return { hasVideo: true, hasAudio: true };
}

export function normaliseFormats(rows: unknown[]): ProviderMediaFormat[] {
  const formats: ProviderMediaFormat[] = [];

  rows.forEach((row, index) => {
    if (!isRecord(row)) return;
    const url = pickUrl(row, URL_KEYS);
    const mime = pickString(row, ['mimeType', 'mime_type', 'contentType', 'type']);
    const ext = extFrom(row, mime, url);
    const resolution = resolutionFrom(row);
    const id = pickString(row, ['formatId', 'format_id', 'itag', 'id', 'quality', 'qualityLabel']) ?? String(index + 1);
    if (!url && !resolution && !pickString(row, ['formatId', 'format_id', 'itag'])) return;

    const { hasVideo, hasAudio } = tracksIn(row, mime, ext);
    const filesize = pickNumber(row, ['filesize', 'fileSize', 'contentLength', 'size', 'filesize_approx']);
    const kind = hasVideo && hasAudio ? 'video+audio' : hasVideo ? 'video only' : 'audio only';

    formats.push({
      id,
      url,
      ext,
      resolution,
      filesize,
      hasVideo,
      hasAudio,
      label: [ext?.toUpperCase(), resolution, kind, filesize ? formatBytes(filesize) : undefined].filter(Boolean).join(' · '),
    });
  });

  return formats;
}

/** Pull a media info result out of an actor's dataset rows, or null if there is nothing real in them. */
export function readMediaInfo(items: unknown[], provider: string, request: MediaInfoRequest): ProviderMediaInfoResult | null {
  if (items.length === 0) return null;
  const first = items[0];

  const rows = pickArray(first, FORMAT_ARRAY_KEYS) ?? items;
  let formats = normaliseFormats(rows);
  // Providers that return one playable file per row expose it at the top level.
  if (formats.length === 0) formats = normaliseFormats([first]);

  if (formats.length === 0) {
    logger.warn('providers.metadata_unusable_payload', {
      provider,
      items: items.length,
      keys: isRecord(first) ? Object.keys(first).slice(0, 20) : typeof first,
    });
    return null;
  }

  return {
    provider,
    platform: request.detection.platform?.label,
    sourceUrl: request.detection.canonicalUrl ?? '',
    title: pickString(first, TITLE_KEYS),
    uploader: pickString(first, UPLOADER_KEYS),
    thumbnail: pickUrl(first, THUMB_KEYS),
    durationSeconds: pickNumber(first, DURATION_KEYS),
    isLive: pickBoolean(first, ['isLive', 'is_live', 'live']) ?? false,
    formats,
  };
}

function metadataAdapter(actor: string, options: { youtubeOnly: boolean; enabled: boolean; disabledReason: string }): MediaInfoAdapter {
  return {
    id: actor,
    label: `External metadata provider (${actor})`,
    feature: 'metadata',
    supports(request: MediaInfoRequest) {
      if (!options.enabled) return options.disabledReason;
      if (!request.detection.matched || !request.detection.canonicalUrl) return 'The URL was not recognised as a single media page.';
      if (options.youtubeOnly && request.detection.platform?.id !== 'youtube') {
        return `${actor} only covers YouTube URLs.`;
      }
      return true;
    },
    async run(request: MediaInfoRequest) {
      const url = request.detection.canonicalUrl!;
      const input = buildActorInput('metadata', { videoUrl: url, url }, { url });
      return readMediaInfo(await runActorForItems(actor, input), actor, request);
    },
  };
}

export function mediaInfoAdapters(): MediaInfoAdapter[] {
  const config = providerConfig();
  const metadata = featureAvailability('metadata', config);
  const download = featureAvailability('download', config);

  const adapters: MediaInfoAdapter[] = [
    metadataAdapter(metadata.actor, {
      // The default primary is YouTube-specific; a general actor configured via
      // UUP_METADATA_PROVIDER_PRIMARY is used for every platform.
      youtubeOnly: /youtube/i.test(metadata.actor),
      enabled: metadata.enabled,
      disabledReason: metadata.reason,
    }),
  ];

  // General metadata fallback: the multi-platform download provider also
  // reports titles and formats.
  if (download.actor !== metadata.actor) {
    adapters.push(
      metadataAdapter(download.actor, { youtubeOnly: false, enabled: download.enabled, disabledReason: download.reason }),
    );
  }

  return adapters;
}
