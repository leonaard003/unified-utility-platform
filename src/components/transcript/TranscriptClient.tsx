'use client';

import { useEffect, useMemo, useState } from 'react';
import Banner from '@/components/Banner';
import { useDownloader, type DownloadMode } from '@/components/downloader/useDownloader';

type TranscriptResponse = {
  videoId: string;
  mode: 'live' | 'demo';
  isDemo: boolean;
  title?: string;
  provenance: string;
  language: string;
  languageCode: string;
  segments: { start: number; duration: number; text: string }[];
  plainText: string;
  srt: string;
  json: string;
  platform?: string;
  engine?: string;
};

function downloadText(name: string, mime: string, text: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function timecode(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

/**
 * Platforms refusing a datacenter IP is the single most common failure here,
 * and yt-dlp reports it as a wall of text. Recognising the signature lets the
 * page say what actually happened and point at the one field that fixes it.
 */
function isPlatformBlock(...parts: (string | null | undefined)[]): boolean {
  const text = parts.filter(Boolean).join(' ');
  return /sign in to confirm|not a bot|UPSTREAM_BLOCKED|confirm your age|login required/i.test(text);
}

export default function TranscriptClient() {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'live' | 'demo'>('live');
  const [language, setLanguage] = useState('');
  const [dlMode, setDlMode] = useState<DownloadMode>('video');
  const [formatId, setFormatId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [result, setResult] = useState<TranscriptResponse | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const downloader = useDownloader();

  const engine = downloader.current?.engine;
  const media = downloader.result?.media;
  const canonicalUrl = downloader.result?.detection?.canonicalUrl || null;
  const busy = loading || downloader.probing || downloader.downloading;
  const blocked = isPlatformBlock(error, hint, downloader.error?.message, downloader.error?.hint);

  useEffect(() => {
    if (blocked) setAdvancedOpen(true);
  }, [blocked]);

  const filenameBase = useMemo(
    () => (result?.title || result?.videoId || 'transcript').replace(/[^\w.-]+/g, '_'),
    [result],
  );

  async function pasteFromClipboard() {
    setPasteNote(null);
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setUrl(text.trim());
        return;
      }
      setPasteNote('The clipboard is empty.');
    } catch {
      // Firefox has no readText for pages, and Chrome needs an explicit grant.
      setPasteNote('The browser blocked clipboard access — paste into the field with Ctrl+V.');
    }
  }

  function clearOutput() {
    setError(null);
    setHint(null);
    setPasteNote(null);
    setResult(null);
    downloader.reset();
  }

  async function getTranscript() {
    if (!url.trim() || busy) return;
    clearOutput();
    setLoading(true);
    try {
      const response = await fetch('/api/transcript', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, mode, languageHint: language }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error?.message || 'Could not get a transcript.');
        setHint(data.error?.hint || null);
        return;
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get a transcript.');
    } finally {
      setLoading(false);
    }
  }

  /** Probe first when the URL has not been inspected yet, then fetch the media. */
  async function downloadVideo() {
    if (!url.trim() || busy) return;
    setError(null);
    setHint(null);
    setResult(null);

    if (media && canonicalUrl) {
      await downloader.download({ url: canonicalUrl, mode: dlMode, formatId });
      return;
    }
    const probed = await downloader.probe(url);
    const probedUrl = probed?.detection?.canonicalUrl;
    if (probed?.media && probedUrl) {
      await downloader.download({ url: probedUrl, mode: dlMode, formatId: '' });
    }
  }

  return (
    <div className="card tool-shell">
      <h1>Video Transcript &amp; Downloader</h1>
      <p className="lede">Paste a public video link, then take the transcript or download the file.</p>

      <div className="searchbar">
        <input
          type="url"
          className="searchbar-input"
          value={url}
          placeholder="Paste your video link"
          aria-label="Public video URL"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void downloadVideo();
          }}
        />
        <button type="button" onClick={() => void pasteFromClipboard()} disabled={busy}>
          Paste
        </button>
        <button type="button" className="primary" onClick={() => void downloadVideo()} disabled={!url.trim() || busy}>
          {downloader.probing ? 'Checking…' : downloader.downloading ? 'Downloading…' : 'Download'}
        </button>
      </div>

      <div className="searchbar-actions">
        <button type="button" onClick={() => void getTranscript()} disabled={!url.trim() || busy}>
          {loading ? 'Transcribing…' : 'Get transcript instead'}
        </button>
        {url.trim() ? (
          <button type="button" onClick={() => { setUrl(''); clearOutput(); }} disabled={busy}>
            Clear
          </button>
        ) : null}
      </div>

      <p className="hint centered">
        YouTube, Instagram, TikTok, and X/Twitter public links. Download only what you have the right to use.
      </p>

      {pasteNote ? <Banner tone="warn" title={pasteNote} /> : null}

      {engine && !engine.available ? (
        <Banner tone="warn" title="The download engine is not installed on this server">
          <div className="hint">{engine.installHint} Transcripts may still work.</div>
        </Banner>
      ) : null}

      {blocked ? (
        <Banner tone="warn" title="The platform is refusing this server">
          <p>
            YouTube (and sometimes TikTok or Instagram) blocks requests coming from a datacenter IP and
            asks it to prove it is not a bot. Nothing is broken on this side — the request never gets
            through.
          </p>
          <p>Two ways past it:</p>
          <ul>
            <li>
              Export cookies from a browser already signed in to that platform, in Netscape format, and
              paste them into <strong>Cookies</strong> below. Cookies expire, so this needs redoing now and then.
            </li>
            <li>
              Set <code>APIFY_TOKEN</code> on the server so the request is made by an external provider
              from its own address pool instead.
            </li>
          </ul>
        </Banner>
      ) : null}

      {error ? (
        <Banner tone="error" title={error}>
          {hint ? <div className="hint">{hint}</div> : null}
        </Banner>
      ) : null}

      {downloader.error ? (
        <Banner tone="error" title={downloader.error.message}>
          {downloader.error.hint ? <div className="hint">{downloader.error.hint}</div> : null}
        </Banner>
      ) : null}

      {media ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{media.title || 'Media found'}</h2>
          <ul className="stat-row">
            {media.uploader ? (
              <li className="stat"><span className="stat-label">Uploader</span><span className="stat-value">{media.uploader}</span></li>
            ) : null}
            {typeof media.durationSeconds === 'number' ? (
              <li className="stat"><span className="stat-label">Duration</span><span className="stat-value">{timecode(media.durationSeconds)}</span></li>
            ) : null}
            <li className="stat"><span className="stat-label">Qualities</span><span className="stat-value">{downloader.formats.length}</span></li>
          </ul>
          <div className="row">
            <div className="field">
              <label htmlFor="dl-mode">Mode</label>
              <select id="dl-mode" value={dlMode} onChange={(e) => setDlMode(e.target.value as DownloadMode)}>
                <option value="video">Video</option>
                <option value="audio">Audio only</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="format-id">Quality</label>
              <select id="format-id" value={formatId} onChange={(e) => setFormatId(e.target.value)}>
                <option value="">Best automatic choice</option>
                {downloader.formats.map((format) => (
                  <option key={format.id} value={format.id}>{format.label}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            className="primary"
            disabled={!downloader.canDownload || !canonicalUrl || downloader.downloading}
            onClick={() => { if (canonicalUrl) void downloader.download({ url: canonicalUrl, mode: dlMode, formatId }); }}
          >
            {downloader.downloading ? 'Downloading…' : 'Download this quality'}
          </button>
        </div>
      ) : null}

      {result ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{result.title || `Source ${result.videoId}`}</h2>
          <ul className="stat-row">
            <li className="stat"><span className="stat-label">Language</span><span className="stat-value">{result.languageCode || result.language}</span></li>
            <li className="stat"><span className="stat-label">Segments</span><span className="stat-value">{result.segments.length}</span></li>
            {result.engine ? (
              <li className="stat"><span className="stat-label">Engine</span><span className="stat-value">{result.engine}</span></li>
            ) : null}
          </ul>
          <p className="muted small">{result.provenance}</p>
          <div className="button-row">
            <button type="button" onClick={() => void navigator.clipboard.writeText(result.plainText)}>Copy text</button>
            <button type="button" onClick={() => downloadText(`${filenameBase}.txt`, 'text/plain;charset=utf-8', result.plainText)}>TXT</button>
            <button type="button" onClick={() => downloadText(`${filenameBase}.srt`, 'application/x-subrip', result.srt)}>SRT</button>
            <button type="button" onClick={() => downloadText(`${filenameBase}.json`, 'application/json', result.json)}>JSON</button>
          </div>
          <textarea
            readOnly
            rows={16}
            value={result.segments.map((s) => `${timecode(s.start)}  ${s.text}`).join('\n')}
          />
        </div>
      ) : null}

      {/* Opened for the caller when a platform block is detected: the fix is the
          Cookies field inside, and leaving it collapsed hides the way out. */}
      <details className="card" open={advancedOpen} onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}>
        <summary><strong>Advanced</strong></summary>
        <div className="row" style={{ marginTop: '1rem' }}>
          <div className="field">
            <label htmlFor="mode">Transcript mode</label>
            <select id="mode" value={mode} onChange={(e) => setMode(e.target.value as 'live' | 'demo')}>
              <option value="live">Live transcription</option>
              <option value="demo">Demo transcript</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="lang">Language hint</label>
            <input id="lang" type="text" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en, id, en-US" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="cookies-text">Cookies (for links that demand a sign-in)</label>
          <textarea
            id="cookies-text"
            rows={5}
            value={downloader.cookiesText}
            onChange={(e) => downloader.setCookiesText(e.target.value)}
            placeholder={'# Netscape HTTP Cookie File'}
          />
          <p className="hint">
            If a platform answers &ldquo;Sign in to confirm you&rsquo;re not a bot&rdquo;, export cookies in Netscape
            format from a signed-in browser, paste them here, and try again.
          </p>
        </div>
        {engine ? (
          <p className="hint">
            Engine: {engine.available ? `yt-dlp ${engine.version || 'ready'}` : 'yt-dlp missing'} ·
            ffmpeg {engine.ffmpegAvailable ? 'ready' : 'missing'}
          </p>
        ) : null}
      </details>
    </div>
  );
}
