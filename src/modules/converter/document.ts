import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { extractText, getDocumentProxy } from 'unpdf';
import { resolveBinary } from '@/lib/capabilities';
import { AppError } from '@/lib/errors';
import { run } from '@/lib/subprocess';
import { withWorkspace } from '@/lib/tempfiles';
import type { PageSize } from './catalog';
import type { ConversionOutput } from './image';

/**
 * Document conversions built on the bundled npm dependencies:
 *   unpdf   — PDF text extraction
 *   mammoth — DOCX to text/HTML
 *   pdf-lib — text to PDF
 *
 * LibreOffice is used for DOCX to PDF when it happens to be installed; when it
 * is not, the text-layout fallback runs and says so instead of failing or
 * pretending the layout survived.
 */

/* ---------------------------- PDF -> text ---------------------------- */

async function pdfPages(bytes: Buffer): Promise<string[]> {
  let pages: string[];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const result = await extractText(pdf, { mergePages: false });
    pages = (Array.isArray(result.text) ? result.text : [String(result.text)]).map((page) =>
      page.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim(),
    );
  } catch (err) {
    throw new AppError('UNSUPPORTED', 'That PDF could not be read.', {
      hint:
        err instanceof Error && /password|encrypt/i.test(err.message)
          ? 'The file appears to be password-protected. Remove the password and try again.'
          : 'It may be corrupt or not a real PDF.',
    });
  }
  return pages;
}

export async function pdfToText(bytes: Buffer): Promise<ConversionOutput> {
  const pages = await pdfPages(bytes);
  const text = pages.join('\n\n').trim();
  const notes = [`Read ${pages.length} page${pages.length === 1 ? '' : 's'}.`];
  if (text === '') {
    notes.push(
      'No text layer was found. This is almost certainly a scanned or image-only PDF — extracting its words would need OCR, which this MVP does not include.',
    );
  }
  return { bytes: Buffer.from(text === '' ? '' : `${text}\n`, 'utf8'), notes };
}

export async function pdfToMarkdown(bytes: Buffer): Promise<ConversionOutput> {
  const pages = await pdfPages(bytes);
  const body = pages.map((page, index) => `## Page ${index + 1}\n\n${page || '_(no text on this page)_'}`).join('\n\n');
  return {
    bytes: Buffer.from(`${body}\n`, 'utf8'),
    notes: [
      `Read ${pages.length} page${pages.length === 1 ? '' : 's'}.`,
      'Only page breaks are represented as structure — headings and lists inside the PDF are not detected.',
    ],
  };
}

/* ---------------------------- DOCX ---------------------------- */

async function docxText(bytes: Buffer): Promise<{ text: string; warnings: string[] }> {
  try {
    const result = await mammoth.extractRawText({ buffer: bytes });
    return { text: result.value, warnings: result.messages.map((m) => m.message) };
  } catch {
    throw new AppError('UNSUPPORTED', 'That file could not be read as a DOCX.', {
      hint: 'Legacy .doc files are not supported — re-save as .docx first.',
    });
  }
}

export async function docxToText(bytes: Buffer): Promise<ConversionOutput> {
  const { text, warnings } = await docxText(bytes);
  const notes = ['Body text only — styling, headers, footers and images are not included.'];
  if (warnings.length > 0) notes.push(`Converter warnings: ${warnings.slice(0, 3).join('; ')}`);
  return { bytes: Buffer.from(`${text.trim()}\n`, 'utf8'), notes };
}

