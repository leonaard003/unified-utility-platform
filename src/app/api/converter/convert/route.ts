import { attachmentHeaders, errorResponse } from '@/lib/http';
import { getCapabilities, requireBinary } from '@/lib/capabilities';
import { enforceRateLimit, RULES } from '@/lib/ratelimit';
import { extensionOf as extFromName, readUpload, replaceExtension, requireString } from '@/lib/validate';
import { findConversion } from '@/modules/converter/catalog';
import { convertMedia } from '@/modules/converter/media';
import { convertImage, imageToPdf } from '@/modules/converter/image';
import { docxToHtml, docxToPdf, docxToText, pdfToMarkdown, pdfToText, textToPdf } from '@/modules/converter/document';
import { AppError } from '@/lib/errors';

function intField(form: FormData, key: string): number | undefined {
  const raw = form.get(key);
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function POST(req: Request) {
  try {
    enforceRateLimit(req, RULES.convert);
    const form = await req.formData();
    const upload = await readUpload(form);
    const conversionId = requireString(form.get('conversionId'), 'conversionId');
    const spec = findConversion(conversionId);
    if (!spec) throw new AppError('INVALID_INPUT', 'Unknown conversion type.');

    const inputExt = extFromName(upload.name);
    if (!spec.from.includes(inputExt)) {
      throw new AppError('UNSUPPORTED', `.${inputExt || 'unknown'} files cannot be converted with ${spec.id}.`);
    }

    if (spec.requires) {
      await requireBinary(spec.requires);
    }

    let output: { bytes: Buffer; notes: string[] };

    switch (spec.id) {
      case 'image:jpeg':
      case 'image:png':
      case 'image:webp':
      case 'image:avif':
        output = await convertImage(upload.bytes, spec.target as 'jpeg' | 'png' | 'webp' | 'avif', {
          width: intField(form, 'width'),
          height: intField(form, 'height'),
          quality: intField(form, 'quality'),
        });
        break;
      case 'image:pdf':
        output = await imageToPdf(upload.bytes, { pageSize: (form.get('pageSize') as 'a4' | 'letter' | 'fit' | null) || 'a4' });
        break;
      case 'document:pdf-txt':
        output = await pdfToText(upload.bytes);
        break;
      case 'document:pdf-md':
        output = await pdfToMarkdown(upload.bytes);
        break;
      case 'document:docx-txt':
        output = await docxToText(upload.bytes);
        break;
      case 'document:docx-html':
        output = await docxToHtml(upload.bytes);
        break;
      case 'document:docx-pdf':
        output = await docxToPdf(upload.bytes, upload.name, { pageSize: (form.get('pageSize') as 'a4' | 'letter' | 'fit' | null) || 'a4' });
        break;
      case 'document:text-pdf':
        output = await textToPdf(upload.bytes.toString('utf8'), { pageSize: (form.get('pageSize') as 'a4' | 'letter' | null) || 'a4', title: upload.name });
        break;
      default:
        if (spec.category === 'audio' || spec.category === 'video') {
          output = await convertMedia(upload.bytes, upload.name, spec.target as 'mp3' | 'wav' | 'm4a' | 'ogg' | 'mp4' | 'webm', {
            audioBitrate: typeof form.get('audioBitrate') === 'string' ? String(form.get('audioBitrate')) : undefined,
            videoHeight: typeof form.get('videoHeight') === 'string' ? String(form.get('videoHeight')) : undefined,
          });
        } else {
          throw new AppError('UNSUPPORTED', `${spec.id} is not wired up yet.`);
        }
    }

    const headers = attachmentHeaders(replaceExtension(upload.name, spec.outExt), spec.mime, output.bytes.length);
    headers.set('x-uup-notes', encodeURIComponent(JSON.stringify(output.notes)));
    return new Response(new Uint8Array(output.bytes).buffer as ArrayBuffer, { headers });
  } catch (err) {
    return errorResponse('api.converter.convert', err);
  }
}

export async function GET() {
  return Response.json({ capabilities: await getCapabilities() });
}
