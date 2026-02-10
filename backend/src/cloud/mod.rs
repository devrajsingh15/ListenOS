//! Cloud API providers for Listen OS
//! 
//! Supports two modes:
//! 1. Remote mode (default): Uses backend API server for AI processing
//! 2. Local mode (fallback): Direct API calls with environment keys

use serde::{Deserialize, Serialize};
use reqwest::Client;

// ============ API MODE ============

/// API mode - remote (server) or local (direct)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ApiMode {
    /// Use backend API server (recommended)
    Remote,
    /// Direct API calls (fallback, requires local API keys)
    Local,
}

impl Default for ApiMode {
    fn default() -> Self {
        // Default to remote mode
        ApiMode::Remote
    }
}

// ============ API KEY HELPERS ============
// For local/fallback mode only - reads from environment

/// Get the Groq API key from environment
pub fn get_groq_key() -> String {
    std::env::var("GROQ_API_KEY").unwrap_or_default()
}

/// Get the Deepgram API key from environment
pub fn get_deepgram_key() -> String {
    std::env::var("DEEPGRAM_API_KEY").unwrap_or_default()
}

/// Extract a number from text (for brightness level, volume, etc.)
fn extract_number(text: &str) -> Option<u32> {
    text.split_whitespace()
        .find_map(|word| word.parse::<u32>().ok())
}

fn trim_spoken_punctuation(value: &str) -> String {
    value
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .trim_end_matches('.')
        .trim_end_matches(',')
        .trim_end_matches('!')
        .trim_end_matches('?')
        .trim()
        .to_string()
}

fn normalize_web_target(target: &str) -> Option<String> {
    let mut normalized = trim_spoken_punctuation(target)
        .replace(" dot ", ".")
        .replace(" slash ", "/")
        .replace(" colon ", ":")
        .replace("  ", " ");
    normalized = normalized.trim().to_string();

    if normalized.is_empty() || normalized.contains(' ') {
        return None;
    }

    let lower = normalized.to_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return Some(normalized);
    }

    if lower.starts_with("www.") {
        return Some(format!("https://{}", normalized));
    }

    // Domain-like: x.com, docs.google.com/path, etc.
    let host = lower.split('/').next().unwrap_or("");
    let host_without_port = host.split(':').next().unwrap_or(host);
    if host_without_port.contains('.') {
        let parts: Vec<&str> = host_without_port.split('.').collect();
        if parts.len() >= 2 {
            let tld = parts.last().copied().unwrap_or("");
            if tld.len() >= 2 && tld.chars().all(|c| c.is_ascii_alphabetic()) {
                return Some(format!("https://{}", normalized));
            }
        }
    }

    None
}

fn is_known_tld(token: &str) -> bool {
    matches!(
        token,
        "com"
            | "org"
            | "net"
            | "io"
            | "ai"
            | "dev"
            | "app"
            | "co"
            | "us"
            | "in"
            | "edu"
            | "gov"
    )
}

fn infer_web_target_from_phrase(target: &str) -> Option<String> {
    let cleaned = trim_spoken_punctuation(target)
        .replace(",", " ")
        .replace("  ", " ");
    let lower = cleaned.to_lowercase();

    if let Some(url) = normalize_web_target(&lower) {
        return Some(url);
    }

    let words: Vec<&str> = lower.split_whitespace().filter(|w| !w.is_empty()).collect();
    if words.is_empty() {
        return None;
    }

    // Support spoken domains like "x com", "open ai com", "docs example io"
    if words.len() >= 2 {
        let tld = words[words.len() - 1];
        if is_known_tld(tld) {
            let host = words[..words.len() - 1].join("");
            if !host.is_empty()
                && host
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-')
            {
                return Some(format!("https://{}.{}", host, tld));
            }
        }
    }

    None
}

fn normalize_spoken_command_text(text: &str) -> String {
    let mut t = text.trim().to_lowercase();

    loop {
        let mut changed = false;
        for prefix in [
            "please ",
            "can you please ",
            "could you please ",
            "would you please ",
            "can you ",
            "could you ",
            "would you ",
            "hey listenos ",
            "listenos ",
            "assistant ",
            "hey assistant ",
        ] {
            if let Some(rest) = t.strip_prefix(prefix) {
                t = rest.trim().to_string();
                changed = true;
                break;
            }
        }
        if !changed {
            break;
        }
    }

    t
}

