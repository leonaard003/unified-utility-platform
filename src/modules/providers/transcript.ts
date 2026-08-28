import { logger } from '@/lib/logger';
import { runActorForItems } from './apify';
import { buildActorInput, featureAvailability, providerConfig } from './config';
import { isRecord, normaliseSegments, pickArray, pickString, plainTextSegments } from './normalize';
import type { ProviderTranscriptResult, TranscriptAdapter, TranscriptRequest } from './types';

/**
 * Transcript providers.
 *
 * Primary: `agentx/video-transcript` (multi-platform), per
 * docs/provider-priority-matrix.md. The local yt-dlp + faster-whisper pipeline
 * stays as the final fallback and is invoked by the router, not from here.
 *
 * The adapter maps the actor's dataset rows onto the app's segment shape. If
 * the payload carries no usable text it returns `null` — the router then moves
 * on. It never returns placeholder or sample content.
 */

const SEGMENT_ARRAY_KEYS = ['transcript', 'segments', 'captions', 'subtitles', 'lines', 'chunks', 'items', 'data', 'results'];
const FULL_TEXT_KEYS = ['transcript', 'text', 'fullText', 'transcription', 'content', 'plainText'];
const TITLE_KEYS = ['title', 'videoTitle', 'name'];
const LANGUAGE_KEYS = ['language', 'languageCode', 'lang', 'detectedLanguage'];

function readSegments(item: unknown) {
  const array = pickArray(item, SEGMENT_ARRAY_KEYS);
  if (array) {
    const normalised = normaliseSegments(array);
    if (normalised) return normalised;
  }
  const text = pickString(item, FULL_TEXT_KEYS);
  return text ? plainTextSegments(text) : null;
}

export function transcriptAdapters(): TranscriptAdapter[] {
  const config = providerConfig();
  const availability = featureAvailability('transcript', config);
  const actor = availability.actor;

  return [
    {
      id: actor,
      label: `External transcript provider (${actor})`,
      feature: 'transcript',
      supports(request: TranscriptRequest) {
        if (!availability.enabled) return availability.reason;
        if (!request.url) return 'No source URL to send to the provider.';
        return true;
      },
      async run(request: TranscriptRequest): Promise<ProviderTranscriptResult | null> {
        const input = buildActorInput(
          'transcript',
          // Default payload: actors in this family read the URL from `videoUrl`
          // or `url`. Override with UUP_TRANSCRIPT_PROVIDER_INPUT if yours differs.
          {
            videoUrl: request.url,
            url: request.url,
            ...(request.languageHint ? { language: request.languageHint } : {}),
          },
          { url: request.url, language: request.languageHint },
        );

        const items = await runActorForItems(actor, input);
        if (items.length === 0) return null;

        // Either one row holding the whole transcript, or one row per segment.
        const first = items[0];
        let parsed = readSegments(first);
        if (!parsed) parsed = normaliseSegments(items);

        if (!parsed) {
          logger.warn('providers.transcript_unusable_payload', {
            actor,
            items: items.length,
            keys: isRecord(first) ? Object.keys(first).slice(0, 20) : typeof first,
          });
          return null;
        }

        return {
          provider: actor,
          platform: request.detection.platform?.label,
          sourceUrl: request.detection.canonicalUrl ?? request.url,
          title: pickString(first, TITLE_KEYS),
          language: pickString(first, LANGUAGE_KEYS) ?? request.languageHint,
          hasTimings: parsed.hasTimings,
          segments: parsed.segments,
        };
      },
    },
  ];
}
