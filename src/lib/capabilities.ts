import { run } from './subprocess';

/**
 * Runtime capability detection.
 *
 * The platform deliberately ships with optional native dependencies (ffmpeg,
 * yt-dlp, LibreOffice). Rather than pretending a feature works and failing at
 * submit time, every module asks this layer what is actually installed and the
 * UI reflects the honest answer up front.
 */

export type CapabilityId = 'ffmpeg' | 'ytdlp' | 'soffice';

export interface Capability {
  id: CapabilityId;
  label: string;
  available: boolean;
  version?: string;
  /** What stops working when this is missing. */
  enables: string;
  installHint: string;
}

const CANDIDATES: Record<CapabilityId, { env: string; bins: string[]; args: string[] }> = {
  ffmpeg: { env: 'FFMPEG_PATH', bins: ['ffmpeg'], args: ['-version'] },
  ytdlp: { env: 'YTDLP_PATH', bins: ['yt-dlp', 'yt-dlp_linux', 'youtube-dl'], args: ['--version'] },
  soffice: { env: 'SOFFICE_PATH', bins: ['soffice', 'libreoffice'], args: ['--version'] },
};

const META: Record<CapabilityId, { label: string; enables: string; installHint: string }> = {
  ffmpeg: {
    label: 'ffmpeg',
    enables: 'Audio and video conversion in the Converter module.',
    installHint: 'Debian/Ubuntu: sudo apt install ffmpeg — macOS: brew install ffmpeg',
  },
  ytdlp: {
    label: 'yt-dlp',
    enables: 'The entire Downloader module (metadata probe and media download).',
    installHint: 'pipx install yt-dlp (or: python3 -m pip install --user yt-dlp)',
  },
  soffice: {
    label: 'LibreOffice',
    enables: 'Full-fidelity DOCX to PDF conversion (layout, fonts, images preserved).',
    installHint: 'Debian/Ubuntu: sudo apt install libreoffice-writer — macOS: brew install --cask libreoffice',
  },
};

interface Resolved {
  bin: string | null;
  version?: string;
}

const cache = new Map<CapabilityId, Promise<Resolved>>();

async function resolve(id: CapabilityId): Promise<Resolved> {
  const { env, bins, args } = CANDIDATES[id];
  const explicit = process.env[env];
  const candidates = explicit ? [explicit, ...bins] : bins;

  for (const bin of candidates) {
    try {
      const result = await run(bin, args, { timeoutMs: 10_000, maxOutputBytes: 64 * 1024 });
      if (result.code === 0) {
        const firstLine = (result.stdout || result.stderr).split('\n')[0]?.trim();
        return { bin, version: firstLine || undefined };
      }
    } catch {
      // Not installed under this name — try the next candidate.
    }
  }
  return { bin: null };
}

/**
 * Resolve the executable path for a capability, memoised for the process lifetime.
 * Returns null when the dependency is not installed.
 */
export function resolveBinary(id: CapabilityId): Promise<Resolved> {
  let entry = cache.get(id);
  if (!entry) {
    entry = resolve(id);
    cache.set(id, entry);
  }
  return entry;
}

export async function requireBinary(id: CapabilityId): Promise<string> {
  const { bin } = await resolveBinary(id);
  if (!bin) {
    const { AppError } = await import('./errors');
    throw new AppError('DEPENDENCY_MISSING', `${META[id].label} is not installed on this server.`, {
      hint: `${META[id].enables} Install it with: ${META[id].installHint}`,
    });
  }
  return bin;
}

export async function getCapabilities(): Promise<Capability[]> {
  const ids: CapabilityId[] = ['ffmpeg', 'ytdlp', 'soffice'];
  return Promise.all(
    ids.map(async (id) => {
      const { bin, version } = await resolveBinary(id);
      return { id, ...META[id], available: Boolean(bin), version };
    }),
  );
}

/** Clear the memo — used by tests and by the /api/health?refresh=1 endpoint. */
export function resetCapabilityCache(): void {
  cache.clear();
}
