'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Banner from '@/components/Banner';
import { formatBytes } from '@/lib/limits';

type OptionId = 'width' | 'height' | 'quality' | 'pageSize' | 'audioBitrate' | 'videoHeight';

type ConversionSpec = {
  id: string;
  label: string;
  from: string[];
  outExt: string;
  notes: string[];
  options: OptionId[];
  requires?: string;
};

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
  /** Only the keys the chosen conversion declares are ever sent. */
  options: Partial<Record<OptionId, string>>;
  status: ItemStatus;
  message?: string;
  notes?: string[];
  previewUrl?: string;
  resultUrl?: string;
  resultName?: string;
};

type ItemPatch = Partial<Item> & { status: ItemStatus };

type FieldSpec =
  | { kind: 'number'; label: string; hint: string; placeholder: string; min?: number; max?: number }
  | { kind: 'select'; label: string; hint: string; choices: { value: string; label: string }[] };

/**
 * Every option the catalog can declare. The dialog renders whichever of these
 * the selected conversion lists, so the backend stays the source of truth for
 * what is actually adjustable.
 */
const OPTION_FIELDS: Record<OptionId, FieldSpec> = {
  width: { kind: 'number', label: 'Width', hint: 'Output width in pixels. Left empty keeps the original.', placeholder: 'original', min: 1 },
  height: { kind: 'number', label: 'Height', hint: 'Output height in pixels. Aspect ratio is preserved and never upscaled.', placeholder: 'original', min: 1 },
  quality: { kind: 'number', label: 'Quality', hint: 'Encoder quality from 1 to 100. Defaults to 80.', placeholder: '80', min: 1, max: 100 },
  pageSize: {
    kind: 'select',
    label: 'Page size',
    hint: '"Fit" sizes the page to the image instead of a paper format.',
    choices: [
      { value: '', label: 'A4 (default)' },
      { value: 'letter', label: 'Letter' },
      { value: 'fit', label: 'Fit to content' },
    ],
  },
  audioBitrate: {
    kind: 'select',
    label: 'Audio bitrate',
    hint: 'Higher keeps more detail and makes a bigger file.',
    choices: [
      { value: '', label: '192k (default)' },
      { value: '96k', label: '96k' },
      { value: '128k', label: '128k' },
      { value: '256k', label: '256k' },
      { value: '320k', label: '320k' },
    ],
  },
  videoHeight: {
    kind: 'select',
    label: 'Video height',
    hint: 'Downscales only. A smaller source is left as it is.',
    choices: [
      { value: '', label: 'Original (default)' },
      { value: '1080', label: '1080p' },
      { value: '720', label: '720p' },
      { value: '480', label: '480p' },
      { value: '360', label: '360p' },
    ],
  },
};

