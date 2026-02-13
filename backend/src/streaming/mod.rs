//! Real-time audio streaming module
//! 
//! Captures microphone audio and accumulates it for processing.
//! Cross-platform support for Windows, macOS, and Linux.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{Arc, Mutex, atomic::{AtomicBool, AtomicU32, Ordering}};

/// Audio chunk for streaming (100ms of audio at 16kHz = 1600 samples)
#[allow(dead_code)]
pub const CHUNK_SIZE_MS: u32 = 100;
pub const SAMPLE_RATE: u32 = 16000;
#[allow(dead_code)]
pub const CHUNK_SAMPLES: usize = (SAMPLE_RATE * CHUNK_SIZE_MS / 1000) as usize;

/// Audio streaming state - thread-safe implementation
pub struct AudioStreamer {
    is_recording: Arc<AtomicBool>,
    sample_rate: u32,
    accumulated_samples: Arc<Mutex<Vec<f32>>>,
    live_level_bits: Arc<AtomicU32>,
    // Store stream handle to keep it alive
    stream_handle: Arc<Mutex<Option<StreamHandle>>>,
}

/// Wrapper to hold the stream (cpal::Stream is not Send on some platforms)
struct StreamHandle {
    stream: cpal::Stream,
}

// Safety: We ensure the stream is only accessed from the thread that created it
unsafe impl Send for StreamHandle {}
unsafe impl Sync for StreamHandle {}

impl AudioStreamer {
    pub fn new() -> Self {
        Self {
            is_recording: Arc::new(AtomicBool::new(false)),
            sample_rate: SAMPLE_RATE,
            accumulated_samples: Arc::new(Mutex::new(Vec::with_capacity(SAMPLE_RATE as usize * 30))),
            live_level_bits: Arc::new(AtomicU32::new(0.0_f32.to_bits())),
            stream_handle: Arc::new(Mutex::new(None)),
        }
    }

    fn is_handsfree_device_name(name: &str) -> bool {
        let n = name.to_lowercase();
        n.contains("hands-free")
            || n.contains("hands free")
            || n.contains("ag audio")
            || n.contains("hfp")
            || n.contains("hsp")
    }

    fn get_device_name(device: &cpal::Device) -> String {
        device.name().unwrap_or_else(|_| "Unknown".to_string())
    }

    fn find_input_device_by_name(
        host: &cpal::Host,
        preferred_name: &str,
    ) -> Result<Option<cpal::Device>, String> {
        let wanted = preferred_name.trim().to_lowercase();
        if wanted.is_empty() {
            return Ok(None);
        }

        let mut match_device = None;
        let devices = host
            .input_devices()
            .map_err(|e| format!("Failed to enumerate input devices: {}", e))?;
        for device in devices {
            let name = Self::get_device_name(&device).to_lowercase();
            if name == wanted {
                match_device = Some(device);
                break;
            }
        }

        Ok(match_device)
    }

    fn select_input_device(
        host: &cpal::Host,
        preferred_device_name: Option<&str>,
    ) -> Result<cpal::Device, String> {
        if let Some(preferred) = preferred_device_name {
            if let Some(device) = Self::find_input_device_by_name(host, preferred)? {
                log::info!("Using preferred input device: {}", Self::get_device_name(&device));
                return Ok(device);
            }
            log::warn!(
                "Preferred input device '{}' not found, falling back to automatic selection",
                preferred
            );
        }

        let default_device = host.default_input_device();
        let default_name = default_device.as_ref().map(Self::get_device_name);

        if let Some(default) = default_device {
            if let Some(name) = default_name.as_ref() {
                // On many Bluetooth headsets, opening the Hands-Free input can steal output audio route.
                // If user didn't explicitly pick a mic, prefer a non-handsfree input when available.
                if Self::is_handsfree_device_name(name) {
                    let devices = host
                        .input_devices()
                        .map_err(|e| format!("Failed to enumerate input devices: {}", e))?;
                    for device in devices {
                        let candidate_name = Self::get_device_name(&device);
                        if !Self::is_handsfree_device_name(&candidate_name) {
                            log::warn!(
                                "Default input '{}' looks like Bluetooth hands-free. Using '{}' to avoid output audio hijack.",
                                name,
                                candidate_name
                            );
                            return Ok(device);
                        }
                    }
                }
            }
            return Ok(default);
        }

        // Last-resort fallback.
        let mut devices = host
            .input_devices()
            .map_err(|e| format!("Failed to enumerate input devices: {}", e))?;
        devices
            .next()
            .ok_or_else(|| "No input device available. Please check microphone permissions.".to_string())
    }

