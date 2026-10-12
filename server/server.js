import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

import { translateAudio, LANGUAGE_NAMES } from './services/translationService.js';
import { synthesizeSpeech, getTtsMode } from './services/ttsService.js';

const PORT = Number(process.env.PORT) || 5000;
const ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const VALID_LANGS = new Set(Object.keys(LANGUAGE_NAMES));

const app = express();
app.use(cors({ origin: ORIGINS }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    tts: getTtsMode(),
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ORIGINS },
  maxHttpBufferSize: 10 * 1024 * 1024, // 10 MB per audio chunk is far more than needed
});

/**
 * Handles one audio chunk: speech -> original text + translation -> spoken audio.
 * Chunks of one connection are processed in order (see the promise chain below),
 * so subtitles and voice always come out in the order the teacher spoke.
 */
async function handleChunk(socket, state, payload) {
  const { seq, audio, mimeType = 'audio/wav', targetLang, sourceLang = 'auto', tts = {} } = payload || {};

  if (!audio || !VALID_LANGS.has(targetLang)) {
    socket.emit('chunk-skipped', { seq });
    return;
  }

  // New target language -> old context would confuse the model.
  if (state.lastTarget !== targetLang) {
    state.history = [];
    state.lastTarget = targetLang;
  }

  const started = Date.now();

  try {
    const buffer = Buffer.isBuffer(audio) ? audio : Buffer.from(audio);
    const result = await translateAudio({
      audioBase64: buffer.toString('base64'),
      mimeType,
      targetLang,
      sourceLang,
      context: state.history,
    });

    if (!result.hasSpeech || !result.translated) {
      socket.emit('chunk-skipped', { seq });
      return;
    }

    state.history.push({ original: result.original, translated: result.translated });
    if (state.history.length > 4) state.history.shift();

    // Send the text immediately so subtitles appear before the voice is ready.
    socket.emit('transcript', {
      seq,
      original: result.original,
      translated: result.translated,
      sourceLang: result.sourceLanguage,
      targetLang,
      latencyMs: Date.now() - started,
    });

    if (tts.enabled !== false) {
      const speech = await synthesizeSpeech({
        text: result.translated,
        lang: targetLang,
        gender: tts.gender,
        pitch: tts.pitch,
      });
      socket.emit('tts-audio', {
        seq,
        text: result.translated,
        lang: targetLang,
        audio: speech ? speech.audioBase64 : null,
        mimeType: speech ? speech.mimeType : null,
      });
    }
  } catch (err) {
    console.error(`[chunk ${seq}]`, err.message);
    socket.emit('server-error', { seq, message: err.message });
  }
}

io.on('connection', (socket) => {
  console.log(`[socket] connected ${socket.id}`);

  const state = { history: [], lastTarget: null, chain: Promise.resolve() };

  socket.on('audio-chunk', (payload) => {
    state.chain = state.chain
      .then(() => handleChunk(socket, state, payload))
      .catch((err) => console.error('[queue]', err));
  });

  // Used by the "Test voice" button.
  socket.on('tts-request', async (payload) => {
    const { seq = 0, text, lang, tts = {} } = payload || {};
    if (!text || !VALID_LANGS.has(lang)) return;
    const speech = await synthesizeSpeech({ text, lang, gender: tts.gender, pitch: tts.pitch });
    socket.emit('tts-audio', {
      seq,
      text,
      lang,
      audio: speech ? speech.audioBase64 : null,
      mimeType: speech ? speech.mimeType : null,
    });
  });

  socket.on('disconnect', () => console.log(`[socket] disconnected ${socket.id}`));
});

server.listen(PORT, () => {
  console.log(`\nLive Class Translator server running on http://localhost:${PORT}`);
  console.log(`  Gemini key : ${process.env.GEMINI_API_KEY ? 'found' : 'MISSING (add it to server/.env)'}`);
  console.log(`  Voice mode : ${getTtsMode()}\n`);
});
