/**
 * Pure YouTube/transcript helpers.
 *
 * Nothing in this file touches the network or Node built-ins, so it is imported
 * by both the API route (server) and the transcript page (browser), and it is
 * covered directly by tests/transcript.test.ts.
 */

export interface TranscriptSegment {
  /** Seconds from the start of the video. */
  start: number;
  /** Seconds. May be 0 when the source format does not provide an end time. */
  duration: number;
  text: string;
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be',
]);

/** Path prefixes that carry the video id as the next path segment. */
const PATH_PREFIXES = ['shorts', 'embed', 'live', 'v'];

/**
 * Accepts a full URL in any of the common YouTube shapes, or a bare 11-character
 * video id. Returns null when no id can be recovered.
 */
export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  if (VIDEO_ID_RE.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  const segments = url.pathname.split('/').filter(Boolean);

  if (host.endsWith('youtu.be')) {
    const candidate = segments[0];
    return candidate && VIDEO_ID_RE.test(candidate) ? candidate : null;
  }

  const v = url.searchParams.get('v');
  if (v && VIDEO_ID_RE.test(v)) return v;

  if (segments.length >= 2 && PATH_PREFIXES.includes(segments[0]!.toLowerCase())) {
    const candidate = segments[1]!;
    return VIDEO_ID_RE.test(candidate) ? candidate : null;
  }

  return null;
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/* ------------------------------------------------------------------ *
 * Timestamp formatting
 * ------------------------------------------------------------------ */

function clampSeconds(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** `HH:MM:SS,mmm` (SRT) or `HH:MM:SS.mmm` (WebVTT). */
export function formatTimestamp(seconds: number, msSeparator: ',' | '.' = ','): string {
  const total = clampSeconds(seconds);
  const ms = Math.floor((total % 1) * 1000);
  const whole = Math.floor(total);
  const hh = Math.floor(whole / 3600);
  const mm = Math.floor((whole % 3600) / 60);
  const ss = whole % 60;
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}${msSeparator}${pad(ms, 3)}`;
}

/** Short `M:SS` / `H:MM:SS` label used in the on-screen transcript. */
export function formatClock(seconds: number): string {
  const whole = Math.floor(clampSeconds(seconds));
  const hh = Math.floor(whole / 3600);
  const mm = Math.floor((whole % 3600) / 60);
  const ss = whole % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}

/** Parse `HH:MM:SS,mmm` / `MM:SS.mmm` into seconds. */
export function parseTimestamp(value: string): number {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(value.trim());
  if (!match) return 0;
  const [, h, m, s, ms] = match;
  return (
    Number(h ?? 0) * 3600 +
    Number(m) * 60 +
    Number(s) +
    Number((ms ?? '0').padEnd(3, '0')) / 1000
  );
}

/* ------------------------------------------------------------------ *
 * Parsers — turn a caption payload into normalised segments
 * ------------------------------------------------------------------ */

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' ',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, entity: string) => {
    const known = HTML_ENTITIES[entity.toLowerCase()] ?? HTML_ENTITIES[entity];
    if (known !== undefined) return known;
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return whole;
  });
}

function cleanText(raw: string): string {
  return decodeEntities(raw.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * YouTube `timedtext` XML — both the legacy `<text start dur>` form and the
 * srv3 `<p t d>` form (times in milliseconds).
 */
export function parseTimedTextXml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];

  const legacy = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  for (let match = legacy.exec(xml); match; match = legacy.exec(xml)) {
    const attrs = match[1]!;
    const start = Number(/\bstart="([^"]*)"/.exec(attrs)?.[1] ?? 0);
    const duration = Number(/\bdur="([^"]*)"/.exec(attrs)?.[1] ?? 0);
    const text = cleanText(match[2]!);
    if (text) segments.push({ start: clampSeconds(start), duration: clampSeconds(duration), text });
  }
  if (segments.length > 0) return segments;

  const srv3 = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  for (let match = srv3.exec(xml); match; match = srv3.exec(xml)) {
    const attrs = match[1]!;
    const startMs = Number(/\bt="([^"]*)"/.exec(attrs)?.[1] ?? 0);
    const durMs = Number(/\bd="([^"]*)"/.exec(attrs)?.[1] ?? 0);
    const text = cleanText(match[2]!);
    if (text) segments.push({ start: clampSeconds(startMs) / 1000, duration: clampSeconds(durMs) / 1000, text });
  }
  return segments;
}

/** YouTube `timedtext?fmt=json3`. */
export function parseJson3(payload: string): TranscriptSegment[] {
  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch {
    return [];
  }
  const events = (data as { events?: unknown }).events;
  if (!Array.isArray(events)) return [];

  const segments: TranscriptSegment[] = [];
  for (const event of events) {
    const e = event as { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] };
    if (!Array.isArray(e.segs)) continue;
    const text = cleanText(e.segs.map((s) => s.utf8 ?? '').join(''));
    if (!text) continue;
    segments.push({
      start: clampSeconds(Number(e.tStartMs ?? 0)) / 1000,
      duration: clampSeconds(Number(e.dDurationMs ?? 0)) / 1000,
      text,
    });
  }
  return segments;
}

/** SubRip (`.srt`). */
export function parseSrt(input: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const blocks = input.replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim() !== '');
    if (lines.length === 0) continue;
    const timeIndex = lines.findIndex((line) => line.includes('-->'));
    if (timeIndex === -1) continue;
    const [rawStart, rawEnd] = lines[timeIndex]!.split('-->');
    const start = parseTimestamp(rawStart ?? '');
    const end = parseTimestamp(rawEnd ?? '');
    const text = cleanText(lines.slice(timeIndex + 1).join(' '));
    if (text) segments.push({ start, duration: Math.max(0, end - start), text });
  }
  return segments;
}

/** WebVTT (`.vtt`). Cue identifiers and NOTE/STYLE blocks are ignored. */
export function parseVtt(input: string): TranscriptSegment[] {
  const body = input.replace(/\r\n/g, '\n').replace(/^WEBVTT[^\n]*\n/, '');
  const segments: TranscriptSegment[] = [];
  for (const block of body.trim().split(/\n{2,}/)) {
    if (/^(NOTE|STYLE|REGION)\b/.test(block.trim())) continue;
    const lines = block.split('\n').filter((line) => line.trim() !== '');
    const timeIndex = lines.findIndex((line) => line.includes('-->'));
    if (timeIndex === -1) continue;
    const [rawStart, rawEnd] = lines[timeIndex]!.split('-->');
    const start = parseTimestamp((rawStart ?? '').trim());
    // A VTT end time can carry cue settings after it ("00:00:04.000 line:80%").
    const end = parseTimestamp((rawEnd ?? '').trim().split(/\s+/)[0] ?? '');
    const text = cleanText(lines.slice(timeIndex + 1).join(' '));
    if (text) segments.push({ start, duration: Math.max(0, end - start), text });
  }
  return segments;
}

export type CaptionFormat = 'json3' | 'xml' | 'srt' | 'vtt' | 'unknown';

export function detectCaptionFormat(input: string): CaptionFormat {
  const head = input.trimStart().slice(0, 400);
  if (head.startsWith('WEBVTT')) return 'vtt';
  if (head.startsWith('{') && head.includes('"events"')) return 'json3';
  if (head.startsWith('<')) return 'xml';
  if (/-->/.test(input)) return /\d{2}:\d{2}:\d{2}\./.test(input) ? 'vtt' : 'srt';
  return 'unknown';
}

/** Best-effort parse of any supported caption payload. */
export function parseCaptions(input: string): { format: CaptionFormat; segments: TranscriptSegment[] } {
  const format = detectCaptionFormat(input);
  switch (format) {
    case 'json3':
      return { format, segments: parseJson3(input) };
    case 'xml':
      return { format, segments: parseTimedTextXml(input) };
    case 'srt':
      return { format, segments: parseSrt(input) };
    case 'vtt':
      return { format, segments: parseVtt(input) };
    default:
      return { format, segments: [] };
  }
}

/* ------------------------------------------------------------------ *
 * Serialisers
 * ------------------------------------------------------------------ */

export function toPlainText(segments: TranscriptSegment[], options: { timestamps?: boolean } = {}): string {
  if (!options.timestamps) {
    return segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();
  }
  return segments.map((s) => `[${formatClock(s.start)}] ${s.text}`).join('\n');
}

/** Fallback cue length when the source gives no duration. */
const DEFAULT_CUE_SECONDS = 2;

function endOf(segments: TranscriptSegment[], index: number): number {
  const current = segments[index]!;
  if (current.duration > 0) return current.start + current.duration;
  const next = segments[index + 1];
  if (next && next.start > current.start) return next.start;
  return current.start + DEFAULT_CUE_SECONDS;
}

export function toSrt(segments: TranscriptSegment[]): string {
  return (
    segments
      .map((segment, index) => {
        const start = formatTimestamp(segment.start, ',');
        const end = formatTimestamp(endOf(segments, index), ',');
        return `${index + 1}\n${start} --> ${end}\n${segment.text}`;
      })
      .join('\n\n') + '\n'
  );
}

export function toVtt(segments: TranscriptSegment[]): string {
  const cues = segments
    .map((segment, index) => {
      const start = formatTimestamp(segment.start, '.');
      const end = formatTimestamp(endOf(segments, index), '.');
      return `${start} --> ${end}\n${segment.text}`;
    })
    .join('\n\n');
  return `WEBVTT\n\n${cues}\n`;
}

export function toJson(segments: TranscriptSegment[], meta: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...meta, segmentCount: segments.length, segments }, null, 2);
}

export function totalDuration(segments: TranscriptSegment[]): number {
  if (segments.length === 0) return 0;
  return endOf(segments, segments.length - 1);
}

export function wordCount(segments: TranscriptSegment[]): number {
  return segments.reduce((total, segment) => {
    const words = segment.text.split(/\s+/).filter(Boolean).length;
    return total + words;
  }, 0);
}
