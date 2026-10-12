import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ExternalLink,
  Info,
  Link2,
  Mic,
  Square,
  Video,
  CheckCircle2,
  XCircle,
  VolumeX,
  Languages,
  Play,
  Zap,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { TARGET_LANGUAGES } from '../utils/translations.js';

export function parseMediaLink(raw) {
  const value = String(raw || '').trim();
  if (!value) return { platform: 'none' };

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return { platform: 'invalid' };
  }

  const host = url.hostname.toLowerCase();
  if (!host.includes('.')) return { platform: 'invalid' };

  // 1. YouTube
  if (
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'youtu.be' ||
    host.endsWith('.youtu.be')
  ) {
    let videoId = null;
    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      videoId = url.pathname.slice(1).split('/')[0];
    } else if (url.pathname.startsWith('/embed/')) {
      videoId = url.pathname.split('/')[2];
    } else if (url.pathname.startsWith('/live/')) {
      videoId = url.pathname.split('/')[2];
    } else if (url.pathname.startsWith('/shorts/')) {
      videoId = url.pathname.split('/')[2];
    } else {
      videoId = url.searchParams.get('v');
    }

    if (videoId) {
      // Remove any timestamp/query params from id
      videoId = videoId.split('?')[0].split('&')[0];
      return {
        platform: 'youtube',
        videoId,
        embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&enablejsapi=1`,
        url: url.href,
        canEmbed: true,
      };
    }
    return { platform: 'youtube', url: url.href, canEmbed: false };
  }

  // 2. Zoom
  if (
    host === 'zoom.us' ||
    host.endsWith('.zoom.us') ||
    host === 'zoom.com' ||
    host.endsWith('.zoom.com')
  ) {
    const match = url.pathname.match(/\/(?:j|s|wc)\/(?:join\/)?(\d{9,12})/);
    const pwd = url.searchParams.get('pwd');
    if (match) {
      const web = `https://app.zoom.us/wc/${match[1]}/join${pwd ? `?pwd=${encodeURIComponent(pwd)}` : ''}`;
      return { platform: 'zoom', url: web, canEmbed: false };
    }
    return { platform: 'zoom', url: url.href, canEmbed: false };
  }

  // 3. Google Meet
  if (host === 'meet.google.com') {
    return { platform: 'meet', url: url.href, canEmbed: false };
  }

  // 4. Microsoft Teams
  if (host === 'teams.microsoft.com' || host === 'teams.live.com') {
    return { platform: 'teams', url: url.href, canEmbed: false };
  }

  // 5. Vimeo
  if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
    const match = url.pathname.match(/\/(\d+)/);
    if (match) {
      return {
        platform: 'vimeo',
        embedUrl: `https://player.vimeo.com/video/${match[1]}?autoplay=1`,
        url: url.href,
        canEmbed: true,
      };
    }
    return { platform: 'vimeo', url: url.href, canEmbed: false };
  }

  // 6. Loom
  if (host === 'loom.com' || host.endsWith('.loom.com')) {
    const match = url.pathname.match(/\/share\/([a-zA-Z0-9]+)/);
    if (match) {
      return {
        platform: 'loom',
        embedUrl: `https://www.loom.com/embed/${match[1]}?autoplay=1`,
        url: url.href,
        canEmbed: true,
      };
    }
    return { platform: 'loom', url: url.href, canEmbed: false };
  }

  // 7. Direct video/audio links
  const path = url.pathname.toLowerCase();
  if (
    path.endsWith('.mp4') ||
    path.endsWith('.webm') ||
    path.endsWith('.ogg') ||
    path.endsWith('.mp3') ||
    path.endsWith('.m3u8')
  ) {
    return { platform: 'media', url: url.href, isDirectMedia: true, canEmbed: true };
  }

  // 8. General web video / meeting link
  return { platform: 'other', url: url.href, canEmbed: false };
}

