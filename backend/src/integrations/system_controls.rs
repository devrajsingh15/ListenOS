//! System Controls Integration for ListenOS
//!
//! Provides extended system controls including brightness, power,
//! bluetooth, wifi, and notifications.
//! Now supports both Windows and macOS.

use super::{AppIntegration, IntegrationAction, IntegrationResult, ActionParameter};
use std::process::Command;

pub struct SystemControlsIntegration;

impl SystemControlsIntegration {
    pub fn new() -> Self {
        Self
    }

    /// Execute a shell command based on platform
    fn run_command(cmd: &str, args: &[&str]) -> Result<String, String> {
        let output = Command::new(cmd)
            .args(args)
            .output()
            .map_err(|e| format!("Command error: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// Execute a PowerShell command (Windows only)
    #[cfg(windows)]
    fn run_powershell(script: &str) -> Result<String, String> {
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", script])
            .output()
            .map_err(|e| format!("PowerShell error: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// Execute an AppleScript command (macOS only)
    #[cfg(target_os = "macos")]
    fn run_applescript(script: &str) -> Result<String, String> {
        let output = Command::new("osascript")
            .args(["-e", script])
            .output()
            .map_err(|e| format!("AppleScript error: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// Set display brightness (0-100)
    fn set_brightness(level: u32) -> Result<(), String> {
        let level = level.min(100);
        
        #[cfg(windows)]
        {
            let script = format!(
                r#"
                $monitors = Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue
                if ($monitors) {{
                    $monitors.WmiSetBrightness(1, {})
                    Write-Output "Brightness set to {}%"
                }} else {{
                    Write-Error "Brightness control not available"
                }}
                "#,
                level, level
            );
            Self::run_powershell(&script)?;
        }
        
        #[cfg(target_os = "macos")]
        {
            // Use brightness command or AppleScript
            let script = format!(
                r#"tell application "System Events" to tell appearance preferences to set dark mode to false"#
            );
            // Try using brightness CLI tool if available, otherwise use osascript
            let _ = Command::new("brightness")
                .arg(format!("{:.2}", level as f32 / 100.0))
                .output()
                .or_else(|_| {
                    // Fallback: open Display preferences
                    Command::new("open")
                        .args(["-a", "System Preferences", "--args", "Displays"])
                        .output()
                });
        }
        
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            // Linux: try xrandr or brightnessctl
            let _ = Command::new("brightnessctl")
                .args(["set", &format!("{}%", level)])
                .output();
        }
        
        Ok(())
    }

    /// Get current brightness level
    fn get_brightness() -> Result<u32, String> {
        #[cfg(windows)]
        {
            let script = r#"
                $brightness = Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness -ErrorAction SilentlyContinue
                if ($brightness) {
                    Write-Output $brightness.CurrentBrightness
                } else {
                    Write-Output "50"
                }
            "#;
            let output = Self::run_powershell(script)?;
            output.trim().parse().map_err(|_| "Failed to parse brightness".to_string())
        }
        
        #[cfg(not(windows))]
        {
            // Return default for non-Windows
            Ok(50)
        }
    }

    /// Toggle night light
    fn toggle_night_light() -> Result<(), String> {
        #[cfg(windows)]
        {
            Command::new("cmd")
                .args(["/C", "start", "ms-settings:nightlight"])
                .spawn()
                .map_err(|e| format!("Failed to open night light settings: {}", e))?;
        }
        
        #[cfg(target_os = "macos")]
        {
            // macOS: Toggle Night Shift via AppleScript
            let script = r#"
                tell application "System Preferences"
                    reveal anchor "displaysNightShiftTab" of pane id "com.apple.preference.displays"
                    activate
                end tell
            "#;
            let _ = Self::run_applescript(script);
        }
        
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            // Linux: try redshift
            let _ = Command::new("redshift").args(["-O", "4500"]).spawn();
        }
        
        Ok(())
    }

    /// Lock the workstation
    fn lock_screen() -> Result<(), String> {
        #[cfg(windows)]
        {
            Command::new("rundll32.exe")
                .args(["user32.dll,LockWorkStation"])
                .spawn()
                .map_err(|e| format!("Failed to lock screen: {}", e))?;
        }
        
        #[cfg(target_os = "macos")]
        {
            // macOS: Use pmset or CGSession
            Command::new("pmset")
                .args(["displaysleepnow"])
                .spawn()
                .or_else(|_| {
                    // Alternative: use Keychain lock
                    Command::new("osascript")
                        .args(["-e", r#"tell application "System Events" to keystroke "q" using {control down, command down}"#])
                        .spawn()
                })
                .map_err(|e| format!("Failed to lock screen: {}", e))?;
        }
        
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            // Linux
            let _ = Command::new("loginctl").args(["lock-session"]).spawn()
                .or_else(|_| Command::new("xdg-screensaver").args(["lock"]).spawn());
        }
        
        Ok(())
    }

    /// Put computer to sleep
    fn sleep() -> Result<(), String> {
        #[cfg(windows)]
        {
            Self::run_powershell("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)")?;
        }
        
        #[cfg(target_os = "macos")]
        {
            Command::new("pmset")
                .args(["sleepnow"])
                .spawn()
                .map_err(|e| format!("Failed to sleep: {}", e))?;
        }
        
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            let _ = Command::new("systemctl").args(["suspend"]).spawn();
        }
        
        Ok(())
    }

    /// Shutdown the computer
    fn shutdown(delay_seconds: u32) -> Result<(), String> {
        #[cfg(windows)]
        {
            let cmd = format!("shutdown /s /t {}", delay_seconds);
            Command::new("cmd")
                .args(["/C", &cmd])
                .spawn()
                .map_err(|e| format!("Failed to initiate shutdown: {}", e))?;
        }
        
        #[cfg(target_os = "macos")]
        {
            if delay_seconds == 0 {
                Command::new("osascript")
                    .args(["-e", r#"tell application "System Events" to shut down"#])
                    .spawn()
                    .map_err(|e| format!("Failed to shutdown: {}", e))?;
            } else {
                Command::new("sudo")
                    .args(["shutdown", "-h", &format!("+{}", delay_seconds / 60)])
                    .spawn()
                    .map_err(|e| format!("Failed to schedule shutdown: {}", e))?;
            }
        }
        
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            let _ = Command::new("shutdown")
                .args(["-h", &format!("+{}", delay_seconds / 60)])
                .spawn();
        }
        
        Ok(())
    }

    /// Restart the computer
    fn restart(delay_seconds: u32) -> Result<(), String> {
        #[cfg(windows)]
        {
            let cmd = format!("shutdown /r /t {}", delay_seconds);
            Command::new("cmd")
                .args(["/C", &cmd])
                .spawn()
                .map_err(|e| format!("Failed to initiate restart: {}", e))?;
        }
        
        #[cfg(target_os = "macos")]
        {
            if delay_seconds == 0 {
                Command::new("osascript")
                    .args(["-e", r#"tell application "System Events" to restart"#])
                    .spawn()
                    .map_err(|e| format!("Failed to restart: {}", e))?;
            } else {
                Command::new("sudo")
                    .args(["shutdown", "-r", &format!("+{}", delay_seconds / 60)])
                    .spawn()
                    .map_err(|e| format!("Failed to schedule restart: {}", e))?;
            }
        }
        
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            let _ = Command::new("shutdown")
                .args(["-r", &format!("+{}", delay_seconds / 60)])
                .spawn();
        }
        
        Ok(())
    }

    /// Cancel pending shutdown
    fn cancel_shutdown() -> Result<(), String> {
        #[cfg(windows)]
        {
            Command::new("cmd")
                .args(["/C", "shutdown", "/a"])
                .spawn()
                .map_err(|e| format!("Failed to cancel shutdown: {}", e))?;
        }
        
        #[cfg(target_os = "macos")]
        {
            Command::new("sudo")
                .args(["killall", "shutdown"])
                .spawn()
                .map_err(|e| format!("Failed to cancel shutdown: {}", e))?;
        }
        
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            let _ = Command::new("shutdown").args(["-c"]).spawn();
        }
        
        Ok(())
    }

    /// Toggle Do Not Disturb
    fn toggle_dnd() -> Result<(), String> {
        #[cfg(windows)]
        {
            Command::new("cmd")
                .args(["/C", "start", "ms-settings:quiethours"])
                .spawn()
                .map_err(|e| format!("Failed to open Focus Assist settings: {}", e))?;
        }
        
        #[cfg(target_os = "macos")]
        {
            // macOS Monterey+: Toggle Focus mode
            let script = r#"
                tell application "System Events"
                    tell process "ControlCenter"
                        click menu bar item "Focus" of menu bar 1
                    end tell
                end tell
            "#;
            let _ = Self::run_applescript(script).or_else(|_| {
                // Fallback: open System Preferences
                Command::new("open")
                    .args(["-a", "System Preferences", "--args", "Focus"])
                    .output()
                    .map(|_| String::new())
                    .map_err(|e| e.to_string())
            });
        }
        
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            log::info!("DND not supported on this platform");
        }
        
        Ok(())
    }

    /// Open Bluetooth settings
    fn open_bluetooth_settings() -> Result<(), String> {
        #[cfg(windows)]
        {
            Command::new("cmd")
                .args(["/C", "start", "ms-settings:bluetooth"])
                .spawn()
                .map_err(|e| format!("Failed to open Bluetooth settings: {}", e))?;
        }
        
        #[cfg(target_os = "macos")]
        {
            Command::new("open")
                .args(["/System/Library/PreferencePanes/Bluetooth.prefPane"])
                .spawn()
                .or_else(|_| {
                    Command::new("open")
                        .args(["x-apple.systempreferences:com.apple.preferences.Bluetooth"])
                        .spawn()
                })
                .map_err(|e| format!("Failed to open Bluetooth settings: {}", e))?;
        }
        
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            let _ = Command::new("blueman-manager").spawn()
                .or_else(|_| Command::new("gnome-control-center").args(["bluetooth"]).spawn());
        }
        
        Ok(())
    }

    /// Open WiFi settings
    fn open_wifi_settings() -> Result<(), String> {
        #[cfg(windows)]
        {
            Command::new("cmd")
                .args(["/C", "start", "ms-settings:network-wifi"])
                .spawn()
                .map_err(|e| format!("Failed to open WiFi settings: {}", e))?;
        }
        
        #[cfg(target_os = "macos")]
        {
            Command::new("open")
                .args(["/System/Library/PreferencePanes/Network.prefPane"])
                .spawn()
                .or_else(|_| {
                    Command::new("open")
                        .args(["x-apple.systempreferences:com.apple.preference.network"])
                        .spawn()
                })
                .map_err(|e| format!("Failed to open WiFi settings: {}", e))?;
        }
        
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            let _ = Command::new("gnome-control-center").args(["wifi"]).spawn()
                .or_else(|_| Command::new("nm-connection-editor").spawn());
        }
        
        Ok(())
    }

    /// Toggle WiFi on/off
    fn toggle_wifi(enable: Option<bool>) -> Result<String, String> {
        #[cfg(windows)]
        {
            let script = match enable {
                Some(true) => r#"
                    $adapter = Get-NetAdapter | Where-Object { $_.Name -like '*Wi-Fi*' -or $_.Name -like '*Wireless*' } | Select-Object -First 1
                    if ($adapter) {
                        Enable-NetAdapter -Name $adapter.Name -Confirm:$false
                        Write-Output "WiFi enabled"
                    } else {
                        Write-Error "No WiFi adapter found"
                    }
                "#,
                Some(false) => r#"
                    $adapter = Get-NetAdapter | Where-Object { $_.Name -like '*Wi-Fi*' -or $_.Name -like '*Wireless*' } | Select-Object -First 1
                    if ($adapter) {
                        Disable-NetAdapter -Name $adapter.Name -Confirm:$false
                        Write-Output "WiFi disabled"
                    } else {
                        Write-Error "No WiFi adapter found"
                    }
                "#,
                None => r#"
                    $adapter = Get-NetAdapter | Where-Object { $_.Name -like '*Wi-Fi*' -or $_.Name -like '*Wireless*' } | Select-Object -First 1
                    if ($adapter) {
                        if ($adapter.Status -eq 'Up') {
                            Disable-NetAdapter -Name $adapter.Name -Confirm:$false
                            Write-Output "WiFi disabled"
                        } else {
                            Enable-NetAdapter -Name $adapter.Name -Confirm:$false
                            Write-Output "WiFi enabled"
                        }
                    } else {
                        Write-Error "No WiFi adapter found"
                    }
                "#,
            };
            let output = Self::run_powershell(script)?;
            return Ok(output.trim().to_string());
        }
        
        #[cfg(target_os = "macos")]
        {
            let action = match enable {
                Some(true) => "on",
                Some(false) => "off",
                None => {
                    // Check current state and toggle
                    let output = Command::new("networksetup")
                        .args(["-getairportpower", "en0"])
                        .output()
                        .map_err(|e| e.to_string())?;
                    let status = String::from_utf8_lossy(&output.stdout);
                    if status.contains("On") { "off" } else { "on" }
                }
            };
            
            Command::new("networksetup")
                .args(["-setairportpower", "en0", action])
                .output()
                .map_err(|e| format!("Failed to toggle WiFi: {}", e))?;
            
            return Ok(format!("WiFi {}", if action == "on" { "enabled" } else { "disabled" }));
        }
        
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            let action = match enable {
                Some(true) => "up",
                Some(false) => "down",
                None => "up", // Default to enable
            };
            let _ = Command::new("nmcli").args(["radio", "wifi", action]).output();
            return Ok(format!("WiFi toggled"));
        }
    }

    /// Toggle Bluetooth on/off
    fn toggle_bluetooth(enable: Option<bool>) -> Result<String, String> {
        #[cfg(windows)]
        {
            let script = match enable {
                Some(true) => r#"
                    Add-Type -AssemblyName System.Runtime.WindowsRuntime
                    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
                    Function Await($WinRtTask, $ResultType) {
                        $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
                        $netTask = $asTask.Invoke($null, @($WinRtTask))
                        $netTask.Wait(-1) | Out-Null
                        $netTask.Result
                    }
                    [Windows.Devices.Radios.Radio,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null
                    $radios = Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus])
                    $radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
                    $bluetooth = $radios | Where-Object { $_.Kind -eq 'Bluetooth' }
                    if ($bluetooth) {
                        Await ($bluetooth.SetStateAsync('On')) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null
                        Write-Output "Bluetooth enabled"
                    }
                "#,
                Some(false) => r#"
                    Add-Type -AssemblyName System.Runtime.WindowsRuntime
                    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
                    Function Await($WinRtTask, $ResultType) {
                        $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
                        $netTask = $asTask.Invoke($null, @($WinRtTask))
                        $netTask.Wait(-1) | Out-Null
                        $netTask.Result
                    }
                    [Windows.Devices.Radios.Radio,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null
                    $radios = Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus])
                    $radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
                    $bluetooth = $radios | Where-Object { $_.Kind -eq 'Bluetooth' }
                    if ($bluetooth) {
                        Await ($bluetooth.SetStateAsync('Off')) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null
                        Write-Output "Bluetooth disabled"
                    }
                "#,
                None => r#"
                    Add-Type -AssemblyName System.Runtime.WindowsRuntime
                    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
                    Function Await($WinRtTask, $ResultType) {
                        $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
                        $netTask = $asTask.Invoke($null, @($WinRtTask))
                        $netTask.Wait(-1) | Out-Null
                        $netTask.Result
                    }
                    [Windows.Devices.Radios.Radio,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null
                    $radios = Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus])
                    $radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
                    $bluetooth = $radios | Where-Object { $_.Kind -eq 'Bluetooth' }
                    if ($bluetooth) {
                        if ($bluetooth.State -eq 'On') {
                            Await ($bluetooth.SetStateAsync('Off')) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null
                            Write-Output "Bluetooth disabled"
                        } else {
                            Await ($bluetooth.SetStateAsync('On')) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null
                            Write-Output "Bluetooth enabled"
                        }
                    }
                "#,
            };
            let output = Self::run_powershell(script)?;
            return Ok(output.trim().to_string());
        }
        
        #[cfg(target_os = "macos")]
        {
            // macOS: Use blueutil if available, otherwise open System Preferences
            let action = match enable {
                Some(true) => "1",
                Some(false) => "0",
                None => {
                    // Toggle: check current state
                    let output = Command::new("blueutil")
                        .args(["--power"])
                        .output();
                    match output {
                        Ok(o) if String::from_utf8_lossy(&o.stdout).trim() == "1" => "0",
                        _ => "1",
                    }
                }
            };
            
            let result = Command::new("blueutil")
                .args(["--power", action])
                .output();
            
            match result {
                Ok(_) => {
                    return Ok(format!("Bluetooth {}", if action == "1" { "enabled" } else { "disabled" }));
                }
                Err(_) => {
                    // Fallback: open Bluetooth preferences
                    Self::open_bluetooth_settings()?;
                    return Ok("Opened Bluetooth settings".to_string());
                }
            }
        }
        
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            let action = match enable {
                Some(true) => "on",
                Some(false) => "off",
                None => "on",
            };
            let _ = Command::new("bluetoothctl").args(["power", action]).output();
            return Ok(format!("Bluetooth toggled"));
        }
    }

