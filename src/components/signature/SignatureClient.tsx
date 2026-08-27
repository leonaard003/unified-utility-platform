'use client';

import { useEffect, useRef, useState } from 'react';

export default function SignatureClient() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [typing, setTyping] = useState('Onichan');
  const [font, setFont] = useState('Georgia');
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    setDrawing(true);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function end() {
    setDrawing(false);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    <div className="card">
      <h1>Signature</h1>
      <p className="lede">Draw or type a signature, preview it, and export a PNG. This creates a reusable image asset only; it does not certify legal validity.</p>

      <div className="grid">
        <div className="card">
          <h2>Draw</h2>
          <canvas
            ref={canvasRef}
            width={700}
            height={220}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            style={{ width: '100%', border: '1px solid #d8dce3', background: '#fff', borderRadius: 8, touchAction: 'none' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={clearCanvas}>Clear</button>
            <button type="button" onClick={() => downloadCanvas(false)}>Download PNG</button>
          </div>
        </div>

        <div className="card">
          <h2>Type</h2>
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
          <div style={{ border: '1px solid #d8dce3', borderRadius: 8, background: '#fff', padding: '1rem', minHeight: 140, fontFamily: font, fontSize: '3rem' }}>
            {typing || 'Signature'}
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <button type="button" onClick={() => downloadCanvas(true)}>Download typed PNG</button>
          </div>
        </div>
      </div>
    </div>
  );
}
