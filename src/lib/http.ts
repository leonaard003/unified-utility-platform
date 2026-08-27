import { NextResponse } from 'next/server';
import { toErrorPayload } from './errors';
import { logger } from './logger';

export function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

/** Convert any thrown value into a consistent JSON error response. */
export function errorResponse(event: string, err: unknown): NextResponse {
  const { status, body } = toErrorPayload(err);
  if (status >= 500) logger.error(event, err);
  else logger.warn(event, { code: body.error.code, message: body.error.message });
  return NextResponse.json(body, { status });
}

/** RFC 5987 encoding so non-ASCII filenames survive the Content-Disposition header. */
export function attachmentHeaders(filename: string, contentType: string, size?: number): Headers {
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const headers = new Headers({
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Cache-Control': 'no-store',
  });
  if (typeof size === 'number') headers.set('Content-Length', String(size));
  return headers;
}

export function fileResponse(bytes: Uint8Array, filename: string, contentType: string): Response {
  // Copy into a fresh ArrayBuffer so the response body is a standalone BodyInit.
  const body = new Uint8Array(bytes).buffer as ArrayBuffer;
  return new Response(body, { headers: attachmentHeaders(filename, contentType, bytes.byteLength) });
}
