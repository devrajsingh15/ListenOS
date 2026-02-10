# macOS Smoke Test Checklist

Use this checklist on a real macOS machine after installing from the generated DMG.

## Install and Launch

1. Open the `.dmg` and drag `ListenOS.app` into `Applications`.
2. Launch `ListenOS.app` from `Applications`.
3. Verify both windows initialize:
   - Dashboard window
   - Assistant overlay chip

## Permissions

1. Grant **Microphone** permission.
2. Grant **Accessibility** permission (for keyboard/mouse automation).
3. Confirm the app works after permissions are granted without restart loops.

## Core Voice Flow

1. Press and hold the configured hotkey.
2. Speak a short dictation sentence.
3. Release the hotkey and confirm text is typed into the focused input.
4. Speak a command (example: "open x.com") and confirm execution.

## Voice Reply / TTS

1. Ask a question that routes to assistant response.
2. Confirm spoken reply is audible.
3. Confirm fallback voice works when ElevenLabs is unavailable.

## Files and System Actions

1. Run a safe file action (example: count Downloads items).
2. Run screenshot action and verify:
   - Screenshot file is created
   - Target folder opens as expected

## Overlay and UX

1. Confirm overlay remains centered and visible.
2. Confirm listening/processing states are visible in the chip.
3. Confirm voice waveform reacts while speaking.

## Stability

1. Keep app running for at least 10 minutes with repeated commands.
2. Verify no crashes and no stuck listening state.
3. Quit and relaunch; confirm settings persist.
