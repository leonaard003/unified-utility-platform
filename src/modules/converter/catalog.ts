import type { CapabilityId } from '@/lib/capabilities';

/**
 * The complete, honest list of conversions this MVP performs.
 *
 * Deliberately narrow. Every entry here is implemented and reachable; the UI is
 * generated from this list, so it is impossible for the interface to offer a
 * conversion the backend cannot do.
 */

export type EngineId = 'sharp' | 'pdf-lib' | 'unpdf' | 'mammoth' | 'ffmpeg';

export type OptionId = 'width' | 'height' | 'quality' | 'pageSize' | 'audioBitrate' | 'videoHeight';

export type TargetId =
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'avif'
  | 'pdf'
  | 'txt'
  | 'html'
  | 'md'
  | 'mp3'
  | 'wav'
  | 'm4a'
  | 'ogg'
  | 'mp4'
  | 'webm';

export interface ConversionSpec {
  /** Stable id, `<category>:<target>`. */
  id: string;
  category: 'image' | 'document' | 'audio' | 'video';
  /** Lower-case input extensions this conversion accepts. */
  from: string[];
  target: TargetId;
  label: string;
  /** File extension written to the downloaded filename. */
  outExt: string;
  mime: string;
  engine: EngineId;
  /** Native binary required. Undefined means "works with the bundled npm deps". */
  requires?: CapabilityId;
  options: OptionId[];
  /** Honest caveats shown next to the conversion in the UI. */
  notes: string[];
}

const RASTER_INPUTS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'gif'];
const AUDIO_INPUTS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'wma'];
const VIDEO_INPUTS = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'mpg', 'mpeg', 'wmv', 'flv'];

export const CONVERSIONS: ConversionSpec[] = [
  /* ---------------- Images (sharp — always available) ---------------- */
  {
    id: 'image:jpeg',
    category: 'image',
    from: RASTER_INPUTS,
    target: 'jpeg',
    label: 'JPG image',
    outExt: 'jpg',
    mime: 'image/jpeg',
    engine: 'sharp',
    options: ['width', 'height', 'quality'],
    notes: ['Transparency is flattened onto white — JPG has no alpha channel.'],
  },
  {
    id: 'image:png',
    category: 'image',
    from: RASTER_INPUTS,
    target: 'png',
    label: 'PNG image',
    outExt: 'png',
    mime: 'image/png',
    engine: 'sharp',
    options: ['width', 'height'],
    notes: ['Lossless. Transparency is preserved when the source has it.'],
  },
  {
    id: 'image:webp',
    category: 'image',
    from: RASTER_INPUTS,
    target: 'webp',
    label: 'WebP image',
    outExt: 'webp',
    mime: 'image/webp',
    engine: 'sharp',
    options: ['width', 'height', 'quality'],
    notes: ['Usually the smallest of the three for photos at the same quality.'],
  },
  {
    id: 'image:avif',
    category: 'image',
    from: RASTER_INPUTS,
    target: 'avif',
    label: 'AVIF image',
    outExt: 'avif',
    mime: 'image/avif',
    engine: 'sharp',
    options: ['width', 'height', 'quality'],
    notes: ['Smallest files, but encoding is noticeably slower than JPG or WebP.'],
  },
  {
    id: 'image:pdf',
    category: 'image',
    from: RASTER_INPUTS,
    target: 'pdf',
    label: 'PDF (one page, image placed)',
    outExt: 'pdf',
    mime: 'application/pdf',
    engine: 'pdf-lib',
    options: ['pageSize', 'quality'],
    notes: ['One image becomes one page. Multi-image PDFs are not in this MVP.'],
  },

  /* ---------------- Documents (bundled npm deps) ---------------- */
  {
    id: 'document:pdf-txt',
    category: 'document',
    from: ['pdf'],
    target: 'txt',
    label: 'Plain text',
    outExt: 'txt',
    mime: 'text/plain; charset=utf-8',
    engine: 'unpdf',
    options: [],
    notes: [
      'Extracts the text layer only. A scanned PDF with no text layer returns nothing — there is no OCR here.',
    ],
  },
  {
    id: 'document:docx-txt',
    category: 'document',
    from: ['docx'],
    target: 'txt',
    label: 'Plain text',
    outExt: 'txt',
    mime: 'text/plain; charset=utf-8',
    engine: 'mammoth',
    options: [],
    notes: ['Body text only — styling, images, headers and footers are dropped.'],
  },
  {
    id: 'document:docx-html',
    category: 'document',
    from: ['docx'],
    target: 'html',
    label: 'HTML',
    outExt: 'html',
    mime: 'text/html; charset=utf-8',
    engine: 'mammoth',
    options: [],
    notes: ['Semantic HTML: headings, lists, tables, bold/italic. Images are inlined as data URLs.'],
  },
  {
    id: 'document:docx-pdf',
    category: 'document',
    from: ['docx'],
    target: 'pdf',
    label: 'PDF (text-only layout)',
    outExt: 'pdf',
    mime: 'application/pdf',
    engine: 'pdf-lib',
    options: ['pageSize'],
    notes: [
      'This rebuilds the document as flowed text — it does NOT reproduce the original layout, fonts or images.',
      'Install LibreOffice on the server for full-fidelity DOCX to PDF; this app will use it automatically when present.',
    ],
  },
  {
    id: 'document:text-pdf',
    category: 'document',
    from: ['txt', 'md', 'markdown', 'csv', 'log', 'json'],
    target: 'pdf',
    label: 'PDF',
    outExt: 'pdf',
    mime: 'application/pdf',
    engine: 'pdf-lib',
    options: ['pageSize'],
    notes: ['Monospaced-width text flow with page numbers. Markdown is rendered literally, not styled.'],
  },
  {
    id: 'document:pdf-md',
    category: 'document',
    from: ['pdf'],
    target: 'md',
    label: 'Markdown (page-separated text)',
    outExt: 'md',
    mime: 'text/markdown; charset=utf-8',
    engine: 'unpdf',
    options: [],
    notes: ['Each PDF page becomes a `## Page N` section. Structure beyond page breaks is not inferred.'],
  },

  /* ---------------- Audio / video (needs ffmpeg) ---------------- */
  {
    id: 'audio:mp3',
    category: 'audio',
    from: [...AUDIO_INPUTS, ...VIDEO_INPUTS],
    target: 'mp3',
    label: 'MP3 audio',
    outExt: 'mp3',
    mime: 'audio/mpeg',
    engine: 'ffmpeg',
    requires: 'ffmpeg',
    options: ['audioBitrate'],
    notes: ['From a video file this extracts the audio track.'],
  },
  {
    id: 'audio:wav',
    category: 'audio',
    from: [...AUDIO_INPUTS, ...VIDEO_INPUTS],
    target: 'wav',
    label: 'WAV audio (16-bit PCM)',
    outExt: 'wav',
    mime: 'audio/wav',
    engine: 'ffmpeg',
    requires: 'ffmpeg',
    options: [],
    notes: ['Uncompressed — expect roughly 10 MB per minute of stereo audio.'],
  },
  {
    id: 'audio:m4a',
    category: 'audio',
    from: [...AUDIO_INPUTS, ...VIDEO_INPUTS],
    target: 'm4a',
    label: 'M4A audio (AAC)',
    outExt: 'm4a',
    mime: 'audio/mp4',
    engine: 'ffmpeg',
    requires: 'ffmpeg',
    options: ['audioBitrate'],
    notes: [],
  },
  {
    id: 'audio:ogg',
    category: 'audio',
    from: [...AUDIO_INPUTS, ...VIDEO_INPUTS],
    target: 'ogg',
    label: 'OGG audio (Vorbis)',
    outExt: 'ogg',
    mime: 'audio/ogg',
    engine: 'ffmpeg',
    requires: 'ffmpeg',
    options: ['audioBitrate'],
    notes: [],
  },
  {
    id: 'video:mp4',
    category: 'video',
    from: VIDEO_INPUTS,
    target: 'mp4',
    label: 'MP4 video (H.264 + AAC)',
    outExt: 'mp4',
    mime: 'video/mp4',
    engine: 'ffmpeg',
    requires: 'ffmpeg',
    options: ['videoHeight'],
    notes: ['Widest compatibility. Re-encoding is CPU-bound — long clips can take minutes.'],
  },
  {
    id: 'video:webm',
    category: 'video',
    from: VIDEO_INPUTS,
    target: 'webm',
    label: 'WebM video (VP9 + Opus)',
    outExt: 'webm',
    mime: 'video/webm',
    engine: 'ffmpeg',
    requires: 'ffmpeg',
    options: ['videoHeight'],
    notes: ['VP9 encoding is significantly slower than H.264. Keep clips short.'],
  },
];

