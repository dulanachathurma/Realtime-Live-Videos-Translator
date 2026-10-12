/**
 * AI Translation Engine
 * ---------------------
 * Sends a short WAV clip to Gemini and gets back, in ONE request:
 *   - the original transcript (in the language that was spoken)
 *   - the translation into the listener's chosen language
 *
 * Gemini understands Sinhala, Tamil and English audio directly, so no separate
 * speech-to-text service is needed.
 */

export const LANGUAGE_NAMES = {
  si: 'Sinhala (සිංහල)',
  en: 'English',
  ta: 'Tamil (தமிழ்)',
  hi: 'Hindi (हिन्दी)',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
  ar: 'Arabic (العربية)',
  ru: 'Russian (Русский)',
  zh: 'Chinese (中文)',
  it: 'Italian (Italiano)',
  pt: 'Portuguese (Português)',
};

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    hasSpeech: { type: 'BOOLEAN' },
    sourceLanguage: { type: 'STRING' },
    original: { type: 'STRING' },
    translated: { type: 'STRING' },
  },
  required: ['hasSpeech', 'sourceLanguage', 'original', 'translated'],
};

function buildPrompt({ targetLang, sourceLang, context }) {
  const target = LANGUAGE_NAMES[targetLang] || targetLang;
  const sourceHint =
    sourceLang && sourceLang !== 'auto'
      ? `The speaker is expected to be speaking ${LANGUAGE_NAMES[sourceLang] || sourceLang}.`
      : 'Detect the spoken language automatically. The speaker may be speaking English, Sinhala, Tamil, Hindi, Spanish, French, German, Japanese, Korean, Arabic, Russian, Chinese, or any other language.';

  const contextBlock =
    context && context.length
      ? `\nPrevious sentences from this same session, for context only (do NOT repeat them):\n${context
          .map((c, i) => `${i + 1}. ${c.original}`)
          .join('\n')}\n`
      : '';

  return `You are a high-speed professional simultaneous interpreter.
You will receive a short audio clip (1 to 5 seconds) from a video, class, or livestream.

Instructions:
1. Transcribe what was spoken verbatim in the original language.
2. Translate it directly into natural, clear spoken ${target}.
3. If the audio is already in ${target}, keep "translated" identical to "original".
4. Set "sourceLanguage" to the detected language code or name (e.g. "en", "si", "ta", "hi", "es", "fr", "de", "ja", etc.).
5. If the clip has no intelligible speech (silence, only music, or background noise), set hasSpeech to false and leave both original and translated empty.

${sourceHint}
Never add commentary or explain your translation. Output only the requested JSON.
${contextBlock}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeParseJson(text) {
  const cleaned = String(text || '')
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

// Candidate models prioritizing fast, high-quota flash models
const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
].filter(Boolean);

export async function translateAudio({
  audioBase64,
  mimeType = 'audio/wav',
  targetLang,
  sourceLang = 'auto',
  context = [],
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY is missing. Add it to server/.env and restart the server.');
  }

  const promptText = buildPrompt({ targetLang, sourceLang, context });
  let lastError;

  // Try candidate models in order if quota or error encountered
  for (const model of CANDIDATE_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const generationConfig = {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    };

    if (/flash/i.test(model)) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            { inline_data: { mime_type: mimeType, data: audioBase64 } },
          ],
        },
      ],
      generationConfig,
    };

    // Exponential backoff for up to 3 attempts per model
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(body),
        });

        if (response.status === 429 || response.status >= 500) {
          const waitTime = Math.min(2500, 600 * Math.pow(2, attempt));
          lastError = new Error(`Gemini is busy (HTTP ${response.status}) on model ${model}.`);
          console.warn(`[gemini] ${model} returned ${response.status}, retrying in ${waitTime}ms (attempt ${attempt + 1}/3)...`);
          await sleep(waitTime);
          continue;
        }

        const data = await response.json();

        if (!response.ok) {
          const message = data?.error?.message || `Gemini request failed (HTTP ${response.status}).`;
          throw new Error(message);
        }

        const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
        if (!text) {
          return { hasSpeech: false, sourceLanguage: 'other', original: '', translated: '' };
        }

        const parsed = safeParseJson(text);
        return {
          hasSpeech: Boolean(parsed.hasSpeech),
          sourceLanguage: String(parsed.sourceLanguage || 'other'),
          original: String(parsed.original || '').trim(),
          translated: String(parsed.translated || '').trim(),
        };
      } catch (err) {
        lastError = err;
        if (err instanceof SyntaxError || /API key|invalid/i.test(err.message)) break;
        await sleep(400 * (attempt + 1));
      }
    }
  }

  // Gracefully handle rate limit without crashing caller
  console.error('[gemini translation]', lastError?.message);
  throw lastError || new Error('Translation temporarily busy. Please retry.');
}