/// Post-process dictation text to clean up common issues
fn post_process_dictation(text: &str) -> String {
    let mut result = text.to_string();
    
    // Remove multiple consecutive spaces
    while result.contains("  ") {
        result = result.replace("  ", " ");
    }
    
    // Trim leading/trailing whitespace
    result = result.trim().to_string();
    
    // Fix spacing around punctuation
    result = result.replace(" .", ".");
    result = result.replace(" ,", ",");
    result = result.replace(" ?", "?");
    result = result.replace(" !", "!");
    result = result.replace(" :", ":");
    result = result.replace(" ;", ";");
    
    // Fix common spoken punctuation that wasn't converted
    result = result.replace(" period", ".");
    result = result.replace(" comma", ",");
    result = result.replace(" question mark", "?");
    result = result.replace(" exclamation point", "!");
    result = result.replace(" exclamation mark", "!");
    result = result.replace(" colon", ":");
    result = result.replace(" semicolon", ";");
    result = result.replace(" new line", "\n");
    result = result.replace(" new paragraph", "\n\n");
    
    // Remove common filler words (optional - comment out if users want them)
    // These are often unintentional in voice dictation
    let filler_patterns = [
        (" um ", " "),
        (" uh ", " "),
        (" like ", " "), // Note: might remove valid uses, be careful
        (" you know ", " "),
    ];
    
    // Only remove fillers if they appear at the start of sentences
    // to avoid removing valid uses in the middle
    let filler_starters = ["Um ", "Uh ", "Like ", "So ", "Well "];
    for filler in filler_starters {
        if result.starts_with(filler) {
            result = result[filler.len()..].to_string();
            // Re-capitalize the first letter
            if let Some(first_char) = result.chars().next() {
                result = first_char.to_uppercase().to_string() + &result[first_char.len_utf8()..];
            }
        }
    }
    
    // Ensure first letter is capitalized (if it starts with a letter)
    if let Some(first_char) = result.chars().next() {
        if first_char.is_alphabetic() && first_char.is_lowercase() {
            result = first_char.to_uppercase().to_string() + &result[first_char.len_utf8()..];
        }
    }
    
    result
}

/// Cloud configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudConfig {
    pub stt_provider: STTProvider,
    pub llm_provider: LLMProvider,
    pub api_mode: ApiMode,
    pub api_server_url: String,
}