function triggerDownload(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

function extensionOf(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() || '';
}

export default function ConverterClient() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [addError, setAddError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [optionsFor, setOptionsFor] = useState<number | null>(null);

  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
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

  // showModal() gives focus trapping and Esc handling for free, but it has to
  // be called imperatively — <dialog open> alone renders a non-modal box.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (optionsFor !== null && !dialog.open) dialog.showModal();
    if (optionsFor === null && dialog.open) dialog.close();
  }, [optionsFor]);

  const maxUploadBytes = catalog?.limits?.maxUploadBytes ?? 0;
  const acceptedExtensions = useMemo(
    () => [...new Set((catalog?.conversions || []).flatMap((spec) => spec.from))].sort(),
    [catalog],
  );

  function conversionsFor(file: File): ConversionSpec[] {
    const ext = extensionOf(file);
    return (catalog?.conversions || []).filter((spec) => spec.from.includes(ext));
  }

  function specById(id: string): ConversionSpec | undefined {
    return (catalog?.conversions || []).find((spec) => spec.id === id);
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
        options: {},
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
    if (optionsFor === id) setOptionsFor(null);
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      releaseUrl(target?.previewUrl);
      releaseUrl(target?.resultUrl);
      return prev.filter((item) => item.id !== id);
    });
    setAddError(null);
  }

  function clearAll() {
    setOptionsFor(null);
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

  function setOption(id: number, key: OptionId, value: string) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, options: { ...item.options, [key]: value } } : item)));
  }

  function resetOptions(id: number) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, options: {} } : item)));
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
    // Only options this conversion declares, and only when set: an empty
    // value means "use the server default".
    for (const key of specById(item.conversionId)?.options ?? []) {
      const value = item.options[key];
      if (value) form.append(key, value);
    }

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
    setOptionsFor(null);
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
  const activeItem = items.find((item) => item.id === optionsFor) || null;
  const activeSpec = activeItem ? specById(activeItem.conversionId) : undefined;
  const activeChanged = activeItem ? Object.values(activeItem.options).some(Boolean) : false;

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
              const choices = conversionsFor(item.file);
              const spec = specById(item.conversionId);
              const tuned = Object.values(item.options).some(Boolean);
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

                  <span className="file-convert">
                    <span className="format-badge">{extensionOf(item.file).toUpperCase() || '?'}</span>
                    <span className="format-arrow" aria-hidden="true">→</span>
                    <label className="visually-hidden" htmlFor={`conversion-${item.id}`}>
                      Output format for {item.file.name}
                    </label>
                    <select
                      id={`conversion-${item.id}`}
                      className="format-select"
                      value={item.conversionId}
                      disabled={!choices.length || loading}
                      onChange={(e) => setConversion(item.id, e.target.value)}
                    >
                      {choices.length
                        ? choices.map((option) => <option key={option.id} value={option.id}>{option.outExt.toUpperCase()}</option>)
                        : <option value="">None</option>}
                    </select>
                    <button
                      type="button"
                      className={tuned ? 'primary' : undefined}
                      onClick={() => setOptionsFor(item.id)}
                      disabled={loading || !spec?.options.length}
                      title={spec?.options.length ? `Options for ${item.file.name}` : 'This conversion has no options'}
                    >
                      Options{tuned ? ' •' : ''}
                    </button>
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

        <button type="submit" className="primary" disabled={loading || !readyCount}>
          {loading ? 'Converting…' : readyCount > 1 ? `Convert ${readyCount} files` : 'Convert & download'}
        </button>
      </form>

      <dialog ref={dialogRef} className="options-dialog" onClose={() => setOptionsFor(null)}>
        {activeItem && activeSpec ? (
          <>
            <div className="options-head">
              <h2>Options</h2>
              <button type="button" onClick={() => setOptionsFor(null)} aria-label="Close options">✕</button>
            </div>
            <p className="muted small options-subject">
              {activeItem.file.name} → {activeSpec.label}
            </p>

            <div className="grid">
              {activeSpec.options.map((key) => {
                const field = OPTION_FIELDS[key];
                const value = activeItem.options[key] ?? '';
                const fieldId = `option-${activeItem.id}-${key}`;
                return (
                  <div className="field" key={key}>
                    <label htmlFor={fieldId}>{field.label}</label>
                    {field.kind === 'number' ? (
                      <input
                        id={fieldId}
                        type="number"
                        min={field.min}
                        max={field.max}
                        placeholder={field.placeholder}
                        value={value}
                        onChange={(e) => setOption(activeItem.id, key, e.target.value)}
                      />
                    ) : (
                      <select id={fieldId} value={value} onChange={(e) => setOption(activeItem.id, key, e.target.value)}>
                        {field.choices.map((choice) => (
                          <option key={choice.value} value={choice.value}>{choice.label}</option>
                        ))}
                      </select>
                    )}
                    <p className="hint">{field.hint}</p>
                  </div>
                );
              })}
            </div>

            {activeSpec.notes.length ? <p className="hint">{activeSpec.notes.join(' ')}</p> : null}

            <div className="button-row options-foot">
              <button type="button" onClick={() => resetOptions(activeItem.id)} disabled={!activeChanged}>
                Reset to defaults
              </button>
              <button type="button" className="primary" onClick={() => setOptionsFor(null)}>Okay</button>
            </div>
          </>
        ) : null}
      </dialog>
    </div>
  );
}
