//! API Client for ListenOS Backend Server
//!
//! Handles communication with the backend API server for:
//! - Voice transcription
//! - Intent processing
//! - User settings sync

use reqwest::Client;
use serde::{Deserialize, Serialize};

/// API client configuration
#[derive(Debug, Clone)]
pub struct ApiConfig {
    /// Base URL of the API server
    pub base_url: String,
    /// API key for authentication (optional, can use Clerk token)
    pub api_key: Option<String>,
    /// Clerk session token
    pub session_token: Option<String>,
}

impl Default for ApiConfig {
    fn default() -> Self {
        Self {
            base_url: "https://server-c6vdxgsxi-devrajsingh15s-projects.vercel.app".to_string(),
            api_key: Some("listenos-desktop-app".to_string()),
            session_token: None,
        }
    }
}

/// API client for backend server communication
pub struct ApiClient {
    client: Client,
    config: ApiConfig,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranscriptionResponse {
    pub text: String,
    pub confidence: f32,
    pub duration_ms: u64,
    pub is_final: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessRequest {
    pub text: String,
    pub context: Option<VoiceContext>,
    pub conversation_history: Option<String>,
    pub custom_commands: Option<Vec<CustomCommand>>,
    pub dictation_style: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VoiceContext {
    pub active_app: Option<String>,
    pub selected_text: Option<String>,
    pub os: String,
    pub mode: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CustomCommand {
    pub trigger: String,
    pub name: String,
    pub id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ActionResponse {
    pub action_type: String,
    pub payload: serde_json::Value,
    pub refined_text: Option<String>,
    pub response_text: Option<String>,
    pub requires_confirmation: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiError {
    pub error: String,
    pub details: Option<String>,
}

impl ApiClient {
    /// Create a new API client with default configuration
    pub fn new() -> Self {
        Self::with_config(ApiConfig::default())
    }

    /// Create a new API client with custom configuration
    pub fn with_config(config: ApiConfig) -> Self {
        Self {
            client: Client::new(),
            config,
        }
    }

    /// Update the API configuration
    pub fn set_config(&mut self, config: ApiConfig) {
        self.config = config;
    }

    /// Set the session token for authentication
    pub fn set_session_token(&mut self, token: String) {
        self.config.session_token = Some(token);
    }

    /// Set the API key for authentication
    pub fn set_api_key(&mut self, key: String) {
        self.config.api_key = Some(key);
    }

    /// Build authorization headers
    fn auth_headers(&self) -> Vec<(&'static str, String)> {
        let mut headers = Vec::new();
        
        if let Some(ref token) = self.config.session_token {
            headers.push(("Authorization", format!("Bearer {}", token)));
        }
        
        if let Some(ref key) = self.config.api_key {
            headers.push(("X-API-Key", key.clone()));
        }
        
        headers
    }

    /// Check if the API server is healthy
    pub async fn health_check(&self) -> Result<bool, String> {
        let url = format!("{}/api/health", self.config.base_url);
        
        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Health check failed: {}", e))?;
        
        Ok(response.status().is_success())
    }

    /// Transcribe audio using the backend API
    pub async fn transcribe(&self, audio_data: &[u8], hints: Option<&[String]>) -> Result<TranscriptionResponse, String> {
        let url = format!("{}/api/voice/transcribe", self.config.base_url);
        
        // Build multipart form
        let file_part = reqwest::multipart::Part::bytes(audio_data.to_vec())
            .file_name("audio.wav")
            .mime_str("audio/wav")
            .map_err(|e| format!("Failed to create file part: {}", e))?;
        
        let mut form = reqwest::multipart::Form::new()
            .part("file", file_part);
        
        if let Some(hints) = hints {
            form = form.text("hints", hints.join(", "));
        }
        
        // Build request with auth
        let mut request = self.client.post(&url);
        
        for (key, value) in self.auth_headers() {
            request = request.header(key, value);
        }
        
        let response = request
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Transcription request failed: {}", e))?;
        
        if !response.status().is_success() {
            let error: ApiError = response.json().await
                .unwrap_or(ApiError { error: "Unknown error".to_string(), details: None });
            return Err(format!("Transcription failed: {}", error.error));
        }
        
        response.json().await
            .map_err(|e| format!("Failed to parse transcription response: {}", e))
    }

    /// Process text intent using the backend API
    pub async fn process_intent(&self, request: ProcessRequest) -> Result<ActionResponse, String> {
        let url = format!("{}/api/voice/process", self.config.base_url);
        
        // Build request with auth
        let mut req = self.client.post(&url);
        
        for (key, value) in self.auth_headers() {
            req = req.header(key, value);
        }
        
        let response = req
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Process request failed: {}", e))?;
        
        if !response.status().is_success() {
            let error: ApiError = response.json().await
                .unwrap_or(ApiError { error: "Unknown error".to_string(), details: None });
            return Err(format!("Processing failed: {}", error.error));
        }
        
        response.json().await
            .map_err(|e| format!("Failed to parse process response: {}", e))
    }
}

impl Default for ApiClient {
    fn default() -> Self {
        Self::new()
    }
}
