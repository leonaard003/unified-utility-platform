'use client';

import { useEffect, useState } from 'react';
import Banner from '@/components/Banner';
import type { DownloadMode, useDownloader } from '@/components/downloader/useDownloader';

type Props = {
  url: string;
  downloader: ReturnType<typeof useDownloader>;
};

export default function DownloadPanel({ url, downloader }: Props) {
  const {
    current,
    result,
    formats,
    canDownload,
    probing,
    downloading,
    error,
    probe,
    download,
    reset,
    cookiesText,
    setCookiesText,
  } = downloader;

  const [mode, setMode] = useState<DownloadMode>('video');
  const [formatId, setFormatId] = useState('');
  const canonicalUrl = result?.detection?.canonicalUrl || null;
  const qualityReady = Boolean(result?.media);

  useEffect(() => {
    reset();
    setFormatId('');
  }, [url, reset]);

  return (
    <>
      {current ? (
        <Banner tone={current.engine.available ? 'ok' : 'warn'} title={current.engine.available ? 'Extraction engine available' : 'Extraction engine missing'}>
          <div className="hint">
            {current.engine.available ? `yt-dlp is installed${current.engine.version ? ` (${current.engine.version})` : ''}.` : current.engine.installHint}
          </div>
        </Banner>
      ) : null}

      <Banner tone="info" title="Download flow">
        <div className="hint">
          Click <strong>Check URL</strong> first. Quality and format options appear after the URL probe succeeds. If YouTube says “Sign in to confirm you’re not a bot”, you can paste exported cookies below and probe again.
        </div>
      </Banner>

      <div className="button-row">
        <button type="button" className="primary" disabled={!url.trim() || probing} onClick={() => void probe(url)}>
          {probing ? 'Checking…' : 'Check URL'}
        </button>
      </div>

      <div className="field" style={{ marginTop: '1rem' }}>
        <label htmlFor="cookies-text">Cookies (optional, advanced)</label>
        <textarea
          id="cookies-text"
          rows={6}
          value={cookiesText}
          onChange={(e) => setCookiesText(e.target.value)}
          placeholder={'Paste Netscape-format cookies here only if a platform asks you to sign in. Example first line: # Netscape HTTP Cookie File'}
        />
        <p className="hint">Only needed for blocked videos. The cookies are sent only with this request flow and are not shown back in results.</p>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>Download options</h2>
        <div className="field">
          <label htmlFor="dl-mode">Download mode</label>
          <select id="dl-mode" value={mode} onChange={(e) => setMode(e.target.value as DownloadMode)} disabled={!qualityReady}>
            <option value="video">Video</option>
            <option value="audio">Audio only</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="format-id">Quality / format</label>
          <select id="format-id" value={formatId} onChange={(e) => setFormatId(e.target.value)} disabled={!qualityReady}>
            <option value="">{qualityReady ? 'Best automatic choice' : 'Run Check URL first'}</option>
            {formats.map((format) => (
              <option key={format.id} value={format.id}>{format.label}</option>
            ))}
          </select>
          <p className="hint">{qualityReady ? 'Audio-only downloads ignore video-specific formats.' : 'Quality choices appear here after a successful probe.'}</p>
        </div>
        <button
          type="button"
          className="primary"
          disabled={!canDownload || !canonicalUrl || !qualityReady || downloading}
          onClick={() => {
            if (canonicalUrl) void download({ url: canonicalUrl, mode, formatId });
          }}
        >
          {downloading ? 'Downloading…' : 'Download now'}
        </button>
      </div>

      {error ? (
        <Banner tone="error" title={error.message}>
          {error.hint ? <div className="hint">{error.hint}</div> : null}
        </Banner>
      ) : null}

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

          {result.probeError ? (
            <Banner tone="warn" title={result.probeError.message}>
              {result.probeError.hint ? <div className="hint">{result.probeError.hint}</div> : null}
            </Banner>
          ) : null}

          {result.media ? (
            <>
              <h3>Media info</h3>
              <ul>
                <li><strong>Title:</strong> {result.media.title}</li>
                {result.media.uploader ? <li><strong>Uploader:</strong> {result.media.uploader}</li> : null}
                {typeof result.media.durationSeconds === 'number' ? <li><strong>Duration:</strong> {result.media.durationSeconds}s</li> : null}
                <li><strong>Available formats:</strong> {formats.length}</li>
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
