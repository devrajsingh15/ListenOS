//! Application configuration module

use serde::{Deserialize, Serialize};
use crate::ai::{WhisperConfig, LLMConfig, AIProvider};

/// Application configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// Hotkey to trigger listening (e.g., "Ctrl+Space")
    pub trigger_hotkey: String,
    
    /// Mode: "push_to_talk" or "toggle"
    pub listening_mode: ListeningMode,
    
    /// Auto-copy transcription to clipboard
    pub auto_copy: bool,
    
    /// Whisper/STT configuration
    pub whisper: WhisperConfig,
    
    /// LLM configuration
    pub llm: LLMConfig,
    
    /// AI provider to use
    pub ai_provider: AIProvider,
    
    /// API keys for external providers
    pub api_keys: ApiKeys,
    
    /// UI preferences
    pub ui: UIConfig,
    
    /// Sound feedback enabled
    pub sound_feedback: bool,
    
    /// Auto-start on system boot
    pub auto_start: bool,
    
    /// Dictation style settings per context
    pub dictation_style: DictationStyleConfig,
}

/// Dictation style configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictationStyleConfig {
    /// Style for personal messages (messengers)
    pub personal: DictationStyle,
    /// Style for work messages (Slack, Teams)
    pub work: DictationStyle,
    /// Style for email
    pub email: DictationStyle,
    /// Style for other contexts
    pub other: DictationStyle,
}

impl Default for DictationStyleConfig {
    fn default() -> Self {
        Self {
            personal: DictationStyle::Casual,
            work: DictationStyle::Formal,
            email: DictationStyle::Formal,
            other: DictationStyle::Formal,
        }
    }
}

/// Dictation style affects capitalization and punctuation
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DictationStyle {
    /// Caps + Full punctuation
    Formal,
    /// Caps + Less punctuation
    Casual,
    /// No caps + Less punctuation  
    VeryCasual,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            trigger_hotkey: "Ctrl+Space".to_string(),
            listening_mode: ListeningMode::PushToTalk,
            auto_copy: true,
            whisper: WhisperConfig::default(),
            llm: LLMConfig::default(),
            ai_provider: AIProvider::Local,
            api_keys: ApiKeys::default(),
            ui: UIConfig::default(),
            sound_feedback: true,
            auto_start: false,
            dictation_style: DictationStyleConfig::default(),
        }
    }
}

/// Listening mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ListeningMode {
    /// Hold hotkey to listen, release to process
    PushToTalk,
    /// Press once to start, press again to stop
    Toggle,
    /// Continuous listening with wake word
    VoiceActivated,
}

/// API keys for external services
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ApiKeys {
    pub openai: Option<String>,
    pub groq: Option<String>,
    pub openrouter: Option<String>,
    pub anthropic: Option<String>,
}

/// UI configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIConfig {
    /// Theme: "dark" or "light"
    pub theme: String,
    
    /// Accent color (hex)
    pub accent_color: String,
    
    /// Window opacity (0.0 - 1.0)
    pub opacity: f32,
    
    /// Show transcription in overlay
    pub show_transcription: bool,
    
    /// Overlay position
    pub overlay_position: OverlayPosition,
    
    /// Window size
    pub window_width: u32,
    pub window_height: u32,
}

impl Default for UIConfig {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            accent_color: "#06b6d4".to_string(), // Cyan
            opacity: 0.9,
            show_transcription: true,
            overlay_position: OverlayPosition::BottomCenter,
            window_width: 400,
            window_height: 600,
        }
    }
}

/// Overlay position on screen
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OverlayPosition {
    TopLeft,
    TopCenter,
    TopRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
    Center,
}
