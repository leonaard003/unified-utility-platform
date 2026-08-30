'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Banner from '@/components/Banner';
import { formatBytes } from '@/lib/limits';

type ConversionSpec = { id: string; label: string; from: string[]; outExt: string; notes: string[]; options: string[]; requires?: string };
type Catalog = {
  conversions: ConversionSpec[];
  capabilities: { id: string; available: boolean }[];
  limits?: { maxUploadBytes: number };
};

export default function ConverterClient() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [conversionId, setConversionId] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [quality, setQuality] = useState('80');
  const [pageSize, setPageSize] = useState('a4');
  const [audioBitrate, setAudioBitrate] = useState('192k');
  const [videoHeight, setVideoHeight] = useState('original');
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Drag events fire for child nodes too, so a plain leave handler flickers.
  // Counting enter/leave pairs keeps the highlight stable.
  const dragDepth = useRef(0);

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/converter/catalog');
      setCatalog(await response.json());
    })();
  }, []);

  // Without this, dropping a file just outside the zone makes the browser
  // navigate away from the app and open the file on its own.
  useEffect(() => {
    const swallow = (event: DragEvent) => event.preventDefault();
    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => {
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
    };
  }, []);

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const maxUploadBytes = catalog?.limits?.maxUploadBytes ?? 0;
  const extension = useMemo(() => file?.name.split('.').pop()?.toLowerCase() || '', [file]);
  const available = useMemo(() => (catalog?.conversions || []).filter((spec) => extension && spec.from.includes(extension)), [catalog, extension]);
  const acceptedExtensions = useMemo(
    () => [...new Set((catalog?.conversions || []).flatMap((spec) => spec.from))].sort(),
    [catalog],
  );

  useEffect(() => {
    setConversionId(available[0]?.id || '');
  }, [available]);

  function applyFiles(dropped: File[]) {
    if (!dropped.length) return;
    const [next, ...rest] = dropped;
    if (maxUploadBytes && next.size > maxUploadBytes) {
      setFile(null);
      setFileError(`"${next.name}" is ${formatBytes(next.size)}, over the ${formatBytes(maxUploadBytes)} upload limit.`);
      return;
    }
    setFile(next);
    setFileError(rest.length ? `Only one file at a time. Kept "${next.name}" and ignored ${rest.length} more.` : null);
  }

  function clearFile() {
    setFile(null);
    setFileError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function onDragEnter(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  }

  function onDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragActive(false);
    }
  }

  function onDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    applyFiles(Array.from(event.dataTransfer.files));
    // Keep the hidden input empty so re-picking the same file still fires change.
    if (inputRef.current) inputRef.current.value = '';
  }

  function onZoneKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      inputRef.current?.click();
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !conversionId) return;
    setLoading(true);
    setError(null);
    setNotes([]);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('conversionId', conversionId);
      if (width) form.append('width', width);
      if (height) form.append('height', height);
      if (quality) form.append('quality', quality);
      if (pageSize) form.append('pageSize', pageSize);
      if (audioBitrate) form.append('audioBitrate', audioBitrate);
      if (videoHeight) form.append('videoHeight', videoHeight);
      const response = await fetch('/api/converter/convert', { method: 'POST', body: form });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error?.message || 'Conversion failed.');
        return;
      }
      const blob = await response.blob();
      const header = response.headers.get('x-uup-notes');
      if (header) setNotes(JSON.parse(decodeURIComponent(header)));
      const name = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'converted.bin';
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = name;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h1>Converter</h1>
      <p className="lede">This module only offers conversions that are actually implemented. Image targets now include JPG, PNG, WEBP, AVIF, GIF, TIFF, BMP, ICO, plus PDF export. Image and document utilities work with bundled dependencies; some formats use ffmpeg.</p>

      <form onSubmit={onSubmit}>
        <div className="field">
          <span className="field-label" id="file-label">Choose file</span>
          <div
            className={`dropzone${dragActive ? ' is-active' : ''}${file ? ' has-file' : ''}`}
            role="button"
            tabIndex={0}
            aria-labelledby="file-label"
            aria-describedby="file-help"
            onClick={() => inputRef.current?.click()}
            onKeyDown={onZoneKeyDown}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <input
              ref={inputRef}
              id="file"
              type="file"
              tabIndex={-1}
              className="dropzone-input"
              accept={acceptedExtensions.length ? acceptedExtensions.map((ext) => `.${ext}`).join(',') : undefined}
              onChange={(e) => applyFiles(Array.from(e.target.files || []))}
            />
            {file ? (
              <span className="dropzone-file">
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="dropzone-thumb" />
                ) : (
                  <span className="dropzone-icon" aria-hidden="true">FILE</span>
                )}
                <span className="dropzone-name">{file.name}</span>
                <span className="dropzone-meta">{formatBytes(file.size)}</span>
              </span>
            ) : (
              <span className="dropzone-empty">
                <strong>{dragActive ? 'Release to use this file' : 'Drag a file here'}</strong>
                <span className="muted small">
                  or click to browse{maxUploadBytes ? ` (up to ${formatBytes(maxUploadBytes)})` : ''}
                </span>
              </span>
            )}
          </div>
          <p className="hint" id="file-help">
            {acceptedExtensions.length ? `Supported: ${acceptedExtensions.join(', ')}` : 'Loading supported formats…'}
          </p>
          {file ? (
            <div className="button-row" style={{ marginTop: '0.5rem' }}>
              <button type="button" onClick={clearFile}>Remove file</button>
            </div>
          ) : null}
          {/* Kept next to the zone: a rejected drop is invisible if the
              message renders below the submit button. */}
          {fileError ? <Banner tone="warn" title={fileError} /> : null}
        </div>

        <div className="field">
          <label htmlFor="conversion">Conversion</label>
          <select id="conversion" value={conversionId} onChange={(e) => setConversionId(e.target.value)} disabled={!available.length}>
            {available.length ? available.map((spec) => <option key={spec.id} value={spec.id}>{spec.id} → {spec.label}</option>) : <option value="">Choose a supported file first</option>}
          </select>
          <p className="hint">Detected extension: {extension || 'none'}</p>
        </div>

        <div className="grid">
          <div className="field"><label htmlFor="width">Width (optional)</label><input id="width" type="number" value={width} onChange={(e) => setWidth(e.target.value)} /></div>
          <div className="field"><label htmlFor="height">Height (optional)</label><input id="height" type="number" value={height} onChange={(e) => setHeight(e.target.value)} /></div>
          <div className="field"><label htmlFor="quality">Quality</label><input id="quality" type="number" min={1} max={100} value={quality} onChange={(e) => setQuality(e.target.value)} /></div>
          <div className="field"><label htmlFor="pageSize">Page size</label><select id="pageSize" value={pageSize} onChange={(e) => setPageSize(e.target.value)}><option value="a4">A4</option><option value="letter">Letter</option><option value="fit">Fit</option></select></div>
          <div className="field"><label htmlFor="audioBitrate">Audio bitrate</label><select id="audioBitrate" value={audioBitrate} onChange={(e) => setAudioBitrate(e.target.value)}><option>96k</option><option>128k</option><option>192k</option><option>256k</option><option>320k</option></select></div>
          <div className="field"><label htmlFor="videoHeight">Video height</label><select id="videoHeight" value={videoHeight} onChange={(e) => setVideoHeight(e.target.value)}><option value="original">Original</option><option value="1080">1080</option><option value="720">720</option><option value="480">480</option><option value="360">360</option></select></div>
        </div>

        <button type="submit" disabled={loading || !file || !conversionId}>{loading ? 'Converting…' : 'Convert & download'}</button>
      </form>

      {error ? <Banner tone="error" title={error} /> : null}
      {notes.length ? <Banner tone="ok" title="Conversion finished"><ul>{notes.map((note) => <li key={note}>{note}</li>)}</ul></Banner> : null}

      {available[0] ? (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2>Available for this file</h2>
          <ul>{available.map((spec) => <li key={spec.id}><strong>{spec.label}</strong> — {spec.notes.join(' ')}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}
