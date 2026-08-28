import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { downloadMedia, engineStatus, probeMedia, type MediaInfo } from '@/modules/downloader/engine';
import type { Detection } from '@/modules/downloader/platforms';
import { fetchTranscriptSource, transcribeAudio } from '@/modules/transcript/asr';
import type { TranscriptSegment } from '@/modules/transcript/youtube';
import { describeProviderLayer, localFallbackAllowed, providerConfig } from './config';
import { downloadAdapters } from './download';
import { mediaInfoAdapters } from './metadata';
import { transcriptAdapters } from './transcript';
import {
  parseFormatId,
  tagProviderFormatId,
  type DownloadMode,
  type ProviderAdapter,
  type ProviderAttempt,
  type ProviderDownloadResult,
  type ProviderFeature,
  type ProviderMediaInfoResult,
  type ResultSource,
  type RoutedResult,
} from './types';

/**
 * The provider router.
 *
 * One rule, applied to all three features: try the configured external
 * providers in order, then fall back to the local pipeline (yt-dlp /
 * faster-whisper). Any provider that is unconfigured, disabled, out of scope
 * for the URL, or simply failing is recorded as an attempt and skipped — it can
 * never take the feature down, and with no `APIFY_TOKEN` at all every request
 * lands on the local path exactly as it did before this layer existed.
 *
 * Callers get back the value plus its provenance, so the API can state which
 * source answered instead of implying one.
 */

export const LOCAL_TRANSCRIPT_ID = 'local:yt-dlp+faster-whisper';
export const LOCAL_MEDIA_ID = 'local:yt-dlp';

interface Candidate<T> {
  id: string;
  source: ResultSource;
  /** Reason this candidate cannot serve the request, when it cannot. */
  skip?: string;
  run: () => Promise<T | null>;
}

