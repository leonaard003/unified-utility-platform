import fs from 'node:fs/promises';
import path from 'node:path';
import { requireBinary } from '@/lib/capabilities';
import { AppError } from '@/lib/errors';
import { run } from '@/lib/subprocess';
import { withWorkspace } from '@/lib/tempfiles';
import type { ConversionOutput } from './image';

export interface MediaOptions {
  audioBitrate?: string;
  videoHeight?: string;
}

function videoFilter(height?: string): string | null {
  if (!height || height === 'original') return null;
  const n = Number(height);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `scale='min(iw,iw)':'min(${n},ih)':force_original_aspect_ratio=decrease`;
}

function extOf(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? 'bin';
}

export async function convertMedia(
  bytes: Buffer,
  filename: string,
  target: 'mp3' | 'wav' | 'm4a' | 'ogg' | 'mp4' | 'webm',
  options: MediaOptions = {},
): Promise<ConversionOutput> {
  const ffmpeg = await requireBinary('ffmpeg');

  return withWorkspace('ffmpeg', async (ws) => {
    const input = ws.file(`input.${extOf(filename)}`);
    const output = ws.file(`output.${target}`);
    await fs.writeFile(input, bytes);

    const args = ['-y', '-i', input];
    const notes: string[] = [];

    if (target === 'mp3') {
      args.push('-vn', '-c:a', 'libmp3lame', '-b:a', options.audioBitrate || '192k');
      notes.push(`Encoded audio as MP3 at ${options.audioBitrate || '192k'}.`);
    } else if (target === 'wav') {
      args.push('-vn', '-c:a', 'pcm_s16le');
      notes.push('Encoded audio as 16-bit PCM WAV.');
    } else if (target === 'm4a') {
      args.push('-vn', '-c:a', 'aac', '-b:a', options.audioBitrate || '192k');
      notes.push(`Encoded audio as AAC/M4A at ${options.audioBitrate || '192k'}.`);
    } else if (target === 'ogg') {
      args.push('-vn', '-c:a', 'libvorbis', '-b:a', options.audioBitrate || '192k');
      notes.push(`Encoded audio as OGG/Vorbis at ${options.audioBitrate || '192k'}.`);
    } else if (target === 'mp4') {
      const vf = videoFilter(options.videoHeight);
      if (vf) {
        args.push('-vf', vf);
        notes.push(`Downscaled video to fit within ${options.videoHeight}p without upscaling.`);
      }
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '192k');
      notes.push('Encoded video as H.264 MP4.');
    } else if (target === 'webm') {
      const vf = videoFilter(options.videoHeight);
      if (vf) {
        args.push('-vf', vf);
        notes.push(`Downscaled video to fit within ${options.videoHeight}p without upscaling.`);
      }
      args.push('-c:v', 'libvpx-vp9', '-crf', '33', '-b:v', '0', '-c:a', 'libopus', '-b:a', '160k');
      notes.push('Encoded video as VP9 WebM.');
    } else {
      throw new AppError('UNSUPPORTED', `Target ${target} is not implemented.`);
    }

    args.push(output);
    const result = await run(ffmpeg, args, { timeoutMs: 600_000, maxOutputBytes: 512 * 1024 });
    if (result.code !== 0) {
      throw new AppError('UNSUPPORTED', 'ffmpeg could not convert that file.', {
        hint: result.stderr.split('\n').find(Boolean)?.slice(0, 220) || 'Try a smaller file or a different target format.',
      });
    }

    const out = await fs.readFile(path.resolve(output));
    notes.push(`Output size: ${out.length.toLocaleString()} bytes.`);
    return { bytes: out, notes };
  });
}