export const OPTION_META: Record<OptionId, { label: string; hint: string; min?: number; max?: number; default?: string }> = {
  width: { label: 'Width (px)', hint: 'Leave blank to keep the original width. Aspect ratio is preserved.', min: 1, max: 12000 },
  height: { label: 'Height (px)', hint: 'Leave blank to keep the original height. Aspect ratio is preserved.', min: 1, max: 12000 },
  quality: { label: 'Quality (1–100)', hint: 'Lower means a smaller file. 80 is a good default for photos.', min: 1, max: 100, default: '80' },
  pageSize: { label: 'Page size', hint: 'A4 or US Letter, or size the page to the image itself.' },
  audioBitrate: { label: 'Audio bitrate', hint: '192k is transparent for most listening.', default: '192k' },
  videoHeight: { label: 'Resolution', hint: 'Downscale only — a 480p source is never upscaled.' },
};

export const PAGE_SIZES = ['a4', 'letter', 'fit'] as const;
export const AUDIO_BITRATES = ['96k', '128k', '192k', '256k', '320k'] as const;
export const VIDEO_HEIGHTS = ['original', '1080', '720', '480', '360'] as const;

export type PageSize = (typeof PAGE_SIZES)[number];

export const ALL_INPUT_EXTENSIONS = Array.from(new Set(CONVERSIONS.flatMap((c) => c.from))).sort();

export function extensionOf(filename: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(filename);
  return match ? match[1]!.toLowerCase() : '';
}

/** Every conversion that accepts this input extension. */
export function conversionsFor(extension: string): ConversionSpec[] {
  const ext = extension.toLowerCase().replace(/^\./, '');
  return CONVERSIONS.filter((spec) => spec.from.includes(ext));
}

export function findConversion(id: string): ConversionSpec | undefined {
  return CONVERSIONS.find((spec) => spec.id === id);
}
