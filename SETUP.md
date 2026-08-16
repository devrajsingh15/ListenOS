# ListenOS Setup

ListenOS packages Electron, a React renderer built with Rspack, and a Rust native backend into one desktop app. No separate server or cloud login is required.

## Install

Install Node.js 20+, Rust stable, and the platform compiler toolchain, then run:

```bash
npm install
```

Windows requires Visual Studio Build Tools with C++. macOS requires Xcode Command Line Tools. Linux requires ALSA development headers.

## Configure

Set the Groq key in `Settings -> System`, or copy `.env.example` to `.env.local`:

```env
GROQ_API_KEY=your_groq_api_key
LISTENOS_REQUIRE_CONFIRMATION=false
```

## Develop

```bash
npm run desktop:dev
```

This starts Rspack, Electron, and the Rust backend. Rust changes are rebuilt when the desktop app restarts.

## Package

```bash
npm run desktop:build:windows
npm run desktop:build:mac
npm run desktop:build:linux
```

Outputs are placed in `dist/electron/`.

## Default Shortcuts

- Hold-to-talk: `Ctrl+Space`
- Assistant mode: `Ctrl+Alt+Space`

Both are configurable in `Settings -> General`.
