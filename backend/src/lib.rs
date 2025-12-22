//! ListenOS - AI-Powered Voice Control System
//! 
//! Dual-window architecture:
//! - Dashboard: Main app for settings, stats, and AI management
//! - Assistant: Always-running overlay that appears on hotkey press

mod audio;
mod commands;
mod ai;
mod system;
mod config;
mod cloud;
mod streaming;
mod conversation;
mod clipboard;
mod integrations;

use tauri::{
    Emitter, Manager, AppHandle,
    tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent},
    menu::{Menu, MenuItem},
};
use tauri_plugin_global_shortcut::ShortcutState;
use std::sync::Arc;
use tokio::sync::Mutex;

pub use audio::AudioState;
pub use commands::*;
pub use config::AppConfig;
pub use cloud::{CloudConfig, VoiceContext, VoiceMode};
pub use streaming::{AudioStreamer, AudioAccumulator, SAMPLE_RATE};
pub use conversation::{ConversationMemory, ConversationStore, Message, Role, Fact};
pub use clipboard::ClipboardService;
pub use integrations::{IntegrationManager, AppIntegration};

/// Global application state
pub struct AppState {
    pub audio: Arc<Mutex<AudioState>>,
    pub config: Arc<Mutex<AppConfig>>,
    pub cloud_config: Arc<Mutex<CloudConfig>>,
    pub streamer: Arc<Mutex<AudioStreamer>>,
    pub accumulator: Arc<Mutex<AudioAccumulator>>,
    pub is_listening: Arc<Mutex<bool>>,
    pub is_processing: Arc<Mutex<bool>>,
    pub current_context: Arc<Mutex<VoiceContext>>,
    pub history: Arc<Mutex<Vec<VoiceProcessingResult>>>,
    // New: Conversation memory for multi-turn dialogues
    pub conversation: Arc<Mutex<ConversationMemory>>,
    pub conversation_store: Arc<std::sync::Mutex<Option<ConversationStore>>>,
    // New: Clipboard service
    pub clipboard: Arc<Mutex<ClipboardService>>,
    // New: App integrations
    pub integrations: Arc<Mutex<IntegrationManager>>,
}

