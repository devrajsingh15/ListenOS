//! Tauri command handlers for Listen OS
//! 
//! Cloud-first architecture with embedded API keys.
//! Users just speak - we handle everything.

pub mod custom;

use crate::AppState;
use crate::audio::AudioDevice;
use crate::cloud::{self, GroqClient, ActionResult, ActionType, VoiceContext, VoiceMode, ConversationContext};
use serde::{Deserialize, Serialize};
use tauri::State;

/// Status response for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusResponse {
    pub is_listening: bool,
    pub is_processing: bool,
    pub is_streaming: bool,
    pub audio_device: Option<String>,
    pub last_transcription: Option<String>,
}

/// Transcription result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionResult {
    pub text: String,
    pub duration_ms: u64,
    pub confidence: f32,
    pub is_final: bool,
}

/// Command result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResult {
    pub success: bool,
    pub message: String,
    pub output: Option<String>,
}

/// Full voice processing result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceProcessingResult {
    pub transcription: TranscriptionResult,
    pub action: ActionResultResponse,
    pub executed: bool,
    /// AI response text for conversational actions
    pub response_text: Option<String>,
    /// Session ID for conversation continuity
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionResultResponse {
    pub action_type: String,
    pub payload: serde_json::Value,
    pub refined_text: Option<String>,
    pub response_text: Option<String>,
}

// ============ Core Voice Commands ============

/// Start listening for voice input
#[tauri::command]
pub async fn start_listening(state: State<'_, AppState>) -> Result<bool, String> {
    let mut is_listening = state.is_listening.lock().await;
    
    if *is_listening {
        // Already listening - just return true instead of error
        return Ok(true);
    }

    // Clear accumulator
    {
        let mut accumulator = state.accumulator.lock().await;
        accumulator.clear();
    }

    // Start audio streaming
    let receiver = {
        let streamer = state.streamer.lock().await;
        streamer.start_streaming()?
    };

    *is_listening = true;

    // Spawn task to collect audio chunks
    let accumulator_clone = state.accumulator.clone();
    let is_listening_clone = state.is_listening.clone();
    
    tokio::spawn(async move {
        loop {
            // Check if still listening
            if !*is_listening_clone.lock().await {
                break;
            }
            
            match receiver.try_recv() {
                Ok(chunk) => {
                    let mut acc = accumulator_clone.lock().await;
                    acc.add_samples(&chunk);
                }
                Err(crossbeam_channel::TryRecvError::Empty) => {
                    tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
                }
                Err(crossbeam_channel::TryRecvError::Disconnected) => {
                    break;
                }
            }
        }
    });
    
    log::info!("Listen OS: Started listening");
    
    Ok(true)
}

