'use client';

import { useMemo, useState } from 'react';

function mmFrom(value: number, unit: string) {
  if (unit === 'mm') return value;
  if (unit === 'cm') return value * 10;
  if (unit === 'm') return value * 1000;
  return value * 25.4;
}

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
    const areaMm2 = iw * ih;
    const areaM2 = areaMm2 / 1_000_000;
    const fitA = Math.floor(sw / iw) * Math.floor(sh / ih);
    const fitB = Math.floor(sw / ih) * Math.floor(sh / iw);
    const fit = Math.max(fitA, fitB, 0);
    const sheetsNeeded = fit > 0 ? Math.ceil(qty / fit) : 0;
    const estimatedCost = sheetsNeeded * pricePerSheet;
    return { areaM2, fitA, fitB, fit, sheetsNeeded, estimatedCost };
  }, [itemW, itemH, sheetW, sheetH, unit, qty, pricePerSheet]);

  return (
    <div className="card">
      <h1>Paper & Printing Calculator</h1>
      <p className="lede">Calculate area, how many pieces fit on a sheet, and a simple paper-cost estimate for print work.</p>

      <div className="grid">
        <div className="card">
          <h2>Piece size</h2>
          <div className="field"><label>Width</label><input type="number" value={itemW} onChange={(e) => setItemW(Number(e.target.value))} /></div>
          <div className="field"><label>Height</label><input type="number" value={itemH} onChange={(e) => setItemH(Number(e.target.value))} /></div>
          <div className="field"><label>Unit</label><select value={unit} onChange={(e) => setUnit(e.target.value)}><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="inch">inch</option></select></div>
          <div className="field"><label>Quantity</label><input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} /></div>
        </div>

        <div className="card">
          <h2>Parent sheet</h2>
          <div className="field"><label>Sheet width</label><input type="number" value={sheetW} onChange={(e) => setSheetW(Number(e.target.value))} /></div>
          <div className="field"><label>Sheet height</label><input type="number" value={sheetH} onChange={(e) => setSheetH(Number(e.target.value))} /></div>
          <div className="field"><label>Paper cost per sheet</label><input type="number" value={pricePerSheet} onChange={(e) => setPricePerSheet(Number(e.target.value))} /></div>
        </div>
      </div>

      <div className="card">
        <h2>Results</h2>
        <ul>
          <li><strong>Area per piece:</strong> {result.areaM2.toFixed(4)} m²</li>
          <li><strong>Fit (normal orientation):</strong> {result.fitA}</li>
          <li><strong>Fit (rotated orientation):</strong> {result.fitB}</li>
          <li><strong>Best fit per sheet:</strong> {result.fit}</li>
          <li><strong>Sheets needed:</strong> {result.sheetsNeeded}</li>
          <li><strong>Estimated paper cost:</strong> {result.estimatedCost.toLocaleString()}</li>
        </ul>
        <p className="hint">Formula: sheets needed = ceil(quantity / best fit). This MVP estimates paper cost only; finishing, waste, ink, and labor are not included yet.</p>
      </div>
    </div>
  );
}
