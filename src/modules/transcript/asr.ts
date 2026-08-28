import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '@/lib/errors';
import { run } from '@/lib/subprocess';
import { withWorkspace } from '@/lib/tempfiles';
import { downloadMedia, probeMedia } from '@/modules/downloader/engine';
import { detectPlatform, type Detection } from '@/modules/downloader/platforms';

export interface TranscriptSource {
  platform: string;
  title?: string;
  canonicalUrl: string;
  detection: Detection;
  audioBytes: Buffer;
  audioFilename: string;
  provenance: string[];
}

export async function fetchTranscriptSource(url: string): Promise<TranscriptSource> {
  const detection = detectPlatform(url);
  if (!detection.matched || !detection.platform) {
    throw new AppError('INVALID_INPUT', detection.reason || 'Unsupported video URL.');
  }

  const media = await probeMedia(detection).catch(() => null);
  const downloaded = await downloadMedia(detection, { mode: 'audio' });

  return {
    platform: detection.platform.label,
    title: media?.title,
    canonicalUrl: detection.canonicalUrl || url,
    detection,
    audioBytes: downloaded.bytes,
    audioFilename: downloaded.filename || 'audio.mp3',
    provenance: [
      `Detected platform: ${detection.platform.label}.`,
      `Fetched media via yt-dlp from ${detection.canonicalUrl || url}.`,
      `Prepared audio file: ${downloaded.filename}.`,
    ],
  };
}

export interface AsrResult {
  segments: { start: number; duration: number; text: string }[];
  language: string;
  languageProbability?: number;
  duration?: number;
  model: string;
}

function candidatePythons(): string[] {
  return [
    process.env.UUP_ASR_PYTHON,
    path.join(process.cwd(), '.venv-transcribe', 'bin', 'python'),
    '/opt/yt-dlp-venv/bin/python',
    'python3',
  ].filter((v): v is string => Boolean(v));
}

export async function transcribeAudio(
  audioBytes: Buffer,
  filename: string,
  languageHint?: string,
): Promise<AsrResult> {
  return withWorkspace('transcribe', async (ws) => {
    const input = ws.file(filename || 'audio.mp3');
    await fs.writeFile(input, audioBytes);

    const script = path.join(process.cwd(), 'scripts', 'transcribe_audio.py');
    let lastError = 'No Python runtime succeeded.';

    for (const python of candidatePythons()) {
      const result = await run(python, [script, input, languageHint || ''], {
        timeoutMs: 600_000,
        maxOutputBytes: 2 * 1024 * 1024,
      }).catch((err) => {
        lastError = err instanceof Error ? err.message : String(err);
        return null;
      });
      if (!result) continue;
      if (result.code !== 0) {
        lastError = result.stderr || result.stdout || `Transcription failed via ${python}`;
        continue;
      }
      try {
        const parsed = JSON.parse(result.stdout) as AsrResult;
        if (!Array.isArray(parsed.segments)) throw new Error('missing segments');
        return parsed;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    throw new AppError('DEPENDENCY_MISSING', 'Live transcription engine is not ready on this server.', {
      hint:
        'Install faster-whisper in a Python environment and point UUP_ASR_PYTHON at that interpreter. ' +
        `Last error: ${String(lastError).slice(0, 220)}`,
    });
  });
}
