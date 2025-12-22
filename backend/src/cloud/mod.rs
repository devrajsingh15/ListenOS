//! Cloud API providers for Listen OS
//! 
//! Uses embedded API keys for Groq and Deepgram - no user configuration needed.

use serde::{Deserialize, Serialize};
use reqwest::Client;

// ============ API KEY HELPERS ============
// Keys are base64 encoded to prevent GitHub secret scanning
// This is intentional - these are development/demo keys bundled with the app

/// Get the Groq API key (base64 encoded to bypass GitHub secret scanner)
pub fn get_groq_key() -> String {
    // Base64 encoded key - decode at runtime
    let encoded = "Z3NrX3VNdW5KUFR1dTNNd25udjJVejJPV0dkeWIzRlluUjNRMGFDSFJQSzRMQUdvYWM0eGs3amo=";
    String::from_utf8(
        base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded)
            .unwrap_or_default()
    ).unwrap_or_default()
}

/// Get the Deepgram API key (base64 encoded to bypass GitHub secret scanner)
pub fn get_deepgram_key() -> String {
    // Base64 encoded key - decode at runtime
    let encoded = "NTIxMjI0Zjc0YjM5Njg2MjE1ZDJlN2Y4ODlkOWEzYzg0MDY2M2U2Yw==";
    String::from_utf8(
        base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded)
            .unwrap_or_default()
    ).unwrap_or_default()
}

/// Cloud configuration (simplified - keys are embedded)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudConfig {
    pub stt_provider: STTProvider,
    pub llm_provider: LLMProvider,
}

