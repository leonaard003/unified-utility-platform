/**
 * Central place for every size/time cap in the platform.
 * Modules must import from here rather than hard-coding numbers, so an operator
 * can retune the whole app from environment variables.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const MAX_UPLOAD_BYTES = envInt('UUP_MAX_UPLOAD_MB', 100) * 1024 * 1024;
export const MAX_DOWNLOAD_BYTES = envInt('UUP_MAX_DOWNLOAD_MB', 300) * 1024 * 1024;
export const TMP_TTL_MS = envInt('UUP_TMP_TTL_MINUTES', 30) * 60 * 1000;

/** Hard wall-clock ceiling for a single ffmpeg / yt-dlp / soffice invocation. */
export const SUBPROCESS_TIMEOUT_MS = envInt('UUP_SUBPROCESS_TIMEOUT_SECONDS', 300) * 1000;

/** Timeout for outbound HTTP calls (YouTube transcript fetching). */
export const OUTBOUND_TIMEOUT_MS = envInt('UUP_OUTBOUND_TIMEOUT_SECONDS', 20) * 1000;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