function PlatformBadge({ platform, t }) {
  const config = {
    youtube: { label: t.platformYouTube || 'YouTube', color: 'text-red-700 bg-red-50 border-red-200', icon: '▶️' },
    zoom: { label: t.platformZoom || 'Zoom', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: '🎥' },
    meet: { label: t.platformMeet || 'Google Meet', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: '📹' },
    teams: { label: t.platformTeams || 'MS Teams', color: 'text-purple-700 bg-purple-50 border-purple-200', icon: '👥' },
    vimeo: { label: t.platformVimeo || 'Vimeo', color: 'text-sky-700 bg-sky-50 border-sky-200', icon: '🎞️' },
    loom: { label: t.platformLoom || 'Loom', color: 'text-amber-700 bg-amber-50 border-amber-200', icon: '📽️' },
    media: { label: t.platformMedia || 'Video Media', color: 'text-cyan-700 bg-cyan-50 border-cyan-200', icon: '🎬' },
    other: { label: t.platformOther || 'Web Stream', color: 'text-indigo-700 bg-indigo-50 border-indigo-200', icon: '🔗' },
    none: { label: t.platformNone, color: 'text-slate-400 bg-slate-100 border-slate-200', icon: '🔗' },
    invalid: { label: t.invalidLink, color: 'text-red-700 bg-red-50 border-red-200', icon: '⚠️' },
  }[platform] || { label: platform, color: 'text-slate-400 bg-slate-100 border-slate-200', icon: '🔗' };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${config.color}`}>
      <span>{config.icon}</span>
      {config.label}
    </span>
  );
}

export default function MeetingPlayer({
  t,
  settings,
  onSettingsChange,
  targetLang,
  onTargetLangChange,
  capture,
  onStartCapture,
  onStopCapture,
  onTestVoice,
  connected,
}) {
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState('');
  const [popupOpen, setPopupOpen] = useState(false);
  const [embeddedActive, setEmbeddedActive] = useState(false);
  const popupRef = useRef(null);
  const pollRef = useRef(null);

  const parsed = useMemo(() => parseMediaLink(link), [link]);

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    []
  );

  const openInSideWindow = (event) => {
    event?.preventDefault();
    setLinkError('');
    if (!parsed.url) {
      setLinkError(t.invalidLink);
      return;
    }

    const screenWidth = window.screen.availWidth;
    const screenHeight = window.screen.availHeight;
    const width = Math.round(screenWidth * 0.52);
    const left = (window.screen.availLeft || 0) + screenWidth - width;
    const top = window.screen.availTop || 0;

    const popup = window.open(
      parsed.url,
      'live-class-window',
      `popup=yes,width=${width},height=${screenHeight},left=${left},top=${top}`
    );

    if (!popup) {
      setLinkError(t.popupBlocked);
      return;
    }

    popupRef.current = popup;
    setPopupOpen(true);
    popup.focus();

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (!popupRef.current || popupRef.current.closed) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setPopupOpen(false);
      }
    }, 1000);
  };

  const handleOpenOrPlay = (e) => {
    e?.preventDefault();
    if (!parsed.url) {
      setLinkError(t.invalidLink);
      return;
    }
    // If can embed (e.g. YouTube), toggle in-app embed player or open side window
    if (parsed.canEmbed) {
      setEmbeddedActive(true);
    } else {
      openInSideWindow(e);
    }
  };

  const handleLinkPaste = (e) => {
    const pasted = e.clipboardData?.getData('text') || '';
    if (pasted) {
      setLink(pasted);
      setLinkError('');
      const p = parseMediaLink(pasted);
      if (p.url && p.platform !== 'none' && p.platform !== 'invalid') {
        // Auto-open the video when link is pasted
        if (p.canEmbed) {
          setEmbeddedActive(true);
        } else {
          // For non-embeddable links (Zoom, Meet, Teams etc), open in side window
          const screenWidth = window.screen.availWidth;
          const screenHeight = window.screen.availHeight;
          const width = Math.round(screenWidth * 0.52);
          const left = (window.screen.availLeft || 0) + screenWidth - width;
          const top = window.screen.availTop || 0;
          const popup = window.open(
            p.url,
            'live-class-window',
            `popup=yes,width=${width},height=${screenHeight},left=${left},top=${top}`
          );
          if (popup) {
            popupRef.current = popup;
            setPopupOpen(true);
            popup.focus();
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = setInterval(() => {
              if (!popupRef.current || popupRef.current.closed) {
                clearInterval(pollRef.current);
                pollRef.current = null;
                setPopupOpen(false);
              }
            }, 1000);
          }
        }
      }
    }
  };

  const listening = capture.active;

  return (
    <section className="glass-card hover-glow">
      {/* Card Header */}
      <div className="glass-card-header flex-wrap">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100">
          <Video className="h-4 w-4 text-indigo-600" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">{t.meetingTitle}</h2>
          <span className="text-xs text-slate-500 hidden sm:inline">
            YouTube, Zoom, Google Meet, Teams & Web Streams
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {popupOpen && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t.classOpen}
            </span>
          )}
          {!popupOpen && !embeddedActive && link && parsed.platform !== 'none' && parsed.platform !== 'invalid' && (
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <XCircle className="h-3.5 w-3.5" />
              {t.classClosed}
            </span>
          )}
          {embeddedActive && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
              <Play className="h-3.5 w-3.5 fill-indigo-600 text-indigo-600" />
              {t.embedPlayer}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)]">
        {/* Left Column: Link Input, Language Selector, and Controls */}
        <div className="min-w-0 space-y-4">
          <form onSubmit={handleOpenOrPlay} className="space-y-3">
            <div>
              <label htmlFor="meeting-link" className="field-label flex items-center justify-between">
                <span>{t.meetingLinkLabel}</span>
                <span className="text-xs font-normal text-indigo-600">Any Video or Meeting URL</span>
              </label>
              <div className="relative">
                <Link2
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="meeting-link"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck="false"
                  value={link}
                  onPaste={handleLinkPaste}
                  onChange={(e) => {
                    setLink(e.target.value);
                    setLinkError('');
                  }}
                  placeholder={t.meetingLinkPlaceholder}
                  className="glass-input pl-10 pr-24"
                />
                {link && (
                  <button
                    type="button"
                    onClick={() => {
                      setLink('');
                      setEmbeddedActive(false);
                      setLinkError('');
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Target Language Selection (Key User Request) */}
            <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 p-3.5 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="target-listening-lang" className="field-label mb-0 flex items-center gap-1.5 font-bold text-indigo-950">
                  <Languages className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                  <span>{t.listenLanguageLabel}</span>
                </label>
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-xs">
                  <Zap className="h-3 w-3" />
                  Live Audio Voice
                </span>
              </div>
              <div className="flex gap-2">
                <select
                  id="target-listening-lang"
                  value={targetLang}
                  onChange={(e) => onTargetLangChange?.(e.target.value)}
                  className="glass-select flex-1 font-semibold text-slate-900 border-indigo-200 bg-white/90"
                >
                  {TARGET_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.flag} {l.native} — {l.english}
                    </option>
                  ))}
                </select>
                {onTestVoice && (
                  <button
                    type="button"
                    onClick={onTestVoice}
                    className="btn-secondary !bg-indigo-600 !text-white !border-indigo-600 hover:!bg-indigo-700 shrink-0 flex items-center gap-1.5 shadow-sm px-3.5 py-2 text-xs font-bold"
                    title={t.testVoice}
                  >
                    <span>🔊</span>
                    <span>{t.testVoice}</span>
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-xs text-indigo-700/80 font-medium">
                The video will be translated and spoken in this language in real-time.
              </p>
            </div>

            {/* Action Buttons for Link */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {parsed.canEmbed ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEmbeddedActive((prev) => !prev)}
                    disabled={!parsed.url}
                    className="btn-primary"
                  >
                    <Play className="h-4 w-4 fill-white" aria-hidden="true" />
                    {embeddedActive ? t.closePlayer : t.embedPlayer}
                  </button>
                  <button
                    type="button"
                    onClick={openInSideWindow}
                    disabled={!parsed.url}
                    className="btn-secondary"
                    title="Open side-by-side window"
                  >
                    <ExternalLink className="h-4 w-4 text-slate-600" aria-hidden="true" />
                    {t.openInSideWindow}
                  </button>
                </>
              ) : (
                <button
                  type="submit"
                  disabled={!parsed.url}
                  className="btn-primary"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  {t.openClass}
                </button>
              )}

              <PlatformBadge platform={parsed.platform} t={t} />

              {linkError && (
                <span className="text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200">
                  {linkError}
                </span>
              )}
            </div>
          </form>

          {/* Embedded Player (For YouTube / Direct Media) */}
          {embeddedActive && parsed.embedUrl && (
            <div className="overflow-hidden rounded-2xl border border-indigo-200 bg-black shadow-lg">
              <div className="flex items-center justify-between bg-slate-900 px-4 py-2 text-xs text-slate-300">
                <span className="flex items-center gap-1.5 font-semibold text-white">
                  <Play className="h-3.5 w-3.5 fill-red-500 text-red-500" />
                  {parsed.platform === 'youtube' ? 'YouTube Player' : 'Media Player'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openInSideWindow}
                    className="hover:text-white flex items-center gap-1 text-[11px]"
                  >
                    <Maximize2 className="h-3 w-3" />
                    Side Window
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmbeddedActive(false)}
                    className="text-slate-400 hover:text-white text-xs ml-2"
                  >
                    ✕ Close
                  </button>
                </div>
              </div>
              <div className="relative aspect-video w-full">
                <iframe
                  src={parsed.embedUrl}
                  title="Video Player"
                  className="h-full w-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </div>
          )}

          {/* Embedded Direct Video Player (for .mp4 / .webm) */}
          {embeddedActive && parsed.isDirectMedia && (
            <div className="overflow-hidden rounded-2xl border border-indigo-200 bg-black shadow-lg p-2">
              <video
                src={parsed.url}
                controls
                autoPlay
                className="w-full max-h-[380px] rounded-xl"
              />
            </div>
          )}

          {/* Critical Tip for Hearing ONLY the Translated Audio (User Request) */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 font-bold border border-amber-300">
                <VolumeX className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-amber-900">
                  {t.hearOnlyTranslationTitle}
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-amber-800">
                  {t.hearOnlyTranslationTip}
                </p>
              </div>
            </div>
          </div>

          {/* Source Language Setting + Capture Action Buttons */}
          <div className="flex flex-wrap items-end gap-3 pt-2">
            <div className="w-full sm:w-auto">
              <label htmlFor="source-lang" className="field-label">
                {t.sourceLangLabel}
              </label>
              <select
                id="source-lang"
                value={settings.sourceLang}
                onChange={(e) => onSettingsChange({ sourceLang: e.target.value })}
                className="glass-select w-full"
              >
                <option value="auto">{t.sourceAuto}</option>
                {TARGET_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.native} — {l.english}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-2.5">
              {!listening ? (
                <>
                  <button
                    type="button"
                    id="start-tab-btn"
                    onClick={() => onStartCapture('tab')}
                    disabled={!connected}
                    className="btn-primary"
                  >
                    <Video className="h-4 w-4" aria-hidden="true" />
                    {t.startTab}
                  </button>
                  <button
                    type="button"
                    id="start-mic-btn"
                    onClick={() => onStartCapture('mic')}
                    disabled={!connected}
                    className="btn-secondary"
                  >
                    <Mic className="h-4 w-4 text-slate-600" aria-hidden="true" />
                    {t.startMic}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    id="stop-btn"
                    onClick={onStopCapture}
                    className="btn-danger"
                  >
                    <Square className="h-4 w-4" aria-hidden="true" />
                    {t.stopTranslating}
                  </button>
                  <span className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60 motion-safe:animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                    </span>
                    {capture.kind === 'mic' ? t.capturingMic : t.capturingTab}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Step-by-Step Interactive Guide */}
        <div className="min-w-0 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 sm:p-5 shadow-inner">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-700">
              {t.stepsTitle}
            </h3>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
              ⚡ Real-time
            </span>
          </div>

          <ol className="space-y-3.5">
            {[t.step1, t.step2, t.step3, t.step4].map((text, index) => (
              <li key={index} className="flex gap-3">
                <span className="step-badge">{index + 1}</span>
                <span className="pt-0.5 text-xs font-medium leading-relaxed text-slate-700">
                  {text}
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-5 rounded-xl border border-slate-200 bg-white/80 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <span>💡 Pro-tip:</span>
              <span>Mute Tab for 100% Pure Translation</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 leading-normal">
              When tab audio is shared, muting that tab eliminates the original speaker's voice completely so only your chosen translated voice plays through your headphones.
            </p>
          </div>

          <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-400">
            {t.desktopAppTip}
          </p>
        </div>
      </div>
    </section>
  );
}
