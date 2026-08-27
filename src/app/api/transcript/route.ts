import { json, errorResponse } from '@/lib/http';
import { enforceRateLimit, RULES } from '@/lib/ratelimit';
import { parseHttpUrl, requireOneOf, requireString } from '@/lib/validate';
import { PROVIDERS } from '@/modules/transcript/providers';
import { extractVideoId, toJson, toPlainText, toSrt } from '@/modules/transcript/youtube';

export async function GET() {
  return json({
    providers: Object.values(PROVIDERS).map((provider) => ({
      id: provider.id,
      label: provider.label,
      description: provider.description,
    })),
  });
}

export async function POST(req: Request) {
  try {
    enforceRateLimit(req, RULES.transcript);
    const body = await req.json();
    const raw = requireString(body.url, 'a YouTube URL or video ID', { maxLength: 500 });
    const mode = requireOneOf(body.mode ?? 'live', ['live', 'demo'] as const, 'mode');
    const languageHint = typeof body.languageHint === 'string' ? body.languageHint.trim() : '';

    const url = raw.includes('/') || raw.includes('.') ? parseHttpUrl(raw, 'YouTube URL') : raw;
    const videoId = extractVideoId(typeof url === 'string' ? url : url.toString());
    if (!videoId) {
      throw new Error('Please provide a valid YouTube video URL or 11-character video ID.');
    }

    const result = await PROVIDERS[mode].fetchTranscript(videoId, languageHint || undefined);
    return json({
      ...result,
      plainText: toPlainText(result.segments, { timestamps: false }),
      srt: toSrt(result.segments),
      json: toJson(result.segments, { videoId: result.videoId, title: result.title, language: result.languageCode, mode: result.mode }),
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Please provide a valid')) {
      return Response.json({ error: { code: 'INVALID_INPUT', message: err.message } }, { status: 400 });
    }
    return errorResponse('api.transcript', err);
  }
}
