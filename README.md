# 🎙️ Offline Voice AI Assistant

A privacy-first, intelligent voice assistant that runs **on-device** with offline speech recognition (Whisper), local language reasoning (llama.cpp / GGUF), offline tools, and text-to-speech.

The project features a **hybrid architecture**:
1. **100% Offline On-Device Mode**: Runs fully on mobile hardware via custom native C++ TurboModules (`whisper.rn` and `llama.rn`) with zero network dependency.
2. **Companion Backend / Development Mode**: Connects the mobile app (or browser) to a local Python FastAPI backend running local Whisper STT and `llama.cpp` inference for fast testing in **Expo Go**, **Web**, or over the **Local Network (LAN)**.

---

## 📑 Table of Contents
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Prerequisites & Quick Setup](#-prerequisites--quick-setup)
- [Starting the Companion Backend](#-starting-the-companion-backend)
- [Starting the Frontend (All Methods)](#-starting-the-frontend-all-methods)
  - [Method 1: Web Browser (Fastest PC Testing)](#method-1-web-browser-fastest-pc-testing)
  - [Method 2: Local Network (LAN) with Expo Go on Phone](#method-2-local-network-lan-with-expo-go-on-phone)
  - [Method 3: Tunnel Mode (Different Wi-Fi / Cellular Data)](#method-3-tunnel-mode-different-wi-fi--cellular-data)
  - [Method 4: Android Emulator / iOS Simulator](#method-4-android-emulator--ios-simulator)
  - [Method 5: Custom Development Build (100% Offline Native AI)](#method-5-custom-development-build-100-offline-native-ai)
- [Offline Tool Execution](#-offline-tool-execution)
- [Troubleshooting & FAQs](#-troubleshooting--faqs)
- [Testing & Quality Assurance](#-testing--quality-assurance)

---

## 🏛️ Architecture

```
                  ┌─────────────────────────────────────────────────┐
                  │                 User Voice / Mic                │
                  └────────────────────────┬────────────────────────┘
                                           │
         ┌─────────────────────────────────┴─────────────────────────────────┐
         ▼ (Mode 1: Dev Build / Native)                                      ▼ (Mode 2: Expo Go / Web / LAN)
   whisper.rn (whisper.cpp)                                         Browser Web Speech API  OR
   (141 MB ggml-base.en model)                                      Audio Upload ➔ POST /api/voice/transcribe
         │                                                                   │
         └─────────────────────────────────┬─────────────────────────────────┘
                                           ▼
                                    Transcribed Text
                                           │
                                           ▼
                       ┌───────────────────────────────────────┐
                       │   Agent Orchestrator (Intent Engine)  │
                       └───────────────────┬───────────────────┘
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    ▼                                             ▼
          Offline Tool Detected?                      Conversational Generation
    (Time, Reminder, Calendar, Notes,                             │
     File Search, Calculator, Web)                                │
                    │                               ┌─────────────┴─────────────┐
                    ▼                               ▼                           ▼
          Execute Locally via                On-Device LLM              Companion Backend
             ToolRegistry                 (llama.rn GGUF)           (llama-server / Gemini)
                    │                               │                           │
                    └──────────────────────┬────────┴───────────────────────────┘
                                           ▼
                                     Assistant Text
                                           │
                                           ▼
                                expo-speech (System TTS)
                                           │
                                           ▼
                                     Device Speaker
```

---

## 📁 Project Structure

```
voice_asssitant/
├── app/
│   └── frontend/              # Expo / React Native TypeScript mobile & web app
│       ├── app/               # Expo Router screens (tabs, voice-security, memory, routines, device-access)
│       ├── modules/
│       │   └── android-assistant/ # Native Android Kotlin Expo Module
│       │       ├── AndroidAssistantModule.kt
│       │       ├── AssistantForegroundService.kt
│       │       ├── AssistantVoiceInteractionService.kt
│       │       ├── AssistantNotificationListener.kt
│       │       ├── KeystoreManager.kt & SpeakerVerificationManager.kt
│       │       └── AppLauncher, ContactsManager, CallManager, SystemControlManager.kt
│       ├── src/
│       │   ├── components/    # VoiceOrb, MicSheet, Composer, ModelRow UI components
│       │   ├── hooks/         # useConversation, useVoiceInput, useMicPermission
│       │   ├── services/      # Native Android bridge, AgentOrchestrator, TaskPlanner, Tools, Memory
│       │   └── store/         # React Context stores for models and settings
│       ├── .env               # Frontend environment config (backend URL)
│       └── package.json
├── backend/                   # FastAPI Python companion backend
│   ├── app/
│   │   ├── routers/           # chat.py, models.py, tools.py, voice.py, diagnostics.py
│   │   ├── services/          # ai_engine.py, local_llm.py, model_service.py, database.py
│   │   └── config.py
│   ├── tests/                 # Pytest test suite (11 integration tests)
│   ├── run.py                 # Backend server entry point (port 8000)
│   └── requirements.txt
└── README.md
```

---

## ⚙️ Prerequisites & Quick Setup

### 1. Requirements
* **Node.js**: v18+ and **Yarn** (`npm i -g yarn`)
* **Python**: v3.10+ and `pip`
* **Expo Go App** (optional): Installed on your iOS or Android phone from App Store / Google Play

### 2. Install Dependencies

#### Backend:
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

#### Frontend:
```bash
cd app/frontend
yarn install
```

---

## 🚀 Starting the Companion Backend

The backend provides the local model manager, Whisper speech-to-text API, database storage, and local `llama.cpp` inference.

In your terminal (from project root):

```powershell
python backend/run.py
```

* **Server Address**: `http://0.0.0.0:8000` (accessible from `localhost` and your LAN IP).
* **Interactive API Docs (Swagger UI)**: Open `http://localhost:8000/docs` in your browser.
* *(Optional)* Set `GEMINI_API_KEY="your-key"` in `backend/.env` if you wish to enable online fallback when no local model is loaded.

---

## 📱 Starting the Frontend (All Methods)

Navigate to the frontend directory before running any frontend commands:
```powershell
cd app/frontend
```

---

### Method 1: Web Browser (Fastest PC Testing)

Runs the application directly in your web browser (Chrome, Edge, Brave, Safari).

```powershell
npx expo start --web
```
* **URL**: `http://localhost:8081`
* **Backend Connection**: Connects automatically to `http://localhost:8000`.
* **Voice**: Uses the browser's native **Web Speech API** for real-time speech recognition.

---

### Method 2: Local Network (LAN) with Expo Go on Phone

Allows you to run the app directly on your physical Android or iPhone device over Wi-Fi without compiling native code.

#### Step 1: Find your Computer's Local IP Address
* **Windows (PowerShell)**:
  ```powershell
  ipconfig
  # Look for "IPv4 Address", e.g., 192.168.1.99
  ```
* **macOS / Linux**:
  ```bash
  ifconfig | grep "inet "
  # or: ip a
  ```

#### Step 2: Configure `app/frontend/.env`
Create or update `app/frontend/.env` with your computer's IP:
```env
EXPO_PUBLIC_BACKEND_URL=http://192.168.1.99:8000
```
*(Replace `192.168.1.99` with your computer's actual IPv4 address).*

#### Step 3: Start Expo in LAN Mode
Ensure your phone and PC are connected to the **same Wi-Fi network**, then run:
```powershell
npx expo start --lan
```

#### Step 4: Open in Expo Go
* **Android**: Open the **Expo Go** app and tap **Scan QR Code**.
* **iOS**: Open the native **Camera app** and scan the QR code to open in Expo Go.

---

### Method 3: Tunnel Mode (Different Wi-Fi / Cellular Data)

If your PC and phone are on different Wi-Fi networks, you are on a restricted university/office network, or testing over 4G/5G mobile data:

```powershell
npx expo start --tunnel
```
* Uses secure cloud tunneling (Ngrok) to route your Metro bundle directly to your phone.
* Works regardless of router firewall rules or subnet mismatches.

---

### Method 4: Android Emulator / iOS Simulator

#### Android Emulator:
1. Start your Android Emulator in Android Studio.
2. If connecting to the companion backend, Android Emulators use `http://10.0.2.2:8000` to refer to the host PC:
   ```env
   EXPO_PUBLIC_BACKEND_URL=http://10.0.2.2:8000
   ```
3. Run:
   ```powershell
   npx expo start --android
   ```

#### iOS Simulator (macOS only):
```bash
npx expo start --ios
```

---

### Method 5: Custom Development Build (100% Offline Native AI)

Standard Expo Go cannot load custom C++ TurboModules (`whisper.rn` and `llama.rn`). If you want **100% on-device offline inference** without a backend:

#### Option A: Local Build with Android Studio & NDK
```powershell
cd app/frontend

# 1. Generate native android / ios directories
npx expo prebuild

# 2. Compile and install on plugged-in device / emulator
npx expo run:android     # or: npx expo run:ios

# 3. Start the bundler for your dev client
npx expo start --dev-client
```

#### Option B: Cloud Build with Expo Application Services (EAS)
```powershell
cd app/frontend
npm install -g eas-cli
eas login
eas build --profile development --platform android
```
Download the resulting `.apk`, install it on your device, and run `npx expo start --dev-client`.

---

## 🛠️ Offline Tool & Device Control Execution

The assistant includes an intent detection engine that executes offline tools and native Android hardware operations without requiring an LLM response:

| Tool | Voice / Text Query Examples | Behavior |
| :--- | :--- | :--- |
| **Clock** | *"What time is it?"*, *"Tell me the date"* | Instant device time check |
| **Daily Briefing** | *"Daily briefing"*, *"Brief me"*, *"How is my day"* | Synthesizes greeting, time, battery level, agenda, unread notifications, and personal memories |
| **Personal Memory** | *"Remember that my passport is in the safe"*, *"What do you remember"* | Persists facts in on-device SQLite `user_memories` table |
| **App Launcher** | *"Open WhatsApp"*, *"Launch Spotify"*, *"Start Settings"* | Discovers installed packages via `PackageManager` with fuzzy matching |
| **Phone Call** | *"Call Sarah"*, *"Dial +1234567890"* | Queries `ContactsContract` and launches safe dialer or direct call |
| **WhatsApp / SMS** | *"Draft message to Sarah saying I'm on my way"* | Resolves contact number and launches WhatsApp with pre-filled message |
| **Flashlight / Torch** | *"Turn on flashlight"*, *"Toggle torch"* | Toggles camera LED via native `CameraManager` |
| **Battery Status** | *"What's my battery level?"*, *"Check battery"* | Queries `BatteryManager` level & charging state |
| **Volume Control** | *"Set volume to 70%"*, *"Turn up volume"*, *"Check volume"* | Adjusts Android `AudioManager` media/call/ring streams |
| **Notifications** | *"Read my notifications"*, *"Check notifications"* | Reads recent incoming notifications via `NotificationListenerService` |
| **Driving Mode** | *"Driving mode"*, *"Check car mode"*, *"Audio routing"* | Detects Bluetooth vehicle/headset audio routing and prioritizes hands-free mode |
| **Reminder** | *"Remind me to buy milk tonight at 8 PM"* | Staged with confirmation, saves to SQLite |
| **Calendar** | *"What's on my schedule for today?"*, *"Tomorrow's agenda"* | Reads local agenda and events |
| **File Search** | *"Search files for report.pdf"*, *"Find document notes"* | Indexed local workspace file search |
| **Web Search** | *"Search the web for quantum computing"* | Online search with confirmation |

---

## 🔒 Biometric Voice Security & Background Assistant

### Owner-Only Biometric Authentication
* **Voice Calibration**: 4-prompt enrollment wizard extracts 192-dimensional acoustic filterbank embeddings.
* **Android KeyStore Encryption**: Centroid template stored encrypted with `AES-256-GCM` in hardware-backed `AndroidKeyStore`.
* **Cosine Similarity Matcher**: Evaluates speaker verification with customizable thresholds (Relaxed: 0.65, Standard: 0.75, Strict: 0.85).
* **Anti-Spoofing & Replay Detector**: Spectral flatness and signal quality analysis rejects recorded or synthetic audio.
* **Fail-Closed Access**: Unauthorized voices cannot execute actions, view private memories, or control device hardware.

### Foreground Background Listening & System Assistant Hook
* **Foreground Service**: Uses `FOREGROUND_SERVICE_MICROPHONE` with a persistent, low-priority notification to ensure reliable background wake-phrase listening.
* **System Assistant Integration**: Registers `AssistantVoiceInteractionService` and `AssistantVoiceInteractionSessionService` allowing hardware gestures, assistant button presses, and lock-screen invocation.
* **Notification Listener Service**: Registers `AssistantNotificationListener` (`BIND_NOTIFICATION_LISTENER_SERVICE`) to securely buffer and summarize incoming notifications upon voice request.

---

## 📱 User Interface & Settings

Dedicated modular screens configured in Expo Router:
1. **Voice Security (`/voice-security`)**: Live voice calibration wizard, anti-spoofing toggle, confidence threshold selector, and biometric deletion.
2. **Device Access & Permissions (`/device-access`)**: Live inspection and deep links for Microphone, Contacts, Direct Calling, Notifications, and Default Assistant settings.
3. **Personal Intelligence & Memory (`/memory`)**: Searchable memory cards, manual fact entry with categories, and full privacy purge.
4. **Automations & Routines (`/routines`)**: Scheduled daily briefings (morning/evening) and one-tap preview.
5. **Hands-Free (`/hands-free`)**: Wake word toggle ("Hey Assistant"), custom sensitivity slider, foreground service status.

---

## 🔍 Troubleshooting & FAQs

### Q1: Expo Go says "Speech recognition is unavailable"
* **Solution**: Ensure your companion backend is running (`python backend/run.py`) and `app/frontend/.env` has `EXPO_PUBLIC_BACKEND_URL=http://<YOUR_IP>:8000`. When connected, the app uses the backend Whisper engine. For pure on-device Whisper, use **Method 5** (Development Build).

### Q2: Network request failed / Cannot connect to backend from phone
1. Verify both your phone and PC are on the **exact same Wi-Fi connection**.
2. Make sure Windows Defender / Firewall allows incoming connections on port `8000`:
   ```powershell
   # Run in Admin PowerShell to permit port 8000:
   New-NetFirewallRule -DisplayName "VoiceAssistantBackend" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
   ```
3. Test your backend from your phone's browser: open `http://<YOUR_PC_IP>:8000/api/voice/status`. It should return `{"status": "ready"}`.

### Q3: Clearing Metro Cache
If Metro gets stuck or exhibits stale module errors:
```powershell
npx expo start -c
```

---

## 🧪 Testing & Quality Assurance

### Run Backend Test Suite (Pytest)
```powershell
python -m pytest backend/tests -v
```
*(Runs 10 automated tests covering health checks, tools, confirmation flows, model downloads, and diagnostics).*

### Run Frontend Typecheck
```powershell
yarn --cwd app/frontend tsc --noEmit
```

### Run Frontend Linter (ESLint)
```powershell
yarn --cwd app/frontend lint
```

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
