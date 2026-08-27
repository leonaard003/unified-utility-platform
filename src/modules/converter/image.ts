import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { AppError } from '@/lib/errors';
import type { PageSize } from './catalog';

/**
 * Image conversion, resizing and compression — all real, all local, powered by
 * the bundled `sharp` build. No optional native dependency is involved, so this
 * part of the converter always works.
 */

export interface ImageOptions {
  width?: number;
  height?: number;
  quality?: number;
}

export interface ConversionOutput {
  bytes: Buffer;
  /** Extra honest detail about what actually happened, shown after the download. */
  notes: string[];
}

export type RasterTarget = 'jpeg' | 'png' | 'webp' | 'avif';

async function readMetadata(bytes: Buffer) {
  try {
    return await sharp(bytes, { animated: false }).metadata();
  } catch {
    throw new AppError('UNSUPPORTED', 'That file could not be read as an image.', {
      hint: 'It may be corrupt, or its extension may not match its real format.',
    });
  }
}

function applyResize(pipeline: sharp.Sharp, options: ImageOptions, notes: string[], original: { width?: number; height?: number }) {
  if (!options.width && !options.height) return pipeline;
  notes.push(
    `Resized from ${original.width ?? '?'}×${original.height ?? '?'} to fit ${options.width ?? 'auto'}×${options.height ?? 'auto'} (aspect ratio preserved, never upscaled).`,
  );
  return pipeline.resize({
    width: options.width,
    height: options.height,
    fit: 'inside',
    withoutEnlargement: true,
  });
}

export async function convertImage(
  bytes: Buffer,
  target: RasterTarget,
  options: ImageOptions = {},
): Promise<ConversionOutput> {
  const meta = await readMetadata(bytes);
  const notes: string[] = [];
  let pipeline = sharp(bytes, { animated: false }).rotate(); // honour EXIF orientation

  if (meta.pages && meta.pages > 1) {
    notes.push(`The source has ${meta.pages} frames; only the first was converted.`);
  }

  pipeline = applyResize(pipeline, options, notes, meta);

  const quality = options.quality ?? 80;
  switch (target) {
    case 'jpeg':
      if (meta.hasAlpha) notes.push('Transparency was flattened onto a white background because JPG has no alpha channel.');
      pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true });
      break;
    case 'png':
      pipeline = pipeline.png({ compressionLevel: 9 });
      break;
    case 'webp':
      pipeline = pipeline.webp({ quality });
      break;
    case 'avif':
      pipeline = pipeline.avif({ quality });
      break;
  }

  const output = await pipeline.toBuffer();
  const delta = bytes.length === 0 ? 0 : Math.round(((output.length - bytes.length) / bytes.length) * 100);
  notes.push(`Output is ${output.length.toLocaleString()} bytes (${delta >= 0 ? '+' : ''}${delta}% vs the original).`);
  return { bytes: output, notes };
}

const PAGE_DIMENSIONS: Record<Exclude<PageSize, 'fit'>, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

/**
 * Place a single image on a single PDF page.
 *
 * pdf-lib can only embed JPEG and PNG, so anything else (WebP, AVIF, TIFF, GIF)
 * is first re-encoded to PNG by sharp. That is stated in the returned notes
 * rather than happening silently.
 */
export async function imageToPdf(
  bytes: Buffer,
  options: { pageSize?: PageSize; quality?: number } = {},
): Promise<ConversionOutput> {
  const meta = await readMetadata(bytes);
  const notes: string[] = [];
  const pageSize = options.pageSize ?? 'a4';

  let embedBytes = bytes;
  let embedKind: 'jpeg' | 'png' = 'png';

  if (meta.format === 'jpeg') {
    embedKind = 'jpeg';
  } else if (meta.format === 'png') {
    embedKind = 'png';
  } else {
    embedBytes = await sharp(bytes, { animated: false }).rotate().png().toBuffer();
    notes.push(`The ${meta.format ?? 'source'} image was re-encoded to PNG so it could be embedded in the PDF.`);
  }

  const pdf = await PDFDocument.create();
  const image = embedKind === 'jpeg' ? await pdf.embedJpg(embedBytes) : await pdf.embedPng(embedBytes);

  if (pageSize === 'fit') {
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    notes.push(`Page sized to the image: ${image.width}×${image.height} points.`);
  } else {
    const [pageWidth, pageHeight] = PAGE_DIMENSIONS[pageSize];
    const margin = 36; // 0.5 inch
    const scale = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    const page = pdf.addPage([pageWidth, pageHeight]);
    page.drawImage(image, {
      x: (pageWidth - width) / 2,
      y: (pageHeight - height) / 2,
      width,
      height,
    });
    notes.push(`Centred on a ${pageSize.toUpperCase()} page with a 0.5 inch margin.`);
  }

  pdf.setProducer('Unified Utility Platform');
  pdf.setCreator('Unified Utility Platform');
  return { bytes: Buffer.from(await pdf.save()), notes };
}

export async function describeImage(bytes: Buffer) {
  const meta = await readMetadata(bytes);
  return {
    format: meta.format,
    width: meta.width,
    height: meta.height,
    hasAlpha: Boolean(meta.hasAlpha),
    frames: meta.pages ?? 1,
  };
}
