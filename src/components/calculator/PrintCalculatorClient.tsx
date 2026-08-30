'use client';

import { useMemo, useState } from 'react';

function mmFrom(value: number, unit: string) {
  if (unit === 'mm') return value;
  if (unit === 'cm') return value * 10;
  if (unit === 'm') return value * 1000;
  return value * 25.4;
}

/** Drawing thousands of rects locks up the browser for no extra insight. */
const MAX_DRAWN_PIECES = 400;

type Placement = { cols: number; rows: number; pieceW: number; pieceH: number; rotated: boolean };

export default function PrintCalculatorClient() {
  const [itemW, setItemW] = useState(210);
  const [itemH, setItemH] = useState(297);
  const [sheetW, setSheetW] = useState(320);
  const [sheetH, setSheetH] = useState(460);
  const [unit, setUnit] = useState('mm');
  const [qty, setQty] = useState(1000);
  const [pricePerSheet, setPricePerSheet] = useState(1500);

  const result = useMemo(() => {
    const iw = mmFrom(itemW, unit);
    const ih = mmFrom(itemH, unit);
    const sw = mmFrom(sheetW, unit);
    const sh = mmFrom(sheetH, unit);
    const valid = iw > 0 && ih > 0 && sw > 0 && sh > 0;

    const areaM2 = (iw * ih) / 1_000_000;
    const normal: Placement = { cols: Math.floor(sw / iw), rows: Math.floor(sh / ih), pieceW: iw, pieceH: ih, rotated: false };
    const rotated: Placement = { cols: Math.floor(sw / ih), rows: Math.floor(sh / iw), pieceW: ih, pieceH: iw, rotated: true };
    const fitA = valid ? Math.max(normal.cols, 0) * Math.max(normal.rows, 0) : 0;
    const fitB = valid ? Math.max(rotated.cols, 0) * Math.max(rotated.rows, 0) : 0;
    const fit = Math.max(fitA, fitB, 0);
    const best = fitB > fitA ? rotated : normal;
    const sheetsNeeded = fit > 0 ? Math.ceil(qty / fit) : 0;
    const estimatedCost = sheetsNeeded * pricePerSheet;
    // Share of the parent sheet that ends up as trim.
    const waste = valid && sw * sh > 0 ? 1 - (fit * iw * ih) / (sw * sh) : 0;

    return { valid, areaM2, fitA, fitB, fit, best, sheetsNeeded, estimatedCost, sheetMmW: sw, sheetMmH: sh, waste };
  }, [itemW, itemH, sheetW, sheetH, unit, qty, pricePerSheet]);

  const { best, sheetMmW, sheetMmH, fit } = result;
  const drawable = result.valid && fit > 0 && fit <= MAX_DRAWN_PIECES;
  const pieces = useMemo(() => {
    if (!drawable) return [];
    const cells: { x: number; y: number }[] = [];
    for (let row = 0; row < best.rows; row += 1) {
      for (let col = 0; col < best.cols; col += 1) {
        cells.push({ x: col * best.pieceW, y: row * best.pieceH });
      }
    }
    return cells;
  }, [drawable, best]);

  const stats = [
    { label: 'Area per piece', value: `${result.areaM2.toFixed(4)} m²` },
    { label: 'Fit — normal', value: result.fitA },
    { label: 'Fit — rotated', value: result.fitB },
    { label: 'Best fit per sheet', value: result.fit },
    { label: 'Sheets needed', value: result.sheetsNeeded.toLocaleString() },
    { label: 'Estimated paper cost', value: result.estimatedCost.toLocaleString() },
  ];

  return (
    <div className="card tool-shell">
      <h1>Paper &amp; Printing Calculator</h1>
      <p className="lede">Calculate area, how many pieces fit on a sheet, and a simple paper-cost estimate for print work.</p>

      <div className="grid">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Piece size</h2>
          <div className="row">
            <div className="field"><label htmlFor="item-w">Width</label><input id="item-w" type="number" value={itemW} onChange={(e) => setItemW(Number(e.target.value))} /></div>
            <div className="field"><label htmlFor="item-h">Height</label><input id="item-h" type="number" value={itemH} onChange={(e) => setItemH(Number(e.target.value))} /></div>
          </div>
          <div className="row">
            <div className="field"><label htmlFor="unit">Unit</label><select id="unit" value={unit} onChange={(e) => setUnit(e.target.value)}><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="inch">inch</option></select></div>
            <div className="field"><label htmlFor="qty">Quantity</label><input id="qty" type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} /></div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Parent sheet</h2>
          <div className="row">
            <div className="field"><label htmlFor="sheet-w">Sheet width</label><input id="sheet-w" type="number" value={sheetW} onChange={(e) => setSheetW(Number(e.target.value))} /></div>
            <div className="field"><label htmlFor="sheet-h">Sheet height</label><input id="sheet-h" type="number" value={sheetH} onChange={(e) => setSheetH(Number(e.target.value))} /></div>
          </div>
          <div className="field"><label htmlFor="price">Paper cost per sheet</label><input id="price" type="number" value={pricePerSheet} onChange={(e) => setPricePerSheet(Number(e.target.value))} /></div>
        </div>

        <div className="card sheet-card">
          <h2 style={{ marginTop: 0 }}>Sheet layout</h2>
          {!result.valid || fit === 0 ? (
            <p className="hint">
              {result.valid
                ? 'The piece does not fit on this sheet in either orientation.'
                : 'Enter a piece size and a sheet size to see the layout.'}
            </p>
          ) : (
            <>
              {drawable ? (
                <svg
                  className="sheet-preview"
                  viewBox={`0 0 ${sheetMmW} ${sheetMmH}`}
                  preserveAspectRatio="xMidYMid meet"
                  role="img"
                  aria-label={`${fit} pieces laid out ${best.cols} across and ${best.rows} down on the sheet`}
                >
                  <rect x={0} y={0} width={sheetMmW} height={sheetMmH} className="sheet-waste" />
                  {pieces.map((cell) => (
                    <rect
                      key={`${cell.x}-${cell.y}`}
                      x={cell.x}
                      y={cell.y}
                      width={best.pieceW}
                      height={best.pieceH}
                      className="sheet-piece"
                    />
                  ))}
                  <rect x={0} y={0} width={sheetMmW} height={sheetMmH} className="sheet-outline" />
                </svg>
              ) : (
                <p className="hint">{fit} pieces fit — too many to draw individually.</p>
              )}
              <p className="hint">
                <strong>{fit} per sheet</strong> in {best.cols}×{best.rows}{' '}
                {best.rotated ? 'rotated' : 'normal'} orientation. Shaded area is trim
                ({Math.round(result.waste * 100)}%).
              </p>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Results</h2>
        <ul className="stat-row">
          {stats.map((stat) => (
            <li key={stat.label} className="stat">
              <span className="stat-label">{stat.label}</span>
              <span className="stat-value">{stat.value}</span>
            </li>
          ))}
        </ul>
        <p className="hint">
          Formula: sheets needed = ceil(quantity / best fit). Pieces are placed in a single orientation;
          mixing orientations in the leftover strip can sometimes yield more per sheet. This MVP estimates
          paper cost only; finishing, waste, ink, and labor are not included yet.
        </p>
      </div>
    </div>
  );
}
