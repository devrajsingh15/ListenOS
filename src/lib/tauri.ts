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
  response_text: string | null;
}

export interface VoiceProcessingResult {
  transcription: TranscriptionResult;
  action: ActionResult;
  executed: boolean;
  response_text: string | null;
  session_id: string;
}

export interface ConversationMessage {
  id: string;
  role: "User" | "Assistant" | "System";
  content: string;
  timestamp: string;
  action_taken: string | null;
  action_success: boolean | null;
}

export interface ClipboardEntry {
  id: string;
  content: string;
  content_type: string;
  timestamp: string;
  source_app: string | null;
  word_count: number;
  char_count: number;
}

export interface IntegrationInfo {
  name: string;
  description: string;
  available: boolean;
  enabled: boolean;
  actions: IntegrationAction[];
}

export interface IntegrationAction {
  id: string;
  name: string;
  description: string;
  parameters: ActionParameter[];
  example_phrases: string[];
}

export interface ActionParameter {
  name: string;
  param_type: string;
  required: boolean;
  description: string;
}

export interface CustomCommand {
  id: string;
  name: string;
  trigger_phrase: string;
  description: string;
  actions: ActionStep[];
  enabled: boolean;
  created_at: string;
  last_used: string | null;
  use_count: number;
}

export interface ActionStep {
  id: string;
  action_type: string;
  payload: Record<string, unknown>;
  delay_ms: number;
  description: string | null;
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

// ============ Conversation Commands ============

export async function getConversation(): Promise<ConversationMessage[]> {
  return invoke("get_conversation");
}

export async function clearConversation(): Promise<void> {
  return invoke("clear_conversation");
}

export async function newConversationSession(): Promise<string> {
  return invoke("new_conversation_session");
}

// ============ Clipboard Commands ============

export async function getClipboard(): Promise<string> {
  return invoke("get_clipboard");
}

export async function setClipboard(content: string): Promise<void> {
  return invoke("set_clipboard", { content });
}

export async function getClipboardHistory(limit?: number): Promise<ClipboardEntry[]> {
  return invoke("get_clipboard_history", { limit });
}

// ============ Integration Commands ============

export async function getIntegrations(): Promise<IntegrationInfo[]> {
  return invoke("get_integrations");
}

export async function setIntegrationEnabled(name: string, enabled: boolean): Promise<boolean> {
  return invoke("set_integration_enabled", { name, enabled });
}

// ============ Custom Commands ============

export async function getCustomCommands(): Promise<CustomCommand[]> {
  return invoke("get_custom_commands");
}

export async function getCommandTemplates(): Promise<CustomCommand[]> {
  return invoke("get_command_templates");
}

export async function saveCustomCommand(command: CustomCommand): Promise<void> {
  return invoke("save_custom_command", { command });
}

export async function deleteCustomCommand(id: string): Promise<void> {
  return invoke("delete_custom_command", { id });
}

export async function setCustomCommandEnabled(id: string, enabled: boolean): Promise<void> {
  return invoke("set_custom_command_enabled", { id, enabled });
}

export async function exportCustomCommands(): Promise<string> {
  return invoke("export_custom_commands");
}

export async function importCustomCommands(json: string): Promise<number> {
  return invoke("import_custom_commands", { json });
}

// ============ Utility ============

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