function describeError(err: unknown): string {
  if (err instanceof AppError) return `${err.code}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

function summarise(attempts: ProviderAttempt[]): string {
  return attempts.map((a) => `${a.provider} — ${a.outcome}${a.reason ? ` (${a.reason})` : ''}`).join('; ');
}

async function runChain<T>(feature: ProviderFeature, candidates: Candidate<T>[]): Promise<RoutedResult<T>> {
  const attempts: ProviderAttempt[] = [];
  let lastError: unknown = null;

  for (const candidate of candidates) {
    if (candidate.skip) {
      attempts.push({ provider: candidate.id, feature, outcome: 'skipped', reason: candidate.skip, durationMs: 0 });
      continue;
    }

    const startedAt = Date.now();
    try {
      const value = await candidate.run();
      const durationMs = Date.now() - startedAt;
      if (value === null || value === undefined) {
        attempts.push({ provider: candidate.id, feature, outcome: 'empty', reason: 'Returned no usable data.', durationMs });
        continue;
      }
      attempts.push({ provider: candidate.id, feature, outcome: 'ok', durationMs });
      logger.info('providers.route_resolved', { feature, provider: candidate.id, source: candidate.source, durationMs });
      return { value, source: candidate.source, provider: candidate.id, attempts };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      lastError = err;
      attempts.push({ provider: candidate.id, feature, outcome: 'failed', reason: describeError(err), durationMs });
      logger.warn('providers.route_attempt_failed', { feature, provider: candidate.id, durationMs, reason: describeError(err) });
    }
  }

  logger.warn('providers.route_exhausted', { feature, attempts: summarise(attempts) });

  // Surface the last real failure — it is the most specific thing we know —
  // with the full attempt list appended so the UI can explain the whole chain.
  const trail = `Sources tried: ${summarise(attempts) || 'none were eligible'}.`;
  if (lastError instanceof AppError) {
    throw new AppError(lastError.code, lastError.message, {
      status: lastError.status,
      hint: [lastError.hint, trail].filter(Boolean).join(' '),
    });
  }
  if (lastError) {
    throw new AppError('UPSTREAM_BLOCKED', `No ${feature} source could complete this request.`, {
      hint: `${describeError(lastError)} ${trail}`,
    });
  }
  throw new AppError('NOT_AVAILABLE', `No ${feature} source is available for this request.`, { hint: trail });
}

/** Wrap a feature adapter as a chain candidate, honouring its own `supports` check. */
function adapterCandidate<Req, Res>(adapter: ProviderAdapter<Req, Res>, request: Req): Candidate<Res> {
  const supported = adapter.supports(request);
  return {
    id: adapter.id,
    source: 'provider',
    skip: supported === true ? undefined : supported,
    run: () => adapter.run(request),
  };
}

/* ------------------------------------------------------------------ *
 * Transcript
 * ------------------------------------------------------------------ */

export interface RoutedTranscript {
  segments: TranscriptSegment[];
  title?: string;
  platform?: string;
  sourceUrl: string;
  language: string;
  /** False when the source gave text without timings (provider payloads only). */
  hasTimings: boolean;
  engine: string;
  provenance: string[];
}

export async function routeTranscript(
  url: string,
  detection: Detection,
  options: { languageHint?: string } = {},
): Promise<RoutedResult<RoutedTranscript>> {
  const request = { url, detection, languageHint: options.languageHint };

  const candidates: Candidate<RoutedTranscript>[] = transcriptAdapters().map((adapter) => {
    const candidate = adapterCandidate(adapter, request);
    return {
      ...candidate,
      run: async () => {
        const result = await adapter.run(request);
        if (!result) return null;
        return {
          segments: result.segments,
          title: result.title,
          platform: result.platform ?? detection.platform?.label,
          sourceUrl: result.sourceUrl,
          language: result.language ?? options.languageHint ?? 'unknown',
          hasTimings: result.hasTimings,
          engine: `provider:${result.provider}`,
          provenance: [
            `Transcript supplied by the external provider ${result.provider}.`,
            result.hasTimings
              ? 'Timings come from the provider.'
              : 'The provider returned text without timings, so the transcript is shown as one untimed block.',
          ],
        } satisfies RoutedTranscript;
      },
    };
  });

  if (localFallbackAllowed()) {
    candidates.push({
      id: LOCAL_TRANSCRIPT_ID,
      source: 'local',
      skip: detection.matched ? undefined : detection.reason || 'The URL is not one the local pipeline can fetch.',
      run: async () => {
        try {
          const source = await fetchTranscriptSource(detection.canonicalUrl ?? url);
          const asr = await transcribeAudio(source.audioBytes, source.audioFilename, options.languageHint);
          return {
            segments: asr.segments as TranscriptSegment[],
            title: source.title,
            platform: source.platform,
            sourceUrl: source.canonicalUrl,
            language: asr.language,
            hasTimings: true,
            engine: `faster-whisper:${asr.model}`,
            provenance: [...source.provenance, `Transcribed locally with faster-whisper model ${asr.model}.`],
          } satisfies RoutedTranscript;
        } catch (err) {
          if (err instanceof AppError && err.code === 'UPSTREAM_BLOCKED') {
            throw new AppError('UPSTREAM_BLOCKED', 'Transcript could not be generated for this video from the current server.', {
              hint: [err.hint, 'This usually means the source platform blocked media access, so no audio could be fetched for transcription.'].filter(Boolean).join(' '),
            });
          }
          throw err;
        }
      },
    });
  }

  return runChain('transcript', candidates);
}

/* ------------------------------------------------------------------ *
 * Metadata / quality
 * ------------------------------------------------------------------ */

function fromLocalProbe(info: MediaInfo, detection: Detection): ProviderMediaInfoResult {
  return {
    provider: LOCAL_MEDIA_ID,
    platform: detection.platform?.label,
    sourceUrl: detection.canonicalUrl ?? '',
    title: info.title,
    uploader: info.uploader,
    thumbnail: info.thumbnail,
    durationSeconds: info.durationSeconds,
    isLive: info.isLive,
    // Local ids are yt-dlp selectors and stay untagged, so a later download
    // request can tell them apart from provider ids.
    formats: info.formats.map((format) => ({
      id: format.id,
      label: format.label,
      ext: format.ext,
      resolution: format.resolution,
      filesize: format.filesize,
      hasVideo: format.hasVideo,
      hasAudio: format.hasAudio,
    })),
  };
}

export async function routeMediaInfo(
  detection: Detection,
  options: { cookiesText?: string } = {},
): Promise<RoutedResult<ProviderMediaInfoResult>> {
  const request = { detection, cookiesText: options.cookiesText };

  const candidates: Candidate<ProviderMediaInfoResult>[] = mediaInfoAdapters().map((adapter) => {
    const candidate = adapterCandidate(adapter, request);
    return {
      ...candidate,
      run: async () => {
        const info = await adapter.run(request);
        if (!info) return null;
        // Namespace the ids so the download route knows they are not yt-dlp selectors.
        return { ...info, formats: info.formats.map((f) => ({ ...f, id: tagProviderFormatId(adapter.id, f.id) })) };
      },
    };
  });

  if (localFallbackAllowed()) {
    const engine = await engineStatus();
    candidates.push({
      id: LOCAL_MEDIA_ID,
      source: 'local',
      skip: !engine.available
        ? 'yt-dlp is not installed on this server.'
        : detection.matched
          ? undefined
          : detection.reason || 'The URL is not a single-media URL.',
      run: async () => fromLocalProbe(await probeMedia(detection, { cookiesText: options.cookiesText }), detection),
    });
  }

  return runChain('metadata', candidates);
}

/* ------------------------------------------------------------------ *
 * Download
 * ------------------------------------------------------------------ */

export async function routeDownload(
  detection: Detection,
  options: { mode: DownloadMode; formatId?: string; cookiesText?: string },
): Promise<RoutedResult<ProviderDownloadResult>> {
  const parsed = options.formatId ? parseFormatId(options.formatId) : null;
  const request = {
    detection,
    mode: options.mode,
    formatId: parsed?.origin === 'provider' ? parsed.formatId : undefined,
    cookiesText: options.cookiesText,
  };

  const candidates: Candidate<ProviderDownloadResult>[] = downloadAdapters().map((adapter) => {
    const candidate = adapterCandidate(adapter, request);
    if (parsed?.origin === 'local') {
      // A yt-dlp selector was chosen in the UI; only yt-dlp can honour it.
      return { ...candidate, skip: candidate.skip ?? 'The chosen format id belongs to the local engine.' };
    }
    if (parsed?.origin === 'provider' && parsed.provider && parsed.provider !== adapter.id) {
      return { ...candidate, skip: candidate.skip ?? `The chosen format came from ${parsed.provider}.` };
    }
    return candidate;
  });

  if (localFallbackAllowed()) {
    const engine = await engineStatus();
    // A provider-issued format id means nothing to yt-dlp, so the local
    // fallback runs on its own default selection instead of a bogus selector.
    const localFormatId = parsed?.origin === 'local' ? parsed.formatId : undefined;
    if (parsed?.origin === 'provider') {
      logger.info('providers.local_fallback_drops_format', { formatId: options.formatId });
    }
    candidates.push({
      id: LOCAL_MEDIA_ID,
      source: 'local',
      skip: engine.available ? undefined : 'yt-dlp is not installed on this server.',
      run: async () => {
        const result = await downloadMedia(detection, {
          mode: options.mode,
          formatId: localFormatId,
          cookiesText: options.cookiesText,
        });
        return { provider: LOCAL_MEDIA_ID, filename: result.filename, contentType: result.contentType, bytes: result.bytes };
      },
    });
  }

  return runChain('download', candidates);
}

/** Provider-layer status for API responses; safe to serialise (no secrets). */
export function providerReport() {
  return describeProviderLayer();
}

export { providerConfig };
