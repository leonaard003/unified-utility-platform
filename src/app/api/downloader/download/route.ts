import { errorResponse, fileResponse } from '@/lib/http';
import { enforceRateLimit, RULES } from '@/lib/ratelimit';
import { parseHttpUrl, requireOneOf } from '@/lib/validate';
import { detectPlatform } from '@/modules/downloader/platforms';
import { downloadMedia } from '@/modules/downloader/engine';

export async function POST(req: Request) {
  try {
    enforceRateLimit(req, RULES.downloadFetch);
    const body = await req.json();
    const url = parseHttpUrl(body.url, 'media URL');
    const detection = detectPlatform(url);
    if (!detection.matched) {
      throw new Error(detection.reason);
    }
    const mode = requireOneOf(body.mode ?? 'video', ['video', 'audio'] as const, 'download mode');
    const result = await downloadMedia(detection, { mode, formatId: typeof body.formatId === 'string' && body.formatId ? body.formatId : undefined });
    return fileResponse(result.bytes, result.filename, result.contentType);
  } catch (err) {
    if (err instanceof Error && !('code' in err)) {
      return Response.json({ error: { code: 'INVALID_INPUT', message: err.message } }, { status: 400 });
    }
    return errorResponse('api.downloader.download', err);
  }
}
