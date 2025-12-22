//! Real-time audio streaming module
//! 
//! Captures microphone audio and accumulates it for processing.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};

/// Audio chunk for streaming (100ms of audio at 16kHz = 1600 samples)
#[allow(dead_code)]
pub const CHUNK_SIZE_MS: u32 = 100;
pub const SAMPLE_RATE: u32 = 16000;
#[allow(dead_code)]
pub const CHUNK_SAMPLES: usize = (SAMPLE_RATE * CHUNK_SIZE_MS / 1000) as usize;

/// Audio streaming state - simplified for thread safety
pub struct AudioStreamer {
    is_recording: Arc<AtomicBool>,
    sample_rate: u32,
    accumulated_samples: Arc<Mutex<Vec<f32>>>,
}

impl AudioStreamer {
    pub fn new() -> Self {
        Self {
            is_recording: Arc::new(AtomicBool::new(false)),
            sample_rate: SAMPLE_RATE,
            accumulated_samples: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Start recording audio directly to internal buffer
    pub fn start_streaming(&self) -> Result<crossbeam_channel::Receiver<Vec<f32>>, String> {
        if self.is_recording.load(Ordering::SeqCst) {
            return Err("Already recording".to_string());
        }

        // Clear previous samples
        if let Ok(mut samples) = self.accumulated_samples.lock() {
            samples.clear();
        }

        let (sender, receiver) = crossbeam_channel::unbounded::<Vec<f32>>();
        
        let is_recording = self.is_recording.clone();
        let accumulated = self.accumulated_samples.clone();
        let sample_rate = self.sample_rate;

        is_recording.store(true, Ordering::SeqCst);

        // Spawn recording thread
        std::thread::spawn(move || {
            let host = cpal::default_host();
            let device = match host.default_input_device() {
                Some(d) => d,
                None => {
                    log::error!("No input device available");
                    is_recording.store(false, Ordering::SeqCst);
                    return;
                }
            };

            log::info!("Using input device: {}", device.name().unwrap_or_default());

            let config = cpal::StreamConfig {
                channels: 1,
                sample_rate: cpal::SampleRate(sample_rate),
                buffer_size: cpal::BufferSize::Default,
            };

            let is_rec = is_recording.clone();
            let acc = accumulated.clone();
            let sender_clone = sender;

            let stream = match device.build_input_stream(
                &config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if !is_rec.load(Ordering::SeqCst) {
                        return;
                    }

                    // Add to accumulated buffer
                    if let Ok(mut samples) = acc.lock() {
                        samples.extend_from_slice(data);
                    }

                    // Send chunk to receiver
                    let chunk = data.to_vec();
                    let _ = sender_clone.send(chunk);
                },
                move |err| {
                    log::error!("Audio stream error: {}", err);
                },
                None,
            ) {
                Ok(s) => s,
                Err(e) => {
                    log::error!("Failed to build stream: {}", e);
                    is_recording.store(false, Ordering::SeqCst);
                    return;
                }
            };

            if let Err(e) = stream.play() {
                log::error!("Failed to start stream: {}", e);
                is_recording.store(false, Ordering::SeqCst);
                return;
            }

            log::info!("Audio streaming started at {} Hz", sample_rate);

            // Keep stream alive while recording
            while is_recording.load(Ordering::SeqCst) {
                std::thread::sleep(std::time::Duration::from_millis(50));
            }

            drop(stream);
            log::info!("Audio stream stopped");
        });

        // Wait a bit for stream to initialize
        std::thread::sleep(std::time::Duration::from_millis(100));

        Ok(receiver)
    }

    /// Stop streaming
    pub fn stop_streaming(&self) {
        self.is_recording.store(false, Ordering::SeqCst);
        log::info!("Audio streaming stop requested");
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