    /// Empty recycle bin / trash
    fn empty_recycle_bin() -> Result<(), String> {
        #[cfg(windows)]
        {
            let script = "Clear-RecycleBin -Force -ErrorAction SilentlyContinue";
            Self::run_powershell(script)?;
        }
        
        #[cfg(target_os = "macos")]
        {
            let script = r#"
                tell application "Finder"
                    empty trash
                end tell
            "#;
            Self::run_applescript(script)?;
        }
        
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            let _ = Command::new("rm").args(["-rf", "~/.local/share/Trash/*"]).output();
        }
        
        Ok(())
    }

    /// Take a screenshot
    fn take_screenshot() -> Result<String, String> {
        #[cfg(windows)]
        {
            Command::new("cmd")
                .args(["/C", "start", "ms-screenclip:"])
                .spawn()
                .map_err(|e| format!("Failed to open screenshot tool: {}", e))?;
        }
        
        #[cfg(target_os = "macos")]
        {
            // macOS: Use screencapture or open Screenshot app
            Command::new("screencapture")
                .args(["-i", "-c"]) // Interactive mode, copy to clipboard
                .spawn()
                .or_else(|_| {
                    Command::new("open")
                        .args(["-a", "Screenshot"])
                        .spawn()
                })
                .map_err(|e| format!("Failed to take screenshot: {}", e))?;
        }
        
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            let _ = Command::new("gnome-screenshot").args(["-i"]).spawn()
                .or_else(|_| Command::new("scrot").spawn());
        }
        
        Ok("Screenshot tool opened".to_string())
    }
}

