import type { TranscriptSegment } from '@/modules/transcript/youtube';
import type { Detection } from '@/modules/downloader/platforms';

/**
 * Shared vocabulary for the external-provider layer.
 *
 * Everything below is a *normalised* shape: each adapter is responsible for
 * turning whatever its upstream API returns into one of these. Nothing in the
 * app outside `src/modules/providers` should ever see a raw provider payload.
 *
 * Two rules the whole layer obeys:
 *  1. An adapter that cannot produce real data returns `null` or throws. It
 *     never invents segments, formats, titles or URLs.
 *  2. Every routed result carries its provenance (`source`, `provider`,
 *     `attempts`) so the API and the UI can say honestly where the data came
 *     from — an external provider or the local pipeline.
 */

export type ProviderFeature = 'transcript' | 'download' | 'metadata';

/** Where a routed result ultimately came from. */
export type ResultSource = 'provider' | 'local';

export interface ProviderTranscriptResult {
  provider: string;
  platform?: string;
  sourceUrl: string;
  title?: string;
  language?: string;
  /** False when the upstream returned text without usable timings. */
  hasTimings: boolean;
  segments: TranscriptSegment[];
}

export interface ProviderMediaFormat {
  id: string;
  label: string;
  ext?: string;
  resolution?: string;
  filesize?: number;
  hasVideo: boolean;
  hasAudio: boolean;
  /** Direct media URL when the provider exposes one; used by the download path. */
  url?: string;
}

export interface ProviderMediaInfoResult {
  provider: string;
  platform?: string;
  sourceUrl: string;
  title?: string;
  uploader?: string;
  thumbnail?: string;
  durationSeconds?: number;
  isLive: boolean;
  formats: ProviderMediaFormat[];
}

export interface ProviderDownloadResult {
  provider: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
}

export interface TranscriptRequest {
  url: string;
  detection: Detection;
  languageHint?: string;
}

export interface MediaInfoRequest {
  detection: Detection;
  cookiesText?: string;
}

export type DownloadMode = 'video' | 'audio';

export interface DownloadRequest {
  detection: Detection;
  mode: DownloadMode;
  /** Provider-native format id (already stripped of the `provider:` prefix). */
  formatId?: string;
  cookiesText?: string;
}

/**
 * One entry per adapter the router considered, successful or not. Surfaced in
 * API responses so a failure is explainable without reading server logs.
 */
export interface ProviderAttempt {
  provider: string;
  feature: ProviderFeature;
  outcome: 'ok' | 'failed' | 'skipped' | 'empty';
  /** Why it was skipped or how it failed. Omitted on success. */
  reason?: string;
  durationMs: number;
}

export interface RoutedResult<T> {
  value: T;
  source: ResultSource;
  provider: string;
  attempts: ProviderAttempt[];
}

/**
 * A candidate the router can try. `supports` runs first and is cheap; returning
 * a string means "skip me, and here is the honest reason".
 */
export interface ProviderAdapter<Req, Res> {
  id: string;
  label: string;
  feature: ProviderFeature;
  /** True to attempt, or a string explaining why this request is out of scope. */
  supports(request: Req): true | string;
  run(request: Req): Promise<Res | null>;
}

export type TranscriptAdapter = ProviderAdapter<TranscriptRequest, ProviderTranscriptResult>;
export type MediaInfoAdapter = ProviderAdapter<MediaInfoRequest, ProviderMediaInfoResult>;
export type DownloadAdapter = ProviderAdapter<DownloadRequest, ProviderDownloadResult>;

/**
 * Format ids that came from an external provider are namespaced before they
 * leave the server, so a later download request can tell a provider id from a
 * yt-dlp id and route accordingly instead of feeding one to the other.
 */
export const PROVIDER_FORMAT_PREFIX = 'provider:';

export function tagProviderFormatId(providerId: string, formatId: string): string {
  return `${PROVIDER_FORMAT_PREFIX}${providerId}:${formatId}`;
}

export interface ParsedFormatId {
  origin: 'provider' | 'local';
  provider?: string;
  formatId: string;
}

export function parseFormatId(raw: string): ParsedFormatId {
  if (!raw.startsWith(PROVIDER_FORMAT_PREFIX)) return { origin: 'local', formatId: raw };
  const rest = raw.slice(PROVIDER_FORMAT_PREFIX.length);
  const split = rest.indexOf(':');
  if (split <= 0) return { origin: 'provider', formatId: rest };
  return { origin: 'provider', provider: rest.slice(0, split), formatId: rest.slice(split + 1) };
}
