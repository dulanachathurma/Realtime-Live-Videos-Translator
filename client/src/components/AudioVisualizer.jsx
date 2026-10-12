import { useEffect, useRef } from 'react';

const INPUT_COLOR = '#6366f1';   // indigo - class audio
const OUTPUT_COLOR = '#059669';  // emerald - translated voice

function drawTrace(ctx, analyser, buffer, width, height, color, amplitude) {
  if (!analyser) {
    // Draw flat glow line when inactive
    const grad = ctx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0, `${color}00`);
    grad.addColorStop(0.3, `${color}35`);
    grad.addColorStop(0.7, `${color}35`);
    grad.addColorStop(1, `${color}00`);
    ctx.beginPath();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = grad;
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    return;
  }

  analyser.getByteTimeDomainData(buffer);
  const step = Math.max(1, Math.floor(buffer.length / width));
  const slice = width / (buffer.length / step);

  // Soft glow stroke
  ctx.beginPath();
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = `${color}25`;
  let x = 0;
  for (let i = 0; i < buffer.length; i += step) {
    const v = (buffer[i] - 128) / 128;
    const y = height / 2 + v * (height / 2) * amplitude;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    x += slice;
  }
  ctx.stroke();

  // Crisp foreground line
  ctx.beginPath();
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  x = 0;
  for (let i = 0; i < buffer.length; i += step) {
    const v = (buffer[i] - 128) / 128;
    const y = height / 2 + v * (height / 2) * amplitude;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    x += slice;
  }
  ctx.stroke();
}

export default function AudioVisualizer({ t, engine, active }) {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let buffer = new Uint8Array(2048);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const { width, height } = rect;
      ctx.clearRect(0, 0, width, height);

      // Subtle horizontal grid lines
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.04)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const y = (height / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Center baseline
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      const { input, output } = engine.getAnalysers();
      const size = (input || output)?.fftSize || 2048;
      if (buffer.length !== size) buffer = new Uint8Array(size);

      drawTrace(ctx, input, buffer, width, height, INPUT_COLOR, 1.5);
      drawTrace(ctx, output, buffer, width, height, OUTPUT_COLOR, 1.5);

      frameRef.current = requestAnimationFrame(render);
    };
    frameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frameRef.current);
      observer.disconnect();
    };
  }, [engine]);

  return (
    <section
      className="glass-card hover-glow overflow-hidden"
      aria-label={t.visualizerTitle}
    >
      <div className="flex items-center justify-between px-5 pt-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900">{t.visualizerTitle}</h2>
        </div>
        <span
          className={`flex items-center gap-1.5 text-xs font-semibold ${
            active ? 'text-red-600' : 'text-slate-400'
          }`}
        >
          {active && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
          )}
          {active ? t.statusLive : t.statusReady}
        </span>
      </div>

      <div className="mx-4 my-3 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-1 shadow-inner">
        <canvas
          ref={canvasRef}
          className="block h-36 w-full rounded-xl"
          role="img"
          aria-label={t.visualizerTitle}
        />
      </div>

      <footer className="flex flex-wrap gap-x-5 gap-y-1 px-5 pb-4 text-xs font-medium text-slate-600">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: INPUT_COLOR, boxShadow: `0 0 6px ${INPUT_COLOR}60` }} />
          {t.classAudio}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: OUTPUT_COLOR, boxShadow: `0 0 6px ${OUTPUT_COLOR}60` }} />
          {t.translatedVoice}
        </span>
      </footer>
    </section>
  );
}
