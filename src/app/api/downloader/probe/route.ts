import { json } from '@/lib/http';
import { getCapabilities } from '@/lib/capabilities';
import { enforceRateLimit, RULES } from '@/lib/ratelimit';
import { parseHttpUrl } from '@/lib/validate';
import { detectPlatform, describePlatform } from '@/modules/downloader/platforms';
import { providerReport, routeMediaInfo } from '@/modules/providers/router';
import { AppError } from '@/lib/errors';

export async function GET() {
  return json({
    capabilities: await getCapabilities(),
    providers: providerReport(),
    platforms: [
      describePlatform(detectPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ').platform!),
      describePlatform(detectPlatform('https://x.com/i/status/1').platform!),
      describePlatform(detectPlatform('https://www.instagram.com/reel/abc/').platform!),
      describePlatform(detectPlatform('https://www.tiktok.com/@x/video/1').platform!),
    ],
  });
}

export async function POST(req: Request) {
  enforceRateLimit(req, RULES.downloadProbe);
  const body = await req.json();
  const parsed = parseHttpUrl(body.url, 'media URL');
  const detection = detectPlatform(parsed);
  const cookiesText = typeof body.cookiesText === 'string' ? body.cookiesText : undefined;

  const response: any = {
    providers: providerReport(),
    platforms: detection.platform ? [describePlatform(detection.platform)] : [],
    detection: detection.platform ? { ...detection, platform: describePlatform(detection.platform) } : detection,
  };

  if (detection.matched) {
    try {
      const routed = await routeMediaInfo(detection, { cookiesText });
      response.media = routed.value;
      response.providerSource = routed.provider;
      response.providerAttempts = routed.attempts;
      response.engine = {
        available: true,
        version: routed.provider,
        ffmpegAvailable: true,
        installHint: 'Provider layer routed this request successfully.',
      };
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
