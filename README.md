# 🎙️ ListenOS

> **AI-Powered Voice Control System for Windows & macOS**

ListenOS is a native desktop application that lets you control your computer using natural voice commands. By default, hold **Ctrl+Space** to talk, speak your command, and release to execute.

![ListenOS Demo](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-blue) ![Tauri 2.0](https://img.shields.io/badge/Tauri-2.0-orange) ![Next.js 16](https://img.shields.io/badge/Next.js-16-black) ![Rust](https://img.shields.io/badge/Rust-stable-red)

## ✨ Features

- **🗣️ Voice-to-Action**: Speak naturally and ListenOS understands your intent
- **⚡ Ultra-Fast**: Sub-200ms response time using Groq's Whisper API
- **🎯 Smart Commands**: Open apps, search the web, compose emails, control volume
- **✍️ Dictation Mode**: Seamlessly type spoken text into any application
- **🔒 Privacy-First**: All processing happens via secure cloud APIs, no local data stored
- **🎨 Beautiful UI**: Modern dashboard with activity history and settings

## 🚀 Quick Start

### Prerequisites

**Windows:**
- **Windows 10/11** (64-bit)
- **Node.js 18+** and **npm** or **bun**
- **Rust** (latest stable) - [Install Rust](https://rustup.rs/)
- **Visual Studio Build Tools** with C++ workload

**macOS:**
- **macOS 10.15+** (Catalina or later)
- **Node.js 18+** and **npm** or **bun**
- **Rust** (latest stable) - [Install Rust](https://rustup.rs/)
- **Xcode Command Line Tools** (`xcode-select --install`)
- Grant **Microphone** and **Accessibility** permissions when prompted

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/devrajsingh15/ListenOS.git
   cd ListenOS
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   bun install
   ```

3. **Run in development mode**
   ```bash
   npm run tauri:dev
   # or
   bun run tauri:dev
   ```

4. **Build for production**
   ```bash
   npm run tauri:build
   # or
   bun run tauri:build
   ```
   The installer will be created in `backend/target/release/bundle/`

### macOS DMG Build (Testing)

To build a macOS DMG package on a macOS machine:

```bash
npm run tauri:build:mac:dmg
```

Output path:

`backend/target/release/bundle/dmg/`

Quick validation on macOS:

```bash
hdiutil verify backend/target/release/bundle/dmg/*.dmg
```

Post-install validation checklist:

`docs/macos-smoke-test-checklist.md`

## 🎮 Usage

### Basic Controls

| Action | How to Use |
|--------|------------|
| **Activate** | Hold **Ctrl+Space** |
| **Speak** | Say your command while holding |
| **Execute** | Release **Ctrl+Space** |

### Example Commands

**🖥️ Open Applications**
- "Open Chrome"
- "Open Settings"
- "Open Spotify"

**🔍 Web Search**
- "Search for best restaurants near me"
- "Look up the weather tomorrow"

**📧 Email**
- "Send an email to john@example.com about the meeting"

**🎵 Media Control**
- "Play some lofi music on YouTube"
- "Volume up"
- "Mute"

**✍️ Dictation** (just speak naturally)
- "Hello, how are you today?"
- "Thank you for your help with this project."

## 🏗️ Architecture

```
ListenOS/
├── src/                        # Next.js frontend
│   ├── app/
│   │   ├── (dashboard)/       # Main dashboard UI
│   │   └── (overlay)/         # Transparent voice overlay
│   ├── components/            # React components
│   └── lib/                   # Utilities & Tauri bindings
│
└── backend/                   # Rust backend
    └── src/
        ├── audio/             # Audio capture (cpal)
        ├── cloud/             # Groq & Deepgram APIs
        ├── commands/          # Tauri command handlers
        ├── streaming/         # Audio streaming
        └── system/            # OS integrations
```

### Technology Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS, Radix UI
- **Backend**: Rust, Tauri 2.0
- **AI Services**: 
  - **Speech-to-Text**: Groq Whisper (whisper-large-v3-turbo)
  - **Intent Processing**: Groq LLaMA 3.3 70B
- **Audio**: cpal for native audio capture

## ⚙️ Configuration

### Hotkey

The default trigger is **Ctrl+Space**. You can change this in the Settings modal (click the gear icon in the dashboard).

### API Keys

ListenOS comes with bundled API keys for immediate use. For heavy usage or production deployment, you can use your own keys:

1. Create/edit `.env.local` in the project root
2. Add your keys:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   DEEPGRAM_API_KEY=your_deepgram_api_key_here
   ```

Get your keys:
- **Groq**: [console.groq.com](https://console.groq.com)
- **Deepgram**: [console.deepgram.com](https://console.deepgram.com)

### Fully Local Routing (Desktop)

You can run voice processing without the ListenOS cloud API:

1. Open **Settings -> System**
2. Turn **Use ListenOS cloud routing** off
3. Paste your Groq key in **Groq API key** and save

When cloud routing is off, transcription + intent processing run through direct Groq API calls from your desktop app.

## 🔧 Development

### Project Structure

```
ListenOS/
├── package.json          # Node.js dependencies
├── next.config.ts        # Next.js configuration
├── src/                  # Frontend source
└── backend/
    ├── Cargo.toml        # Rust dependencies
    ├── tauri.conf.json   # Tauri configuration
    └── src/              # Rust source
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js development server |
| `npm run tauri:dev` | Start Tauri in development mode |
| `npm run tauri:build` | Build production installer |
| `npm run tauri:build:mac:dmg` | Build macOS DMG package |
| `npm run tauri:build:windows:nsis` | Build Windows NSIS installer |
| `npm run tauri:build:linux:appimage` | Build Linux AppImage package |
| `npm run lint` | Run ESLint |

### Auto-Update Release Pipeline

ListenOS supports in-app updates via Tauri updater (no manual reinstall for users once installed).

1. Add GitHub repository secrets:
   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
   - `CLOUDFLARE_R2_ACCESS_KEY_ID`
   - `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
   - `CLOUDFLARE_R2_ENDPOINT` (for example `https://<account-id>.r2.cloudflarestorage.com`)
   - `CLOUDFLARE_R2_BUCKET`
   - `CLOUDFLARE_R2_PUBLIC_BASE_URL` (for example `https://updates.listenos.com` or your `*.r2.dev` URL)
   Generate once with:
   `npx tauri signer generate -w ~/.tauri/listenos.key`
   The release workflow sets Tauri's updater endpoint to `<CLOUDFLARE_R2_PUBLIC_BASE_URL>/latest.json` at build time.
2. Configure your R2 bucket for public reads (or attach a public custom domain).
3. Run GitHub Action **Cut Release** with a version (for example `0.1.21`).
4. The workflow bumps versions, creates tag `v<version>`, and pushes it.
5. Tag push triggers **Release** workflow, which:
   - builds signed installers
   - builds for Windows (NSIS), macOS (DMG), and Linux (AppImage)
   - creates updater `latest.json`
   - uploads all updater files to Cloudflare R2 under `releases/v<version>/`
   - updates the live updater URL at `<CLOUDFLARE_R2_PUBLIC_BASE_URL>/latest.json`
6. Installed apps auto-check and install updates on startup.

Local helpers:
- `npm run release:prepare -- 0.1.21` updates version files locally.
- `npm run version:sync` syncs `backend/tauri.conf.json` and `backend/Cargo.toml` to `package.json` version.

### Debugging

Logs are available in the terminal running `tauri:dev`. For more verbose logging:

```bash
RUST_LOG=debug npm run tauri:dev
```

## 📋 System Requirements

| Component | Windows | macOS |
|-----------|---------|-------|
| OS | Windows 10/11 (64-bit) | macOS 10.15+ (Catalina) |
| RAM | 4GB minimum, 8GB recommended | 4GB minimum, 8GB recommended |
| Storage | 200MB for installation | 200MB for installation |
| Microphone | Any input device | Any input device |
| Internet | Required for AI processing | Required for AI processing |
| Permissions | - | Microphone, Accessibility |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) - For the amazing desktop framework
- [Groq](https://groq.com/) - For ultra-fast AI inference
- [Deepgram](https://deepgram.com/) - For real-time speech recognition

---

## 📜 License

**PROPRIETARY SOFTWARE - ALL RIGHTS RESERVED**

Copyright (c) 2025 **EvidentSphere**. All Rights Reserved.

This software is proprietary and confidential. Unauthorized copying, modification, 
distribution, or use of this software, via any medium, is strictly prohibited.

See [LICENSE](LICENSE) for full terms and conditions.

---

<p align="center">
  <strong>Developed by EvidentSphere</strong><br>
  © 2025 EvidentSphere. All Rights Reserved.
</p>
