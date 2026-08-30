'use client';

import { useEffect, useRef, useState } from 'react';

/** Backing-store size. The element is scaled by CSS; pointers are mapped below. */
const CANVAS_W = 1000;
const CANVAS_H = 320;

export default function SignatureClient() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [typing, setTyping] = useState('Onichan');
  const [font, setFont] = useState('Georgia');
  const [hasInk, setHasInk] = useState(false);
  // A ref, not state: pointermove can arrive before React has flushed a
  // setState from pointerdown, and that first segment would be dropped.
  const drawing = useRef(false);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
  }, []);

  /**
   * The canvas is 1000x320 internally but rendered at whatever width the
   * layout gives it, so client coordinates have to be scaled into the backing
   * store. Without this the stroke lands away from the cursor.
   */
  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    // Capture keeps the stroke alive if the pointer slips outside the canvas.
    // It is a convenience, so a failure here must not abort the stroke.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* no active pointer — drawing still works without capture */
    }
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    // A single tap should leave a dot, not nothing.
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    drawing.current = true;
    setHasInk(true);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function end(event: React.PointerEvent<HTMLCanvasElement>) {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* capture was never taken */
    }
    drawing.current = false;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  function downloadCanvas(fromTyping = false) {
    const source = fromTyping ? renderTypedPreview() : canvasRef.current;
    if (!source) return;
    const a = document.createElement('a');
    a.href = source.toDataURL('image/png');
    a.download = fromTyping ? 'typed-signature.png' : 'drawn-signature.png';
    a.click();
  }

  function renderTypedPreview() {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `96px ${font}`;
    ctx.fillStyle = '#111';
    ctx.fillText(typing || 'Signature', 30, 160);
    return canvas;
  }

  return (
    <div className="card tool-shell">
      <h1>Signature</h1>
      <p className="lede">Draw or type a signature, preview it, and export a PNG. This creates a reusable image asset only; it does not certify legal validity.</p>

      <div className="sig-layout">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Draw</h2>
          <canvas
            ref={canvasRef}
            className="sig-canvas"
            width={CANVAS_W}
            height={CANVAS_H}
            aria-label="Signature drawing area"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
          <div className="button-row" style={{ marginTop: '0.75rem' }}>
            <button type="button" onClick={clearCanvas} disabled={!hasInk}>Clear</button>
            <button type="button" className="primary" onClick={() => downloadCanvas(false)} disabled={!hasInk}>
              Download PNG
            </button>
            <span className="muted small">
              {hasInk ? 'Exports with a transparent background.' : 'Draw with a mouse, pen, or finger.'}
            </span>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Type</h2>
          <div className="row">
            <div className="field">
              <label htmlFor="sig-text">Name</label>
              <input id="sig-text" type="text" value={typing} onChange={(e) => setTyping(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="sig-font">Font</label>
              <select id="sig-font" value={font} onChange={(e) => setFont(e.target.value)}>
                <option>Georgia</option>
                <option>cursive</option>
                <option>serif</option>
                <option>monospace</option>
              </select>
            </div>
          </div>
          <div className="sig-typed" style={{ fontFamily: font }}>
            {typing || 'Signature'}
          </div>
          <div className="button-row" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="primary" onClick={() => downloadCanvas(true)}>Download typed PNG</button>
          </div>
        </div>
      </div>
    </div>
  );
}
