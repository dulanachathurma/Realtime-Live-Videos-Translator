/**
 * AudioEngine
 * -----------
 * One AudioContext handles everything:
 *
 *   class tab / microphone ──► [AudioWorklet] ──► speech chunks (16 kHz WAV) ──► server
 *                          └─► analyserIn (waveform)
 *                          └─► originalGain ─┐
 *   translated voice (mp3) ──► translatedGain ┼─► master ─► destination (headset)
 *                                            └─► analyserOut (waveform)
 *
 * Because all sound leaves through one AudioContext, choosing a headset is a single
 * AudioContext.setSinkId() call (Chrome / Edge).
 */

const WORKLET_SOURCE = `
class ChunkCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2048);
    this.length = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const channel = input[0];
      for (let i = 0; i < channel.length; i++) {
        this.buffer[this.length++] = channel[i];
        if (this.length === this.buffer.length) {
          this.port.postMessage(this.buffer.slice(0));
          this.length = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('chunk-capture', ChunkCapture);
`;

const TARGET_RATE = 16000;

function writeString(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}

/** Averages groups of samples to go from the context sample rate down to 16 kHz. */
function downsample(samples, fromRate, toRate) {
  if (toRate >= fromRate) return samples;
  const ratio = fromRate / toRate;
  const outLength = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += samples[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

/** Encodes mono float samples as a 16-bit PCM WAV file. */
function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export class AudioEngine {
  constructor({ onChunk, onEnded, onPlayState } = {}) {
    this.onChunk = onChunk || (() => {});
    this.onEnded = onEnded || (() => {});
    this.onPlayState = onPlayState || (() => {});

    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.workletNode = null;
    this.workletReady = false;

    this.mixer = { balance: 100, master: 100, monitorOriginal: false, autoDuck: true };
    this.rate = 1;
    this.sinkId = '';
    this.ducked = false;

    this.queue = [];
    this.playing = false;
    this.currentAudio = null;
    this.currentResolve = null;

    // High-speed low-latency chunking: 1.2s - 2.8s window with 0.3s pause flush for near-instant translation
    this.silenceThreshold = 0.007; // RMS below this counts as silence
    this.minChunkSec = 1.2; // faster turnaround: starts processing right as speaker begins talking
    this.maxChunkSec = 2.8; // cap chunk length to 2.8s so voice output starts promptly
    this.silenceFlushSec = 0.3; // natural breath/pause of 300ms flushes completed sentence immediately
    this.resetChunker();
  }

  /* ------------------------------------------------------------------ context */

  async ensureContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass({ latencyHint: 'interactive' });
      const ctx = this.ctx;

      this.master = ctx.createGain();
      this.originalGain = ctx.createGain();
      this.translatedGain = ctx.createGain();
      this.silentGain = ctx.createGain();
      this.silentGain.gain.value = 0;

      this.analyserIn = ctx.createAnalyser();
      this.analyserOut = ctx.createAnalyser();
      [this.analyserIn, this.analyserOut].forEach((a) => {
        a.fftSize = 2048;
        a.smoothingTimeConstant = 0.6;
      });

      this.originalGain.connect(this.master);
      this.translatedGain.connect(this.master);
      this.translatedGain.connect(this.analyserOut);
      this.master.connect(ctx.destination);
      this.silentGain.connect(ctx.destination);

      this.applyMixer();
      if (this.sinkId) await this.applySink();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  getAnalysers() {
    return { input: this.analyserIn || null, output: this.analyserOut || null };
  }

  /* -------------------------------------------------------------------- mixer */

  setMixer(partial) {
    this.mixer = { ...this.mixer, ...partial };
    this.applyMixer();
  }

  setRate(rate) {
    this.rate = Number(rate) || 1;
    if (this.currentAudio) this.currentAudio.playbackRate = this.rate;
  }

  /** balance: 0 = only the original, 100 = only the translation. */
  levels() {
    const { balance, master, monitorOriginal, autoDuck } = this.mixer;
    const translated = balance >= 50 ? 1 : balance / 50;
    let original = balance <= 50 ? 1 : (100 - balance) / 50;
    if (!monitorOriginal) original = 0;
    if (autoDuck && this.ducked) original *= 0.25;
    const m = master / 100;
    return { translated: translated * m, original: original * m };
  }

  applyMixer() {
    if (!this.ctx) return;
    const { translated, original } = this.levels();
    const now = this.ctx.currentTime;
    this.translatedGain.gain.setTargetAtTime(translated, now, 0.05);
    this.originalGain.gain.setTargetAtTime(original, now, 0.08);
  }

  setDuck(value) {
    this.ducked = value;
    this.applyMixer();
  }

  /* ------------------------------------------------------------ output device */

  supportsSinkId() {
    return typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;
  }

  async listOutputDevices(requestPermission = false) {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    if (requestPermission) {
      try {
        // Device names stay hidden until the browser has given microphone permission once.
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
        probe.getTracks().forEach((track) => track.stop());
      } catch {
        /* ignore, we still list what we can */
      }
    }
    const all = await navigator.mediaDevices.enumerateDevices();
    return all
      .filter((d) => d.kind === 'audiooutput')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Output ${i + 1}` }));
  }

  async setOutputDevice(deviceId) {
    this.sinkId = !deviceId || deviceId === 'default' ? '' : deviceId;
    if (this.ctx) await this.applySink();
  }

  async applySink() {
    if (this.ctx && typeof this.ctx.setSinkId === 'function') {
      try {
        await this.ctx.setSinkId(this.sinkId);
      } catch (err) {
        console.warn('Could not switch output device:', err);
      }
    }
  }

  /* ------------------------------------------------------------------ capture */

  async start(kind) {
    await this.ensureContext();
    await this.stop();

    let stream;
    if (kind === 'tab') {
      // Chrome needs a video track to offer the "share tab audio" checkbox. We never use the video.
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 1 },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } else {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    }

    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('NO_AUDIO_TRACK');
    }

    this.stream = stream;
    stream.getTracks().forEach((track) =>
      track.addEventListener('ended', () => {
        if (this.stream === stream) {
          this.stop();
          this.onEnded();
        }
      })
    );

    const ctx = this.ctx;
    if (!this.workletReady) {
      const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      this.workletReady = true;
    }

    this.source = ctx.createMediaStreamSource(new MediaStream(audioTracks));
    this.source.connect(this.analyserIn);
    // Only monitor tab audio. Monitoring the microphone would cause feedback.
    if (kind === 'tab') this.source.connect(this.originalGain);

    this.workletNode = new AudioWorkletNode(ctx, 'chunk-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
    });
    this.workletNode.port.onmessage = (event) => this.handleFrames(event.data);
    this.source.connect(this.workletNode);
    this.workletNode.connect(this.silentGain);

    this.resetChunker();
  }

  async stop() {
    if (this.workletNode) {
      this.flush(); // send whatever the teacher was in the middle of saying
      try {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      } catch {
        /* already disconnected */
      }
      this.workletNode = null;
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        /* already disconnected */
      }
      this.source = null;
    }
    if (this.stream) {
      const old = this.stream;
      this.stream = null;
      old.getTracks().forEach((track) => track.stop());
    }
  }

  /* ----------------------------------------------------------------- chunking */

  resetChunker() {
    this.frames = [];
    this.frameSamples = 0;
    this.speechSec = 0;
    this.silenceSec = 0;
    this.hasSpeech = false;
  }

  handleFrames(frame) {
    const sampleRate = this.ctx.sampleRate;
    const duration = frame.length / sampleRate;

    let sum = 0;
    for (let i = 0; i < frame.length; i += 1) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / frame.length);

    this.frames.push(frame);
    this.frameSamples += frame.length;

    if (rms > this.silenceThreshold) {
      this.speechSec += duration;
      this.silenceSec = 0;
      if (this.speechSec > 0.1) this.hasSpeech = true;
    } else {
      this.silenceSec += duration;
    }

    if (!this.hasSpeech) {
      // Still waiting for speech: keep only a short pre-roll so the first word is not clipped.
      while (this.frames.length > 1 && this.frameSamples / sampleRate > 0.25) {
        this.frameSamples -= this.frames.shift().length;
      }
      if (this.silenceSec > 0.8) this.speechSec = 0;
      return;
    }

    const total = this.frameSamples / sampleRate;
    const sentenceEnded = total >= this.minChunkSec && this.silenceSec >= this.silenceFlushSec;
    if (sentenceEnded || total >= this.maxChunkSec) this.flush();
  }

  flush() {
    if (!this.ctx || !this.frames.length) return;

    const sampleRate = this.ctx.sampleRate;
    const all = new Float32Array(this.frameSamples);
    let offset = 0;
    for (const frame of this.frames) {
      all.set(frame, offset);
      offset += frame.length;
    }
    const hadSpeech = this.speechSec >= 0.15;
    this.resetChunker();
    if (!hadSpeech) return;

    // Quiet recordings transcribe better when brought up to a sensible level.
    let peak = 0;
    for (let i = 0; i < all.length; i += 1) peak = Math.max(peak, Math.abs(all[i]));
    if (peak > 0.002 && peak < 0.5) {
      const gain = Math.min(0.8 / peak, 6);
      for (let i = 0; i < all.length; i += 1) all[i] *= gain;
    }

    const small = downsample(all, sampleRate, TARGET_RATE);
    this.onChunk(encodeWav(small, TARGET_RATE), small.length / TARGET_RATE);
  }

  /* ----------------------------------------------------------------- playback */

  playTranslated({ audioBase64, mimeType = 'audio/mpeg', gender = 'FEMALE', pitch = 0 }) {
    if (!audioBase64) return;
    console.log(`[TTS Audio] Enqueued chunk size: ${audioBase64.length} chars (mime: ${mimeType}, gender: ${gender})`);
    this.queue.push({ audioBase64, mimeType, gender, pitch });
    // Ensure AudioContext is ready before draining (handles browser autoplay policy)
    this.ensureContext().then(() => this.drain()).catch((err) => {
      console.warn('[TTS Audio] Could not resume AudioContext for playback:', err);
      this.drain();
    });
  }

  async drain() {
    if (this.playing) return;
    this.playing = true;
    this.onPlayState(true);
    this.setDuck(true);

    while (this.queue.length) {
      const item = this.queue.shift();
      try {
        // Always ensure context is alive before each playback item
        if (this.ctx && this.ctx.state === 'suspended') {
          await this.ctx.resume().catch(() => {});
        }
        await this.playItem(item);
      } catch (err) {
        console.warn('[TTS Audio] Playback problem:', err);
        // Small delay before next item to avoid rapid error loops
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    this.playing = false;
    this.onPlayState(false);
    this.setDuck(false);
  }

  async playItem({ audioBase64, mimeType = 'audio/mpeg', gender = 'FEMALE' }) {
    const bytes = base64ToBytes(audioBase64);
    if (bytes.byteLength < 100) {
      console.warn('[TTS Audio] Skipping very small audio chunk:', bytes.byteLength, 'bytes');
      return;
    }

    const isMale = String(gender).toUpperCase() === 'MALE';
    const backlog = this.queue.length;
    const catchUp = backlog >= 3 ? 1.25 : backlog >= 2 ? 1.12 : 1;
    const playbackRate = Math.min(2, this.rate * catchUp);
    const volume = Math.max(0, Math.min(1, this.levels().translated ?? 1));

    console.log(`[TTS Audio] Playing ${bytes.byteLength} bytes (vol: ${volume}, rate: ${playbackRate}, gender: ${gender})`);

    // Primary: Native HTMLAudioElement
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.src = url;
    audio.volume = volume;
    audio.playbackRate = playbackRate;
    // For male voice, pitch can be rendered deeper
    audio.preservesPitch = !isMale;
    if (isMale) {
      // Shifting playback rate slightly down produces a realistic deeper male resonance
      audio.playbackRate = playbackRate * 0.88;
    }
    this.currentAudio = audio;

    return new Promise((resolve) => {
      let resolved = false;
      let safetyTimeout = null;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          if (safetyTimeout) clearTimeout(safetyTimeout);
          this.currentAudio = null;
          this.currentResolve = null;
          try {
            URL.revokeObjectURL(url);
          } catch {
            /* ignore */
          }
          resolve();
        }
      };

      this.currentResolve = cleanup;
      audio.onended = cleanup;
      audio.onerror = (e) => {
        console.warn('[TTS Audio] HTMLAudio element error:', e);
        cleanup();
      };

      // Safety timeout: 15s max per audio chunk to never block the queue
      safetyTimeout = setTimeout(() => {
        console.warn('[TTS Audio] Playback safety timeout fired');
        cleanup();
      }, 15000);

      // Attempt to play
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('[TTS Audio] audio.play() was prevented by browser policy:', err);
          // Fallback to Web Audio decodeAudioData if AudioContext is available
          if (this.ctx) {
            this.ctx.resume().then(() => {
              return this.ctx.decodeAudioData(bytes.buffer.slice(0));
            }).then((buf) => {
              const src = this.ctx.createBufferSource();
              src.buffer = buf;
              src.playbackRate.value = playbackRate;
              src.connect(this.translatedGain);
              this.currentSourceNode = src;
              src.onended = cleanup;
              src.start(0);
            }).catch((fallbackErr) => {
              console.warn('[TTS Audio] WebAudio fallback failed:', fallbackErr);
              cleanup();
            });
          } else {
            cleanup();
          }
        });
      }
    });
  }

  /** Stops the voice that is speaking now and forgets everything that is waiting. */
  clearQueue() {
    this.queue = [];
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.stop();
      } catch {
        /* already stopped */
      }
      this.currentSourceNode = null;
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
    }
    if (this.currentResolve) {
      this.currentResolve();
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  /** Browser voice synthesizer with dynamic gender and pitch filtering */
  speakBrowser(text, langCode, gender = 'FEMALE', pitchOffset = 0) {
    if (!('speechSynthesis' in window) || !text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;
    utterance.rate = this.rate;
    utterance.volume = Math.min(1, this.levels().translated);

    const isMale = String(gender).toUpperCase() === 'MALE';
    // Dynamically adjust utterance pitch: lower (0.7-0.85) for male, higher (1.1-1.3) for female
    const basePitch = isMale ? 0.8 : 1.15;
    const pitchAdjustment = (Number(pitchOffset) || 0) * 0.05;
    utterance.pitch = Math.max(0.5, Math.min(2.0, basePitch + pitchAdjustment));

    const prefix = langCode.slice(0, 2).toLowerCase();
    const voices = window.speechSynthesis.getVoices() || [];

    // Filter candidate voices for this language
    const langVoices = voices.filter(
      (v) => v.lang.toLowerCase().startsWith(prefix) || v.lang.toLowerCase().replace('_', '-').startsWith(langCode.toLowerCase())
    );

    let chosenVoice = null;
    if (langVoices.length > 0) {
      if (isMale) {
        // Look for male keyword or identifiers (david, george, mark, male, guy, james, etc.)
        chosenVoice = langVoices.find((v) =>
          /\bmale\b|david|george|mark|guy|james|richard|stefan|daniel|alex/i.test(v.name)
        );
      } else {
        // Look for female keyword or identifiers (zira, susan, female, linda, samantha, victoria, anna, etc.)
        chosenVoice = langVoices.find((v) =>
          /\bfemale\b|zira|susan|linda|samantha|victoria|anna|karen|catherine/i.test(v.name)
        );
      }
      if (!chosenVoice) {
        chosenVoice = langVoices[0];
      }
    }

    if (chosenVoice) {
      utterance.voice = chosenVoice;
      console.log(`[Browser Voice] Selected: ${chosenVoice.name} (${gender}, pitch: ${utterance.pitch})`);
    } else {
      console.log(`[Browser Voice] Fallback voice for ${langCode} (${gender}, pitch: ${utterance.pitch})`);
    }

    window.speechSynthesis.speak(utterance);
  }
}
