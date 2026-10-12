import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { X, AlertTriangle } from 'lucide-react';

import Navbar from './components/Navbar.jsx';
import MeetingPlayer from './components/MeetingPlayer.jsx';
import AudioControls from './components/AudioControls.jsx';
import AudioVisualizer from './components/AudioVisualizer.jsx';
import TranscriptPanel from './components/TranscriptPanel.jsx';
import { AudioEngine } from './utils/audioProcessor.js';
import { SPEECH_CODES, UI } from './utils/translations.js';

const SETTINGS_KEY = 'lct.settings.v1';
const LANG_KEY = 'lct.lang.v1';
const TARGET_LANG_KEY = 'lct.targetLang.v1';

const DEFAULT_SETTINGS = {
  sourceLang: 'auto',
  balance: 100,
  master: 100,
  monitorOriginal: false,
  autoDuck: true,
  outputDevice: 'default',
  gender: 'FEMALE',
  speed: 1,
  pitch: 0,
  muted: false,
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    return UI[saved] ? saved : 'si';
  } catch {
    return 'si';
  }
}

function loadTargetLang() {
  try {
    return localStorage.getItem(TARGET_LANG_KEY) || 'si';
  } catch {
    return 'si';
  }
}

function mapCaptureError(err) {
  if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') return { key: 'errPermission' };
  if (err?.message === 'NO_AUDIO_TRACK') return { key: 'errNoAudio' };
  return { key: 'errServer', detail: err?.message || String(err) };
}

