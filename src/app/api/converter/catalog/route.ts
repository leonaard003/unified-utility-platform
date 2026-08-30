import { json } from '@/lib/http';
import { getCapabilities } from '@/lib/capabilities';
import { CONVERSIONS } from '@/modules/converter/catalog';
import { MAX_UPLOAD_BYTES } from '@/lib/limits';

export async function GET() {
  return json({
    conversions: CONVERSIONS,
    capabilities: await getCapabilities(),
    limits: { maxUploadBytes: MAX_UPLOAD_BYTES },
  });
}
