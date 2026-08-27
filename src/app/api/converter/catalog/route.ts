import { json } from '@/lib/http';
import { getCapabilities } from '@/lib/capabilities';
import { CONVERSIONS } from '@/modules/converter/catalog';

export async function GET() {
  return json({ conversions: CONVERSIONS, capabilities: await getCapabilities() });
}
