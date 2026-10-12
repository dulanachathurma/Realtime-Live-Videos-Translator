import { useEffect, useRef, useState } from 'react';
import { Captions, Download, Minus, Plus, Trash2 } from 'lucide-react';
import { LANGUAGES } from '../utils/translations.js';

const SIZES = ['text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl'];

function nativeName(code) {
  return LANGUAGES.find((l) => l.code === code)?.native || code;
}

export default function TranscriptPanel({ t, items, pending, onClear }) {
  const [view, setView] = useState('both');
  const [sizeIndex, setSizeIndex] = useState(2);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items.length, pending, autoScroll]);

  const download = () => {
    const lines = items.map(
      (item) =>
        `[${item.time}]\n${t.original}: ${item.original}\n${t.translated}: ${item.translated}\n`
    );
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `class-transcript-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const views = [
    { value: 'both', label: t.viewBoth },
    { value: 'translated', label: t.viewTranslated },
    { value: 'original', label: t.viewOriginal },
  ];

  const sizeClass = SIZES[sizeIndex];

  return (
    <section className="glass-card hover-glow">
      {/* Header */}
      <div className="glass-card-header flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100">
            <Captions className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          </div>
          <h2 className="text-sm font-bold text-slate-900">{t.transcriptTitle}</h2>
          {pending > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
              <span className="dot-bounce" />
              <span className="dot-bounce" />
              <span className="dot-bounce" />
              <span className="ml-1">{t.translating}</span>
            </span>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div role="radiogroup" aria-label={t.transcriptTitle} className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 shadow-sm">
            {views.map((v) => (
              <button
                key={v.value}
                type="button"
                role="radio"
                aria-checked={view === v.value}
                onClick={() => setView(v.value)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  view === v.value
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Text size */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100 px-0.5 shadow-sm" role="group" aria-label={t.textSize}>
            <button
              type="button"
              onClick={() => setSizeIndex((i) => Math.max(0, i - 1))}
              disabled={sizeIndex === 0}
              aria-label={`${t.textSize} −`}
              className="p-1.5 text-slate-600 hover:text-slate-900 disabled:opacity-30 transition-colors"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <span className="px-1 text-xs font-bold text-slate-400">Aa</span>
            <button
              type="button"
              onClick={() => setSizeIndex((i) => Math.min(SIZES.length - 1, i + 1))}
              disabled={sizeIndex === SIZES.length - 1}
              aria-label={`${t.textSize} +`}
              className="p-1.5 text-slate-600 hover:text-slate-900 disabled:opacity-30 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* Auto scroll */}
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            {t.autoScroll}
          </label>

          {/* Download */}
          <button
            type="button"
            onClick={download}
            disabled={!items.length}
            title={t.downloadTranscript}
            aria-label={t.downloadTranscript}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:text-slate-900 disabled:opacity-30 shadow-sm transition-colors"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* Clear */}
          <button
            type="button"
            onClick={onClear}
            disabled={!items.length}
            title={t.clearTranscript}
            aria-label={t.clearTranscript}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:text-red-600 disabled:opacity-30 shadow-sm transition-colors"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Transcript body */}
      <div
        ref={scrollRef}
        className="h-[430px] overflow-y-auto px-5 py-4 bg-slate-50/50"
        aria-live="polite"
        aria-label={t.transcriptTitle}
      >
        {!items.length && !pending ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white border border-slate-200 shadow-sm">
              <Captions className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-500">{t.emptyTranscript}</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {items.map((item) => (
              <li
                key={item.seq}
                className="grid gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition-all md:grid-cols-2 md:gap-5"
              >
                {view !== 'translated' && (
                  <div className={view === 'original' ? 'md:col-span-2' : ''}>
                    <p className="mb-1.5 text-xs font-semibold text-slate-400">
                      {t.original} · {item.time}
                      {item.sourceLang && item.sourceLang !== 'other' && (
                        <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700 font-bold border border-indigo-100">
                          {t.detected}: {nativeName(item.sourceLang)}
                        </span>
                      )}
                    </p>
                    <p className={`transcript-original leading-relaxed text-slate-700 ${sizeClass}`}>
                      {item.original}
                    </p>
                  </div>
                )}
                {view !== 'original' && (
                  <div className={view === 'translated' ? 'md:col-span-2' : ''}>
                    <p className="mb-1.5 text-xs font-bold text-emerald-700 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {t.translated}
                    </p>
                    <p className={`transcript-translated leading-relaxed text-slate-900 ${sizeClass}`}>
                      {item.translated}
                    </p>
                  </div>
                )}
              </li>
            ))}

            {pending > 0 && (
              <li className="flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-sm font-semibold text-indigo-700 shadow-sm">
                <span className="flex gap-1" aria-hidden="true">
                  <span className="dot-bounce" />
                  <span className="dot-bounce" />
                  <span className="dot-bounce" />
                </span>
                {t.translating}
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
