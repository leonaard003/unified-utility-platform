'use client';

import { useMemo, useState } from 'react';

type ConversionSpec = {
  id: string;
  category: string;
  label: string;
  from: string[];
  outExt: string;
  notes: string[];
  requires?: string;
};

type Props = {
  conversions: ConversionSpec[];
  capabilities: { id: string; available: boolean }[];
};

const CATEGORY_LABELS: Record<string, string> = {
  image: 'Images',
  document: 'Documents',
  audio: 'Audio',
  video: 'Video',
};

/**
 * Naming the real sources keeps PDF-to-TXT and DOCX-to-TXT distinguishable.
 * Conversions that accept a long list collapse to a count instead.
 */
function sourceLabel(spec: ConversionSpec): string {
  if (spec.from.length <= 3) return spec.from.map((ext) => ext.toUpperCase()).join(' / ');
  return `${spec.from.length} FORMATS`;
}

/**
 * Browsable view of what the converter actually does.
 *
 * Everything here is derived from the same catalog the API validates against,
 * so this panel can never advertise a conversion the backend cannot perform.
 */
export default function FormatCatalog({ conversions, capabilities }: Props) {
  const groups = useMemo(() => {
    const byCategory = new Map<string, ConversionSpec[]>();
    for (const spec of conversions) {
      const list = byCategory.get(spec.category) || [];
      list.push(spec);
      byCategory.set(spec.category, list);
    }
    return [...byCategory.entries()].map(([category, specs]) => ({
      category,
      label: CATEGORY_LABELS[category] || category,
      specs,
      inputs: [...new Set(specs.flatMap((spec) => spec.from))].sort(),
    }));
  }, [conversions]);

  const [active, setActive] = useState(groups[0]?.category || '');
  const group = groups.find((entry) => entry.category === active) || groups[0];

  const missing = useMemo(() => {
    const unavailable = new Set(capabilities.filter((cap) => !cap.available).map((cap) => cap.id));
    return (group?.specs || []).filter((spec) => spec.requires && unavailable.has(spec.requires));
  }, [group, capabilities]);

  if (!group) return null;

  const totalInputs = new Set(conversions.flatMap((spec) => spec.from)).size;
  // When every conversion in a category takes the same inputs, a "From" column
  // would just repeat the ACCEPTS row above it on every single line.
  const mixedSources = new Set(group.specs.map((spec) => spec.from.join(','))).size > 1;

  return (
    <section className="card catalog" aria-labelledby="catalog-heading">
      <h2 id="catalog-heading" style={{ marginTop: 0 }}>Format catalog</h2>
      <p className="lede">
        This build converts {totalInputs} input formats across {groups.length} categories, using bundled
        libraries plus ffmpeg. Every entry below is implemented — nothing here is a placeholder.
      </p>

      <div className="catalog-tabs" role="tablist" aria-label="Format categories">
        {groups.map((entry) => (
          <button
            key={entry.category}
            type="button"
            role="tab"
            id={`catalog-tab-${entry.category}`}
            aria-selected={entry.category === active}
            aria-controls="catalog-panel"
            className={`catalog-tab${entry.category === active ? ' is-active' : ''}`}
            onClick={() => setActive(entry.category)}
          >
            {entry.label} <span className="catalog-count">{entry.inputs.length}</span>
          </button>
        ))}
      </div>

      <div className="catalog-panel" id="catalog-panel" role="tabpanel" aria-labelledby={`catalog-tab-${group.category}`}>
        <p className="catalog-kicker">
          ACCEPTS
          <span className="muted">{group.inputs.length} formats</span>
        </p>
        <ul className="chip-list">
          {group.inputs.map((ext) => <li key={ext} className="chip">{ext.toUpperCase()}</li>)}
        </ul>

        <p className="catalog-kicker" style={{ marginTop: '0.9rem' }}>
          CONVERTS TO
          <span className="muted">{group.specs.length} conversions</span>
        </p>
        <ul className="catalog-grid">
          {group.specs.map((spec) => (
            <li key={spec.id} className="catalog-cell">
              <span className="catalog-cell-head">
                {mixedSources ? (
                  <>
                    <span className="chip">{sourceLabel(spec)}</span>
                    <span className="format-arrow" aria-hidden="true">→</span>
                  </>
                ) : null}
                <span className="chip chip-out">{spec.outExt.toUpperCase()}</span>
              </span>
              <span className="muted small">{spec.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {missing.length ? (
        <p className="hint">
          Currently unavailable on this server ({[...new Set(missing.map((spec) => spec.requires))].join(', ')} not
          installed): {missing.map((spec) => spec.outExt.toUpperCase()).join(', ')}.
        </p>
      ) : null}
    </section>
  );
}
