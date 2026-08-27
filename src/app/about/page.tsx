import { getCapabilities } from '@/lib/capabilities';
import { tempInfo } from '@/lib/tempfiles';
import Banner from '@/components/Banner';

export default async function AboutPage() {
  const capabilities = await getCapabilities();
  const temp = tempInfo();

  return (
    <>
      <div className="card">
        <h1>About this MVP</h1>
        <p className="lede">
          This app is built to prove the core utility flows first. Design polish, branding, and broader feature coverage can be layered on later.
        </p>
        <Banner tone="warn" title="Important disclaimers">
          <ul>
            <li>Downloader support depends on public platform access and whether the extraction engine is installed.</li>
            <li>Uploaded/generated files are temporary and are cleaned automatically.</li>
            <li>The signature tool exports an image asset; it does not certify legal validity.</li>
          </ul>
        </Banner>
      </div>

      <div className="card">
        <h2>Runtime capabilities</h2>
        <ul>
          {capabilities.map((cap) => (
            <li key={cap.id}>
              <strong>{cap.label}:</strong> {cap.available ? 'available' : 'missing'}
              {cap.version ? ` (${cap.version})` : ''}
              <div className="hint">{cap.enables} {cap.available ? '' : `Install hint: ${cap.installHint}`}</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Temporary-file policy</h2>
        <ul>
          <li><strong>Temp root:</strong> {temp.root}</li>
          <li><strong>TTL:</strong> {Math.round(temp.ttlMs / 60000)} minutes</li>
          <li><strong>OS temp dir:</strong> {temp.osTmp}</li>
        </ul>
      </div>
    </>
  );
}
