import type { TranscriptSegment } from '@/modules/transcript/youtube';

/**
 * Field-mapping helpers shared by the provider adapters.
 *
 * Third-party actors do not agree on field names (`downloadUrl` vs `video_url`
 * vs `url`; `transcript` vs `segments` vs `captions`), and their output schemas
 * change without notice. Rather than hard-code one guess per provider, the
 * adapters read through a list of plausible keys and return `null` when none of
 * them holds usable data — which the router treats as "this provider had
 * nothing", not as an excuse to synthesise a result.
 */

export type Rec = Record<string, unknown>;

export function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function pickString(source: unknown, keys: string[]): string | undefined {
  if (!isRecord(source)) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return undefined;
}

export function pickNumber(source: unknown, keys: string[]): number | undefined {
  if (!isRecord(source)) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

export function pickBoolean(source: unknown, keys: string[]): boolean | undefined {
  if (!isRecord(source)) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

export function pickArray(source: unknown, keys: string[]): unknown[] | undefined {
  if (!isRecord(source)) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value) && value.length > 0) return value;
  }
  return undefined;
}

/** First http(s) URL found under any of the given keys. */
export function pickUrl(source: unknown, keys: string[]): string | undefined {
  const value = pickString(source, keys);
  if (!value) return undefined;
  return /^https?:\/\//i.test(value) ? value : undefined;
}

const START_KEYS = ['start', 'startTime', 'start_time', 'offset', 'begin', 'from', 'startSeconds'];
const DURATION_KEYS = ['duration', 'dur', 'length', 'durationSeconds'];
const END_KEYS = ['end', 'endTime', 'end_time', 'to', 'endSeconds'];
const TEXT_KEYS = ['text', 'content', 'caption', 'line', 'segment', 'value'];

/**
 * Timestamps arrive as seconds (`12.5`), milliseconds (`12500`) or clock
 * strings (`00:00:12,500`). Milliseconds are only assumed when the actor says
 * so in the key name, because guessing units silently shifts every timestamp.
 */
function toSeconds(value: number | undefined, key: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (key && /ms$|millis/i.test(key)) return value / 1000;
  return value;
}

function clockToSeconds(raw: string): number | undefined {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(raw.trim());
  if (!match) return undefined;
  const [, h, m, s, frac] = match;
  return Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s) + Number(`0.${frac ?? 0}`);
}

function readTime(row: Rec, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'number' && Number.isFinite(value)) return toSeconds(value, key);
    if (typeof value === 'string' && value.trim() !== '') {
      const clock = clockToSeconds(value);
      if (clock !== undefined) return clock;
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return toSeconds(parsed, key);
    }
  }
  const msKey = keys.map((key) => `${key}Ms`).find((key) => typeof row[key] === 'number');
  if (msKey) return (row[msKey] as number) / 1000;
  return undefined;
}

export interface NormalisedSegments {
  segments: TranscriptSegment[];
  /** False when the upstream gave text but no usable timings. */
  hasTimings: boolean;
}

/**
 * Turn a provider's transcript payload into the app's segment shape.
 *
 * When only plain text comes back, it is returned as a single untimed segment
 * with `hasTimings: false`. Splitting it into evenly spaced pseudo-segments
 * would look better and be a lie, so this does not do that.
 */
export function normaliseSegments(rows: unknown[]): NormalisedSegments | null {
  const segments: TranscriptSegment[] = [];
  let timed = false;

  for (const row of rows) {
    if (typeof row === 'string') {
      const text = row.trim();
      if (text) segments.push({ start: 0, duration: 0, text });
      continue;
    }
    if (!isRecord(row)) continue;

    const text = pickString(row, TEXT_KEYS);
    if (!text) continue;

    const start = readTime(row, START_KEYS);
    let duration = readTime(row, DURATION_KEYS);
    if (duration === undefined) {
      const end = readTime(row, END_KEYS);
      if (end !== undefined && start !== undefined && end >= start) duration = end - start;
    }
    if (start !== undefined) timed = true;
    segments.push({ start: start ?? 0, duration: duration ?? 0, text });
  }

  if (segments.length === 0) return null;
  return { segments, hasTimings: timed };
}

/** Collapse a plain-text transcript into one honest, untimed segment. */
export function plainTextSegments(text: string): NormalisedSegments | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return { segments: [{ start: 0, duration: 0, text: trimmed }], hasTimings: false };
}
