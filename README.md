# Live Class Translator

Listen to a live Zoom or Google Meet class in Sinhala, English or Tamil, through your headset, while the teacher is still talking.

<img width="1024" height="765" alt="cff138e3-90e9-4074-969d-e807bb7e66e4" src="https://github.com/user-attachments/assets/79d50779-c9af-4b5f-bbfc-4f7ff0371261" />


<p align="center">
  ▶️ <b><a href="https://drive.google.com/file/d/1fbkurbvAe5rnWRQUW7FFhKigJ8ddWPnn/view?usp=sharing">Click here to watch the VoxBridge AI Live Audio Translator Video Demo</a></b>
</p>

## Run it on localhost

You need Node.js 18 or newer and Google Chrome (or Edge).

**1. Server** (terminal 1)

```bash
cd server
npm install
cp .env.example .env      # Windows: copy .env.example .env
# open .env and paste your GEMINI_API_KEY (free at https://aistudio.google.com/apikey)
npm run dev
```

**2. Client** (terminal 2)

```bash
cd client
npm install
npm run dev
```

Open **http://localhost:5173** in Chrome.

Check the server is healthy at http://localhost:5000/api/health

## How to use it in class

1. Pick your language in the top bar (සිංහල / English / தமிழ்). This is the language you will hear and read.
2. Paste the Zoom or Google Meet link and press **Open class**. The class opens in a window beside the app. Join through the browser.
3. Press **Start translating**. In the Chrome dialog choose **Chrome Tab**, select the class tab, and tick **Also share tab audio**.
4. Put your headset on and choose it under **Sound output**. Mute the class tab if you want to hear only the translation.

Zoom desktop app instead of the browser? On Windows choose **Entire screen** and tick **Share system audio**.

## How it works

```
class tab audio → AudioWorklet → ~2–9 s speech chunks (16 kHz WAV)
   → Socket.io → server → Gemini (transcribe + translate in one call)
   → Google TTS → MP3 → Socket.io → AudioContext → your headset
```

Expect about 3 to 6 seconds of delay behind the teacher. That is normal for AI interpretation.

## Notes

- Zoom and Google Meet block being embedded in other sites (iframes), so the class opens in a side window. The app captures that tab's audio.
- Without `GOOGLE_TTS_API_KEY` the server uses a free, unofficial Google voice. It works for local demos but has no pitch control. For a real deployment, add the key.
- If the server cannot make audio at all, the browser's own voice is used. Sinhala and Tamil browser voices depend on your operating system.
- Do not commit `server/.env`.