export default function App() {
  const [lang, setLang] = useState(loadLang);
  const [targetLang, setTargetLang] = useState(loadTargetLang);
  const [settings, setSettings] = useState(loadSettings);
  const [items, setItems] = useState([]);
  const [pending, setPending] = useState(0);
  const [connected, setConnected] = useState(false);
  const [capture, setCapture] = useState({ active: false, kind: null });
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState(null);

  const t = UI[lang] || UI.en;

  const socketRef = useRef(null);
  const seqRef = useRef(0);
  const engineRef = useRef(null);
  const liveRef = useRef({ lang, targetLang, settings });
  liveRef.current = { lang, targetLang, settings };

  const sendChunkRef = useRef(() => {});
  sendChunkRef.current = (wav) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;
    const { targetLang: chosenTarget, settings: s } = liveRef.current;
    seqRef.current += 1;
    socket.emit('audio-chunk', {
      seq: seqRef.current,
      audio: wav,
      mimeType: 'audio/wav',
      targetLang: chosenTarget,
      sourceLang: s.sourceLang,
      tts: { enabled: !s.muted, gender: s.gender, pitch: s.pitch },
    });
    setPending((p) => p + 1);
  };

  if (!engineRef.current) {
    engineRef.current = new AudioEngine({
      onChunk: (wav) => sendChunkRef.current(wav),
      onEnded: () => setCapture({ active: false, kind: null }),
    });
  }
  const engine = engineRef.current;

  /* ---------------------------------------------------------------- socket */

  useEffect(() => {
    const socket = io({ transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setError((current) => (current?.key === 'serverOffline' ? null : current));
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => {
      setConnected(false);
      setError({ key: 'serverOffline' });
    });

    socket.on('transcript', (msg) => {
      setPending((p) => Math.max(0, p - 1));
      setItems((prev) => {
        const entry = {
          seq: msg.seq,
          original: msg.original,
          translated: msg.translated,
          sourceLang: msg.sourceLang,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
        return [...prev.filter((i) => i.seq !== msg.seq), entry].sort((a, b) => a.seq - b.seq).slice(-300);
      });
    });

    socket.on('chunk-skipped', () => setPending((p) => Math.max(0, p - 1)));

    socket.on('tts-audio', async (msg) => {
      const currentSettings = liveRef.current.settings;
      if (currentSettings.muted && msg.seq !== 0) return;

      // Ensure AudioContext is alive before attempting to play audio
      try {
        await engineRef.current.ensureContext();
      } catch (err) {
        console.warn('[socket] Failed to resume AudioContext for TTS playback:', err);
      }

      if (msg.audio) {
        console.log(`[socket] tts-audio received chunk #${msg.seq} (${msg.lang}, gender: ${currentSettings.gender})`);
        engineRef.current.playTranslated({
          audioBase64: msg.audio,
          mimeType: msg.mimeType,
          gender: currentSettings.gender,
          pitch: currentSettings.pitch,
        });
      } else {
        console.log(`[socket] tts-audio fallback to speakBrowser (#${msg.seq}, gender: ${currentSettings.gender})`);
        engineRef.current.speakBrowser(
          msg.text,
          SPEECH_CODES[msg.lang] || 'en-US',
          currentSettings.gender,
          currentSettings.pitch
        );
      }
    });

    socket.on('server-error', (msg) => {
      setPending((p) => Math.max(0, p - 1));
      console.warn('[socket] server-error:', msg.message);
      // Only display server error banner if not already busy
      setError({ key: 'errServer', detail: msg.message });
    });

    return () => {
      socket.close();
      engineRef.current?.stop();
      engineRef.current?.clearQueue();
    };
  }, []);

  /* ------------------------------------------------------ settings → engine */

  useEffect(() => {
    engine.setMixer({
      balance: settings.balance,
      master: settings.master,
      monitorOriginal: settings.monitorOriginal,
      autoDuck: settings.autoDuck,
    });
  }, [engine, settings.balance, settings.master, settings.monitorOriginal, settings.autoDuck]);

  useEffect(() => {
    engine.setRate(settings.speed);
  }, [engine, settings.speed]);

  useEffect(() => {
    engine.setOutputDevice(settings.outputDevice);
  }, [engine, settings.outputDevice]);

  useEffect(() => {
    if (settings.muted) engine.clearQueue();
  }, [engine, settings.muted]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage may be disabled */
    }
  }, [settings]);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem(TARGET_LANG_KEY, targetLang);
    } catch {
      /* ignore */
    }
  }, [targetLang]);

  useEffect(() => {
    const unlockAudio = () => {
      if (engine.ctx && engine.ctx.state === 'suspended') {
        engine.ctx.resume().catch(() => {});
      }
    };
    window.addEventListener('click', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, [engine]);

  /* ---------------------------------------------------------------- devices */

  const refreshDevices = useCallback(
    async (askPermission = false) => {
      setDevices(await engine.listOutputDevices(askPermission));
    },
    [engine]
  );

  useEffect(() => {
    refreshDevices(false);
    const handler = () => refreshDevices(false);
    navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handler);
  }, [refreshDevices]);

  /* ---------------------------------------------------------------- actions */

  const updateSettings = (partial) => setSettings((prev) => ({ ...prev, ...partial }));

  const startCapture = async (kind) => {
    setError(null);
    try {
      // Explicitly resume AudioContext on user gesture to clear browser autoplay restrictions
      await engine.ensureContext();
      if (engine.ctx && engine.ctx.state === 'suspended') {
        await engine.ctx.resume();
        console.log('[AudioContext] Resumed successfully via user gesture');
      }

      // Auto-mute original audio in mixer: keep monitorOriginal=false and balance=100 so user hears ONLY translation
      updateSettings({ monitorOriginal: false, balance: 100 });

      await engine.start(kind);
      setCapture({ active: true, kind });
      refreshDevices(false);
    } catch (err) {
      setCapture({ active: false, kind: null });
      setError(mapCaptureError(err));
    }
  };

  const stopCapture = async () => {
    await engine.stop();
    setCapture({ active: false, kind: null });
  };

  const testVoice = async () => {
    setError(null);
    if (settings.muted) updateSettings({ muted: false });
    try {
      await engine.ensureContext();
      if (engine.ctx && engine.ctx.state === 'suspended') {
        await engine.ctx.resume();
      }
    } catch {
      /* ignore */
    }
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError({ key: 'serverOffline' });
      return;
    }
    socket.emit('tts-request', {
      seq: 0,
      text: t.testSentence,
      lang: targetLang,
      tts: { gender: settings.gender, pitch: settings.pitch },
    });
  };

  const errorText = error ? `${t[error.key] || error.key}${error.detail ? `: ${error.detail}` : ''}` : '';

  return (
    <div className="min-h-screen text-slate-800 antialiased selection:bg-indigo-500 selection:text-white">
      <Navbar
        t={t}
        lang={lang}
        onLangChange={(newLang) => {
          setLang(newLang);
        }}
        live={capture.active}
        connected={connected}
      />

      <main className="mx-auto grid max-w-[1400px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {error && (
          <div
            role="alert"
            className="error-box lg:col-span-2 shadow-sm"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
            <p className="flex-1 font-medium">{errorText}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label={t.dismiss}
              className="shrink-0 rounded-lg p-1 text-red-400 hover:text-red-700 hover:bg-red-100 transition-colors"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="min-w-0 space-y-6">
          <MeetingPlayer
            t={t}
            settings={settings}
            onSettingsChange={updateSettings}
            targetLang={targetLang}
            onTargetLangChange={(newLang) => {
              setTargetLang(newLang);
            }}
            capture={capture}
            onStartCapture={startCapture}
            onStopCapture={stopCapture}
            onTestVoice={testVoice}
            connected={connected}
          />
          <TranscriptPanel t={t} items={items} pending={pending} onClear={() => setItems([])} />
        </div>

        <aside className="min-w-0 space-y-6">
          <AudioVisualizer t={t} engine={engine} active={capture.active} />
          <AudioControls
            t={t}
            settings={settings}
            onChange={updateSettings}
            devices={devices}
            sinkSupported={engine.supportsSinkId()}
            onRefreshDevices={() => refreshDevices(true)}
            onTestVoice={testVoice}
          />
        </aside>
      </main>

      {/* Subtle ambient pastel gradient orbs for light theme depth */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div
          className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-1/2 -right-40 h-[500px] w-[500px] rounded-full opacity-35 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, transparent 70%)' }}
        />
      </div>
    </div>
  );
}
