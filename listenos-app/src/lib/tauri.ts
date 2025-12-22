import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ============ Types ============

export interface TranscriptionResult {
  text: string;
  duration_ms: number;
  confidence: number;
  is_final: boolean;
}

export interface ActionResult {
  action_type: string;
  payload: Record<string, unknown>;
  refined_text: string | null;
}

export interface VoiceProcessingResult {
  transcription: TranscriptionResult;
  action: ActionResult;
  executed: boolean;
}

export interface StatusResponse {
  is_listening: boolean;
  is_processing: boolean;
  is_streaming: boolean;
  audio_device: string | null;
  last_transcription: string | null;
}

// ============ Voice Commands ============

// Start listening - begins native audio recording
export async function startListening(): Promise<boolean> {
  return invoke("start_listening");
}

// Stop listening - processes audio with Groq Whisper, executes action, returns result
export async function stopListening(): Promise<VoiceProcessingResult> {
  return invoke("stop_listening");
}

// Get current status
export async function getStatus(): Promise<StatusResponse> {
  return invoke("get_status");
}

// ============ Action Commands ============

export async function typeText(text: string): Promise<{ success: boolean; message: string }> {
  return invoke("type_text", { text });
}

export async function runSystemCommand(command: string): Promise<{ success: boolean; message: string; output?: string }> {
  return invoke("run_system_command", { command });
}

// ============ Audio Device Commands ============

export interface AudioDevice {
  name: string;
  is_default: boolean;
}

export async function getAudioDevices(): Promise<AudioDevice[]> {
  return invoke("get_audio_devices");
}

export async function setAudioDevice(deviceName: string): Promise<boolean> {
  return invoke("set_audio_device", { deviceName });
}

// ============ History Commands ============

export async function getHistory(): Promise<VoiceProcessingResult[]> {
  return invoke("get_history");
}

export async function clearHistory(): Promise<void> {
  return invoke("clear_history");
}

// ============ Window Commands ============

export async function hideAssistant(): Promise<void> {
  return invoke("hide_assistant");
}

export async function showDashboard(): Promise<void> {
  return invoke("show_dashboard");
}

// ============ Event Listeners ============

export function onShortcutPressed(callback: () => void): Promise<UnlistenFn> {
  return listen("shortcut-pressed", () => {
    callback();
  });
}

export function onShortcutReleased(callback: () => void): Promise<UnlistenFn> {
  return listen("shortcut-released", () => {
    callback();
  });
}

// ============ Utility ============

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
