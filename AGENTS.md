# ListenOS Agent Guidance

- The renderer uses React 19 bundled with Rspack. Do not introduce Next.js APIs, conventions, or configuration.
- Electron owns the desktop windows, tray, updater, deep links, and preload bridge.
- The standalone Rust backend communicates with Electron over private JSON-RPC IPC.
- Preserve unrelated working-tree changes and validate migration work with `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `cargo test --manifest-path backend/Cargo.toml --locked`.
- For Windows release verification, run `npm run desktop:build:windows`.
