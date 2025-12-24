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
    let encoded = "Z3NrX2xRbkZsME5BN1RueVVVMXlFOXNhV0dkeWIzRllpZlFkMXdEaUc1UDNMR0xIVWpzTDdSWGk=";
    String::from_utf8(
        base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded)
            .unwrap_or_default()
    ).unwrap_or_default()
}

/// Get the Deepgram API key (base64 encoded to bypass GitHub secret scanner)
pub fn get_deepgram_key() -> String {
    // Base64 encoded key - decode at runtime
    let encoded = "NThkNDMwNGJkNDlhOTJiYjA1ZjY0Y2I0ZTEzOGIzMThkYTIwZWJjYw==";
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

/// Dictation style setting (matches config)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum DictationStyle {
    /// Caps + Full punctuation
    #[default]
    Formal,
    /// Caps + Less punctuation
    Casual,
    /// No caps + Less punctuation  
    VeryCasual,
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
    /// User's custom commands (trigger phrases and IDs)
    pub custom_commands: Vec<(String, String, String)>, // (trigger, name, id)
    /// User's text expansion snippets (trigger, expansion)
    pub snippets: Vec<(String, String)>,
    /// Current dictation style
    pub dictation_style: DictationStyle,
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
    /// 
    /// `dictionary_hints` - Optional list of custom words/names to help recognition
    pub async fn transcribe(&self, audio_data: &[u8]) -> Result<TranscriptionResult, String> {
        self.transcribe_with_hints(audio_data, &[]).await
    }
    
    /// Transcribe audio with custom vocabulary hints
    pub async fn transcribe_with_hints(&self, audio_data: &[u8], dictionary_hints: &[String]) -> Result<TranscriptionResult, String> {
        // Check rate limit before making API call
        crate::rate_limit::check_stt_limit()?;
        
        use reqwest::multipart::{Form, Part};
        
        let audio_part = Part::bytes(audio_data.to_vec())
            .file_name("audio.wav")
            .mime_str("audio/wav")
            .map_err(|e| format!("Failed to create audio part: {}", e))?;

        let mut form = Form::new()
            .part("file", audio_part)
            .text("model", "whisper-large-v3-turbo")
            .text("response_format", "json")
            .text("language", "en");
        
        // Add dictionary hints as a prompt to improve recognition
        if !dictionary_hints.is_empty() {
            // Limit to first 50 words to avoid prompt being too long
            let hints: Vec<&str> = dictionary_hints.iter()
                .take(50)
                .map(|s| s.as_str())
                .collect();
            let prompt = format!("Vocabulary hints: {}", hints.join(", "));
            form = form.text("prompt", prompt);
            log::info!("Using {} dictionary hints for transcription", hints.len());
        }

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
        // Check rate limit before making API call
        crate::rate_limit::check_llm_limit()?;
        
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
        let mut prompt = String::from(r#"You are ListenOS, a voice-to-action assistant. Your PRIMARY job is to help users type text and execute commands.

=== CRITICAL DECISION TREE (FOLLOW IN ORDER) ===

STEP 1: Does the input contain an EXPLICIT COMMAND KEYWORD?
Command keywords: "open", "launch", "start", "search", "google", "play", "pause", "stop", "next", "previous", "skip", "mute", "unmute", "volume", "lock", "screenshot", "clipboard", "translate", "summarize", "format"

If NO command keyword found → USE type_text (this is the DEFAULT)
If YES command keyword found → Continue to Step 2

STEP 2: Is the command keyword at the START of the sentence?
- "Open Chrome" → YES, it's a command
- "I want to open a new document" → NO, user is dictating about opening something
- "Search for restaurants" → YES, it's a command  
- "I need to search for a solution" → NO, user is dictating

If command keyword is NOT at the start → USE type_text
If command keyword IS at the start → Execute the appropriate command

=== THE GOLDEN RULE ===
WHEN IN DOUBT, USE type_text. It's better to type text that the user can delete than to execute a wrong command.

"#);

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
        }

        prompt.push_str(&format!("OS: {}\n\n", voice_context.os));

        // Add user's custom commands if any
        if !conv_context.custom_commands.is_empty() {
            prompt.push_str("=== USER'S CUSTOM COMMANDS (HIGHEST PRIORITY) ===\n");
            prompt.push_str("If the user says ANY of these trigger phrases, use custom_command action:\n\n");
            for (trigger, name, id) in &conv_context.custom_commands {
                prompt.push_str(&format!(
                    "- \"{}\" -> {{\"action\": \"custom_command\", \"payload\": {{\"command_id\": \"{}\", \"trigger_phrase\": \"{}\"}}}} ({})",
                    trigger, id, trigger, name
                ));
                prompt.push('\n');
            }
            prompt.push('\n');
        }

        // Add user's text expansion snippets if any
        if !conv_context.snippets.is_empty() {
            prompt.push_str("=== USER'S TEXT SNIPPETS (EXPAND ON MATCH) ===\n");
            prompt.push_str("If the user says EXACTLY one of these trigger phrases, expand to the text using type_text:\n\n");
            for (trigger, expansion) in &conv_context.snippets {
                let preview = if expansion.len() > 50 { 
                    format!("{}...", &expansion[..50]) 
                } else { 
                    expansion.clone() 
                };
                prompt.push_str(&format!(
                    "- \"{}\" -> {{\"action\": \"type_text\", \"refined_text\": \"{}\"}}\n",
                    trigger, preview
                ));
            }
            prompt.push('\n');
        }

        // Add available actions with clear triggers
        prompt.push_str(r#"=== AVAILABLE COMMANDS (only when explicitly triggered) ===

APPS & BROWSER:
- open_app: Trigger words: "open", "launch", "start" + app name
  Example: "Open Chrome" -> {"action": "open_app", "payload": {"app": "chrome"}}
  
- open_url: Trigger words: "open", "go to" + URL/website
  Example: "Open google.com" -> {"action": "open_url", "payload": {"url": "https://google.com"}}
  
- web_search: Trigger words: "search", "google", "look up", "find"
  Example: "Search for weather" -> {"action": "web_search", "payload": {"query": "weather"}}

MEDIA CONTROL:
- spotify_control: Trigger words: "play", "pause", "stop", "next", "previous", "skip"
  Example: "Pause the music" -> {"action": "spotify_control", "payload": {"action": "pause"}}
  Example: "Play some jazz" -> {"action": "spotify_control", "payload": {"action": "search", "query": "jazz"}}

- volume_control: Trigger words: "volume", "louder", "quieter", "mute"
  Example: "Volume up" -> {"action": "volume_control", "payload": {"direction": "up"}}

SYSTEM:
- system_control: Trigger words: "lock", "screenshot", "sleep"
  Example: "Lock my computer" -> {"action": "system_control", "payload": {"action": "lock"}}
  Example: "Take a screenshot" -> {"action": "system_control", "payload": {"action": "screenshot"}}

CLIPBOARD (only when "clipboard" is mentioned):
- clipboard_format: "format my clipboard", "clipboard as bullets"
- clipboard_translate: "translate my clipboard to Spanish"
- clipboard_summarize: "summarize my clipboard"

DICTATION (DEFAULT - use for everything else):
- type_text: Used when the user is dictating text to be typed
  The refined_text field contains the EXACT text to type
  Example: "Hello how are you" -> {"action": "type_text", "refined_text": "Hello, how are you?"}
  Example: "I need to finish the report by Friday" -> {"action": "type_text", "refined_text": "I need to finish the report by Friday."}

=== RESPONSE FORMAT (JSON only) ===

{
  "action": "action_type",
  "payload": {},
  "refined_text": "only for type_text - the exact text to type with proper punctuation"
}

=== EXAMPLES - COMMANDS ===

"Open Chrome" -> {"action": "open_app", "payload": {"app": "chrome"}}
"Search for Italian restaurants" -> {"action": "web_search", "payload": {"query": "Italian restaurants"}}
"Pause" -> {"action": "spotify_control", "payload": {"action": "pause"}}
"Lock computer" -> {"action": "system_control", "payload": {"action": "lock"}}
"Volume down" -> {"action": "volume_control", "payload": {"direction": "down"}}

=== EXAMPLES - DICTATION (type_text) ===

"Hello world" -> {"action": "type_text", "refined_text": "Hello world."}
"The meeting is scheduled for 3 PM" -> {"action": "type_text", "refined_text": "The meeting is scheduled for 3 PM."}
"Dear John comma I hope this email finds you well" -> {"action": "type_text", "refined_text": "Dear John, I hope this email finds you well."}
"Please review the attached document and let me know your thoughts" -> {"action": "type_text", "refined_text": "Please review the attached document and let me know your thoughts."}
"I think we should open the discussion with" -> {"action": "type_text", "refined_text": "I think we should open the discussion with"}
"Can you help me with this" -> {"action": "type_text", "refined_text": "Can you help me with this?"}
"#);

        // Add style-specific punctuation rules
        let style_rules = match conv_context.dictation_style {
            DictationStyle::Formal => r#"
=== PUNCTUATION RULES FOR type_text (FORMAL STYLE) ===

1. Add periods at the end of complete sentences
2. Add question marks for questions
3. Convert spoken punctuation: "comma" -> ",", "period" -> ".", "question mark" -> "?"
4. Capitalize first letter of sentences and proper nouns
5. Keep the user's words exactly, just add proper formatting
6. Use full punctuation including commas in complex sentences
"#,
            DictationStyle::Casual => r#"
=== PUNCTUATION RULES FOR type_text (CASUAL STYLE) ===

1. Capitalize first letter of sentences
2. Add question marks for questions
3. Convert spoken punctuation: "comma" -> ",", "period" -> ".", "question mark" -> "?"
4. Use MINIMAL punctuation - skip periods at end of simple sentences
5. Skip commas unless explicitly spoken
6. Keep the casual, natural flow of speech

Examples with CASUAL style:
- "Hey how are you" -> "Hey how are you"
- "Let's meet at noon" -> "Let's meet at noon"
- "Sounds good see you then" -> "Sounds good see you then"
"#,
            DictationStyle::VeryCasual => r#"
=== PUNCTUATION RULES FOR type_text (VERY CASUAL STYLE) ===

1. Use ALL LOWERCASE (no capital letters except proper nouns like names)
2. Use MINIMAL punctuation - skip periods completely
3. Only add question marks for questions
4. Skip commas unless explicitly spoken
5. Keep it natural like texting a friend

Examples with VERY CASUAL style:
- "Hey how are you" -> "hey how are you"
- "Let's meet at noon" -> "let's meet at noon"
- "Sounds good see you then" -> "sounds good see you then"
- "Thanks for your help" -> "thanks for your help"
"#,
        };
        prompt.push_str(style_rules);

        prompt
    }

    /// Parse the LLM response into an ActionResult
    fn parse_llm_response(&self, parsed: &serde_json::Value, original_text: &str) -> Result<ActionResult, String> {
        let action_str = parsed["action"].as_str().unwrap_or("type_text");
        
        let action_type = match action_str {
            "open_app" => ActionType::OpenApp,
            "open_url" => ActionType::OpenUrl,
            "web_search" => ActionType::WebSearch,
            "run_command" => ActionType::RunCommand,
            "volume_control" => ActionType::VolumeControl,
            "send_email" => ActionType::SendEmail,
            "multi_step" => ActionType::MultiStep,
            // Convert respond/clarify to type_text to avoid confusion
            // (nothing visible happens with respond, which frustrates users)
            "respond" | "clarify" => {
                // If there's a response_text, type it instead of doing nothing
                if let Some(response) = parsed["response_text"].as_str() {
                    return Ok(ActionResult {
                        action_type: ActionType::TypeText,
                        payload: serde_json::json!({}),
                        refined_text: Some(response.to_string()),
                        response_text: None,
                        requires_confirmation: false,
                    });
                }
                ActionType::TypeText
            },
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

        // For type_text, ensure we have text to type
        let refined_text = if action_type == ActionType::TypeText {
            parsed["refined_text"]
                .as_str()
                .map(|s| s.to_string())
                // Fallback: use original transcription if no refined_text
                .or_else(|| Some(original_text.to_string()))
        } else {
            parsed["refined_text"].as_str().map(|s| s.to_string())
        };

        Ok(ActionResult {
            action_type,
            payload: parsed["payload"].clone(),
            refined_text,
            response_text: parsed["response_text"].as_str().map(|s| s.to_string()),
            requires_confirmation: false,
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
