'use client';

import { useEffect, useState } from 'react';
import Banner from '@/components/Banner';
import type { DownloadMode, useDownloader } from '@/components/downloader/useDownloader';

type Props = {
  /** The URL typed by the user; owned by the parent so one field can serve several flows. */
  url: string;
  /** Shared probe/download state from useDownloader(), owned by the parent. */
  downloader: ReturnType<typeof useDownloader>;
};

/**
 * Download-specific controls: engine status, URL check, media info, and the
 * video/audio + quality/format pickers. Rendered by both the standalone
 * downloader page and the combined transcript page.
 */
export default function DownloadPanel({ url, downloader }: Props) {
  const { current, result, formats, canDownload, probing, downloading, error, probe, download, reset } = downloader;
  const [mode, setMode] = useState<DownloadMode>('video');
  const [formatId, setFormatId] = useState('');
  const canonicalUrl = result?.detection?.canonicalUrl || null;

  // A probe result belongs to the URL it was made for; drop it when the URL changes.
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

      <button type="button" disabled={!url.trim() || probing} onClick={() => void probe(url)}>
        {probing ? 'Checking…' : 'Check URL'}
      </button>

      {error ? <Banner tone="error" title={error.message}>{error.hint ? <div className="hint">{error.hint}</div> : null}</Banner> : null}

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
                <select id="dl-mode" value={mode} onChange={(e) => setMode(e.target.value as DownloadMode)}>
                  <option value="video">Video</option>
                  <option value="audio">Audio only</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="format-id">Quality / format (optional)</label>
                <select id="format-id" value={formatId} onChange={(e) => setFormatId(e.target.value)}>
                  <option value="">Best automatic choice</option>
                  {formats.map((format) => <option key={format.id} value={format.id}>{format.label}</option>)}
                </select>
                <p className="hint">Audio-only downloads ignore video-specific formats.</p>
              </div>
              <button
                type="button"
                className="primary"
                disabled={!canDownload || !canonicalUrl || downloading}
                onClick={() => { if (canonicalUrl) void download({ url: canonicalUrl, mode, formatId }); }}
              >
                {downloading ? 'Downloading…' : 'Download now'}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