export async function docxToHtml(bytes: Buffer): Promise<ConversionOutput> {
  let result: { value: string; messages: { message: string }[] };
  try {
    result = await mammoth.convertToHtml({ buffer: bytes });
  } catch {
    throw new AppError('UNSUPPORTED', 'That file could not be read as a DOCX.', {
      hint: 'Legacy .doc files are not supported — re-save as .docx first.',
    });
  }
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Converted document</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.6; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; }
  td, th { border: 1px solid #ccc; padding: 0.3rem 0.5rem; }
</style>
</head>
<body>
${result.value}
</body>
</html>
`;
  const notes = ['Headings, lists, tables and inline emphasis are preserved. Images are inlined as data URLs.'];
  if (result.messages.length > 0) {
    notes.push(`Converter warnings: ${result.messages.slice(0, 3).map((m) => m.message).join('; ')}`);
  }
  return { bytes: Buffer.from(html, 'utf8'), notes };
}

/* ---------------------------- text -> PDF ---------------------------- */

const PAGE_DIMENSIONS: Record<Exclude<PageSize, 'fit'>, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

/**
 * pdf-lib's standard fonts use WinAnsi encoding, which cannot represent most
 * non-Latin text. Rather than throwing halfway through a document, unsupported
 * characters are replaced and the substitution is reported in the notes.
 */
function toWinAnsi(text: string): { text: string; replaced: number } {
  let replaced = 0;
  const mapped = text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .split('')
    .map((char) => {
      const code = char.codePointAt(0)!;
      if (char === '\n' || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) return char;
      replaced += 1;
      return '?';
    })
    .join('');
  return { text: mapped, replaced };
}

function wrap(line: string, maxWidth: number, measure: (s: string) => number): string[] {
  if (line === '') return [''];
  if (measure(line) <= maxWidth) return [line];

  const out: string[] = [];
  let current = '';
  for (const word of line.split(/(\s+)/)) {
    if (word === '') continue;
    const candidate = current + word;
    if (measure(candidate) <= maxWidth || current === '') {
      // A single word longer than the line has to be hard-broken.
      if (current === '' && measure(word) > maxWidth) {
        let chunk = '';
        for (const char of word) {
          if (measure(chunk + char) > maxWidth && chunk !== '') {
            out.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        current = chunk;
        continue;
      }
      current = candidate;
    } else {
      out.push(current.trimEnd());
      current = word.trimStart();
    }
  }
  if (current.trimEnd() !== '' || out.length === 0) out.push(current.trimEnd());
  return out;
}

export async function textToPdf(
  input: string,
  options: { pageSize?: PageSize; title?: string } = {},
): Promise<ConversionOutput> {
  const pageSize = options.pageSize === 'fit' || !options.pageSize ? 'a4' : options.pageSize;
  const [pageWidth, pageHeight] = PAGE_DIMENSIONS[pageSize];
  const margin = 56;
  const fontSize = 11;
  const lineHeight = fontSize * 1.45;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const measure = (s: string) => font.widthOfTextAtSize(s, fontSize);
  const usableWidth = pageWidth - margin * 2;

  const { text, replaced } = toWinAnsi(input);
  const lines = text.split('\n').flatMap((line) => wrap(line, usableWidth, measure));

  const linesPerPage = Math.max(1, Math.floor((pageHeight - margin * 2) / lineHeight));
  const pageCount = Math.max(1, Math.ceil(lines.length / linesPerPage));

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;
    for (const line of lines.slice(pageIndex * linesPerPage, (pageIndex + 1) * linesPerPage)) {
      if (line !== '') page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0.09, 0.1, 0.11) });
      y -= lineHeight;
    }
    const label = `${pageIndex + 1} / ${pageCount}`;
    page.drawText(label, {
      x: pageWidth - margin - font.widthOfTextAtSize(label, 9),
      y: margin / 2,
      size: 9,
      font,
      color: rgb(0.45, 0.48, 0.52),
    });
  }

  if (options.title) pdf.setTitle(options.title);
  pdf.setProducer('Unified Utility Platform');
  pdf.setCreator('Unified Utility Platform');

  const notes = [`${pageCount} page${pageCount === 1 ? '' : 's'} at ${pageSize.toUpperCase()}, 11pt Helvetica.`];
  if (replaced > 0) {
    notes.push(
      `${replaced} character${replaced === 1 ? '' : 's'} outside the Latin-1 range (for example CJK or emoji) could not be drawn with the built-in font and were replaced with "?".`,
    );
  }
  return { bytes: Buffer.from(await pdf.save()), notes };
}

/* ---------------------------- DOCX -> PDF ---------------------------- */

/** Full-fidelity path — only taken when LibreOffice is actually installed. */
async function sofficeToPdf(bytes: Buffer, filename: string): Promise<Buffer | null> {
  const { bin } = await resolveBinary('soffice');
  if (!bin) return null;

  return withWorkspace('soffice', async (ws) => {
    const input = ws.file(filename);
    await fs.writeFile(input, bytes);
    const result = await run(
      bin,
      ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', ws.dir, input],
      { timeoutMs: 180_000 },
    );
    if (result.code !== 0) return null;
    const produced = (await fs.readdir(ws.dir)).find((name) => name.toLowerCase().endsWith('.pdf'));
    return produced ? fs.readFile(path.join(ws.dir, produced)) : null;
  });
}

export async function docxToPdf(
  bytes: Buffer,
  filename: string,
  options: { pageSize?: PageSize } = {},
): Promise<ConversionOutput> {
  const viaSoffice = await sofficeToPdf(bytes, filename);
  if (viaSoffice) {
    return {
      bytes: viaSoffice,
      notes: ['Converted with LibreOffice — the original layout, fonts and images are preserved.'],
    };
  }

  const { text, warnings } = await docxText(bytes);
  const output = await textToPdf(text, { pageSize: options.pageSize, title: filename });
  return {
    bytes: output.bytes,
    notes: [
      'LibreOffice is not installed on this server, so the document was rebuilt as flowed text. The original layout, fonts, images and tables are NOT reproduced.',
      'Install LibreOffice (apt install libreoffice-writer) for a full-fidelity conversion — this app will use it automatically once present.',
      ...output.notes,
      ...(warnings.length > 0 ? [`Reader warnings: ${warnings.slice(0, 3).join('; ')}`] : []),
    ],
  };
}