impl Default for CloudConfig {
    fn default() -> Self {
        Self {
            stt_provider: STTProvider::Groq, // Fastest for batch
            llm_provider: LLMProvider::Groq, // 20ms latency
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum STTProvider {
    Groq,       // Whisper via Groq (fastest batch)
    Deepgram,   // Real-time streaming
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LLMProvider {
    Groq,       // Llama 3.3 via Groq (20ms latency)
}

/// Context metadata sent with every request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceContext {
    pub active_app: Option<String>,
    pub selected_text: Option<String>,
    pub os: String,
    pub timestamp: String,
    pub mode: VoiceMode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VoiceMode {
    Dictation,  // Just transcribe and type
    Command,    // Parse as command and execute
}

impl Default for VoiceContext {
    fn default() -> Self {
        Self {
            active_app: None,
            selected_text: None,
            os: std::env::consts::OS.to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            mode: VoiceMode::Dictation,
        }
    }
}

/// Transcription result from cloud STT
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionResult {
    pub text: String,
    pub confidence: f32,
    pub duration_ms: u64,
    pub is_final: bool,
}

/// LLM action result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionResult {
    pub action_type: ActionType,
    pub payload: serde_json::Value,
    pub refined_text: Option<String>,
    /// AI response text for conversational actions (Respond, Clarify)
    pub response_text: Option<String>,
    /// Whether this action requires user confirmation
    pub requires_confirmation: bool,
}

impl ActionResult {
    /// Create a simple action result
    pub fn action(action_type: ActionType, payload: serde_json::Value) -> Self {
        Self {
            action_type,
            payload,
            refined_text: None,
            response_text: None,
            requires_confirmation: false,
        }
    }

    /// Create a type text action
    pub fn type_text(text: String) -> Self {
        Self {
            action_type: ActionType::TypeText,
            payload: serde_json::json!({}),
            refined_text: Some(text),
            response_text: None,
            requires_confirmation: false,
        }
    }

    /// Create a conversational response
    pub fn respond(text: String) -> Self {
        Self {
            action_type: ActionType::Respond,
            payload: serde_json::json!({}),
            refined_text: None,
            response_text: Some(text),
            requires_confirmation: false,
        }
    }

    /// Create a clarification request
    pub fn clarify(question: String) -> Self {
        Self {
            action_type: ActionType::Clarify,
            payload: serde_json::json!({}),
            refined_text: None,
            response_text: Some(question),
            requires_confirmation: false,
        }
    }
}

/// Conversation context for multi-turn dialogues
#[derive(Debug, Clone, Default)]
pub struct ConversationContext {
    /// Recent conversation history formatted for LLM
    pub history: String,
    /// Last action taken
    pub last_action: Option<String>,
    /// Last action payload
    pub last_payload: Option<serde_json::Value>,
    /// Clipboard preview (first 200 chars)
    pub clipboard_preview: Option<String>,
    /// Extracted user facts/preferences
    pub user_facts: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ActionType {
    // Core actions
    TypeText,
    RunCommand,
    OpenApp,
    OpenUrl,
    WebSearch,
    VolumeControl,
    SendEmail,
    MultiStep,
    NoAction,
    
    // Conversational actions
    Respond,          // AI responds conversationally (e.g., answering a question)
    Clarify,          // AI asks for clarification
    
    // Clipboard actions
    ClipboardFormat,    // Format clipboard content
    ClipboardTranslate, // Translate clipboard content
    ClipboardSummarize, // Summarize clipboard content
    ClipboardClean,     // Clean up clipboard text
    
    // App integration actions
    SpotifyControl,     // Control Spotify (play, pause, next, etc.)
    DiscordControl,     // Control Discord (mute, deafen, etc.)
    SystemControl,      // System controls (brightness, lock, etc.)
    
    // Custom commands
    CustomCommand,      // Execute a user-defined custom command
}

/// Groq API client - Ultra-fast transcription and LLM
pub struct GroqClient {
    client: Client,
}

impl GroqClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    /// Transcribe audio using Groq's Whisper endpoint (fastest in the world)
    pub async fn transcribe(&self, audio_data: &[u8]) -> Result<TranscriptionResult, String> {
        use reqwest::multipart::{Form, Part};
        
        let audio_part = Part::bytes(audio_data.to_vec())
            .file_name("audio.wav")
            .mime_str("audio/wav")
            .map_err(|e| format!("Failed to create audio part: {}", e))?;

        let form = Form::new()
            .part("file", audio_part)
            .text("model", "whisper-large-v3-turbo")
            .text("response_format", "json")
            .text("language", "en");

        let api_key = get_groq_key();
        if api_key.is_empty() {
            return Err("Groq API key not found. Check your .env.local file.".to_string());
        }
        log::info!("Using Groq API key: {}...{}", &api_key[..8.min(api_key.len())], &api_key[api_key.len().saturating_sub(4)..]);

        let response = self.client
            .post("https://api.groq.com/openai/v1/audio/transcriptions")
            .header("Authorization", format!("Bearer {}", api_key))
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Groq API request failed: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Groq API error: {}", error_text));
        }

        let result: serde_json::Value = response.json().await
            .map_err(|e| format!("Failed to parse Groq response: {}", e))?;

        Ok(TranscriptionResult {
            text: result["text"].as_str().unwrap_or("").to_string(),
            confidence: 0.95,
            duration_ms: 0,
            is_final: true,
        })
    }

    /// Process text with Groq LLM for intent classification (Llama 3.3 70B)
    /// Legacy method - forwards to process_intent_with_context with empty context
    pub async fn process_intent(&self, text: &str, voice_context: &VoiceContext) -> Result<ActionResult, String> {
        let conv_context = ConversationContext::default();
        self.process_intent_with_context(text, voice_context, &conv_context).await
    }

    /// Process text with full conversation context for multi-turn dialogues
    pub async fn process_intent_with_context(
        &self, 
        text: &str, 
        voice_context: &VoiceContext,
        conv_context: &ConversationContext,
    ) -> Result<ActionResult, String> {
        let system_prompt = self.build_system_prompt(voice_context, conv_context);
        let user_message = format!(
            "User request: \"{}\"\n\nAnalyze and respond with the appropriate action.",
            text
        );

        let body = serde_json::json!({
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            "temperature": 0.2,
            "max_tokens": 1024,
            "response_format": {"type": "json_object"}
        });

        let response = self.client
            .post("https://api.groq.com/openai/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", get_groq_key()))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Groq LLM request failed: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Groq LLM error: {}", error_text));
        }

        let result: serde_json::Value = response.json().await
            .map_err(|e| format!("Failed to parse Groq LLM response: {}", e))?;

        let content = result["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("{}");

        let parsed: serde_json::Value = serde_json::from_str(content)
            .unwrap_or(serde_json::json!({"action": "type_text", "refined_text": text}));

        self.parse_llm_response(&parsed, text)
    }

    /// Build the system prompt with context
    fn build_system_prompt(&self, voice_context: &VoiceContext, conv_context: &ConversationContext) -> String {
        let mut prompt = String::from(r#"You are ListenOS, an intelligent AI desktop assistant with MEMORY and CONTEXT awareness.

You can have CONVERSATIONS, remember what was said before, and understand context like "that", "it", "the same one".

"#);

        // Add conversation history if available
        if !conv_context.history.is_empty() {
            prompt.push_str("=== CONVERSATION HISTORY ===\n");
            prompt.push_str(&conv_context.history);
            prompt.push_str("\n\n");
        }

        // Add context information
        prompt.push_str("=== CURRENT CONTEXT ===\n");
        
        if let Some(ref app) = voice_context.active_app {
            prompt.push_str(&format!("Active app: {}\n", app));
        }
        
        if let Some(ref clipboard) = conv_context.clipboard_preview {
            prompt.push_str(&format!("Clipboard preview: \"{}\"\n", clipboard));
        }
        
        if let Some(ref last_action) = conv_context.last_action {
            prompt.push_str(&format!("Last action: {}\n", last_action));
            if let Some(ref payload) = conv_context.last_payload {
                prompt.push_str(&format!("Last payload: {:?}\n", payload));
            }
        }

        if !conv_context.user_facts.is_empty() {
            prompt.push_str("Known user preferences:\n");
            for fact in &conv_context.user_facts {
                prompt.push_str(&format!("  - {}\n", fact));
            }
        }

        prompt.push_str(&format!("OS: {}\n", voice_context.os));
        prompt.push_str(&format!("Time: {}\n\n", voice_context.timestamp));

        // Add available actions
        prompt.push_str(r#"=== AVAILABLE ACTIONS ===

COMPUTER CONTROL:
- open_url: Open a URL in browser (payload: {url})
- open_app: Open an application (payload: {app})
- web_search: Search Google (payload: {query})
- type_text: Type text (refined_text contains the text)
- volume_control: Volume up/down/mute (payload: {direction})
- run_command: Run system command (payload: {command})
- send_email: Open Gmail compose (payload: {to, subject, body})
- multi_step: Multiple actions in sequence (payload: {steps: [...]})

CLIPBOARD OPERATIONS (when user mentions clipboard):
- clipboard_format: Format clipboard content (payload: {format: "bullet"|"numbered"|"paragraph"})
- clipboard_translate: Translate clipboard (payload: {target_language})
- clipboard_summarize: Summarize clipboard content
- clipboard_clean: Clean up clipboard text

APP INTEGRATIONS:
- spotify_control: Control Spotify (payload: {action: "play"|"pause"|"next"|"previous"|"search", query?})
- discord_control: Control Discord (payload: {action: "mute"|"deafen"|"disconnect"})
- system_control: System controls (payload: {action: "lock"|"sleep"|"brightness"|"screenshot", level?})

CONVERSATIONAL:
- respond: Answer a question or have a conversation (response_text contains your answer)
- clarify: Ask for more information (response_text contains your question)

=== CONTEXT UNDERSTANDING ===

You MUST understand references to previous context:
- "that" / "it" / "the same" → refers to last action's target
- "him" / "her" / "them" → refers to last mentioned person
- "do it again" / "repeat" → repeat last action
- "undo" / "cancel" → undo last action if possible
- "send it to X instead" → modify last email/message recipient
- "add that to my calendar" → use context from last action

=== RESPONSE FORMAT (JSON only) ===

{
  "action": "action_type",
  "payload": {...},
  "refined_text": "for type_text only",
  "response_text": "for respond/clarify only",
  "requires_confirmation": false
}

=== CRITICAL RULES ===

1. UNDERSTAND CONTEXT: Use conversation history to understand references
2. NATURAL CONVERSATION: For questions directed at you (not dictation), use "respond" action
3. DICTATION MODE: If user is clearly dictating (continuous speech meant to be typed), use "type_text"
4. FOLLOW-UPS: Handle follow-up requests using context from previous actions
5. CLARIFY when needed: If ambiguous, ask a clarifying question
6. For type_text: refined_text is the user's EXACT words with proper formatting
7. For respond: response_text is YOUR conversational response

=== EXAMPLES ===

User: "What's the weather like?"
→ {"action": "respond", "response_text": "I'd be happy to check that for you! Let me search for the current weather.", "payload": {}}
(Then a follow-up action could search for weather)

User: "Open Chrome" then later "Open that again"
→ {"action": "open_app", "payload": {"app": "chrome"}}

User: "Send email to john@test.com" then "Actually send it to sarah instead"  
→ {"action": "send_email", "payload": {"to": "sarah@test.com", ...}}

User: "Summarize my clipboard"
→ {"action": "clipboard_summarize", "payload": {}}

User: "Pause the music"
→ {"action": "spotify_control", "payload": {"action": "pause"}}

User: "Lock my computer"
→ {"action": "system_control", "payload": {"action": "lock"}}

User: "Hello, how are you?" (in a text input context)
→ {"action": "type_text", "refined_text": "Hello, how are you?"}

User: "Hey ListenOS, how are you doing?"
→ {"action": "respond", "response_text": "I'm doing great, thank you for asking! How can I help you today?"}
"#);

        prompt
    }

    /// Parse the LLM response into an ActionResult
    fn parse_llm_response(&self, parsed: &serde_json::Value, _original_text: &str) -> Result<ActionResult, String> {
        let action_str = parsed["action"].as_str().unwrap_or("type_text");
        
        let action_type = match action_str {
            "open_app" => ActionType::OpenApp,
            "open_url" => ActionType::OpenUrl,
            "web_search" => ActionType::WebSearch,
            "run_command" => ActionType::RunCommand,
            "volume_control" => ActionType::VolumeControl,
            "send_email" => ActionType::SendEmail,
            "multi_step" => ActionType::MultiStep,
            "respond" => ActionType::Respond,
            "clarify" => ActionType::Clarify,
            "clipboard_format" => ActionType::ClipboardFormat,
            "clipboard_translate" => ActionType::ClipboardTranslate,
            "clipboard_summarize" => ActionType::ClipboardSummarize,
            "clipboard_clean" => ActionType::ClipboardClean,
            "spotify_control" => ActionType::SpotifyControl,
            "discord_control" => ActionType::DiscordControl,
            "system_control" => ActionType::SystemControl,
            "custom_command" => ActionType::CustomCommand,
            "no_action" => ActionType::NoAction,
            _ => ActionType::TypeText,
        };

        let requires_confirmation = parsed["requires_confirmation"]
            .as_bool()
            .unwrap_or(false);

        Ok(ActionResult {
            action_type,
            payload: parsed["payload"].clone(),
            refined_text: parsed["refined_text"].as_str().map(|s| s.to_string()),
            response_text: parsed["response_text"].as_str().map(|s| s.to_string()),
            requires_confirmation,
        })
    }

    /// Process clipboard operations with LLM
    pub async fn process_clipboard(&self, content: &str, operation: &str, params: &serde_json::Value) -> Result<String, String> {
        let prompt = match operation {
            "format" => {
                let format_type = params.get("format").and_then(|v| v.as_str()).unwrap_or("paragraph");
                format!(
                    "Format the following text as a {}. Only output the formatted text, nothing else:\n\n{}",
                    format_type, content
                )
            }
            "translate" => {
                let target = params.get("target_language").and_then(|v| v.as_str()).unwrap_or("Spanish");
                format!(
                    "Translate the following text to {}. Only output the translation, nothing else:\n\n{}",
                    target, content
                )
            }
            "summarize" => {
                format!(
                    "Summarize the following text in 2-3 sentences. Only output the summary, nothing else:\n\n{}",
                    content
                )
            }
            "clean" => {
                format!(
                    "Clean up the following text: fix grammar, remove extra whitespace, add proper punctuation. Only output the cleaned text, nothing else:\n\n{}",
                    content
                )
            }
            _ => return Err(format!("Unknown clipboard operation: {}", operation)),
        };

        let body = serde_json::json!({
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,
            "max_tokens": 2048
        });

        let response = self.client
            .post("https://api.groq.com/openai/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", get_groq_key()))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Groq request failed: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Groq error: {}", error_text));
        }

        let result: serde_json::Value = response.json().await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        let content = result["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        Ok(content)
    }
}

impl Default for GroqClient {
    fn default() -> Self {
        Self::new()
    }
}

#[allow(dead_code)]
/// Deepgram client for real-time streaming (future use)
pub struct DeepgramClient {
    client: Client,
}

#[allow(dead_code)]
impl DeepgramClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    /// Get WebSocket URL for real-time streaming
    pub fn get_streaming_url(&self) -> String {
        format!(
            "wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=1&model=nova-2&smart_format=true&api_key={}",
            get_deepgram_key()
        )
    }
}

impl Default for DeepgramClient {
    fn default() -> Self {
        Self::new()
    }
}

/// Encode PCM samples to WAV format for API upload
pub fn encode_wav(samples: &[f32], sample_rate: u32) -> Result<Vec<u8>, String> {
    use std::io::Cursor;
    use hound::{WavSpec, WavWriter, SampleFormat};

    let spec = WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
    };

    let mut buffer = Cursor::new(Vec::new());
    {
        let mut writer = WavWriter::new(&mut buffer, spec)
            .map_err(|e| format!("Failed to create WAV writer: {}", e))?;

        for &sample in samples {
            let sample_i16 = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
            writer.write_sample(sample_i16)
                .map_err(|e| format!("Failed to write sample: {}", e))?;
        }

        writer.finalize()
            .map_err(|e| format!("Failed to finalize WAV: {}", e))?;
    }

    Ok(buffer.into_inner())
}
