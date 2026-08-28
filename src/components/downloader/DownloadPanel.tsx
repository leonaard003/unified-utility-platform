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

  async function handlePrimaryDownload() {
    if (!url.trim()) return;

    if (qualityReady && canonicalUrl) {
      await download({ url: canonicalUrl, mode, formatId });
      return;
    }

    const probed = await probe(url);
    const probedUrl = probed?.detection?.canonicalUrl;
    if (probed?.media && probedUrl) {
      await download({ url: probedUrl, mode, formatId: '' });
    }
  }

  return (
    <>
      {current ? (
        <Banner tone={current.engine.available ? 'ok' : 'warn'} title={current.engine.available ? 'Download engine ready' : 'Download engine missing'}>
          <div className="hint">
            {current.engine.available ? `yt-dlp ready${current.engine.version ? ` (${current.engine.version})` : ''}.` : current.engine.installHint}
          </div>
        </Banner>
      ) : null}

      <div className="button-row">
        <button type="button" className="primary" disabled={!url.trim() || probing || downloading} onClick={() => void handlePrimaryDownload()}>
          {probing ? 'Checking…' : downloading ? 'Downloading…' : 'Download video'}
        </button>
      </div>

      {error ? (
        <Banner tone="error" title={error.message}>
          {error.hint ? <div className="hint">{error.hint}</div> : null}
        </Banner>
      ) : null}

      {result?.media ? (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2>{result.media.title || 'Media found'}</h2>
          <ul>
            {result.media.uploader ? <li><strong>Uploader:</strong> {result.media.uploader}</li> : null}
            {typeof result.media.durationSeconds === 'number' ? <li><strong>Duration:</strong> {result.media.durationSeconds}s</li> : null}
            <li><strong>Available qualities:</strong> {formats.length}</li>
          </ul>
        </div>
      ) : null}

      {result?.media ? (
        <details className="card" style={{ marginTop: '1rem' }}>
          <summary><strong>Choose another quality / mode</strong></summary>
          <div style={{ marginTop: '1rem' }}>
            <div className="field">
              <label htmlFor="dl-mode">Mode</label>
              <select id="dl-mode" value={mode} onChange={(e) => setMode(e.target.value as DownloadMode)}>
                <option value="video">Video</option>
                <option value="audio">Audio only</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="format-id">Quality</label>
              <select id="format-id" value={formatId} onChange={(e) => setFormatId(e.target.value)}>
                <option value="">Best automatic choice</option>
                {formats.map((format) => (
                  <option key={format.id} value={format.id}>{format.label}</option>
                ))}
              </select>
              <p className="hint">Choose a quality if available, or leave automatic.</p>
            </div>
            <button
              type="button"
              className="primary"
              disabled={!canDownload || !canonicalUrl || downloading}
              onClick={() => {
                if (canonicalUrl) void download({ url: canonicalUrl, mode, formatId });
              }}
            >
              {downloading ? 'Downloading…' : 'Download selected quality'}
            </button>
          </div>
        </details>
      ) : null}

      <details className="card" style={{ marginTop: '1rem' }}>
        <summary><strong>Advanced / blocked video help</strong></summary>
        <div style={{ marginTop: '1rem' }}>
          <p className="hint">If a platform says “Sign in to confirm you’re not a bot”, paste Netscape-format cookies here and click Download again.</p>
          <div className="field">
            <label htmlFor="cookies-text">Cookies</label>
            <textarea
              id="cookies-text"
              rows={6}
              value={cookiesText}
              onChange={(e) => setCookiesText(e.target.value)}
              placeholder={'Example first line: # Netscape HTTP Cookie File'}
            />
          </div>
          {result?.detection ? (
            <>
              <p className="small muted">Canonical URL: {result.detection.canonicalUrl}</p>
              {result.probeError ? (
                <Banner tone="warn" title={result.probeError.message}>
                  {result.probeError.hint ? <div className="hint">{result.probeError.hint}</div> : null}
                </Banner>
              ) : null}
            </>
          ) : null}
        </div>
      </details>
    </>
  );
}
