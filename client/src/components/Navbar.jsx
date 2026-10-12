import { LANGUAGES } from '../utils/translations.js';

function BrandMark() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="10" fill="url(#brandGrad)" />
      {/* Sound wave bars */}
      <rect x="7" y="16" width="3.5" height="8" rx="1.75" fill="rgba(255,255,255,0.6)" />
      <rect x="12.5" y="12" width="3.5" height="16" rx="1.75" fill="rgba(255,255,255,0.85)" />
      <rect x="18" y="8" width="3.5" height="22" rx="1.75" fill="white" />
      <rect x="23.5" y="13" width="3.5" height="14" rx="1.75" fill="rgba(255,255,255,0.85)" />
      {/* Translation mark */}
      <circle cx="29" cy="10" r="4.5" fill="#10b981" />
      <text x="29" y="13.5" textAnchor="middle" fontSize="6.5" fill="white" fontWeight="800">T</text>
    </svg>
  );
}

export default function Navbar({ t, lang, onLangChange, live, connected }) {
  const status = live ? 'live' : connected ? 'ready' : 'offline';
  const label = { live: t.statusLive, ready: t.statusReady, offline: t.statusOffline }[status];

  return (
    <header className="navbar-glass sticky top-0 z-50">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        
        {/* Brand */}
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark />
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold leading-tight text-slate-900">
              {t.appName}
            </h1>
            <p className="truncate text-xs font-medium text-slate-500">{t.tagline}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status badge */}
          <div
            role="status"
            aria-live="polite"
            className={`status-badge ${
              status === 'live' ? 'status-live' : status === 'ready' ? 'status-ready' : 'status-offline'
            }`}
          >
            <span className="relative flex h-2 w-2">
              {status === 'live' && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 motion-safe:animate-ping" />
              )}
              <span
                className={`live-dot relative inline-flex h-2 w-2 rounded-full ${
                  status === 'live' ? 'bg-red-500' : status === 'ready' ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
            </span>
            {label}
          </div>

          {/* Language switcher */}
          <div
            role="radiogroup"
            aria-label={t.uiLanguage}
            className="flex overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-1 shadow-sm"
          >
            {LANGUAGES.map((l) => {
              const active = l.code === lang;
              return (
                <button
                  key={l.code}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onLangChange(l.code)}
                  className={`lang-pill ${active ? 'active' : ''}`}
                >
                  {l.native}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}