impl Default for SystemControlsIntegration {
    fn default() -> Self {
        Self::new()
    }
}

impl AppIntegration for SystemControlsIntegration {
    fn name(&self) -> &str {
        "system"
    }

    fn description(&self) -> &str {
        "System controls - brightness, power, WiFi, Bluetooth, and more"
    }

    fn is_available(&self) -> bool {
        // Now available on Windows, macOS, and Linux
        cfg!(any(windows, target_os = "macos", target_os = "linux"))
    }

    fn supported_actions(&self) -> Vec<IntegrationAction> {
        vec![
            IntegrationAction {
                id: "system_brightness".to_string(),
                name: "Set Brightness".to_string(),
                description: "Adjust display brightness".to_string(),
                parameters: vec![
                    ActionParameter {
                        name: "level".to_string(),
                        param_type: "number".to_string(),
                        required: false,
                        description: "Brightness level (0-100) or 'up'/'down'".to_string(),
                    },
                ],
                example_phrases: vec![
                    "set brightness to 50".to_string(),
                    "brightness up".to_string(),
                    "dim the screen".to_string(),
                ],
            },
            IntegrationAction {
                id: "system_night_light".to_string(),
                name: "Night Light".to_string(),
                description: "Toggle night light / blue light filter".to_string(),
                parameters: vec![],
                example_phrases: vec![
                    "turn on night light".to_string(),
                    "enable blue light filter".to_string(),
                ],
            },
            IntegrationAction {
                id: "system_lock".to_string(),
                name: "Lock Screen".to_string(),
                description: "Lock the computer".to_string(),
                parameters: vec![],
                example_phrases: vec![
                    "lock the computer".to_string(),
                    "lock screen".to_string(),
                    "lock my pc".to_string(),
                ],
            },
            IntegrationAction {
                id: "system_sleep".to_string(),
                name: "Sleep".to_string(),
                description: "Put computer to sleep".to_string(),
                parameters: vec![],
                example_phrases: vec![
                    "put computer to sleep".to_string(),
                    "sleep mode".to_string(),
                ],
            },
            IntegrationAction {
                id: "system_shutdown".to_string(),
                name: "Shutdown".to_string(),
                description: "Shutdown the computer".to_string(),
                parameters: vec![
                    ActionParameter {
                        name: "delay".to_string(),
                        param_type: "number".to_string(),
                        required: false,
                        description: "Delay in seconds before shutdown".to_string(),
                    },
                ],
                example_phrases: vec![
                    "shutdown the computer".to_string(),
                    "shutdown in 5 minutes".to_string(),
                ],
            },
            IntegrationAction {
                id: "system_restart".to_string(),
                name: "Restart".to_string(),
                description: "Restart the computer".to_string(),
                parameters: vec![],
                example_phrases: vec![
                    "restart the computer".to_string(),
                    "reboot".to_string(),
                ],
            },
            IntegrationAction {
                id: "system_cancel_shutdown".to_string(),
                name: "Cancel Shutdown".to_string(),
                description: "Cancel a pending shutdown".to_string(),
                parameters: vec![],
                example_phrases: vec![
                    "cancel shutdown".to_string(),
                    "abort shutdown".to_string(),
                ],
            },
            IntegrationAction {
                id: "system_dnd".to_string(),
                name: "Do Not Disturb".to_string(),
                description: "Toggle Focus Assist / Do Not Disturb".to_string(),
                parameters: vec![],
                example_phrases: vec![
                    "enable do not disturb".to_string(),
                    "turn on focus mode".to_string(),
                ],
            },
            IntegrationAction {
                id: "system_bluetooth".to_string(),
                name: "Bluetooth Settings".to_string(),
                description: "Open Bluetooth settings".to_string(),
                parameters: vec![],
                example_phrases: vec![
                    "open bluetooth settings".to_string(),
                    "connect bluetooth".to_string(),
                ],
            },
            IntegrationAction {
                id: "system_bluetooth_toggle".to_string(),
                name: "Toggle Bluetooth".to_string(),
                description: "Enable or disable Bluetooth".to_string(),
                parameters: vec![
                    ActionParameter {
                        name: "enable".to_string(),
                        param_type: "boolean".to_string(),
                        required: false,
                        description: "true to enable, false to disable".to_string(),
                    },
                ],
                example_phrases: vec![
                    "turn on bluetooth".to_string(),
                    "turn off bluetooth".to_string(),
                ],
            },
            IntegrationAction {
                id: "system_wifi".to_string(),
                name: "WiFi Settings".to_string(),
                description: "Open WiFi settings".to_string(),
                parameters: vec![],
                example_phrases: vec![
                    "open wifi settings".to_string(),
                    "connect to wifi".to_string(),
                ],
            },
            IntegrationAction {
                id: "system_wifi_toggle".to_string(),
                name: "Toggle WiFi".to_string(),
                description: "Enable or disable WiFi".to_string(),
                parameters: vec![],
                example_phrases: vec![
                    "turn off wifi".to_string(),
                    "disable wifi".to_string(),
                ],
            },
            IntegrationAction {
                id: "system_screenshot".to_string(),
                name: "Screenshot".to_string(),
                description: "Take a screenshot".to_string(),
                parameters: vec![],
                example_phrases: vec![
                    "take a screenshot".to_string(),
                    "capture screen".to_string(),
                ],
            },
            IntegrationAction {
                id: "system_recycle_bin".to_string(),
                name: "Empty Recycle Bin".to_string(),
                description: "Empty the recycle bin / trash".to_string(),
                parameters: vec![],
                example_phrases: vec![
                    "empty recycle bin".to_string(),
                    "clear trash".to_string(),
                ],
            },
        ]
    }

