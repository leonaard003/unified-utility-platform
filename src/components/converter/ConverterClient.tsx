'use client';

import { useEffect, useMemo, useState } from 'react';
import Banner from '@/components/Banner';

type ConversionSpec = { id: string; label: string; from: string[]; outExt: string; notes: string[]; options: string[]; requires?: string };
type Catalog = { conversions: ConversionSpec[]; capabilities: { id: string; available: boolean }[] };

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

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/converter/catalog');
      setCatalog(await response.json());
    })();
  }, []);

  const extension = useMemo(() => file?.name.split('.').pop()?.toLowerCase() || '', [file]);
  const available = useMemo(() => (catalog?.conversions || []).filter((spec) => extension && spec.from.includes(extension)), [catalog, extension]);

  useEffect(() => {
    setConversionId(available[0]?.id || '');
  }, [available]);

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
          <label htmlFor="file">Choose file</label>
          <input id="file" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
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
