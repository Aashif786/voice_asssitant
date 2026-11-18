# Offline Voice AI Assistant

A privacy-first, **on-device** voice assistant. Speech recognition (Whisper), language
reasoning (llama.cpp), and text-to-speech all run **on the phone** — no audio or
conversation ever leaves the device. An optional companion backend exists for desktop/LAN
use, but the mobile app is fully self-contained.

- **App:** Expo / React Native (TypeScript), `app/frontend`
- **Optional backend:** FastAPI (Python), `backend` — not required by the mobile app

---

## Architecture (on-device)

```
 Mic ──▶ whisper.rn (Whisper, on-device STT) ──▶ text
                                                  │
                                       tool intent?│
                        ┌─────────────────────────┴───────────────┐
                        ▼                                          ▼
          Tool (time, reminder, calendar,             llama.rn (llama.cpp, on-device LLM)
          draft, file/web search)                                  │
                        └─────────────────────────┬────────────────┘
                                                   ▼
                                     expo-speech (on-device TTS) ──▶ Speaker
```

- **STT:** `whisper.rn` (whisper.cpp) with a locally downloaded GGML model.
- **LLM:** `llama.rn` (llama.cpp) running a downloaded GGUF model.
- **Tools:** detected offline (`src/services/ai/toolIntent.ts`) and executed on-device.
- **Fallback:** if no model is loaded, a deterministic rule engine answers and prompts the
  user to install a model. If `EXPO_PUBLIC_BACKEND_URL` is set, the optional backend is
  used as a secondary generator.

> **Important:** `llama.rn` and `whisper.rn` are native modules. They do **not** run in
> Expo Go or on web — you must create a **development build** (EAS or local prebuild).

---

## Prerequisites

- Node 18+ and Yarn
- For device builds: an Expo account + EAS CLI (`npm i -g eas-cli`), and Android Studio
  (Android) or Xcode (iOS)

## Install

```bash
cd app/frontend
yarn install
# Ensures the native modules match the installed Expo SDK:
npx expo install llama.rn whisper.rn
```

## Run (development build — required for voice/LLM)

Because the app uses native modules, run a dev build rather than Expo Go:

```bash
# Build & install a dev client on a connected device/emulator:
eas build --profile development --platform android   # or ios
# ...then start the bundler:
npx expo start --dev-client
```

Local alternative (no EAS):

```bash
npx expo prebuild
npx expo run:android   # or: npx expo run:ios
```

### First run
1. Open **Models** → download a GGUF model (start with **SmolLM2 135M** or **Qwen 2.5 0.5B**
   on low-RAM devices; **Llama 3.2 1B/3B** for better quality).
2. Tap the mic → grant microphone permission → the app downloads the Whisper speech model
   once (~141 MB), then transcribes on-device.
3. Speak. The transcript is answered by the on-device LLM and read back with TTS.

## Optional companion backend

Only needed if you want a desktop/LAN server (e.g. to run larger models on a PC). The
mobile app does **not** require it.

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run.py            # serves http://0.0.0.0:8000
```

Point the app at it by setting `EXPO_PUBLIC_BACKEND_URL` (e.g. in `app/frontend/.env`).
Backend config is via env vars — see `backend/.env.example`. The backend's own STT is
offline when `faster-whisper` is installed (otherwise it falls back to an online engine
and reports that honestly at `/api/voice/status`).

Run backend tests:

```bash
VA_DATA_DIR=/tmp/va pytest backend/tests -q   # VA_DATA_DIR avoids writing into the repo
```

---

## Status

| Capability | Status |
|------------|--------|
| On-device STT (Whisper) | Implemented — needs a dev build + one-time model download |
| On-device LLM (llama.cpp) | Implemented — needs a downloaded GGUF model |
| On-device TTS | Implemented (native) |
| Tools: time, reminder, calendar, draft, file/web search | Implemented |
| Wake-word ("Hey Assistant") | Planned — needs a native wake engine + Android foreground service |

## Notes for maintainers

- Large binaries and model files are git-ignored (`backend/bin/`, `*.gguf`, `*.bin`,
  `*.db`). Don't commit them — models download at runtime; ship llama.cpp binaries via a
  release artifact or Git LFS if the desktop backend is distributed.
- `backend/tests/test_api.py::test_models_lifecycle` downloads a real model and needs
  network; deselect it in offline CI.
