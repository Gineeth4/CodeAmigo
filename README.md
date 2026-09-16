# 🌌 CodeAmigo: Next-Gen AI Mobile Companion

![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Expo](https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=FastAPI&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-Local_LLM-black?style=for-the-badge)

CodeAmigo is a premium, high-performance mobile AI assistant built specifically for developers. Rather than relying on cloud-based LLM APIs, CodeAmigo features a highly secure, hardware-paired connection architecture that links your mobile device directly to a local FastAPI bridge server running Llama 3.1/3.2 models via Ollama. 

Designed with a heavy emphasis on UX/UI, fluid Reanimated physics, and uncompromised local security.

---

## 📖 Table of Contents
1. [Core Philosophy](#-core-philosophy)
2. [Architectural Highlights](#-architectural-highlights)
3. [Premium UI/UX Features](#-premium-uiux-features)
4. [Security & Authentication](#-security--authentication)
5. [Tech Stack](#-tech-stack)
6. [Installation & Setup](#-installation--setup)
7. [Developer Notes](#-developer-notes)
8. [Author](#-author)

---

## 🎯 Core Philosophy
Most AI companions are built as simple web wrappers. CodeAmigo is engineered from the ground up to feel like a **native, premium IDE**. From the 120fps UI-thread keyboard synchronization to the tactile haptic feedback and dynamic Markdown rendering, every pixel is designed to optimize the developer workflow on mobile.

---

## 🏗 Architectural Highlights

### 1. Hardware-Paired Local Backend
Instead of an open web API, CodeAmigo requires a physical QR-code scan using `expo-camera`. The payload securely transfers local IP endpoints and active role profiles, allowing the mobile app to handshake with the local FastAPI server. 

### 2. Server-Sent Events (SSE) Streaming
CodeAmigo utilizes a robust Server-Sent Events (SSE) parser on the frontend to stream tokens directly from the local Ollama instance in real-time, completely bypassing standard REST timeouts and ensuring a fluid conversational flow.

### 3. Active Health Polling
The UI features a dynamic Connection Status Beacon in the header. The app routinely pings the FastAPI `/` health endpoint on a 5-second interval. If the local server drops, the beacon visually alerts the user instantly.

---

## ✨ Premium UI/UX Features

### 🚀 120fps Reanimated Engine
- **UI-Thread Keyboard:** Standard `KeyboardAvoidingView` was completely abandoned. The chat input relies on `useAnimatedKeyboard()` from `react-native-reanimated` to tie the text box directly to the OS keyboard layout on the native UI thread, guaranteeing zero-lag input.
- **3D Spatial Push:** Routing between the Scanner and Chat utilizes custom 3D spatial depth animations for an immersive transition.
- **Ambient Memory Hooks:** The login background uses a highly optimized, `React.memo`-wrapped twinkling star ambient animation to prevent any render-blocking operations.

### 🎨 The Chat Interface
- **Dynamic Syntax Theming:** Users can switch between developer-grade syntax themes (One Dark, Dracula, Monokai). This changes the global accent colors and the exact Markdown rendering logic inside the chat.
- **Glowing Code Blocks:** Markdown rendering is elevated with deep `#050505` backgrounds and soft glowing borders to make code stand out from standard text.
- **Smart Input Expansion:** The text input smoothly scales up to 120px for multi-line code pasting before enabling internal scrolling.
- **Haptic Engine:** Powered by `expo-haptics`, interactions (sending prompts, copying code) are accompanied by subtle physical feedback.
- **Pulsing Indicator:** A sleek "CodeAmigo is typing..." message bubble seamlessly integrates into the chat stream instead of utilizing blocky, absolute-positioned loaders.

### ⚙️ The Settings Engine
- **Gesture-Handled Modal:** The settings overlay relies on a strictly calculated fixed-height Modal (`height: Dimensions.get('window').height * 0.75`), solving standard flexbox collapse issues.
- **Priority Scrolling:** Protected by `react-native-gesture-handler`, the inner `ScrollView` uses `nestedScrollEnabled` to completely override global swipe layouts, ensuring buttery smooth scrolling.
- **Static 2x2 Feature Grid:** Role-specific features (e.g., Student Mode, Debug Buddy) are mapped into a rigid, non-scrolling 2x2 flex-wrap grid for maximum data density and minimal footprint.

---

## 🔐 Security & Authentication

CodeAmigo implements a strict **Forced Pipeline Routing** model:
`Signup / Login -> Hardware QR Scanner -> Secure Chat`

- **Cached Bypass:** Returning users who authenticate successfully bypass the feature onboarding overlays, jumping straight from Scanner to Chat.
- **Keychain Wiping:** If the user logs out, all cached `backend_url` variables stored in `expo-secure-store` are nuked, preventing unauthorized local network access.

---

## 🛠 Tech Stack

### Frontend (Mobile Application)
* **Framework:** React Native + Expo Router
* **Language:** TypeScript
* **Animations:** React Native Reanimated 3
* **Gestures:** React Native Gesture Handler
* **Camera:** Expo Camera (v14+)
* **Storage:** Expo Secure Store
* **Feedback:** Expo Haptics

### Backend (Local Bridge Server)
* **Framework:** FastAPI (Python)
* **LLM Engine:** Ollama (Llama 3.1 / Llama 3.2)
* **Protocol:** Server-Sent Events (SSE)

---

## 🚀 Installation & Setup

### 1. The FastAPI Backend
Ensure Python 3.10+ and Ollama are installed on your host machine.
```bash
# Clone the backend repository
git clone <backend-repo-url>
cd codeamigo-backend

# Install dependencies
pip install fastapi uvicorn sse-starlette

# Run the local server (Ensure this matches your IP)
uvicorn main:app --host 0.0.0.0 --port 8000
```
### 2. The React Native Frontend
```bash
# Clone this repository
git clone [https://github.com/Gineeth4/CodeAmigo.git](https://github.com/Gineeth4/CodeAmigo.git)
cd CodeAmigo

# Install dependencies
npm install

# Start the Expo server
npx expo start
```

Note: Ensure your mobile device and your laptop/server are connected to the exact same local Wi-Fi network for the QR scanner to successfully handshake.

👨‍💻 Author
Built with precision by Gineeth R. 

Computer Science & Engineering | VIT Chennai

Designed for the Software Engineering Project & daily developer workflows.
