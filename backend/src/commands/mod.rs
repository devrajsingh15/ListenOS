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

    let duration_ms = (samples.len() as u64 * 1000) / sample_rate as u64;
    log::info!("Captured {} samples ({} ms)", samples.len(), duration_ms);

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

    // Transcribe with Groq
    let client = GroqClient::new();
    
    let transcription = match client.transcribe(&wav_data).await {
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
            let mut is_processing = state.is_processing.lock().await;
            *is_processing = false;
            return Err(format!("Transcription failed: {}", e));
        }
    };

    if transcription.text.trim().is_empty() {
        let mut is_processing = state.is_processing.lock().await;
        *is_processing = false;
        return Err("No speech detected.".to_string());
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
        
        let ctx = ConversationContext {
            history: conversation.format_for_llm(),
            last_action: conversation.last_action.clone(),
            last_payload: conversation.last_action_payload.clone(),
            clipboard_preview,
            user_facts: conversation.extracted_facts.iter()
                .map(|f| format!("{}: {}", f.key, f.value))
                .collect(),
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
    let executed = execute_action_internal(&action, &state).await.is_ok();

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
            // TODO: Implement custom command execution
            Ok(CommandResult {
                success: false,
                message: "Custom commands not yet implemented".to_string(),
                output: None,
            })
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
                
                // Map common app names to Windows commands/URIs
                let launch_cmd = match app.as_str() {
                    // Windows Store Apps - use URI schemes
                    "settings" | "windows settings" => "start ms-settings:".to_string(),
                    "store" | "microsoft store" => "start ms-windows-store:".to_string(),
                    "mail" | "outlook" => "start outlookcal:".to_string(),
                    "calendar" => "start outlookcal:".to_string(),
                    "calculator" => "start calculator:".to_string(),
                    "camera" => "start microsoft.windows.camera:".to_string(),
                    "maps" => "start bingmaps:".to_string(),
                    "photos" => "start ms-photos:".to_string(),
                    "clock" | "alarms" => "start ms-clock:".to_string(),
                    "weather" => "start bingweather:".to_string(),
                    
                    // Popular apps with URI schemes
                    "whatsapp" => "start whatsapp:".to_string(),
                    "spotify" => "start spotify:".to_string(),
                    "discord" => "start discord:".to_string(),
                    "slack" => "start slack:".to_string(),
                    "teams" | "microsoft teams" => "start msteams:".to_string(),
                    "zoom" => "start zoommtg:".to_string(),
                    "telegram" => "start tg:".to_string(),
                    
                    // Web-based - open in browser
                    "youtube" => "start https://youtube.com".to_string(),
                    "gmail" => "start https://gmail.com".to_string(),
                    "google" => "start https://google.com".to_string(),
                    "twitter" | "x" => "start https://x.com".to_string(),
                    "facebook" => "start https://facebook.com".to_string(),
                    "instagram" => "start https://instagram.com".to_string(),
                    "linkedin" => "start https://linkedin.com".to_string(),
                    "reddit" => "start https://reddit.com".to_string(),
                    "github" => "start https://github.com".to_string(),
                    "netflix" => "start https://netflix.com".to_string(),
                    
                    // Browsers
                    "chrome" | "google chrome" => "start chrome".to_string(),
                    "firefox" => "start firefox".to_string(),
                    "edge" | "microsoft edge" => "start msedge".to_string(),
                    "brave" => "start brave".to_string(),
                    
                    // Common desktop apps
                    "notepad" => "start notepad".to_string(),
                    "word" | "microsoft word" => "start winword".to_string(),
                    "excel" | "microsoft excel" => "start excel".to_string(),
                    "powerpoint" => "start powerpnt".to_string(),
                    "vscode" | "visual studio code" | "code" => "start code".to_string(),
                    "terminal" | "cmd" | "command prompt" => "start cmd".to_string(),
                    "powershell" => "start powershell".to_string(),
                    "explorer" | "file explorer" | "files" => "start explorer".to_string(),
                    "task manager" => "start taskmgr".to_string(),
                    "control panel" => "start control".to_string(),
                    
                    // Fallback: try to start by name
                    _ => format!("start {}", app),
                };
                
                let result = Command::new("cmd")
                    .args(["/C", &launch_cmd])
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
            
            #[cfg(not(windows))]
            {
                let cmd = format!("open -a \"{}\"", app);
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
    }
}

/// Type text into the active window
#[tauri::command]
pub async fn type_text(text: String) -> Result<CommandResult, String> {
    type_text_internal(text).await
}

async fn type_text_internal(text: String) -> Result<CommandResult, String> {
    use enigo::{Enigo, Keyboard, Settings};
    
    // Small delay to allow user to focus on target input
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create enigo: {}", e))?;
    
    enigo.text(&text)
        .map_err(|e| format!("Failed to type: {}", e))?;
    
    log::info!("Typed: {}", text);
    
    Ok(CommandResult {
        success: true,
        message: format!("Typed: {}", text),
        output: None,
    })
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
        let old_shortcut_str = &current_config.trigger_hotkey;
        let new_shortcut_str = &config.trigger_hotkey;

        // Unregister old
        if let Ok(old_shortcut) = Shortcut::from_str(old_shortcut_str) {
            let _ = app.global_shortcut().unregister(old_shortcut);
        }

        // Register new
        if let Ok(new_shortcut) = Shortcut::from_str(new_shortcut_str) {
            let _ = app.global_shortcut().register(new_shortcut);
            log::info!("Re-registered shortcut: {}", new_shortcut_str);
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