impl Default for AppState {
    fn default() -> Self {
        // Initialize conversation store (may fail, that's ok)
        let conversation_store = ConversationStore::new().ok();
        
        // Load facts from store if available
        let mut conversation = ConversationMemory::new_session();
        if let Some(ref store) = conversation_store {
            if let Ok(facts) = store.load_facts() {
                conversation.extracted_facts = facts;
            }
        }

        Self {
            audio: Arc::new(Mutex::new(AudioState::default())),
            config: Arc::new(Mutex::new(AppConfig::default())),
            cloud_config: Arc::new(Mutex::new(CloudConfig::default())),
            streamer: Arc::new(Mutex::new(AudioStreamer::new())),
            accumulator: Arc::new(Mutex::new(AudioAccumulator::new(SAMPLE_RATE))),
            is_listening: Arc::new(Mutex::new(false)),
            is_processing: Arc::new(Mutex::new(false)),
            current_context: Arc::new(Mutex::new(VoiceContext::default())),
            history: Arc::new(Mutex::new(Vec::new())),
            conversation: Arc::new(Mutex::new(conversation)),
            conversation_store: Arc::new(std::sync::Mutex::new(conversation_store)),
            clipboard: Arc::new(Mutex::new(ClipboardService::new())),
            integrations: Arc::new(Mutex::new(IntegrationManager::new())),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env.local file from project root
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let env_path = std::path::PathBuf::from(manifest_dir).join("../.env.local");
    if env_path.exists() {
        let _ = dotenvy::from_path(&env_path);
    }
    
    let _ = env_logger::try_init();
    log::info!("Starting ListenOS - AI Voice Control System");
    
    // Debug: Check if API keys are loaded
    let groq_key = std::env::var("GROQ_API_KEY").unwrap_or_default();
    log::info!("GROQ_API_KEY loaded: {} chars", groq_key.len());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    let shortcut_str = shortcut.to_string();
                    log::info!("Global shortcut event: {} - {:?}", shortcut_str, event.state);
                    
                    // Emit events to the assistant window (always running in background)
                    if let Some(assistant) = app.get_webview_window("assistant") {
                        if event.state == ShortcutState::Pressed {
                            log::info!("Ctrl+Space pressed - showing assistant");
                            
                            // Ensure transparency on Windows when showing
                            #[cfg(target_os = "windows")]
                            {
                                use tauri::webview::Color;
                                let _ = assistant.set_background_color(Some(Color(0, 0, 0, 0)));
                            }
                            
                            let _ = assistant.show();
                            let _ = assistant.set_focus();
                            let _ = assistant.emit("shortcut-pressed", ());
                        } else if event.state == ShortcutState::Released {
                            log::info!("Ctrl+Space released - processing");
                            let _ = assistant.emit("shortcut-released", ());
                        }
                    }
                })
                .build()
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            // Voice
            commands::start_listening,
            commands::stop_listening,
            commands::get_status,
            // Actions
            commands::type_text,
            commands::run_system_command,
            // Audio
            commands::get_audio_devices,
            commands::set_audio_device,
            // Config
            commands::get_config,
            commands::set_config,
            // Conversation
            commands::get_conversation,
            commands::clear_conversation,
            commands::new_conversation_session,
            // Clipboard
            commands::get_clipboard,
            commands::set_clipboard,
            commands::get_clipboard_history,
            // Integrations
            commands::get_integrations,
            commands::set_integration_enabled,
            // Custom Commands
            commands::get_custom_commands,
            commands::get_command_templates,
            commands::save_custom_command,
            commands::delete_custom_command,
            commands::set_custom_command_enabled,
            commands::export_custom_commands,
            commands::import_custom_commands,
            // Data
            get_history,
            clear_history,
            // Window control
            hide_assistant,
            show_dashboard,
        ])
        .setup(|app| {
            // Register global shortcut on startup
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
            use std::str::FromStr;
            
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async {
                let state = handle.state::<AppState>();
                let config = state.config.lock().await;
                let shortcut_str = &config.trigger_hotkey;
                
                if let Ok(shortcut) = Shortcut::from_str(shortcut_str) {
                    let _ = handle.global_shortcut().register(shortcut);
                    log::info!("Registered startup shortcut: {}", shortcut_str);
                } else {
                    log::warn!("Failed to parse shortcut: {}", shortcut_str);
                }
            });

            // Setup tray icon
            setup_tray(app)?;

            // Dashboard: Hide to tray on close (don't quit app)
            if let Some(dashboard) = app.get_webview_window("dashboard") {
                let dashboard_clone = dashboard.clone();
                dashboard.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = dashboard_clone.hide();
                        log::info!("Dashboard hidden to tray");
                    }
                });
            }

            // Assistant: Start hidden, set transparent background, will show on hotkey
            if let Some(assistant) = app.get_webview_window("assistant") {
                // Set WebView background to transparent (RGBA with 0 alpha)
                #[cfg(target_os = "windows")]
                {
                    use tauri::webview::Color;
                    let _ = assistant.set_background_color(Some(Color(0, 0, 0, 0)));
                }
                let _ = assistant.hide();
                log::info!("Assistant window initialized (hidden, transparent background)");
            }

            log::info!("ListenOS setup complete - dual-window architecture ready");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ListenOS");
}

#[tauri::command]
async fn hide_assistant(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("assistant") {
        let _ = window.hide();
    }
    Ok(())
}

#[tauri::command]
async fn show_dashboard(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("dashboard") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

#[tauri::command]
async fn get_history(state: tauri::State<'_, AppState>) -> Result<Vec<VoiceProcessingResult>, String> {
    let history = state.history.lock().await;
    Ok(history.clone())
}

#[tauri::command]
async fn clear_history(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut history = state.history.lock().await;
    history.clear();
    Ok(())
}

fn setup_tray(app: &mut tauri::App) -> Result<(), tauri::Error> {
    let quit_item = MenuItem::with_id(app, "quit", "Quit ListenOS", true, None::<&str>)?;
    let show_item = MenuItem::with_id(app, "show", "Open Dashboard", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let icon = match app.default_window_icon().cloned() {
        Some(i) => i,
        None => {
            log::warn!("Default window icon not found");
            return Ok(());
        }
    };
    
    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "quit" => app.exit(0),
                "show" => {
                    if let Some(window) = app.get_webview_window("dashboard") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                if let Some(window) = tray.app_handle().get_webview_window("dashboard") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    log::info!("System tray initialized");
    Ok(())
}
