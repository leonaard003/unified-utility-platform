import { json } from '@/lib/http';
import { getCapabilities } from '@/lib/capabilities';
import { enforceRateLimit, RULES } from '@/lib/ratelimit';
import { parseHttpUrl } from '@/lib/validate';
import { detectPlatform, describePlatform } from '@/modules/downloader/platforms';
import { engineStatus, probeMedia } from '@/modules/downloader/engine';
import { AppError } from '@/lib/errors';

export async function GET() {
  const engine = await engineStatus();
  return json({
    engine,
    capabilities: await getCapabilities(),
    platforms: [describePlatform(detectPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ').platform!), describePlatform(detectPlatform('https://x.com/i/status/1').platform!), describePlatform(detectPlatform('https://www.instagram.com/reel/abc/').platform!), describePlatform(detectPlatform('https://www.tiktok.com/@x/video/1').platform!)],
  });
}

export async function POST(req: Request) {
  enforceRateLimit(req, RULES.downloadProbe);
  const body = await req.json();
  const parsed = parseHttpUrl(body.url, 'media URL');
  const detection = detectPlatform(parsed);
  const engine = await engineStatus();

  const response: any = {
    engine,
    platforms: detection.platform ? [describePlatform(detection.platform)] : [],
    detection: detection.platform ? { ...detection, platform: describePlatform(detection.platform) } : detection,
  };

  if (detection.matched && engine.available) {
    try {
      response.media = await probeMedia(detection);
    } catch (err) {
      if (err instanceof AppError) {
        response.probeError = { message: err.message, hint: err.hint };
      } else {
        throw err;
      }
    }
  }

  return json(response);
}