impl Default for CloudConfig {
    fn default() -> Self {
        Self {
            stt_provider: STTProvider::Groq,
            llm_provider: LLMProvider::Groq,
            api_mode: ApiMode::Remote,
            api_server_url: std::env::var("LISTENOS_API_URL")
                .unwrap_or_else(|_| "http://localhost:3001".to_string()),
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
    
    // Keyboard shortcuts (copy, paste, undo, etc.)
    KeyboardShortcut,   // Execute a keyboard shortcut
    
    // Window management
    WindowControl,      // Control windows (minimize, maximize, close, etc.)
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
        // Rate limiting disabled for testing
        // crate::rate_limit::check_stt_limit()?;
        
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
        // Rate limiting disabled for testing
        // crate::rate_limit::check_llm_limit()?;
        
        // 1. Check for local command execution FIRST (bypass LLM for speed/reliability)
        if let Some(action) = self.detect_local_command(text) {
            log::info!("Local command detected: {:?}", action.action_type);
            return Ok(action);
        }
        
        // 2. Fallback to LLM for complex queries
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

    /// Detect if the text is a simple command that can be handled locally
    /// 
    /// IMPORTANT: This should only catch UNAMBIGUOUS commands.
    /// When in doubt, let the LLM decide (it can distinguish dictation from commands).
    /// Only detect commands that are:
    /// 1. Short (1-4 words typically)
    /// 2. Start with a clear command verb
    /// 3. Have no ambiguity with normal dictation
    fn detect_local_command(&self, text: &str) -> Option<ActionResult> {
        // Pre-process: clean up transcription artifacts
        let t = normalize_spoken_command_text(text);
        // Remove trailing punctuation
        let t = t.trim_end_matches('.').trim_end_matches(',').trim_end_matches('!').trim_end_matches('?');
        // Remove leading punctuation that Whisper sometimes adds
        let t = t.trim_start_matches(',').trim_start_matches('.').trim();
        // Normalize multiple spaces and remove commas between words (Whisper artifact)
        let t = t.replace(", ", " ").replace("  ", " ");
        
        // Count words - if extremely long, likely dictation/paragraph
        let word_count = t.split_whitespace().count();
        if word_count > 24 {
            return None; // Too long to be a simple command
        }
        
        // System controls
        if t.contains("shutdown") || t.contains("shut down") {
            return Some(ActionResult::action(ActionType::SystemControl, serde_json::json!({"action": "shutdown"})));
        }
        if t.contains("restart") || t.contains("reboot") {
            return Some(ActionResult::action(ActionType::SystemControl, serde_json::json!({"action": "restart"})));
        }
        if t.contains("lock") && (t.contains("computer") || t.contains("screen") || t.contains("pc") || t.contains("my") || t == "lock") {
            return Some(ActionResult::action(ActionType::SystemControl, serde_json::json!({"action": "lock"})));
        }
        if t.contains("sleep") && (t.contains("computer") || t.contains("pc") || t.contains("my") || t == "sleep") {
            return Some(ActionResult::action(ActionType::SystemControl, serde_json::json!({"action": "sleep"})));
        }
        let mentions_downloads = t.contains("download") || t.contains("downloads folder");
        let wants_download_count = mentions_downloads
            && (
                t.contains("how many")
                    || t.contains("how much")
                    || t.contains("count")
                    || t.contains("number of")
                    || t.contains("how many files")
            );
        let wants_organize_downloads = mentions_downloads
            && (t.contains("organize") || t.contains("sort") || t.contains("clean up"));
        let wants_screenshot = t.contains("screenshot") || t.contains("screen shot") || t.contains("capture screen");
        let wants_open = t.contains("open") || t.contains("show");
        let wants_screenshot_folder = t.contains("screenshot folder")
            || t.contains("screenshots folder")
            || (t.contains("screenshot") && t.contains("folder"))
            || (t.contains("screen shot") && t.contains("folder"));

        if wants_screenshot && wants_open && t.contains("folder") {
            return Some(ActionResult::action(
                ActionType::MultiStep,
                serde_json::json!({
                    "steps": [
                        { "action": "system_control", "payload": { "action": "screenshot" } },
                        { "action": "system_control", "payload": { "action": "open_screenshots_folder" } }
                    ]
                }),
            ));
        }

        if wants_open && wants_screenshot_folder {
            return Some(ActionResult::action(
                ActionType::SystemControl,
                serde_json::json!({"action": "open_screenshots_folder"}),
            ));
        }

        if wants_download_count && wants_organize_downloads && wants_screenshot {
            return Some(ActionResult::action(
                ActionType::MultiStep,
                serde_json::json!({
                    "steps": [
                        { "action": "system_control", "payload": { "action": "downloads_count" } },
                        { "action": "system_control", "payload": { "action": "organize_downloads" } },
                        { "action": "system_control", "payload": { "action": "screenshot" } }
                    ]
                }),
            ));
        }
        if wants_download_count && wants_organize_downloads {
            return Some(ActionResult::action(
                ActionType::MultiStep,
                serde_json::json!({
                    "steps": [
                        { "action": "system_control", "payload": { "action": "downloads_count" } },
                        { "action": "system_control", "payload": { "action": "organize_downloads" } }
                    ]
                }),
            ));
        }
        if wants_organize_downloads && wants_screenshot {
            return Some(ActionResult::action(
                ActionType::MultiStep,
                serde_json::json!({
                    "steps": [
                        { "action": "system_control", "payload": { "action": "organize_downloads" } },
                        { "action": "system_control", "payload": { "action": "screenshot" } }
                    ]
                }),
            ));
        }
        if wants_download_count && wants_screenshot {
            return Some(ActionResult::action(
                ActionType::MultiStep,
                serde_json::json!({
                    "steps": [
                        { "action": "system_control", "payload": { "action": "downloads_count" } },
                        { "action": "system_control", "payload": { "action": "screenshot" } }
                    ]
                }),
            ));
        }
        if wants_download_count {
            return Some(ActionResult::action(
                ActionType::SystemControl,
                serde_json::json!({"action": "downloads_count"}),
            ));
        }
        if wants_organize_downloads {
            return Some(ActionResult::action(
                ActionType::SystemControl,
                serde_json::json!({"action": "organize_downloads"}),
            ));
        }
        if wants_screenshot {
            return Some(ActionResult::action(
                ActionType::SystemControl,
                serde_json::json!({"action": "screenshot"}),
            ));
        }
        // Bluetooth control - distinguish between toggle and settings
        if t.contains("bluetooth") {
            // Check if user wants to turn on/off/enable/disable
            if t.contains("turn on") || t.contains("enable") || t.contains("switch on") {
                return Some(ActionResult::action(ActionType::SystemControl, serde_json::json!({"action": "bluetooth_toggle", "enable": true})));
            } else if t.contains("turn off") || t.contains("disable") || t.contains("switch off") {
                return Some(ActionResult::action(ActionType::SystemControl, serde_json::json!({"action": "bluetooth_toggle", "enable": false})));
            } else if t.contains("toggle") {
                return Some(ActionResult::action(ActionType::SystemControl, serde_json::json!({"action": "bluetooth_toggle"})));
            }
            // Default: open settings
            return Some(ActionResult::action(ActionType::SystemControl, serde_json::json!({"action": "bluetooth"})));
        }
        // WiFi control - distinguish between toggle and settings
        if t.contains("wifi") || t.contains("wi-fi") {
            // Check if user wants to turn on/off/enable/disable
            if t.contains("turn on") || t.contains("enable") || t.contains("switch on") {
                return Some(ActionResult::action(ActionType::SystemControl, serde_json::json!({"action": "wifi_toggle", "enable": true})));
            } else if t.contains("turn off") || t.contains("disable") || t.contains("switch off") {
                return Some(ActionResult::action(ActionType::SystemControl, serde_json::json!({"action": "wifi_toggle", "enable": false})));
            } else if t.contains("toggle") {
                return Some(ActionResult::action(ActionType::SystemControl, serde_json::json!({"action": "wifi_toggle"})));
            }
            // Default: open settings
            return Some(ActionResult::action(ActionType::SystemControl, serde_json::json!({"action": "wifi"})));
        }
        if t.contains("brightness") {
            // Try to extract level
            let level = extract_number(&t).unwrap_or(50);
            if t.contains("up") || t.contains("increase") {
                return Some(ActionResult::action(ActionType::SystemControl, serde_json::json!({"action": "brightness", "level": "up"})));
            } else if t.contains("down") || t.contains("decrease") || t.contains("dim") {
                return Some(ActionResult::action(ActionType::SystemControl, serde_json::json!({"action": "brightness", "level": "down"})));
            }
            return Some(ActionResult::action(ActionType::SystemControl, serde_json::json!({"action": "brightness", "level": level})));
        }
        if t.contains("night light") || t.contains("night mode") || t.contains("blue light") {
            return Some(ActionResult::action(ActionType::SystemControl, serde_json::json!({"action": "night_light"})));
        }
        if t.contains("do not disturb") || t.contains("dnd") || t.contains("focus mode") {
            return Some(ActionResult::action(ActionType::SystemControl, serde_json::json!({"action": "dnd"})));
        }
        if t.contains("empty") && (t.contains("trash") || t.contains("recycle") || t.contains("bin")) {
            return Some(ActionResult::action(ActionType::SystemControl, serde_json::json!({"action": "recycle_bin"})));
        }
        
        // Volume control
        if t.contains("volume") || t.contains("louder") || t.contains("quieter") {
            let direction = if t.contains("up") || t.contains("louder") || t.contains("increase") {
                "up"
            } else if t.contains("down") || t.contains("quieter") || t.contains("decrease") || t.contains("lower") {
                "down"
            } else if t.contains("mute") {
                "mute"
            } else {
                "up" // default
            };
            return Some(ActionResult::action(ActionType::VolumeControl, serde_json::json!({"direction": direction})));
        }
        if t == "mute" || t == "unmute" {
            return Some(ActionResult::action(ActionType::VolumeControl, serde_json::json!({"direction": "mute"})));
        }
        
        // App/URL opening - check websites first, then apps
        // Match patterns: "open chrome", "open x.com", "go to x.com", "visit github.com"
        let open_patterns = ["open ", "open, ", "open. ", "launch ", "start ", "go to ", "visit "];
        let has_open_prefix = open_patterns.iter().any(|p| t.starts_with(p));
        
        // Also match if it's just "open X" without space issues
        let words: Vec<&str> = t.split_whitespace().collect();
        let is_open_command = words.len() >= 2 && 
            (words[0] == "open" || words[0] == "launch" || words[0] == "start" || words[0] == "visit" ||
             (words[0] == "go" && words.get(1) == Some(&"to")) ||
             words[0] == "open," || words[0] == "open.");
        
        if has_open_prefix || is_open_command {
            // Clean up target - remove command words and punctuation
            let raw_target = if is_open_command {
                if words[0] == "go" && words.get(1) == Some(&"to") {
                    words[2..].join(" ")
                } else {
                    words[1..].join(" ")
                }
            } else {
                t.replace("open, ", "")
                    .replace("open. ", "")
                    .replace("open ", "")
                    .replace("launch ", "")
                    .replace("start ", "")
                    .replace("go to ", "")
                    .replace("visit ", "")
            };

            let app_name = trim_spoken_punctuation(&raw_target);
            let app_words: Vec<&str> = app_name.split_whitespace().collect();
            let has_spoken_tld = app_words
                .last()
                .map(|w| is_known_tld(w))
                .unwrap_or(false);
            let prefers_web_target = t.starts_with("visit ")
                || t.starts_with("go to ")
                || app_name.contains('.')
                || app_name.starts_with("www.")
                || app_name.starts_with("http://")
                || app_name.starts_with("https://")
                || raw_target.contains(" dot ")
                || has_spoken_tld;
            
            if app_name.is_empty() {
                return None;
            }

            // Direct URL/domain opening (e.g., "open x.com", "visit github.com")
            if prefers_web_target {
                if let Some(url) = infer_web_target_from_phrase(&app_name) {
                    return Some(ActionResult::action(ActionType::OpenUrl, serde_json::json!({"url": url})));
                }
            }

            // Long natural-language phrases that start with "open ..." are often dictation.
            // Let LLM decide instead of forcing app launch.
            if app_name.split_whitespace().count() > 4 {
                return None;
            }
            
            log::info!("Detected app open command: '{}' -> app: '{}'", t, app_name);
            
            // OS-aware system app aliases
            // These map user-friendly names to the correct app name for the execute_action handler
            let system_aliases: &[(&str, &str)] = match std::env::consts::OS {
                "windows" => &[
                    ("file explorer", "explorer"),
                    ("files", "explorer"),
                    ("explorer", "explorer"),
                    ("my computer", "explorer"),
                    ("this pc", "explorer"),
                    ("finder", "explorer"), // macOS user on Windows
                    ("settings", "settings"),
                    ("control panel", "control panel"),
                    ("task manager", "task manager"),
                    ("terminal", "terminal"),
                    ("command prompt", "cmd"),
                    ("cmd", "cmd"),
                    ("powershell", "powershell"),
                    ("notepad", "notepad"),
                    ("calculator", "calculator"),
                    ("calendar", "calendar"),
                    ("camera", "camera"),
                    ("clock", "clock"),
                    ("photos", "photos"),
                    ("store", "store"),
                    ("microsoft store", "store"),
                ],
                "macos" => &[
                    ("finder", "finder"),
                    ("files", "finder"),
                    ("file explorer", "finder"),
                    ("explorer", "finder"),
                    ("settings", "system preferences"),
                    ("system preferences", "system preferences"),
                    ("terminal", "terminal"),
                    ("activity monitor", "activity monitor"),
                    ("task manager", "activity monitor"),
                ],
                "linux" => &[
                    ("files", "nautilus"),
                    ("file explorer", "nautilus"),
                    ("file manager", "nautilus"),
                    ("settings", "gnome-control-center"),
                    ("terminal", "gnome-terminal"),
                ],
                _ => &[],
            };
            
            // Check system aliases first
            for (alias, app) in system_aliases {
                if app_name == *alias || app_name.contains(alias) {
                    return Some(ActionResult::action(ActionType::OpenApp, serde_json::json!({"app": *app})));
                }
            }
            
            // Check if it's a website that should open in browser
            // Use EXACT match to avoid "netflix" matching "x"
            let web_apps = [
                ("youtube", "https://youtube.com"),
                ("gmail", "https://gmail.com"),
                ("twitter", "https://twitter.com"),
                ("x", "https://x.com"),  // Must be exact match
                ("facebook", "https://facebook.com"),
                ("instagram", "https://instagram.com"),
                ("linkedin", "https://linkedin.com"),
                ("reddit", "https://reddit.com"),
                ("github", "https://github.com"),
                ("netflix", "https://netflix.com"),
                ("amazon", "https://amazon.com"),
            ];
            
            for (name, url) in web_apps {
                // Use exact match for short names like "x", contains for others
                let matches = if name.len() <= 2 {
                    app_name == *name
                } else {
                    app_name == *name || app_name.contains(name)
                };
                if matches {
                    return Some(ActionResult::action(ActionType::OpenUrl, serde_json::json!({"url": url})));
                }
            }
            
            // Otherwise treat as app (execute_action has more mappings)
            return Some(ActionResult::action(ActionType::OpenApp, serde_json::json!({"app": app_name})));
        }
        
        // Web search
        if t.starts_with("search ") || t.starts_with("google ") || t.starts_with("search for ") || t.starts_with("look up ") {
            let query = t
                .replace("search for ", "")
                .replace("search ", "")
                .replace("google ", "")
                .replace("look up ", "")
                .trim()
                .to_string();
            if !query.is_empty() {
                return Some(ActionResult::action(ActionType::WebSearch, serde_json::json!({"query": query})));
            }
        }
        
        // Media control (Spotify/general)
        // Simple controls: play, pause, next, previous
        if t == "play" || t == "pause" || t == "stop music" || t == "resume" || t == "resume music" || t == "play music" || t == "pause music" {
            return Some(ActionResult::action(ActionType::SpotifyControl, serde_json::json!({"action": "play_pause"})));
        }
        if t == "next" || t == "skip" || t == "next song" || t == "next track" {
            return Some(ActionResult::action(ActionType::SpotifyControl, serde_json::json!({"action": "next"})));
        }
        if t == "previous" || t == "previous song" || t == "last song" {
            return Some(ActionResult::action(ActionType::SpotifyControl, serde_json::json!({"action": "previous"})));
        }
        
        // Play specific song/artist - "play [song name]" or "play [artist]"
        // Opens Spotify, searches, and plays the first result
        if t.starts_with("play ") && word_count >= 2 && word_count <= 6 {
            let song_query = t.replace("play ", "").trim().to_string();
            if !song_query.is_empty() && song_query != "music" {
                return Some(ActionResult::action(ActionType::SpotifyControl, serde_json::json!({
                    "action": "play_song",
                    "query": song_query
                })));
            }
        }
        
        // Keyboard shortcuts (clipboard, editing)
        if t == "copy" || t == "copy that" || t == "copy this" {
            return Some(ActionResult::action(ActionType::KeyboardShortcut, serde_json::json!({"shortcut": "copy"})));
        }
        if t == "paste" || t == "paste that" || t == "paste it" {
            return Some(ActionResult::action(ActionType::KeyboardShortcut, serde_json::json!({"shortcut": "paste"})));
        }
        if t == "cut" || t == "cut that" || t == "cut this" {
            return Some(ActionResult::action(ActionType::KeyboardShortcut, serde_json::json!({"shortcut": "cut"})));
        }
        if t == "select all" || t == "select everything" {
            return Some(ActionResult::action(ActionType::KeyboardShortcut, serde_json::json!({"shortcut": "select_all"})));
        }
        if t == "undo" || t == "undo that" {
            return Some(ActionResult::action(ActionType::KeyboardShortcut, serde_json::json!({"shortcut": "undo"})));
        }
        if t == "redo" || t == "redo that" {
            return Some(ActionResult::action(ActionType::KeyboardShortcut, serde_json::json!({"shortcut": "redo"})));
        }
        if t == "save" || t == "save file" || t == "save this" || t == "save it" {
            return Some(ActionResult::action(ActionType::KeyboardShortcut, serde_json::json!({"shortcut": "save"})));
        }
        if t == "find" || t == "search here" || t == "find in page" {
            return Some(ActionResult::action(ActionType::KeyboardShortcut, serde_json::json!({"shortcut": "find"})));
        }
        if t == "new tab" || t == "open new tab" {
            return Some(ActionResult::action(ActionType::KeyboardShortcut, serde_json::json!({"shortcut": "new_tab"})));
        }
        if t == "close tab" || t == "close this tab" {
            return Some(ActionResult::action(ActionType::KeyboardShortcut, serde_json::json!({"shortcut": "close_tab"})));
        }
        if t == "new window" || t == "open new window" {
            return Some(ActionResult::action(ActionType::KeyboardShortcut, serde_json::json!({"shortcut": "new_window"})));
        }
        if t == "refresh" || t == "reload" || t == "reload page" {
            return Some(ActionResult::action(ActionType::KeyboardShortcut, serde_json::json!({"shortcut": "refresh"})));
        }
        if t == "go back" || t == "back" {
            return Some(ActionResult::action(ActionType::KeyboardShortcut, serde_json::json!({"shortcut": "back"})));
        }
        if t == "go forward" || t == "forward" {
            return Some(ActionResult::action(ActionType::KeyboardShortcut, serde_json::json!({"shortcut": "forward"})));
        }
        
        // Window management
        if t == "minimize" || t == "minimize window" || t == "minimize this" {
            return Some(ActionResult::action(ActionType::WindowControl, serde_json::json!({"action": "minimize"})));
        }
        if t == "maximize" || t == "maximize window" || t == "maximize this" || t == "full screen" || t == "fullscreen" {
            return Some(ActionResult::action(ActionType::WindowControl, serde_json::json!({"action": "maximize"})));
        }
        if t == "close window" || t == "close this window" || t == "close this" {
            return Some(ActionResult::action(ActionType::WindowControl, serde_json::json!({"action": "close"})));
        }
        if t == "switch window" || t == "switch app" || t == "next window" || t == "alt tab" {
            return Some(ActionResult::action(ActionType::WindowControl, serde_json::json!({"action": "switch"})));
        }
        if t == "snap left" || t == "move left" || t == "window left" {
            return Some(ActionResult::action(ActionType::WindowControl, serde_json::json!({"action": "snap_left"})));
        }
        if t == "snap right" || t == "move right" || t == "window right" {
            return Some(ActionResult::action(ActionType::WindowControl, serde_json::json!({"action": "snap_right"})));
        }
        if t == "show desktop" || t == "desktop" || t == "minimize all" {
            return Some(ActionResult::action(ActionType::WindowControl, serde_json::json!({"action": "show_desktop"})));
        }
        if t == "next desktop"
            || t == "switch to next desktop"
            || t == "desktop right"
            || (t.contains("switch") && t.contains("desktop") && t.contains("next"))
        {
            return Some(ActionResult::action(ActionType::WindowControl, serde_json::json!({"action": "next_desktop"})));
        }
        if t == "previous desktop"
            || t == "switch to previous desktop"
            || t == "desktop left"
            || (t.contains("switch") && t.contains("desktop") && (t.contains("previous") || t.contains("back")))
        {
            return Some(ActionResult::action(ActionType::WindowControl, serde_json::json!({"action": "previous_desktop"})));
        }
        if t == "task view"
            || t == "show desktops"
            || t == "mission control"
            || t == "switch desktop view"
            || t == "desktop view"
        {
            return Some(ActionResult::action(ActionType::WindowControl, serde_json::json!({"action": "task_view"})));
        }
        if t == "restore" || t == "restore window" {
            return Some(ActionResult::action(ActionType::WindowControl, serde_json::json!({"action": "restore"})));
        }
        
        // Quick responses (time, date, etc.)
        if t.contains("what time") || t.contains("what's the time") || t == "time" {
            let now = chrono::Local::now();
            let time_str = now.format("%I:%M %p").to_string();
            let tz = now.format("%Z").to_string();
            return Some(ActionResult::respond(format!("It's {} ({})", time_str, tz)));
        }
        if t.contains("what day") || t.contains("what's today") || t.contains("today's date") || t.contains("what date") {
            let now = chrono::Local::now();
            let date_str = now.format("%A, %B %d, %Y").to_string();
            return Some(ActionResult::respond(format!("Today is {}", date_str)));
        }
        
        None
    }

    /// Build the system prompt with context
    fn build_system_prompt(&self, voice_context: &VoiceContext, conv_context: &ConversationContext) -> String {
        let mut prompt = String::from(r#"You are ListenOS, a voice-to-action assistant. Analyze user voice input and decide: COMMAND or DICTATION.

=== COMMAND DETECTION ===

Treat as COMMAND if the input:
1. STARTS with a command verb: open, launch, start, search, google, play, pause, stop, next, previous, skip, mute, unmute, volume, lock, screenshot, shutdown, restart, reboot, sleep, brightness, bluetooth, wifi, close, quit, exit
2. Is a SHORT phrase (1-4 words) that matches a command pattern
3. Contains "my computer", "the computer", "my PC" with a system action

Examples of COMMANDS (execute these):
- "Open Chrome" → open_app
- "Search for pizza" → web_search  
- "Play music" → spotify_control
- "Pause" → spotify_control
- "Lock my computer" → system_control
- "Shutdown" → system_control
- "Volume up" → volume_control
- "Take a screenshot" → system_control
- "Organize my downloads" → system_control

=== DICTATION ===

Treat as DICTATION (type_text) if:
1. It's a complete sentence the user wants typed
2. Command words appear MID-SENTENCE (not at start)
3. It's conversational or descriptive text

Examples of DICTATION (type these):
- "I want to open a new chapter" → type_text (open is mid-sentence)
- "The meeting was great" → type_text
- "Please search for the document" → type_text (starts with please)
- "Can you help me" → type_text

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
- system_control: Trigger words: "lock", "screenshot", "sleep", "shutdown", "restart", "reboot", "brightness", "bluetooth", "wifi", "night light"
  Example: "Lock my computer" -> {"action": "system_control", "payload": {"action": "lock"}}
  Example: "Take a screenshot" -> {"action": "system_control", "payload": {"action": "screenshot"}}
  Example: "Organize my downloads folder" -> {"action": "system_control", "payload": {"action": "organize_downloads"}}
  Example: "Shutdown the computer" -> {"action": "system_control", "payload": {"action": "shutdown"}}
  Example: "Restart" -> {"action": "system_control", "payload": {"action": "restart"}}
  Example: "Put computer to sleep" -> {"action": "system_control", "payload": {"action": "sleep"}}
  Example: "Turn on bluetooth" -> {"action": "system_control", "payload": {"action": "bluetooth"}}
  Example: "Turn off wifi" -> {"action": "system_control", "payload": {"action": "wifi_toggle"}}
  Example: "Set brightness to 50" -> {"action": "system_control", "payload": {"action": "brightness", "level": 50}}
  Example: "Turn on night light" -> {"action": "system_control", "payload": {"action": "night_light"}}

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
                        refined_text: Some(post_process_dictation(response)),
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
            "keyboard_shortcut" => ActionType::KeyboardShortcut,
            "window_control" => ActionType::WindowControl,
            "no_action" => ActionType::NoAction,
            _ => ActionType::TypeText,
        };

        // For type_text, ensure we have text to type and post-process it
        let refined_text = if action_type == ActionType::TypeText {
            parsed["refined_text"]
                .as_str()
                .map(|s| post_process_dictation(s))
                // Fallback: use original transcription if no refined_text
                .or_else(|| Some(post_process_dictation(original_text)))
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

/// Public helper for deterministic command routing without calling the LLM.
/// Returns `Some(ActionResult)` only for unambiguous command phrases.
pub fn detect_local_command(text: &str) -> Option<ActionResult> {
    GroqClient::new().detect_local_command(text)
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
