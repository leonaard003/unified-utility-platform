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

type ItemStatus = 'idle' | 'running' | 'done' | 'error';

type Item = {
  id: number;
  file: File;
  conversionId: string;
  status: ItemStatus;
  message?: string;
  notes?: string[];
  previewUrl?: string;
  resultUrl?: string;
  resultName?: string;
};

type ItemPatch = Partial<Item> & { status: ItemStatus };

function triggerDownload(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

export default function ConverterClient() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [quality, setQuality] = useState('80');
  const [pageSize, setPageSize] = useState('a4');
  const [audioBitrate, setAudioBitrate] = useState('192k');
  const [videoHeight, setVideoHeight] = useState('original');
  const [addError, setAddError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Drag events fire for child nodes too, so a plain leave handler flickers.
  // Counting enter/leave pairs keeps the highlight stable.
  const dragDepth = useRef(0);
  // crypto.randomUUID() is unavailable over plain http, so ids come from a counter.
  const nextId = useRef(1);
  // Object URLs outlive React state, so unmount has to release them explicitly.
  const liveUrls = useRef(new Set<string>());

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

  const urlsOnUnmount = liveUrls;
  useEffect(() => () => {
    urlsOnUnmount.current.forEach((url) => URL.revokeObjectURL(url));
    urlsOnUnmount.current.clear();
  }, [urlsOnUnmount]);

  const maxUploadBytes = catalog?.limits?.maxUploadBytes ?? 0;
  const acceptedExtensions = useMemo(
    () => [...new Set((catalog?.conversions || []).flatMap((spec) => spec.from))].sort(),
    [catalog],
  );

  function conversionsFor(file: File): ConversionSpec[] {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    return (catalog?.conversions || []).filter((spec) => spec.from.includes(ext));
  }

  // Files can land before the catalog does, so defaults are filled in here
  // rather than at drop time.
  useEffect(() => {
    if (!catalog) return;
    setItems((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (item.conversionId) return item;
        const first = conversionsFor(item.file)[0]?.id;
        if (!first) return item;
        changed = true;
        return { ...item, conversionId: first };
      });
      return changed ? next : prev;
    });
  }, [catalog, items]);

  function trackUrl(url: string) {
    liveUrls.current.add(url);
    return url;
  }

  function releaseUrl(url?: string) {
    if (!url) return;
    URL.revokeObjectURL(url);
    liveUrls.current.delete(url);
  }

  function addFiles(incoming: File[]) {
    if (!incoming.length) return;
    const accepted: Item[] = [];
    const rejected: string[] = [];
    for (const file of incoming) {
      if (maxUploadBytes && file.size > maxUploadBytes) {
        rejected.push(`"${file.name}" (${formatBytes(file.size)})`);
        continue;
      }
      accepted.push({
        id: nextId.current++,
        file,
        conversionId: conversionsFor(file)[0]?.id || '',
        status: 'idle',
        previewUrl: file.type.startsWith('image/') ? trackUrl(URL.createObjectURL(file)) : undefined,
      });
    }
    if (accepted.length) setItems((prev) => [...prev, ...accepted]);
    setAddError(
      rejected.length
        ? `Skipped ${rejected.join(', ')} — over the ${formatBytes(maxUploadBytes)} upload limit.`
        : null,
    );
  }

  function removeItem(id: number) {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      releaseUrl(target?.previewUrl);
      releaseUrl(target?.resultUrl);
      return prev.filter((item) => item.id !== id);
    });
    setAddError(null);
  }

  function clearAll() {
    setItems((prev) => {
      prev.forEach((item) => {
        releaseUrl(item.previewUrl);
        releaseUrl(item.resultUrl);
      });
      return [];
    });
    setAddError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function setConversion(id: number, conversionId: string) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, conversionId, status: 'idle', message: undefined } : item)));
  }

  function openPicker() {
    inputRef.current?.click();
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
    addFiles(Array.from(event.dataTransfer.files));
    // Keep the hidden input empty so re-picking the same file still fires change.
    if (inputRef.current) inputRef.current.value = '';
  }

  function onZoneKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  }

  async function convertItem(item: Item): Promise<ItemPatch> {
    const form = new FormData();
    form.append('file', item.file);
    form.append('conversionId', item.conversionId);
    if (width) form.append('width', width);
    if (height) form.append('height', height);
    if (quality) form.append('quality', quality);
    if (pageSize) form.append('pageSize', pageSize);
    if (audioBitrate) form.append('audioBitrate', audioBitrate);
    if (videoHeight) form.append('videoHeight', videoHeight);

    const response = await fetch('/api/converter/convert', { method: 'POST', body: form });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      return { status: 'error', message: data?.error?.message || 'Conversion failed.' };
    }
    const blob = await response.blob();
    const header = response.headers.get('x-uup-notes');
    const name = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'converted.bin';
    return {
      status: 'done',
      notes: header ? JSON.parse(decodeURIComponent(header)) : [],
      resultUrl: trackUrl(URL.createObjectURL(blob)),
      resultName: name,
      message: undefined,
    };
  }

  function patchItem(id: number, patch: ItemPatch) {
    setItems((prev) => prev.map((item) => {
      if (item.id !== id) return item;
      if (patch.resultUrl && item.resultUrl) releaseUrl(item.resultUrl);
      return { ...item, ...patch };
    }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const queue = items.filter((item) => item.conversionId);
    if (!queue.length || loading) return;
    setLoading(true);
    const results: ItemPatch[] = [];
    // Sequential on purpose: the API converts one file per request, and
    // ffmpeg jobs in parallel would fight over the VPS.
    for (const item of queue) {
      patchItem(item.id, { status: 'running', message: undefined });
      try {
        const patch = await convertItem(item);
        results.push(patch);
        patchItem(item.id, patch);
      } catch (err) {
        const patch: ItemPatch = { status: 'error', message: err instanceof Error ? err.message : 'Conversion failed.' };
        results.push(patch);
        patchItem(item.id, patch);
      }
    }
    setLoading(false);
    // Browsers block bursts of automatic downloads, so only the single-file
    // case saves on its own; batches use the per-row Download buttons.
    const only = results[0];
    if (results.length === 1 && only.status === 'done' && only.resultUrl && only.resultName) {
      triggerDownload(only.resultUrl, only.resultName);
    }
  }

  const readyCount = items.filter((item) => item.conversionId).length;
  const unsupported = items.filter((item) => !conversionsFor(item.file).length);

  return (
    <div className="card">
      <h1>Converter</h1>
      <p className="lede">This module only offers conversions that are actually implemented. Image targets now include JPG, PNG, WEBP, AVIF, GIF, TIFF, BMP, ICO, plus PDF export. Image and document utilities work with bundled dependencies; some formats use ffmpeg.</p>

      <form onSubmit={onSubmit}>
        <div className="field">
          <span className="field-label" id="file-label">Choose files</span>
          <div
            className={`dropzone${dragActive ? ' is-active' : ''}`}
            role="button"
            tabIndex={0}
            aria-labelledby="file-label"
            aria-describedby="file-help"
            onClick={openPicker}
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
              multiple
              tabIndex={-1}
              className="dropzone-input"
              accept={acceptedExtensions.length ? acceptedExtensions.map((ext) => `.${ext}`).join(',') : undefined}
              onChange={(e) => {
                addFiles(Array.from(e.target.files || []));
                e.target.value = '';
              }}
            />
            <span className="dropzone-empty">
              <strong>
                {dragActive ? 'Release to add these files' : items.length ? 'Drag more files here' : 'Drag files here'}
              </strong>
              <span className="muted small">
                or click to browse{maxUploadBytes ? ` (up to ${formatBytes(maxUploadBytes)} each)` : ''}
              </span>
            </span>
          </div>
          <p className="hint" id="file-help">
            {acceptedExtensions.length ? `Supported: ${acceptedExtensions.join(', ')}` : 'Loading supported formats…'}
          </p>
          {/* Kept next to the zone: a rejected drop is invisible if the
              message renders below the submit button. */}
          {addError ? <Banner tone="warn" title={addError} /> : null}
        </div>

        {items.length ? (
          <ul className="file-list">
            {items.map((item) => {
              const options = conversionsFor(item.file);
              return (
                <li key={item.id} className="file-row">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt="" className="file-thumb" />
                  ) : (
                    <span className="file-thumb file-thumb-generic" aria-hidden="true">FILE</span>
                  )}

                  <span className="file-info">
                    <span className="file-name" title={item.file.name}>{item.file.name}</span>
                    <span className="muted small">
                      {formatBytes(item.file.size)}
                      {item.status === 'running' ? ' · converting…' : ''}
                      {item.status === 'done' ? ` · ${item.resultName}` : ''}
                    </span>
                    {item.message ? <span className="file-message">{item.message}</span> : null}
                    {item.notes?.length ? <span className="muted small">{item.notes.join(' ')}</span> : null}
                  </span>

                  <span className="file-target">
                    <label className="visually-hidden" htmlFor={`conversion-${item.id}`}>
                      Output format for {item.file.name}
                    </label>
                    <select
                      id={`conversion-${item.id}`}
                      value={item.conversionId}
                      disabled={!options.length || loading}
                      onChange={(e) => setConversion(item.id, e.target.value)}
                    >
                      {options.length
                        ? options.map((spec) => <option key={spec.id} value={spec.id}>{spec.label}</option>)
                        : <option value="">No conversion available</option>}
                    </select>
                  </span>

                  <span className="file-actions">
                    {item.status === 'done' && item.resultUrl && item.resultName ? (
                      <button type="button" className="primary" onClick={() => triggerDownload(item.resultUrl!, item.resultName!)}>
                        Download
                      </button>
                    ) : null}
                    {item.status === 'error' ? <span className="pill err">Failed</span> : null}
                    <button type="button" onClick={() => removeItem(item.id)} disabled={loading} aria-label={`Remove ${item.file.name}`}>
                      Remove
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}

        {items.length ? (
          <div className="button-row" style={{ margin: '0 0 1rem' }}>
            <button type="button" onClick={openPicker} disabled={loading}>Add more files</button>
            <button type="button" onClick={clearAll} disabled={loading}>Clear all</button>
            <span className="muted small">{items.length} file(s) queued</span>
          </div>
        ) : null}

        {unsupported.length ? (
          <Banner tone="warn" title={`No conversion available for ${unsupported.map((item) => item.file.name).join(', ')}. These are skipped.`} />
        ) : null}

        <fieldset>
          <legend>Options applied to every file</legend>
          <div className="grid">
            <div className="field"><label htmlFor="width">Width (optional)</label><input id="width" type="number" value={width} onChange={(e) => setWidth(e.target.value)} /></div>
            <div className="field"><label htmlFor="height">Height (optional)</label><input id="height" type="number" value={height} onChange={(e) => setHeight(e.target.value)} /></div>
            <div className="field"><label htmlFor="quality">Quality</label><input id="quality" type="number" min={1} max={100} value={quality} onChange={(e) => setQuality(e.target.value)} /></div>
            <div className="field"><label htmlFor="pageSize">Page size</label><select id="pageSize" value={pageSize} onChange={(e) => setPageSize(e.target.value)}><option value="a4">A4</option><option value="letter">Letter</option><option value="fit">Fit</option></select></div>
            <div className="field"><label htmlFor="audioBitrate">Audio bitrate</label><select id="audioBitrate" value={audioBitrate} onChange={(e) => setAudioBitrate(e.target.value)}><option>96k</option><option>128k</option><option>192k</option><option>256k</option><option>320k</option></select></div>
            <div className="field"><label htmlFor="videoHeight">Video height</label><select id="videoHeight" value={videoHeight} onChange={(e) => setVideoHeight(e.target.value)}><option value="original">Original</option><option value="1080">1080</option><option value="720">720</option><option value="480">480</option><option value="360">360</option></select></div>
          </div>
        </fieldset>

        <button type="submit" className="primary" disabled={loading || !readyCount}>
          {loading ? 'Converting…' : readyCount > 1 ? `Convert ${readyCount} files` : 'Convert & download'}
        </button>
      </form>
    </div>
  );
}
