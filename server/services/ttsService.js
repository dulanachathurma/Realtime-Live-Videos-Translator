/**
 * Speech Synthesis Engine
 * -----------------------
 * Turns the translated text into spoken audio (MP3, returned as base64).
 *
 *  1. Google Cloud Text-to-Speech  (if GOOGLE_TTS_API_KEY is set) - best quality,
 *     supports Sinhala (si-LK), Tamil (ta-IN), English (en-US), male/female and pitch.
 *  2. Google Translate voice       (free fallback, no key, no pitch control).
 *     This is an unofficial endpoint: fine for local demos, not for production.
 *  3. If both fail, we return null and the browser speaks the text with its own voice.
 */

import { Buffer } from 'node:buffer';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CLOUD_LANG = {
  si: 'si-LK',
  en: 'en-US',
  ta: 'ta-IN',
  hi: 'hi-IN',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  ja: 'ja-JP',
  ko: 'ko-KR',
  ar: 'ar-XA',
  ru: 'ru-RU',
  zh: 'cmn-CN',
  it: 'it-IT',
  pt: 'pt-BR',
};

const FALLBACK_LANG = {
  si: 'si',
  en: 'en',
  ta: 'ta',
  hi: 'hi',
  es: 'es',
  fr: 'fr',
  de: 'de',
  ja: 'ja',
  ko: 'ko',
  ar: 'ar',
  ru: 'ru',
  zh: 'zh-CN',
  it: 'it',
  pt: 'pt',
};

export function getTtsMode() {
  return process.env.GOOGLE_TTS_API_KEY ? 'google-cloud' : 'google-translate-fallback';
}

function clamp(value, min, max) {
  const n = Number(value);
  if (Number.isNaN(n)) return 0;
  return Math.min(max, Math.max(min, n));
}

// Explicit Google Cloud TTS voice names for Male and Female per language
const CLOUD_VOICE_NAMES = {
  'si-LK': { FEMALE: 'si-LK-Standard-A', MALE: 'si-LK-Standard-A' }, // Sinhala only has Standard-A; pitch shift differentiates gender
  'en-US': { FEMALE: 'en-US-Journey-F', MALE: 'en-US-Journey-D' },
  'ta-IN': { FEMALE: 'ta-IN-Standard-A', MALE: 'ta-IN-Standard-B' },
  'hi-IN': { FEMALE: 'hi-IN-Standard-A', MALE: 'hi-IN-Standard-B' },
  'es-ES': { FEMALE: 'es-ES-Standard-A', MALE: 'es-ES-Standard-B' },
  'fr-FR': { FEMALE: 'fr-FR-Standard-A', MALE: 'fr-FR-Standard-B' },
  'de-DE': { FEMALE: 'de-DE-Standard-A', MALE: 'de-DE-Standard-B' },
  'ja-JP': { FEMALE: 'ja-JP-Standard-A', MALE: 'ja-JP-Standard-C' },
  'ko-KR': { FEMALE: 'ko-KR-Standard-A', MALE: 'ko-KR-Standard-C' },
  'ar-XA': { FEMALE: 'ar-XA-Standard-A', MALE: 'ar-XA-Standard-B' },
  'ru-RU': { FEMALE: 'ru-RU-Standard-A', MALE: 'ru-RU-Standard-B' },
  'cmn-CN': { FEMALE: 'cmn-CN-Standard-A', MALE: 'cmn-CN-Standard-B' },
  'it-IT': { FEMALE: 'it-IT-Standard-A', MALE: 'it-IT-Standard-C' },
  'pt-BR': { FEMALE: 'pt-BR-Standard-A', MALE: 'pt-BR-Standard-B' },
};

async function cloudTts({ text, lang, gender, pitch }) {
  const languageCode = CLOUD_LANG[lang] || 'en-US';
  const isMale = String(gender).toUpperCase() === 'MALE';
  const voiceMapping = CLOUD_VOICE_NAMES[languageCode];
  const voiceName = voiceMapping ? (isMale ? voiceMapping.MALE : voiceMapping.FEMALE) : undefined;

  // Dynamic pitch: shift -4.0 semitones for male voice, +2.5 for female voice, plus user pitch offset
  const baseGenderPitch = isMale ? -4.0 : 2.5;
  const totalPitch = clamp((Number(pitch) || 0) + baseGenderPitch, -20, 20);

  const voicePayload = {
    languageCode,
    ssmlGender: isMale ? 'MALE' : 'FEMALE',
  };
  if (voiceName) {
    voicePayload.name = voiceName;
  }

  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(
      process.env.GOOGLE_TTS_API_KEY
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: voicePayload,
        audioConfig: {
          audioEncoding: 'MP3',
          pitch: totalPitch,
          speakingRate: 1.0,
        },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok || !data.audioContent) {
    throw new Error(data?.error?.message || `Cloud TTS failed (HTTP ${response.status})`);
  }
  return { audioBase64: data.audioContent, mimeType: 'audio/mpeg', engine: 'google-cloud' };
}

/** Splits text into pieces of at most `max` characters, preferring sentence/word boundaries. */
function splitText(text, max = 180) {
  const sentences = text.match(/[^.!?।\n]+[.!?।]?/g) || [text];
  const pieces = [];
  let current = '';

  const pushWords = (sentence) => {
    let buffer = '';
    for (const word of sentence.split(/\s+/)) {
      if ((buffer + ' ' + word).trim().length > max) {
        if (buffer) pieces.push(buffer.trim());
        buffer = word;
      } else {
        buffer = `${buffer} ${word}`;
      }
    }
    if (buffer.trim()) pieces.push(buffer.trim());
  };

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length > max) {
      if (current) {
        pieces.push(current.trim());
        current = '';
      }
      pushWords(sentence);
    } else if ((current + ' ' + sentence).trim().length > max) {
      pieces.push(current.trim());
      current = sentence;
    } else {
      current = `${current} ${sentence}`;
    }
  }
  if (current.trim()) pieces.push(current.trim());
  return pieces;
}

async function fallbackTts({ text, lang }) {
  const tl = FALLBACK_LANG[lang] || 'en';
  const buffers = [];

  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  ];

  for (const piece of splitText(text)) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${encodeURIComponent(
      piece
    )}`;

    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': userAgents[attempt % userAgents.length],
            Referer: 'https://translate.google.com/',
          },
        });
        if (!response.ok) {
          lastErr = new Error(`Fallback TTS failed (HTTP ${response.status})`);
          await sleep(300 * (attempt + 1));
          continue;
        }
        buffers.push(Buffer.from(await response.arrayBuffer()));
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        await sleep(300 * (attempt + 1));
      }
    }
    if (lastErr) throw lastErr;
  }

  if (!buffers.length) throw new Error('Fallback TTS returned no audio');
  return {
    audioBase64: Buffer.concat(buffers).toString('base64'),
    mimeType: 'audio/mpeg',
    engine: 'google-translate-fallback',
  };
}

export async function synthesizeSpeech({ text, lang, gender = 'FEMALE', pitch = 0 }) {
  const clean = String(text || '').trim();
  if (!clean) return null;

  if (process.env.GOOGLE_TTS_API_KEY) {
    try {
      return await cloudTts({ text: clean, lang, gender, pitch });
    } catch (err) {
      console.warn('[tts] Cloud TTS failed, trying fallback:', err.message);
    }
  }

  try {
    return await fallbackTts({ text: clean, lang });
  } catch (err) {
    console.warn('[tts] Fallback TTS failed, the browser voice will be used:', err.message);
    return null;
  }
}
