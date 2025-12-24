//! System Controls Integration for ListenOS
//!
//! Provides extended system controls including brightness, power,
//! bluetooth, wifi, and notifications.

use super::{AppIntegration, IntegrationAction, IntegrationResult, ActionParameter};
use std::process::Command;

pub struct SystemControlsIntegration;

impl SystemControlsIntegration {
    pub fn new() -> Self {
        Self
    }

    /// Execute a PowerShell command and return output
    fn run_powershell(script: &str) -> Result<String, String> {
        #[cfg(windows)]
        {
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

        #[cfg(not(windows))]
        Err("System controls only supported on Windows".to_string())
    }

    /// Set display brightness (0-100)
    fn set_brightness(level: u32) -> Result<(), String> {
        let level = level.min(100);
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
        Ok(())
    }

    /// Get current brightness level
    fn get_brightness() -> Result<u32, String> {
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

    /// Toggle night light (Windows 10/11)
    fn toggle_night_light() -> Result<(), String> {
        // Open Night Light settings
        Command::new("cmd")
            .args(["/C", "start", "ms-settings:nightlight"])
            .spawn()
            .map_err(|e| format!("Failed to open night light settings: {}", e))?;
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
            Ok(())
        }

        #[cfg(not(windows))]
        Err("Lock screen not supported on this platform".to_string())
    }

    /// Put computer to sleep
    fn sleep() -> Result<(), String> {
        Self::run_powershell("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)")?;
        Ok(())
    }

    /// Shutdown the computer
    fn shutdown(delay_seconds: u32) -> Result<(), String> {
        let cmd = format!("shutdown /s /t {}", delay_seconds);
        Command::new("cmd")
            .args(["/C", &cmd])
            .spawn()
            .map_err(|e| format!("Failed to initiate shutdown: {}", e))?;
        Ok(())
    }

    /// Restart the computer
    fn restart(delay_seconds: u32) -> Result<(), String> {
        let cmd = format!("shutdown /r /t {}", delay_seconds);
        Command::new("cmd")
            .args(["/C", &cmd])
            .spawn()
            .map_err(|e| format!("Failed to initiate restart: {}", e))?;
        Ok(())
    }

    /// Cancel pending shutdown
    fn cancel_shutdown() -> Result<(), String> {
        Command::new("cmd")
            .args(["/C", "shutdown", "/a"])
            .spawn()
            .map_err(|e| format!("Failed to cancel shutdown: {}", e))?;
        Ok(())
    }

    /// Toggle Do Not Disturb (Focus Assist on Windows)
    fn toggle_dnd() -> Result<(), String> {
        // Open Focus Assist settings
        Command::new("cmd")
            .args(["/C", "start", "ms-settings:quiethours"])
            .spawn()
            .map_err(|e| format!("Failed to open Focus Assist settings: {}", e))?;
        Ok(())
    }

    /// Open Bluetooth settings
    fn open_bluetooth_settings() -> Result<(), String> {
        Command::new("cmd")
            .args(["/C", "start", "ms-settings:bluetooth"])
            .spawn()
            .map_err(|e| format!("Failed to open Bluetooth settings: {}", e))?;
        Ok(())
    }

    /// Open WiFi settings
    fn open_wifi_settings() -> Result<(), String> {
        Command::new("cmd")
            .args(["/C", "start", "ms-settings:network-wifi"])
            .spawn()
            .map_err(|e| format!("Failed to open WiFi settings: {}", e))?;
        Ok(())
    }

    /// Toggle WiFi on/off
    fn toggle_wifi(enable: Option<bool>) -> Result<String, String> {
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
        Ok(output.trim().to_string())
    }

    /// Toggle Bluetooth on/off
    fn toggle_bluetooth(enable: Option<bool>) -> Result<String, String> {
        // Use PowerShell to toggle Bluetooth radio
        // This uses the Windows.Devices.Radios API
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
                [Windows.Devices.Radios.RadioState,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null
                $radios = Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus])
                $radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
                $bluetooth = $radios | Where-Object { $_.Kind -eq 'Bluetooth' }
                if ($bluetooth) {
                    Await ($bluetooth.SetStateAsync('On')) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null
                    Write-Output "Bluetooth enabled"
                } else {
                    Write-Error "No Bluetooth radio found"
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
                [Windows.Devices.Radios.RadioState,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null
                $radios = Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus])
                $radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])  
                $bluetooth = $radios | Where-Object { $_.Kind -eq 'Bluetooth' }
                if ($bluetooth) {
                    Await ($bluetooth.SetStateAsync('Off')) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null
                    Write-Output "Bluetooth disabled"
                } else {
                    Write-Error "No Bluetooth radio found"
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
                [Windows.Devices.Radios.RadioState,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null
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
                } else {
                    Write-Error "No Bluetooth radio found"
                }
            "#,
        };
        let output = Self::run_powershell(script)?;
        Ok(output.trim().to_string())
    }

    /// Empty recycle bin
    fn empty_recycle_bin() -> Result<(), String> {
        let script = "Clear-RecycleBin -Force -ErrorAction SilentlyContinue";
        Self::run_powershell(script)?;
        Ok(())
    }

    /// Take a screenshot
    fn take_screenshot() -> Result<String, String> {
        // Use Snipping Tool
        Command::new("cmd")
            .args(["/C", "start", "ms-screenclip:"])
            .spawn()
            .map_err(|e| format!("Failed to open screenshot tool: {}", e))?;
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
        cfg!(windows)
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
                    "disable notifications".to_string(),
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
                        description: "true to enable, false to disable, omit to toggle".to_string(),
                    },
                ],
                example_phrases: vec![
                    "turn on bluetooth".to_string(),
                    "turn off bluetooth".to_string(),
                    "enable bluetooth".to_string(),
                    "disable bluetooth".to_string(),
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
                    "enable wifi".to_string(),
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
                description: "Empty the recycle bin".to_string(),
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
                
                // Default: show current brightness
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
                Ok(IntegrationResult::success("Opened Focus Assist settings"))
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
                Ok(IntegrationResult::success("Recycle bin emptied"))
            }
            
            _ => Err(format!("Unknown system action: {}", action)),
        }
    }
}