    /// Start recording audio directly to internal buffer
    pub fn start_streaming(
        &self,
        preferred_device_name: Option<&str>,
    ) -> Result<crossbeam_channel::Receiver<Vec<f32>>, String> {
        if self.is_recording.load(Ordering::SeqCst) {
            return Err("Already recording".to_string());
        }

        // Clear previous samples
        if let Ok(mut samples) = self.accumulated_samples.lock() {
            samples.clear();
        }
        self.live_level_bits.store(0.0_f32.to_bits(), Ordering::Relaxed);

        let (sender, receiver) = crossbeam_channel::unbounded::<Vec<f32>>();
        
        let is_recording = self.is_recording.clone();
        let accumulated = self.accumulated_samples.clone();
        let live_level = self.live_level_bits.clone();
        let sample_rate = self.sample_rate;
        let stream_handle = self.stream_handle.clone();

        is_recording.store(true, Ordering::SeqCst);

        // Build stream on current thread (important for macOS)
        let host = cpal::default_host();
        
        log::info!("Audio host: {}", host.id().name());
        
        let device = match Self::select_input_device(&host, preferred_device_name) {
            Ok(d) => d,
            Err(e) => {
                is_recording.store(false, Ordering::SeqCst);
                return Err(e);
            }
        };

        let device_name = device.name().unwrap_or_else(|_| "Unknown".to_string());
        log::info!("Using input device: {}", device_name);

        // Get supported config and try to match our desired sample rate
        let supported_config = device.default_input_config()
            .map_err(|e| format!("Failed to get default input config: {}", e))?;
        
        log::info!("Default config: {:?}", supported_config);

        // Try to use our desired sample rate, fall back to device default
        let config = cpal::StreamConfig {
            channels: 1,
            sample_rate: cpal::SampleRate(sample_rate),
            buffer_size: cpal::BufferSize::Default,
        };

        let is_rec = is_recording.clone();
        let acc = accumulated.clone();
        let sender_clone = sender;

        // Build the input stream
        let stream = device.build_input_stream(
            &config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if !is_rec.load(Ordering::SeqCst) {
                    live_level.store(0.0_f32.to_bits(), Ordering::Relaxed);
                    return;
                }

                if !data.is_empty() {
                    let rms = (data.iter().map(|s| s * s).sum::<f32>() / data.len() as f32).sqrt();
                    let peak = data
                        .iter()
                        .map(|s| s.abs())
                        .fold(0.0_f32, |acc, value| acc.max(value));
                    let active_ratio = data
                        .iter()
                        .filter(|sample| sample.abs() > 0.012)
                        .count() as f32
                        / data.len() as f32;

                    let raw_level = if rms < 0.0012 && peak < 0.01 {
                        0.0
                    } else {
                        ((rms * 12.0) + (peak * 1.8) + (active_ratio * 2.2))
                            .clamp(0.0, 1.0)
                            .powf(0.9)
                    };

                    // Light smoothing for stability without lag.
                    let previous = f32::from_bits(live_level.load(Ordering::Relaxed));
                    let smoothed = (previous * 0.22 + raw_level * 0.78).clamp(0.0, 1.0);
                    live_level.store(smoothed.to_bits(), Ordering::Relaxed);
                }

                // Add to accumulated buffer (use try_lock to avoid blocking)
                if let Ok(mut samples) = acc.try_lock() {
                    samples.extend_from_slice(data);
                }

                // Send chunk to receiver (non-blocking)
                let chunk = data.to_vec();
                let _ = sender_clone.try_send(chunk);
            },
            move |err| {
                log::error!("Audio stream error: {}", err);
            },
            None,
        ).map_err(|e| {
            is_recording.store(false, Ordering::SeqCst);
            format!("Failed to build audio stream: {}. Check microphone permissions.", e)
        })?;

        // Start the stream
        stream.play().map_err(|e| {
            is_recording.store(false, Ordering::SeqCst);
            format!("Failed to start audio stream: {}", e)
        })?;

        // Store stream handle to keep it alive
        if let Ok(mut handle) = stream_handle.lock() {
            *handle = Some(StreamHandle { stream });
        }

        log::info!("Audio streaming started at {} Hz", sample_rate);

        Ok(receiver)
    }

    /// Stop streaming
    pub fn stop_streaming(&self) {
        self.is_recording.store(false, Ordering::SeqCst);
        self.live_level_bits.store(0.0_f32.to_bits(), Ordering::Relaxed);
        
        // Drop the stream handle to stop recording
        if let Ok(mut handle) = self.stream_handle.lock() {
            if let Some(active) = handle.take() {
                let _ = active.stream.pause();
            }
        }
        
        log::info!("Audio streaming stopped");
    }

    /// Check if currently streaming
    pub fn is_streaming(&self) -> bool {
        self.is_recording.load(Ordering::SeqCst)
    }

    /// Get accumulated samples
    pub fn get_accumulated_samples(&self) -> Vec<f32> {
        self.accumulated_samples.lock()
            .map(|s| s.clone())
            .unwrap_or_default()
    }

    /// Clear accumulated samples
    pub fn clear_samples(&self) {
        if let Ok(mut samples) = self.accumulated_samples.lock() {
            samples.clear();
        }
        self.live_level_bits.store(0.0_f32.to_bits(), Ordering::Relaxed);
    }

    /// Get current live audio level from the capture callback (0.0-1.0).
    pub fn get_live_level(&self) -> f32 {
        f32::from_bits(self.live_level_bits.load(Ordering::Relaxed)).clamp(0.0, 1.0)
    }
}

impl Default for AudioStreamer {
    fn default() -> Self {
        Self::new()
    }
}

/// Accumulator that collects audio until recording stops
pub struct AudioAccumulator {
    samples: Vec<f32>,
    sample_rate: u32,
}

impl AudioAccumulator {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            samples: Vec::with_capacity(sample_rate as usize * 30), // 30 seconds max
            sample_rate,
        }
    }

    /// Add samples to the accumulator
    pub fn add_samples(&mut self, samples: &[f32]) {
        self.samples.extend_from_slice(samples);
    }

    /// Get all accumulated samples
    pub fn get_samples(&self) -> &[f32] {
        &self.samples
    }

    /// Clear the accumulator
    pub fn clear(&mut self) {
        self.samples.clear();
    }

    /// Get sample rate
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
}