/// Stop listening and process audio with Groq AI
#[tauri::command]
pub async fn stop_listening(state: State<'_, AppState>) -> Result<VoiceProcessingResult, String> {
    // Check if listening
    {
        let is_listening = state.is_listening.lock().await;
        if !*is_listening {
            return Err("Not listening".to_string());
        }
    }

    // Stop listening flag first
    {
        let mut is_listening = state.is_listening.lock().await;
        *is_listening = false;
    }
    
    // Stop streaming
    {
        let streamer = state.streamer.lock().await;
        streamer.stop_streaming();
    }
    
    // Wait for final chunks
    tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;

    // Set processing state
    {
        let mut is_processing = state.is_processing.lock().await;
        *is_processing = true;
    }

    // Get accumulated audio
    let (samples, sample_rate) = {
        let accumulator = state.accumulator.lock().await;
        (accumulator.get_samples().to_vec(), accumulator.sample_rate())
    };

    // Calculate RMS to detect silence (to filter hallucinations)
    let rms: f32 = if samples.is_empty() {
        0.0
    } else {
        (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt()
    };
    let duration_ms = (samples.len() as u64 * 1000) / sample_rate as u64;
    log::info!("Audio captured: {} samples, {} ms, RMS: {:.4}", samples.len(), duration_ms, rms);

    if samples.is_empty() || samples.len() < 1600 { // Less than 100ms
        let mut is_processing = state.is_processing.lock().await;
        *is_processing = false;
        return Err("Recording too short.".to_string());
    }

    // Encode to WAV
    let wav_data = cloud::encode_wav(&samples, sample_rate)?;
    log::info!("Encoded WAV: {} bytes", wav_data.len());

    // Get context
    let context = state.current_context.lock().await.clone();

    // Load dictionary words for recognition hints
    let dictionary_hints = match crate::dictionary::DictionaryStore::new() {
        Ok(store) => store.get_words_for_recognition().unwrap_or_default(),
        Err(_) => Vec::new(),
    };

    // Transcribe with Groq (using dictionary hints)
    let client = GroqClient::new();
    
    let transcription = match client.transcribe_with_hints(&wav_data, &dictionary_hints).await {
        Ok(result) => {
            log::info!("Transcription: {}", result.text);
            TranscriptionResult {
                text: result.text,
                duration_ms,
                confidence: result.confidence,
                is_final: true,
            }
        }
        Err(e) => {
            log::error!("Transcription failed: {}", e);
            // Log error for UI notification
            {
                let mut error_log = state.error_log.lock().await;
                error_log.log_error_with_details(
                    crate::error_log::ErrorType::Transcription,
                    "Voice transcription failed",
                    e.clone()
                );
            }
            let mut is_processing = state.is_processing.lock().await;
            *is_processing = false;
            return Err(format!("Transcription failed: {}", e));
        }
    };

    // Detect silence at audio level - filter Whisper hallucinations
    // RMS < 0.002 means essentially silence (mic noise only)
    let is_silent = rms < 0.002;
    
    // Also filter known Whisper hallucination phrases that appear on silence
    let hallucination_phrases = [
        "thank you", "thanks", "thanks for watching", "thank you for watching",
        "subscribe", "like and subscribe", "see you", "bye", "goodbye",
        "you", ".", "..", "...",
    ];
    let text_lower = transcription.text.trim().to_lowercase();
    let is_hallucination = hallucination_phrases.iter().any(|&p| text_lower == p);

    if transcription.text.trim().is_empty() || (is_silent && is_hallucination) {
        log::info!("No speech detected (RMS: {:.4}, text: '{}')", rms, transcription.text);
        let mut is_processing = state.is_processing.lock().await;
        *is_processing = false;
        
        // Return a silent success (NoAction) so frontend just dismisses quietly
        return Ok(VoiceProcessingResult {
            transcription: TranscriptionResult {
                text: String::new(),
                duration_ms,
                confidence: 0.0,
                is_final: true,
            },
            action: ActionResultResponse {
                action_type: "NoAction".to_string(),
                payload: serde_json::json!({}),
                refined_text: None,
                response_text: None,
            },
            executed: true,
            response_text: None,
            session_id: "silent".to_string(),
        });
    }

    // Get conversation context for multi-turn dialogues
    let (conv_context, session_id) = {
        let mut conversation = state.conversation.lock().await;
        
        // Add user message to conversation
        conversation.add_user_message(transcription.text.clone());
        
        // Build conversation context for LLM
        let clipboard_preview = {
            let clipboard = state.clipboard.lock().await;
            clipboard.get_preview(200).ok()
        };
        
        // Load custom commands for context
        let custom_commands = match custom::CustomCommandsStore::new() {
            Ok(store) => {
                store.get_enabled_commands()
                    .unwrap_or_default()
                    .into_iter()
                    .map(|c| (c.trigger_phrase, c.name, c.id))
                    .collect()
            }
            Err(_) => Vec::new()
        };
        
        // Load snippets for context
        let snippets = match crate::snippets::SnippetsStore::new() {
            Ok(store) => {
                store.get_all_snippets()
                    .unwrap_or_default()
                    .into_iter()
                    .map(|s| (s.trigger, s.expansion))
                    .collect()
            }
            Err(_) => Vec::new()
        };
        
        // Determine dictation style based on active app
        let dictation_style = {
            let config = state.config.lock().await;
            let active_app = context.active_app.as_ref().map(|s| s.to_lowercase());
            
            let style_config = &config.dictation_style;
            
            // Detect app category based on name
            let config_style = match active_app.as_deref() {
                // Personal messengers
                Some(app) if app.contains("whatsapp") || app.contains("messenger") || 
                             app.contains("telegram") || app.contains("imessage") ||
                             app.contains("signal") || app.contains("discord") => style_config.personal,
                // Work apps
                Some(app) if app.contains("slack") || app.contains("teams") || 
                             app.contains("zoom") => style_config.work,
                // Email
                Some(app) if app.contains("mail") || app.contains("outlook") || 
                             app.contains("gmail") || app.contains("thunderbird") => style_config.email,
                // Default
                _ => style_config.other,
            };
            
            // Convert config style to cloud style
            match config_style {
                crate::config::DictationStyle::Formal => cloud::DictationStyle::Formal,
                crate::config::DictationStyle::Casual => cloud::DictationStyle::Casual,
                crate::config::DictationStyle::VeryCasual => cloud::DictationStyle::VeryCasual,
            }
        };
        
        let ctx = ConversationContext {
            history: conversation.format_for_llm(),
            last_action: conversation.last_action.clone(),
            last_payload: conversation.last_action_payload.clone(),
            clipboard_preview,
            user_facts: conversation.extracted_facts.iter()
                .map(|f| format!("{}: {}", f.key, f.value))
                .collect(),
            custom_commands,
            snippets,
            dictation_style,
        };
        
        (ctx, conversation.session_id.clone())
    };

    // Process intent with LLM (with conversation context)
    let action = match client.process_intent_with_context(&transcription.text, &context, &conv_context).await {
        Ok(result) => {
            log::info!("Action: {:?}", result.action_type);
            result
        }
        Err(e) => {
            log::warn!("LLM processing failed, defaulting to dictation: {}", e);
            // Log error for UI notification (non-fatal - we fallback to dictation)
            {
                let mut error_log = state.error_log.lock().await;
                error_log.log_error_with_details(
                    crate::error_log::ErrorType::LLMProcessing,
                    "AI processing failed, using dictation mode",
                    e.clone()
                );
            }
            ActionResult {
                action_type: ActionType::TypeText,
                payload: serde_json::json!({}),
                refined_text: Some(transcription.text.clone()),
                response_text: None,
                requires_confirmation: false,
            }
        }
    };

    // Execute the action
    let execute_result = execute_action_internal(&action, &state).await;
    let executed = execute_result.is_ok();
    
    // Log execution errors
    if let Err(ref e) = execute_result {
        let mut error_log = state.error_log.lock().await;
        error_log.log_error_with_details(
            crate::error_log::ErrorType::ActionExecution,
            format!("Failed to execute {:?}", action.action_type),
            e.clone()
        );
    }
    
    // Track typed text for correction learning
    if action.action_type == ActionType::TypeText {
        if let Some(ref typed) = action.refined_text {
            let mut tracker = state.correction_tracker.lock().await;
            tracker.record_typed(transcription.text.clone(), typed.clone());
        }
    }

    // Update conversation with assistant response
    {
        let mut conversation = state.conversation.lock().await;
        let response_content = action.response_text.clone()
            .or_else(|| action.refined_text.clone())
            .unwrap_or_else(|| format!("Executed: {:?}", action.action_type));
        
        conversation.add_assistant_message(
            response_content,
            Some(action.action_type),
            Some(executed),
            Some(action.payload.clone()),
        );

        // Persist conversation to store
        if let Ok(store_guard) = state.conversation_store.lock() {
            if let Some(ref store) = *store_guard {
                let _ = store.save_session(&conversation);
            }
        }
    }

    // Processing logic finished
    let result = VoiceProcessingResult {
        transcription,
        action: ActionResultResponse {
            action_type: format!("{:?}", action.action_type),
            payload: action.payload,
            refined_text: action.refined_text,
            response_text: action.response_text.clone(),
        },
        executed,
        response_text: action.response_text,
        session_id,
    };

    // Save to history
    {
        let mut history = state.history.lock().await;
        history.push(result.clone());
        // Keep only last 50
        if history.len() > 50 {
            history.remove(0);
        }
    }

    // Set processing state to false
    {
        let mut is_processing = state.is_processing.lock().await;
        *is_processing = false;
    }

    Ok(result)
}

/// Get current application status
#[tauri::command]
pub async fn get_status(state: State<'_, AppState>) -> Result<StatusResponse, String> {
    let is_listening = *state.is_listening.lock().await;
    let is_processing = *state.is_processing.lock().await;
    let audio = state.audio.lock().await;
    let streamer = state.streamer.lock().await;
    
    Ok(StatusResponse {
        is_listening,
        is_processing,
        is_streaming: streamer.is_streaming(),
        audio_device: audio.selected_device.clone(),
        last_transcription: None,
    })
}

// ============ Audio Device Commands ============

/// Get list of available audio input devices
#[tauri::command]
pub async fn get_audio_devices() -> Result<Vec<AudioDevice>, String> {
    crate::audio::AudioState::get_devices()
}

/// Set the audio input device
#[tauri::command]
pub async fn set_audio_device(
    state: State<'_, AppState>,
    device_name: String,
) -> Result<bool, String> {
    let mut audio = state.audio.lock().await;
    audio.selected_device = Some(device_name.clone());
    log::info!("Set audio device to {}", device_name);
    Ok(true)
}

// ============ Action Execution ============

async fn execute_action_internal(action: &ActionResult, state: &State<'_, AppState>) -> Result<CommandResult, String> {
    match action.action_type {
        // Conversational actions - no system action needed
        ActionType::Respond => {
            Ok(CommandResult {
                success: true,
                message: action.response_text.clone().unwrap_or_else(|| "Response sent".to_string()),
                output: action.response_text.clone(),
            })
        }
        
        ActionType::Clarify => {
            Ok(CommandResult {
                success: true,
                message: action.response_text.clone().unwrap_or_else(|| "Clarification requested".to_string()),
                output: action.response_text.clone(),
            })
        }
        
        // Clipboard actions
        ActionType::ClipboardFormat | ActionType::ClipboardTranslate | 
        ActionType::ClipboardSummarize | ActionType::ClipboardClean => {
            execute_clipboard_action(action, state).await
        }
        
        // App integration actions
        ActionType::SpotifyControl => {
            execute_spotify_action(action, state).await
        }
        
        ActionType::DiscordControl => {
            execute_discord_action(action, state).await
        }
        
        ActionType::SystemControl => {
            execute_system_action(action, state).await
        }
        
        ActionType::CustomCommand => {
            execute_custom_command(action, state).await
        }

        ActionType::TypeText => {
            // Get text from refined_text or payload
            let text = if let Some(ref refined) = action.refined_text {
                refined.clone()
            } else if let Some(payload_text) = action.payload.get("text").and_then(|v| v.as_str()) {
                payload_text.to_string()
            } else {
                String::new()
            };
            
            if text.is_empty() {
                return Ok(CommandResult {
                    success: false,
                    message: "No text to type".to_string(),
                    output: None,
                });
            }
            
            type_text_internal(text).await
        }
        
        ActionType::OpenApp => {
            let app = action.payload.get("app")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_lowercase();
            
            if app.is_empty() {
                return Ok(CommandResult {
                    success: false,
                    message: "No app specified".to_string(),
                    output: None,
                });
            }
            
            log::info!("Opening app: {}", app);
            
            #[cfg(windows)]
            {
                use std::process::Command;
                
                // Try multiple methods in order:
                // 1. Known app mappings (native commands, URI schemes)
                // 2. Start by name
                // 3. URI scheme fallback
                // 4. Web fallback for popular apps
                
                // Map common app names to Windows commands/URIs
                let known_apps: &[(&str, &str, Option<&str>)] = &[
                    // (name, primary_cmd, web_fallback)
                    // Windows Store Apps - use URI schemes
                    ("settings", "ms-settings:", None),
                    ("windows settings", "ms-settings:", None),
                    ("store", "ms-windows-store:", None),
                    ("microsoft store", "ms-windows-store:", None),
                    ("mail", "outlookmail:", Some("https://outlook.live.com")),
                    ("outlook", "outlookmail:", Some("https://outlook.live.com")),
                    ("calendar", "outlookcal:", Some("https://outlook.live.com/calendar")),
                    ("calculator", "calculator:", None),
                    ("camera", "microsoft.windows.camera:", None),
                    ("maps", "bingmaps:", Some("https://maps.google.com")),
                    ("photos", "ms-photos:", None),
                    ("clock", "ms-clock:", None),
                    ("alarms", "ms-clock:", None),
                    ("weather", "bingweather:", Some("https://weather.com")),
                    
                    // Popular apps with URI schemes and web fallbacks
                    ("whatsapp", "whatsapp:", Some("https://web.whatsapp.com")),
                    ("spotify", "spotify:", Some("https://open.spotify.com")),
                    ("discord", "discord:", Some("https://discord.com/app")),
                    ("slack", "slack:", Some("https://app.slack.com")),
                    ("teams", "msteams:", Some("https://teams.microsoft.com")),
                    ("microsoft teams", "msteams:", Some("https://teams.microsoft.com")),
                    ("zoom", "zoommtg:", Some("https://zoom.us/join")),
                    ("telegram", "tg:", Some("https://web.telegram.org")),
                    
                    // Browsers
                    ("chrome", "chrome", None),
                    ("google chrome", "chrome", None),
                    ("firefox", "firefox", None),
                    ("edge", "msedge", None),
                    ("microsoft edge", "msedge", None),
                    ("brave", "brave", None),
                    
                    // Common desktop apps
                    ("notepad", "notepad", None),
                    ("word", "winword", None),
                    ("microsoft word", "winword", None),
                    ("excel", "excel", None),
                    ("microsoft excel", "excel", None),
                    ("powerpoint", "powerpnt", None),
                    ("vscode", "code", None),
                    ("visual studio code", "code", None),
                    ("code", "code", None),
                    ("terminal", "wt", None), // Windows Terminal
                    ("cmd", "cmd", None),
                    ("command prompt", "cmd", None),
                    ("powershell", "powershell", None),
                    ("explorer", "explorer", None),
                    ("file explorer", "explorer", None),
                    ("files", "explorer", None),
                    ("task manager", "taskmgr", None),
                    ("control panel", "control", None),
                    
                    // Web-only apps
                    ("youtube", "https://youtube.com", None),
                    ("gmail", "https://gmail.com", None),
                    ("google", "https://google.com", None),
                    ("twitter", "https://x.com", None),
                    ("x", "https://x.com", None),
                    ("facebook", "https://facebook.com", None),
                    ("instagram", "https://instagram.com", None),
                    ("linkedin", "https://linkedin.com", None),
                    ("reddit", "https://reddit.com", None),
                    ("github", "https://github.com", None),
                    ("netflix", "https://netflix.com", None),
                ];
                
                // Find matching app
                let app_info = known_apps.iter().find(|(name, _, _)| *name == app.as_str());
                
                if let Some((_, primary_cmd, web_fallback)) = app_info {
                    // Try primary command first
                    let launch_cmd = if primary_cmd.contains("://") || primary_cmd.ends_with(':') {
                        format!("start {}", primary_cmd)
                    } else {
                        format!("start {}", primary_cmd)
                    };
                    
                    let result = Command::new("cmd")
                        .args(["/C", &launch_cmd])
                        .output();
                    
                    match result {
                        Ok(output) if output.status.success() => {
                            return Ok(CommandResult {
                                success: true,
                                message: format!("Opened: {}", app),
                                output: None,
                            });
                        }
                        _ => {
                            // Try web fallback if available
                            if let Some(web_url) = web_fallback {
                                log::info!("Primary launch failed, trying web fallback: {}", web_url);
                                let _ = Command::new("cmd")
                                    .args(["/C", "start", "", web_url])
                                    .spawn();
                                return Ok(CommandResult {
                                    success: true,
                                    message: format!("Opened {} (web)", app),
                                    output: None,
                                });
                            }
                        }
                    }
                }
                
                // Fallback: try to start by name directly
                let result = Command::new("cmd")
                    .args(["/C", "start", &app])
                    .spawn();
                
                match result {
                    Ok(_) => Ok(CommandResult {
                        success: true,
                        message: format!("Opened: {}", app),
                        output: None,
                    }),
                    Err(e) => Err(format!("Failed to open {}: {}", app, e)),
                }
            }
            
            #[cfg(target_os = "macos")]
            {
                use std::process::Command;
                
                // Try open -a first
                let result = Command::new("open")
                    .args(["-a", &app])
                    .output();
                
                if let Ok(output) = result {
                    if output.status.success() {
                        return Ok(CommandResult {
                            success: true,
                            message: format!("Opened: {}", app),
                            output: None,
                        });
                    }
                }
                
                // Fallback to web version for known apps
                let web_fallback: Option<&str> = match app.as_str() {
                    "whatsapp" => Some("https://web.whatsapp.com"),
                    "spotify" => Some("https://open.spotify.com"),
                    "discord" => Some("https://discord.com/app"),
                    "slack" => Some("https://app.slack.com"),
                    "telegram" => Some("https://web.telegram.org"),
                    _ => None,
                };
                
                if let Some(url) = web_fallback {
                    let _ = Command::new("open").arg(url).spawn();
                    return Ok(CommandResult {
                        success: true,
                        message: format!("Opened {} (web)", app),
                        output: None,
                    });
                }
                
                Err(format!("Could not find app: {}", app))
            }
            
            #[cfg(not(any(windows, target_os = "macos")))]
            {
                let cmd = format!("xdg-open {} 2>/dev/null || open {}", app, app);
                run_system_command(cmd).await
            }
        }
        
        ActionType::WebSearch => {
            let query = action.payload.get("query")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            
            if query.is_empty() {
                return Ok(CommandResult {
                    success: false,
                    message: "No search query specified".to_string(),
                    output: None,
                });
            }
            
            log::info!("Searching for: {}", query);
            
            let encoded_query = query.replace(" ", "+");
            let url = format!("https://www.google.com/search?q={}", encoded_query);
            
            #[cfg(windows)]
            {
                use std::process::Command;
                let result = Command::new("cmd")
                    .args(["/C", "start", "", &url])
                    .spawn();
                
                match result {
                    Ok(_) => Ok(CommandResult {
                        success: true,
                        message: format!("Searching: {}", query),
                        output: None,
                    }),
                    Err(e) => Err(format!("Failed to search: {}", e)),
                }
            }
            
            #[cfg(not(windows))]
            {
                let cmd = format!("open \"{}\"", url);
                run_system_command(cmd).await
            }
        }
        
        ActionType::VolumeControl => {
            let direction = action.payload.get("direction")
                .and_then(|v| v.as_str())
                .unwrap_or("up");
            
            #[cfg(windows)]
            {
                let key_code = match direction {
                    "up" => 175,
                    "down" => 174,
                    "mute" => 173,
                    _ => 175,
                };
                let cmd = format!(
                    "powershell -Command \"(New-Object -ComObject WScript.Shell).SendKeys([char]{})\"", 
                    key_code
                );
                let _ = run_system_command(cmd).await;
            }
            
            Ok(CommandResult {
                success: true,
                message: format!("Volume {}", direction),
                output: None,
            })
        }
        
        ActionType::RunCommand => {
            let cmd = action.payload.get("command")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            
            if cmd.is_empty() {
                return Err("No command specified".to_string());
            }
            
            run_system_command(cmd.to_string()).await
        }
        
        ActionType::OpenUrl => {
            let url = action.payload.get("url")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            
            if url.is_empty() {
                return Ok(CommandResult {
                    success: false,
                    message: "No URL specified".to_string(),
                    output: None,
                });
            }
            
            log::info!("Opening URL: {}", url);
            
            #[cfg(windows)]
            {
                use std::process::Command;
                let result = Command::new("cmd")
                    .args(["/C", "start", "", url])
                    .spawn();
                
                match result {
                    Ok(_) => Ok(CommandResult {
                        success: true,
                        message: format!("Opened: {}", url),
                        output: None,
                    }),
                    Err(e) => Err(format!("Failed to open URL: {}", e)),
                }
            }
            
            #[cfg(not(windows))]
            {
                let cmd = format!("open \"{}\"", url);
                run_system_command(cmd).await
            }
        }
        
        ActionType::SendEmail => {
            // Extract email details
            let to = action.payload.get("to")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let subject = action.payload.get("subject")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let body = action.payload.get("body")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            
            // URL encode the parts
            let encoded_subject = subject.replace(" ", "+");
            let encoded_body = body.replace(" ", "+").replace("\n", "%0A");
            
            // Open Gmail compose
            let gmail_url = format!(
                "https://mail.google.com/mail/?view=cm&to={}&su={}&body={}",
                to, encoded_subject, encoded_body
            );
            
            log::info!("Opening email compose: to={}", to);
            
            #[cfg(windows)]
            {
                use std::process::Command;
                let result = Command::new("cmd")
                    .args(["/C", "start", "", &gmail_url])
                    .spawn();
                
                match result {
                    Ok(_) => Ok(CommandResult {
                        success: true,
                        message: format!("Composing email to: {}", to),
                        output: None,
                    }),
                    Err(e) => Err(format!("Failed to open email: {}", e)),
                }
            }
            
            #[cfg(not(windows))]
            {
                let cmd = format!("open \"{}\"", gmail_url);
                run_system_command(cmd).await
            }
        }
        
        ActionType::MultiStep => {
            // Execute multiple actions in sequence
            let steps = action.payload.get("steps")
                .and_then(|v| v.as_array());
            
            if let Some(steps) = steps {
                log::info!("Executing {} steps", steps.len());
                
                for (i, step) in steps.iter().enumerate() {
                    let step_action_type = match step["action"].as_str().unwrap_or("") {
                        "open_app" => ActionType::OpenApp,
                        "open_url" => ActionType::OpenUrl,
                        "web_search" => ActionType::WebSearch,
                        "run_command" => ActionType::RunCommand,
                        "type_text" => ActionType::TypeText,
                        "volume_control" => ActionType::VolumeControl,
                        _ => continue,
                    };
                    
                    let step_result = ActionResult {
                        action_type: step_action_type,
                        payload: step["payload"].clone(),
                        refined_text: step["refined_text"].as_str().map(|s| s.to_string()),
                        response_text: None,
                        requires_confirmation: false,
                    };
                    
                    log::info!("Step {}: {:?}", i + 1, step_action_type);
                    
                    // Execute and continue regardless of result
                    if let Err(e) = Box::pin(execute_action_internal(&step_result, state)).await {
                        log::warn!("Step {} failed: {}", i + 1, e);
                    }
                    
                    // Small delay between steps
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                }
                
                Ok(CommandResult {
                    success: true,
                    message: format!("Executed {} steps", steps.len()),
                    output: None,
                })
            } else {
                Ok(CommandResult {
                    success: false,
                    message: "No steps provided".to_string(),
                    output: None,
                })
            }
        }
        
        ActionType::NoAction => {
            Ok(CommandResult {
                success: true,
                message: "No action required".to_string(),
                output: None,
            })
        }
        
        ActionType::KeyboardShortcut => {
            execute_keyboard_shortcut(action).await
        }
        
        ActionType::WindowControl => {
            execute_window_control(action).await
        }
    }
}

/// Type text into the active window
#[tauri::command]
pub async fn type_text(text: String) -> Result<CommandResult, String> {
    type_text_internal(text).await
}

async fn type_text_internal(text: String) -> Result<CommandResult, String> {
    use enigo::{Enigo, Keyboard, Key, Settings, Direction};
    use arboard::Clipboard;
    
    if text.is_empty() {
        return Err("No text to type".to_string());
    }
    
    log::info!("type_text_internal: Starting to type {} chars", text.len());
    
    // Longer delay to ensure focus is restored after Ctrl+Space release
    // Windows needs more time to restore focus to the previous window
    tokio::time::sleep(tokio::time::Duration::from_millis(350)).await;
    
    // Use clipboard + Ctrl+V for reliable pasting (more reliable than enigo.text())
    let mut clipboard = Clipboard::new()
        .map_err(|e| format!("Failed to access clipboard: {}", e))?;
    
    // Save current clipboard content to restore later
    let previous_content = clipboard.get_text().ok();
    log::info!("type_text_internal: Saved previous clipboard content");
    
    // Set our text to clipboard with retry
    let mut set_success = false;
    for attempt in 1..=3 {
        match clipboard.set_text(&text) {
            Ok(_) => {
                // Verify the clipboard was actually set
                tokio::time::sleep(tokio::time::Duration::from_millis(30)).await;
                if let Ok(current) = clipboard.get_text() {
                    if current == text {
                        set_success = true;
                        log::info!("type_text_internal: Clipboard set successfully on attempt {}", attempt);
                        break;
                    }
                }
                log::warn!("type_text_internal: Clipboard verification failed on attempt {}", attempt);
            }
            Err(e) => {
                log::warn!("type_text_internal: Failed to set clipboard on attempt {}: {}", attempt, e);
            }
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
    }
    
    if !set_success {
        return Err("Failed to set clipboard after 3 attempts".to_string());
    }
    
    // Additional delay for clipboard to be fully ready
    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
    
    // Simulate Ctrl+V to paste with retry
    let mut paste_success = false;
    for attempt in 1..=2 {
        match paste_with_enigo() {
            Ok(_) => {
                paste_success = true;
                log::info!("type_text_internal: Paste successful on attempt {}", attempt);
                break;
            }
            Err(e) => {
                log::warn!("type_text_internal: Paste failed on attempt {}: {}", attempt, e);
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            }
        }
    }
    
    if !paste_success {
        // Fallback: try character-by-character typing for short text
        if text.len() <= 100 {
            log::info!("type_text_internal: Falling back to character-by-character typing");
            if let Ok(mut enigo) = Enigo::new(&Settings::default()) {
                if enigo.text(&text).is_ok() {
                    paste_success = true;
                }
            }
        }
    }
    
    // Restore previous clipboard content after a delay
    tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
    if let Some(prev) = previous_content {
        let _ = clipboard.set_text(&prev);
        log::info!("type_text_internal: Restored previous clipboard content");
    }
    
    if paste_success {
        log::info!("type_text_internal: Successfully typed text");
        Ok(CommandResult {
            success: true,
            message: format!("Typed: {}", if text.len() > 50 { format!("{}...", &text[..50]) } else { text }),
            output: None,
        })
    } else {
        Err("Failed to paste text into the focused application".to_string())
    }
}

/// Helper function to perform Ctrl+V paste
fn paste_with_enigo() -> Result<(), String> {
    use enigo::{Enigo, Keyboard, Key, Settings, Direction};
    
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create enigo: {}", e))?;
    
    // Press Ctrl
    enigo.key(Key::Control, Direction::Press)
        .map_err(|e| format!("Failed to press Ctrl: {}", e))?;
    
    // Small delay between key presses
    std::thread::sleep(std::time::Duration::from_millis(20));
    
    // Press and release V
    enigo.key(Key::Unicode('v'), Direction::Click)
        .map_err(|e| format!("Failed to press V: {}", e))?;
    
    // Small delay before releasing
    std::thread::sleep(std::time::Duration::from_millis(20));
    
    // Release Ctrl
    enigo.key(Key::Control, Direction::Release)
        .map_err(|e| format!("Failed to release Ctrl: {}", e))?;
    
    Ok(())
}

/// Run a system command
#[tauri::command]
pub async fn run_system_command(command: String) -> Result<CommandResult, String> {
    use std::process::Command;
    
    log::info!("Running: {}", command);
    
    #[cfg(windows)]
    let output = Command::new("cmd")
        .args(["/C", &command])
        .output()
        .map_err(|e| format!("Failed: {}", e))?;
    
    #[cfg(not(windows))]
    let output = Command::new("sh")
        .args(["-c", &command])
        .output()
        .map_err(|e| format!("Failed: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    
    if output.status.success() {
        Ok(CommandResult {
            success: true,
            message: "Done".to_string(),
            output: Some(stdout),
        })
    } else {
        Err(stderr)
    }
}

// ============ Keyboard Shortcut Helpers ============

/// Execute a keyboard shortcut (copy, paste, undo, etc.)
async fn execute_keyboard_shortcut(action: &ActionResult) -> Result<CommandResult, String> {
    use enigo::{Enigo, Keyboard, Key, Settings, Direction};
    
    let shortcut = action.payload.get("shortcut")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    
    if shortcut.is_empty() {
        return Err("No shortcut specified".to_string());
    }
    
    log::info!("Executing keyboard shortcut: {}", shortcut);
    
    // Small delay to ensure focus is on the right window
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create enigo: {}", e))?;
    
    let result = match shortcut {
        "copy" => {
            // Ctrl+C
            send_key_combo(&mut enigo, &[Key::Control], 'c')
        }
        "paste" => {
            // Ctrl+V
            send_key_combo(&mut enigo, &[Key::Control], 'v')
        }
        "cut" => {
            // Ctrl+X
            send_key_combo(&mut enigo, &[Key::Control], 'x')
        }
        "select_all" => {
            // Ctrl+A
            send_key_combo(&mut enigo, &[Key::Control], 'a')
        }
        "undo" => {
            // Ctrl+Z
            send_key_combo(&mut enigo, &[Key::Control], 'z')
        }
        "redo" => {
            // Ctrl+Y (Windows) or Ctrl+Shift+Z (cross-platform)
            send_key_combo(&mut enigo, &[Key::Control], 'y')
        }
        "save" => {
            // Ctrl+S
            send_key_combo(&mut enigo, &[Key::Control], 's')
        }
        "find" => {
            // Ctrl+F
            send_key_combo(&mut enigo, &[Key::Control], 'f')
        }
        "new_tab" => {
            // Ctrl+T
            send_key_combo(&mut enigo, &[Key::Control], 't')
        }
        "close_tab" => {
            // Ctrl+W
            send_key_combo(&mut enigo, &[Key::Control], 'w')
        }
        "new_window" => {
            // Ctrl+N
            send_key_combo(&mut enigo, &[Key::Control], 'n')
        }
        "refresh" => {
            // F5 or Ctrl+R
            send_key_combo(&mut enigo, &[Key::Control], 'r')
        }
        "back" => {
            // Alt+Left
            enigo.key(Key::Alt, Direction::Press).ok();
            std::thread::sleep(std::time::Duration::from_millis(20));
            enigo.key(Key::LeftArrow, Direction::Click).ok();
            std::thread::sleep(std::time::Duration::from_millis(20));
            enigo.key(Key::Alt, Direction::Release).ok();
            Ok(())
        }
        "forward" => {
            // Alt+Right
            enigo.key(Key::Alt, Direction::Press).ok();
            std::thread::sleep(std::time::Duration::from_millis(20));
            enigo.key(Key::RightArrow, Direction::Click).ok();
            std::thread::sleep(std::time::Duration::from_millis(20));
            enigo.key(Key::Alt, Direction::Release).ok();
            Ok(())
        }
        _ => Err(format!("Unknown shortcut: {}", shortcut)),
    };
    
    match result {
        Ok(()) => Ok(CommandResult {
            success: true,
            message: format!("Executed: {}", shortcut),
            output: None,
        }),
        Err(e) => Err(e),
    }
}

/// Helper to send a key combo like Ctrl+C
fn send_key_combo(enigo: &mut enigo::Enigo, modifiers: &[enigo::Key], key: char) -> Result<(), String> {
    use enigo::{Keyboard, Key, Direction};
    
    // Press modifiers
    for modifier in modifiers {
        enigo.key(*modifier, Direction::Press)
            .map_err(|e| format!("Failed to press modifier: {}", e))?;
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    
    // Press and release the key
    enigo.key(Key::Unicode(key), Direction::Click)
        .map_err(|e| format!("Failed to press key: {}", e))?;
    
    std::thread::sleep(std::time::Duration::from_millis(20));
    
    // Release modifiers in reverse order
    for modifier in modifiers.iter().rev() {
        enigo.key(*modifier, Direction::Release)
            .map_err(|e| format!("Failed to release modifier: {}", e))?;
    }
    
    Ok(())
}

// ============ Window Control Helpers ============

/// Execute window control commands (minimize, maximize, close, etc.)
async fn execute_window_control(action: &ActionResult) -> Result<CommandResult, String> {
    use enigo::{Enigo, Keyboard, Key, Settings, Direction};
    
    let window_action = action.payload.get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    
    if window_action.is_empty() {
        return Err("No window action specified".to_string());
    }
    
    log::info!("Executing window control: {}", window_action);
    
    // Small delay to ensure focus is on the right window
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create enigo: {}", e))?;
    
    let result = match window_action {
        "minimize" => {
            // Win+Down (minimize)
            #[cfg(windows)]
            {
                enigo.key(Key::Meta, Direction::Press).ok();
                std::thread::sleep(std::time::Duration::from_millis(20));
                enigo.key(Key::DownArrow, Direction::Click).ok();
                std::thread::sleep(std::time::Duration::from_millis(20));
                enigo.key(Key::Meta, Direction::Release).ok();
            }
            #[cfg(target_os = "macos")]
            {
                // Cmd+M
                enigo.key(Key::Meta, Direction::Press).ok();
                std::thread::sleep(std::time::Duration::from_millis(20));
                enigo.key(Key::Unicode('m'), Direction::Click).ok();
                std::thread::sleep(std::time::Duration::from_millis(20));
                enigo.key(Key::Meta, Direction::Release).ok();
            }
            Ok(())
        }
        "maximize" => {
            // Win+Up (maximize)
            #[cfg(windows)]
            {
                enigo.key(Key::Meta, Direction::Press).ok();
                std::thread::sleep(std::time::Duration::from_millis(20));
                enigo.key(Key::UpArrow, Direction::Click).ok();
                std::thread::sleep(std::time::Duration::from_millis(20));
                enigo.key(Key::Meta, Direction::Release).ok();
            }
            #[cfg(target_os = "macos")]
            {
                // Ctrl+Cmd+F for fullscreen
                enigo.key(Key::Control, Direction::Press).ok();
                enigo.key(Key::Meta, Direction::Press).ok();
                std::thread::sleep(std::time::Duration::from_millis(20));
                enigo.key(Key::Unicode('f'), Direction::Click).ok();
                std::thread::sleep(std::time::Duration::from_millis(20));
                enigo.key(Key::Meta, Direction::Release).ok();
                enigo.key(Key::Control, Direction::Release).ok();
            }
            Ok(())
        }
        "close" => {
            // Alt+F4 (Windows) or Cmd+W (macOS)
            #[cfg(windows)]
            {
                enigo.key(Key::Alt, Direction::Press).ok();
                std::thread::sleep(std::time::Duration::from_millis(20));
                enigo.key(Key::F4, Direction::Click).ok();
                std::thread::sleep(std::time::Duration::from_millis(20));
                enigo.key(Key::Alt, Direction::Release).ok();
            }
            #[cfg(target_os = "macos")]
            {
                enigo.key(Key::Meta, Direction::Press).ok();
                std::thread::sleep(std::time::Duration::from_millis(20));
                enigo.key(Key::Unicode('w'), Direction::Click).ok();
                std::thread::sleep(std::time::Duration::from_millis(20));
                enigo.key(Key::Meta, Direction::Release).ok();
            }
            Ok(())
        }
        "switch" => {
            // Alt+Tab
            enigo.key(Key::Alt, Direction::Press).ok();
            std::thread::sleep(std::time::Duration::from_millis(20));
            enigo.key(Key::Tab, Direction::Click).ok();
            std::thread::sleep(std::time::Duration::from_millis(100));
            enigo.key(Key::Alt, Direction::Release).ok();
            Ok(())
        }
        "snap_left" => {
            // Win+Left
            enigo.key(Key::Meta, Direction::Press).ok();
            std::thread::sleep(std::time::Duration::from_millis(20));
            enigo.key(Key::LeftArrow, Direction::Click).ok();
            std::thread::sleep(std::time::Duration::from_millis(20));
            enigo.key(Key::Meta, Direction::Release).ok();
            Ok(())
        }
        "snap_right" => {
            // Win+Right
            enigo.key(Key::Meta, Direction::Press).ok();
            std::thread::sleep(std::time::Duration::from_millis(20));
            enigo.key(Key::RightArrow, Direction::Click).ok();
            std::thread::sleep(std::time::Duration::from_millis(20));
            enigo.key(Key::Meta, Direction::Release).ok();
            Ok(())
        }
        "show_desktop" => {
            // Win+D
            enigo.key(Key::Meta, Direction::Press).ok();
            std::thread::sleep(std::time::Duration::from_millis(20));
            enigo.key(Key::Unicode('d'), Direction::Click).ok();
            std::thread::sleep(std::time::Duration::from_millis(20));
            enigo.key(Key::Meta, Direction::Release).ok();
            Ok(())
        }
        "restore" => {
            // Win+Up then Win+Down to restore from minimized/maximized
            enigo.key(Key::Meta, Direction::Press).ok();
            std::thread::sleep(std::time::Duration::from_millis(20));
            enigo.key(Key::UpArrow, Direction::Click).ok();
            std::thread::sleep(std::time::Duration::from_millis(50));
            enigo.key(Key::DownArrow, Direction::Click).ok();
            std::thread::sleep(std::time::Duration::from_millis(20));
            enigo.key(Key::Meta, Direction::Release).ok();
            Ok(())
        }
        _ => Err(format!("Unknown window action: {}", window_action)),
    };
    
    match result {
        Ok(()) => Ok(CommandResult {
            success: true,
            message: format!("Window: {}", window_action),
            output: None,
        }),
        Err(e) => Err(e),
    }
}

// ============ Clipboard Action Helpers ============

async fn execute_clipboard_action(action: &ActionResult, state: &State<'_, AppState>) -> Result<CommandResult, String> {
    // Get current clipboard content
    let content = {
        let clipboard = state.clipboard.lock().await;
        clipboard.get_current()?
    };

    if content.trim().is_empty() {
        return Ok(CommandResult {
            success: false,
            message: "Clipboard is empty".to_string(),
            output: None,
        });
    }

    let operation = match action.action_type {
        ActionType::ClipboardFormat => "format",
        ActionType::ClipboardTranslate => "translate",
        ActionType::ClipboardSummarize => "summarize",
        ActionType::ClipboardClean => "clean",
        _ => return Err("Invalid clipboard action".to_string()),
    };

    // Process with LLM
    let client = GroqClient::new();
    let result = client.process_clipboard(&content, operation, &action.payload).await?;

    // Set the result back to clipboard
    {
        let clipboard = state.clipboard.lock().await;
        clipboard.set_content(result.clone())?;
    }

    Ok(CommandResult {
        success: true,
        message: format!("Clipboard {}: done", operation),
        output: Some(result),
    })
}

// ============ Integration Action Helpers ============

async fn execute_spotify_action(action: &ActionResult, state: &State<'_, AppState>) -> Result<CommandResult, String> {
    let integrations = state.integrations.lock().await;
    
    let spotify_action = action.payload.get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("play_pause");
    
    let spotify_action_id = format!("spotify_{}", spotify_action);
    
    match integrations.execute("spotify", &spotify_action_id, &action.payload) {
        Ok(result) => Ok(CommandResult {
            success: result.success,
            message: result.message,
            output: result.data.map(|d| d.to_string()),
        }),
        Err(e) => Err(e),
    }
}

async fn execute_discord_action(action: &ActionResult, state: &State<'_, AppState>) -> Result<CommandResult, String> {
    let integrations = state.integrations.lock().await;
    
    let discord_action = action.payload.get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("mute");
    
    let discord_action_id = format!("discord_{}", discord_action);
    
    match integrations.execute("discord", &discord_action_id, &action.payload) {
        Ok(result) => Ok(CommandResult {
            success: result.success,
            message: result.message,
            output: result.data.map(|d| d.to_string()),
        }),
        Err(e) => Err(e),
    }
}

async fn execute_system_action(action: &ActionResult, state: &State<'_, AppState>) -> Result<CommandResult, String> {
    let integrations = state.integrations.lock().await;
    
    let system_action = action.payload.get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("lock");
    
    let system_action_id = format!("system_{}", system_action);
    
    match integrations.execute("system", &system_action_id, &action.payload) {
        Ok(result) => Ok(CommandResult {
            success: result.success,
            message: result.message,
            output: result.data.map(|d| d.to_string()),
        }),
        Err(e) => Err(e),
    }
}

// ============ Custom Command Execution ============

async fn execute_custom_command(action: &ActionResult, state: &State<'_, AppState>) -> Result<CommandResult, String> {
    // Get command ID from payload
    let command_id = action.payload.get("command_id")
        .and_then(|v| v.as_str());
    
    let trigger_phrase = action.payload.get("trigger_phrase")
        .and_then(|v| v.as_str());
    
    // Load custom commands store
    let store = custom::CustomCommandsStore::new()?;
    
    // Find the command either by ID or trigger phrase
    let command = if let Some(id) = command_id {
        store.get_all_commands()?
            .into_iter()
            .find(|c| c.id == id && c.enabled)
    } else if let Some(trigger) = trigger_phrase {
        store.find_by_trigger(trigger)?
    } else {
        return Err("No command ID or trigger phrase provided".to_string());
    };
    
    let command = match command {
        Some(cmd) => cmd,
        None => return Err("Custom command not found or disabled".to_string()),
    };
    
    log::info!("Executing custom command: {} ({})", command.name, command.id);
    
    // Execute each action step in sequence
    let mut success_count = 0;
    let total_steps = command.actions.len();
    
    for (i, step) in command.actions.iter().enumerate() {
        log::info!("Step {}/{}: {} - {:?}", i + 1, total_steps, step.action_type, step.payload);
        
        // Apply delay before step (except for first step)
        if step.delay_ms > 0 {
            tokio::time::sleep(tokio::time::Duration::from_millis(step.delay_ms as u64)).await;
        }
        
        // Map action_type string to ActionType enum and execute
        let step_action_type = match step.action_type.as_str() {
            "open_app" => ActionType::OpenApp,
            "open_url" => ActionType::OpenUrl,
            "web_search" => ActionType::WebSearch,
            "run_command" => ActionType::RunCommand,
            "type_text" => ActionType::TypeText,
            "volume_control" => ActionType::VolumeControl,
            "spotify_control" => ActionType::SpotifyControl,
            "discord_control" => ActionType::DiscordControl,
            "system_control" => ActionType::SystemControl,
            _ => {
                log::warn!("Unknown action type in custom command: {}", step.action_type);
                continue;
            }
        };
        
        let step_result = ActionResult {
            action_type: step_action_type,
            payload: step.payload.clone(),
            refined_text: step.payload.get("text").and_then(|v| v.as_str()).map(|s| s.to_string()),
            response_text: None,
            requires_confirmation: false,
        };
        
        // Execute the step (recursively call execute_action_internal)
        match Box::pin(execute_action_internal(&step_result, state)).await {
            Ok(result) => {
                if result.success {
                    success_count += 1;
                }
                log::info!("Step {}/{} completed: {}", i + 1, total_steps, result.message);
            }
            Err(e) => {
                log::warn!("Step {}/{} failed: {}", i + 1, total_steps, e);
            }
        }
    }
    
    // Record usage
    if let Err(e) = store.record_usage(&command.id) {
        log::warn!("Failed to record command usage: {}", e);
    }
    
    Ok(CommandResult {
        success: success_count > 0,
        message: format!("Executed '{}': {}/{} steps completed", command.name, success_count, total_steps),
        output: None,
    })
}

// ============ Conversation Commands ============

/// Get conversation history
#[tauri::command]
pub async fn get_conversation(state: State<'_, AppState>) -> Result<Vec<crate::conversation::Message>, String> {
    let conversation = state.conversation.lock().await;
    Ok(conversation.messages.clone())
}

/// Clear conversation history
#[tauri::command]
pub async fn clear_conversation(state: State<'_, AppState>) -> Result<(), String> {
    let mut conversation = state.conversation.lock().await;
    conversation.clear();
    Ok(())
}

/// Start a new conversation session
#[tauri::command]
pub async fn new_conversation_session(state: State<'_, AppState>) -> Result<String, String> {
    let mut conversation = state.conversation.lock().await;
    
    // Save current session
    if let Ok(store_guard) = state.conversation_store.lock() {
        if let Some(ref store) = *store_guard {
            let _ = store.save_session(&conversation);
        }
    }
    
    // Create new session
    *conversation = crate::conversation::ConversationMemory::new_session();
    Ok(conversation.session_id.clone())
}

// ============ Clipboard Commands ============

/// Get clipboard content
#[tauri::command]
pub async fn get_clipboard(state: State<'_, AppState>) -> Result<String, String> {
    let clipboard = state.clipboard.lock().await;
    clipboard.get_current()
}

/// Set clipboard content
#[tauri::command]
pub async fn set_clipboard(state: State<'_, AppState>, content: String) -> Result<(), String> {
    let clipboard = state.clipboard.lock().await;
    clipboard.set_content(content)
}

/// Get clipboard history
#[tauri::command]
pub async fn get_clipboard_history(state: State<'_, AppState>, limit: Option<usize>) -> Result<Vec<crate::clipboard::ClipboardEntry>, String> {
    let clipboard = state.clipboard.lock().await;
    Ok(clipboard.get_history(limit.unwrap_or(20)))
}

// ============ Integration Commands ============

/// Get list of available integrations
#[tauri::command]
pub async fn get_integrations(state: State<'_, AppState>) -> Result<Vec<crate::integrations::IntegrationInfo>, String> {
    let integrations = state.integrations.lock().await;
    Ok(integrations.list_integrations())
}

/// Enable or disable an integration
#[tauri::command]
pub async fn set_integration_enabled(
    state: State<'_, AppState>,
    name: String,
    enabled: bool,
) -> Result<bool, String> {
    let mut integrations = state.integrations.lock().await;
    Ok(integrations.set_enabled(&name, enabled))
}

// ============ Context Commands ============

/// Set voice mode (dictation or command)
#[tauri::command]
pub async fn set_voice_context(
    state: State<'_, AppState>,
    active_app: Option<String>,
    selected_text: Option<String>,
    mode: String,
) -> Result<bool, String> {
    let mut context = state.current_context.lock().await;
    
    context.active_app = active_app;
    context.selected_text = selected_text;
    context.mode = match mode.as_str() {
        "command" => VoiceMode::Command,
        _ => VoiceMode::Dictation,
    };
    context.timestamp = chrono::Utc::now().to_rfc3339();
    
    Ok(true)
}

/// Get current voice context
#[tauri::command]
pub async fn get_voice_context(state: State<'_, AppState>) -> Result<VoiceContext, String> {
    let context = state.current_context.lock().await;
    Ok(context.clone())
}

// ============ Configuration Commands ============

#[tauri::command]
pub async fn get_config(state: State<'_, AppState>) -> Result<crate::config::AppConfig, String> {
    let config = state.config.lock().await;
    Ok(config.clone())
}

#[tauri::command]
pub async fn set_config(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
    config: crate::config::AppConfig,
) -> Result<bool, String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
    use std::str::FromStr;

    let mut current_config = state.config.lock().await;
    
    // Check if hotkey changed
    if current_config.trigger_hotkey != config.trigger_hotkey {
        let new_shortcut_str = &config.trigger_hotkey;
        
        log::info!("Updating hotkey from '{}' to '{}'", current_config.trigger_hotkey, new_shortcut_str);

        // Unregister all existing shortcuts to be safe
        let _ = app.global_shortcut().unregister_all();
        log::info!("Unregistered all previous shortcuts");

        // Register new
        if let Ok(new_shortcut) = Shortcut::from_str(new_shortcut_str) {
            match app.global_shortcut().register(new_shortcut) {
                Ok(_) => log::info!("Successfully registered new shortcut: {}", new_shortcut_str),
                Err(e) => log::error!("Failed to register new shortcut: {}", e),
            }
        } else {
            log::error!("Failed to parse new shortcut string: {}", new_shortcut_str);
        }
    }

    *current_config = config;
    Ok(true)
}

// ============ Custom Commands ============

/// Get all custom commands
#[tauri::command]
pub async fn get_custom_commands() -> Result<Vec<custom::CustomCommand>, String> {
    let store = custom::CustomCommandsStore::new()?;
    store.get_all_commands()
}

/// Get built-in command templates
#[tauri::command]
pub async fn get_command_templates() -> Result<Vec<custom::CustomCommand>, String> {
    Ok(custom::get_builtin_templates())
}

/// Save a custom command
#[tauri::command]
pub async fn save_custom_command(command: custom::CustomCommand) -> Result<(), String> {
    let store = custom::CustomCommandsStore::new()?;
    store.save_command(&command)
}

/// Delete a custom command
#[tauri::command]
pub async fn delete_custom_command(id: String) -> Result<(), String> {
    let store = custom::CustomCommandsStore::new()?;
    store.delete_command(&id)
}

/// Enable or disable a custom command
#[tauri::command]
pub async fn set_custom_command_enabled(id: String, enabled: bool) -> Result<(), String> {
    let store = custom::CustomCommandsStore::new()?;
    store.set_enabled(&id, enabled)
}

/// Export all custom commands to JSON
#[tauri::command]
pub async fn export_custom_commands() -> Result<String, String> {
    let store = custom::CustomCommandsStore::new()?;
    store.export_commands()
}

/// Import custom commands from JSON
#[tauri::command]
pub async fn import_custom_commands(json: String) -> Result<usize, String> {
    let store = custom::CustomCommandsStore::new()?;
    store.import_commands(&json)
}
