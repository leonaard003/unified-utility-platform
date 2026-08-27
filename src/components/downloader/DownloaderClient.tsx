'use client';

import { useEffect, useMemo, useState } from 'react';
import Banner from '@/components/Banner';

type Action = { id: string; label: string; support: string; supportLabel: string; note: string };
type Platform = { id: string; label: string; caveats: string[]; actions: Action[] };
type ProbeResponse = {
  engine: { available: boolean; version?: string; ffmpegAvailable: boolean; installHint: string };
  platforms: Platform[];
  detection?: { matched: boolean; reason: string; canonicalUrl: string | null; mediaId: string | null; kind: string | null; platform: Platform | null };
  media?: { title: string; uploader?: string; durationSeconds?: number; thumbnail?: string; formats: { id: string; label: string }[] };
  probeError?: { message: string; hint?: string };
};

export default function DownloaderClient() {
  const [url, setUrl] = useState('');
  const [caps, setCaps] = useState<ProbeResponse | null>(null);
  const [result, setResult] = useState<ProbeResponse | null>(null);
  const [mode, setMode] = useState<'video' | 'audio'>('video');
  const [formatId, setFormatId] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/downloader/probe');
      const data = await response.json();
      setCaps(data);
    })();
  }, []);

  const current = result || caps;
  const canDownload = Boolean(result?.detection?.matched && result.engine.available);

  async function probe(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch('/api/downloader/probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      setResult(await response.json());
    } finally {
      setLoading(false);
    }
  }

  async function download() {
    if (!result?.detection?.canonicalUrl) return;
    setDownloading(true);
    try {
      const response = await fetch('/api/downloader/download', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: result.detection.canonicalUrl, mode, formatId: formatId || undefined }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Download failed.');
      }
      const blob = await response.blob();
      const name = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'download.bin';
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = name;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setDownloading(false);
    }
  }

  const formats = useMemo(() => result?.media?.formats || [], [result]);

  return (
    <div className="card">
      <h1>Downloader</h1>
      <p className="lede">Paste one public URL from YouTube, X, Instagram, or TikTok. The app tells you what the URL is, what the module supports, and whether the extraction engine is installed.</p>

      {current ? (
        <Banner tone={current.engine.available ? 'ok' : 'warn'} title={current.engine.available ? 'Extraction engine available' : 'Extraction engine missing'}>
          <div className="hint">
            {current.engine.available ? `yt-dlp is installed${current.engine.version ? ` (${current.engine.version})` : ''}.` : current.engine.installHint}
          </div>
        </Banner>
      ) : null}

      <form onSubmit={probe}>
        <div className="field">
          <label htmlFor="dl-url">Public media URL</label>
          <input id="dl-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" required />
        </div>
        <button type="submit" disabled={loading}>{loading ? 'Checking…' : 'Check URL'}</button>
      </form>

      {result?.detection ? (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2>Detection</h2>
          <p>{result.detection.reason}</p>
          {result.detection.platform ? (
            <>
              <p className="small muted">Canonical URL: {result.detection.canonicalUrl}</p>
              <h3>{result.detection.platform.label} support</h3>
              <ul>
                {result.detection.platform.actions.map((action) => (
                  <li key={action.id}><strong>{action.label}:</strong> {action.supportLabel} — {action.note}</li>
                ))}
              </ul>
              <ul>
                {result.detection.platform.caveats.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </>
          ) : null}

          {result.probeError ? <Banner tone="warn" title={result.probeError.message}>{result.probeError.hint ? <div className="hint">{result.probeError.hint}</div> : null}</Banner> : null}

          {result.media ? (
            <>
              <h3>Media info</h3>
              <ul>
                <li><strong>Title:</strong> {result.media.title}</li>
                {result.media.uploader ? <li><strong>Uploader:</strong> {result.media.uploader}</li> : null}
                {typeof result.media.durationSeconds === 'number' ? <li><strong>Duration:</strong> {result.media.durationSeconds}s</li> : null}
              </ul>
              <div className="field">
                <label htmlFor="dl-mode">Download mode</label>
                <select id="dl-mode" value={mode} onChange={(e) => setMode(e.target.value as 'video' | 'audio')}>
                  <option value="video">Video</option>
                  <option value="audio">Audio only</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="format-id">Preferred format (optional)</label>
                <select id="format-id" value={formatId} onChange={(e) => setFormatId(e.target.value)}>
                  <option value="">Best automatic choice</option>
                  {formats.map((format) => <option key={format.id} value={format.id}>{format.label}</option>)}
                </select>
              </div>
              <button type="button" disabled={!canDownload || downloading} onClick={download}>{downloading ? 'Downloading…' : 'Download now'}</button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