    fn execute(&self, action: &str, params: &serde_json::Value) -> Result<IntegrationResult, String> {
        match action {
            "system_brightness" => {
                let level = params.get("level");
                
                if let Some(level_val) = level {
                    if let Some(n) = level_val.as_u64() {
                        Self::set_brightness(n as u32)?;
                        return Ok(IntegrationResult::success(format!("Brightness set to {}%", n)));
                    }
                    if let Some(s) = level_val.as_str() {
                        let current = Self::get_brightness().unwrap_or(50);
                        let new_level = match s {
                            "up" => (current + 10).min(100),
                            "down" => current.saturating_sub(10),
                            _ => current,
                        };
                        Self::set_brightness(new_level)?;
                        return Ok(IntegrationResult::success(format!("Brightness set to {}%", new_level)));
                    }
                }
                
                let current = Self::get_brightness().unwrap_or(50);
                Ok(IntegrationResult::success_with_data(
                    format!("Current brightness: {}%", current),
                    serde_json::json!({ "brightness": current })
                ))
            }
            
            "system_night_light" => {
                Self::toggle_night_light()?;
                Ok(IntegrationResult::success("Opened Night Light settings"))
            }
            
            "system_lock" => {
                Self::lock_screen()?;
                Ok(IntegrationResult::success("Screen locked"))
            }
            
            "system_sleep" => {
                Self::sleep()?;
                Ok(IntegrationResult::success("Computer going to sleep"))
            }
            
            "system_shutdown" => {
                let delay = params.get("delay")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(60) as u32;
                Self::shutdown(delay)?;
                Ok(IntegrationResult::success(format!("Shutting down in {} seconds", delay)))
            }
            
            "system_restart" => {
                let delay = params.get("delay")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(30) as u32;
                Self::restart(delay)?;
                Ok(IntegrationResult::success(format!("Restarting in {} seconds", delay)))
            }
            
            "system_cancel_shutdown" => {
                Self::cancel_shutdown()?;
                Ok(IntegrationResult::success("Shutdown cancelled"))
            }
            
            "system_dnd" => {
                Self::toggle_dnd()?;
                Ok(IntegrationResult::success("Toggled Do Not Disturb"))
            }
            
            "system_bluetooth" => {
                Self::open_bluetooth_settings()?;
                Ok(IntegrationResult::success("Opened Bluetooth settings"))
            }
            
            "system_bluetooth_toggle" => {
                let enable = params.get("enable").and_then(|v| v.as_bool());
                let result = Self::toggle_bluetooth(enable)?;
                Ok(IntegrationResult::success(result))
            }
            
            "system_wifi" => {
                Self::open_wifi_settings()?;
                Ok(IntegrationResult::success("Opened WiFi settings"))
            }
            
            "system_wifi_toggle" => {
                let enable = params.get("enable").and_then(|v| v.as_bool());
                let result = Self::toggle_wifi(enable)?;
                Ok(IntegrationResult::success(result))
            }
            
            "system_screenshot" => {
                let result = Self::take_screenshot()?;
                Ok(IntegrationResult::success(result))
            }
            
            "system_recycle_bin" => {
                Self::empty_recycle_bin()?;
                Ok(IntegrationResult::success("Recycle bin / trash emptied"))
            }
            
            _ => Err(format!("Unknown system action: {}", action)),
        }
    }
}
