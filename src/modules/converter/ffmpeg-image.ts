import fs from 'node:fs/promises';
import { requireBinary } from '@/lib/capabilities';
import { AppError } from '@/lib/errors';
import { run } from '@/lib/subprocess';
import { withWorkspace } from '@/lib/tempfiles';
import type { ConversionOutput } from './image';

export type FfmpegImageTarget = 'bmp' | 'ico';

function extOf(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? 'bin';
}

export async function convertFfmpegImage(
  bytes: Buffer,
  filename: string,
  target: FfmpegImageTarget,
): Promise<ConversionOutput> {
  const ffmpeg = await requireBinary('ffmpeg');

  return withWorkspace('ffimg', async (ws) => {
    const input = ws.file(`input.${extOf(filename)}`);
    const output = ws.file(`output.${target}`);
    await fs.writeFile(input, bytes);

    const args = ['-y', '-i', input];
    const notes: string[] = [];

    switch (target) {
      case 'bmp':
        args.push('-frames:v', '1', output);
        notes.push('Exported a single-frame BMP image via ffmpeg.');
        break;
      case 'ico':
        args.push('-vf', 'scale=256:256:force_original_aspect_ratio=decrease,pad=256:256:(ow-iw)/2:(oh-ih)/2:color=white@0', '-frames:v', '1', output);
        notes.push('Exported a 256×256 ICO file via ffmpeg. Smaller images are centered with transparent padding when possible.');
        break;
      default:
        throw new AppError('UNSUPPORTED', `Target ${target} is not implemented.`);
    }

    const result = await run(ffmpeg, args, { timeoutMs: 180_000, maxOutputBytes: 512 * 1024 });
    if (result.code !== 0) {
      throw new AppError('UNSUPPORTED', `ffmpeg could not convert that file to ${target.toUpperCase()}.`, {
        hint: result.stderr.split('\n').find(Boolean)?.slice(0, 220) || 'Try a different source image.',
      });
    }

    const out = await fs.readFile(output);
    notes.push(`Output size: ${out.length.toLocaleString()} bytes.`);
    return { bytes: out, notes };
  });
}
