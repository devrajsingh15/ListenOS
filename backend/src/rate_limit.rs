//! Rate limiting for API calls
//!
//! Prevents abuse and protects against runaway API costs.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Rate limit configuration
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    /// Maximum requests per window
    pub max_requests: u32,
    /// Window duration
    pub window: Duration,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            max_requests: 30,  // 30 requests
            window: Duration::from_secs(60), // per minute
        }
    }
}

/// Rate limit bucket for tracking requests
#[derive(Debug)]
struct Bucket {
    requests: Vec<Instant>,
    window: Duration,
    max_requests: u32,
}

impl Bucket {
    fn new(config: &RateLimitConfig) -> Self {
        Self {
            requests: Vec::new(),
            window: config.window,
            max_requests: config.max_requests,
        }
    }

    /// Check if a request is allowed and record it
    fn check_and_record(&mut self) -> Result<(), RateLimitError> {
        let now = Instant::now();
        
        // Remove old requests outside the window
        self.requests.retain(|&t| now.duration_since(t) < self.window);
        
        // Check if we're at the limit
        if self.requests.len() >= self.max_requests as usize {
            let oldest = self.requests.first().copied();
            let retry_after = oldest
                .map(|t| self.window.saturating_sub(now.duration_since(t)))
                .unwrap_or(self.window);
            
            return Err(RateLimitError {
                retry_after,
                limit: self.max_requests,
            });
        }
        
        // Record this request
        self.requests.push(now);
        Ok(())
    }

    /// Get remaining requests in current window
    fn remaining(&mut self) -> u32 {
        let now = Instant::now();
        self.requests.retain(|&t| now.duration_since(t) < self.window);
        self.max_requests.saturating_sub(self.requests.len() as u32)
    }
}

/// Rate limit error
#[derive(Debug, Clone)]
pub struct RateLimitError {
    pub retry_after: Duration,
    pub limit: u32,
}

impl std::fmt::Display for RateLimitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Rate limit exceeded ({} requests/min). Please wait {} seconds.",
            self.limit,
            self.retry_after.as_secs()
        )
    }
}

impl std::error::Error for RateLimitError {}

/// Global rate limiter
pub struct RateLimiter {
    buckets: Mutex<HashMap<String, Bucket>>,
    default_config: RateLimitConfig,
    configs: HashMap<String, RateLimitConfig>,
}

impl RateLimiter {
    /// Create a new rate limiter with default config
    pub fn new() -> Self {
        let mut configs = HashMap::new();
        
        // STT (transcription) - more generous
        configs.insert("stt".to_string(), RateLimitConfig {
            max_requests: 60,
            window: Duration::from_secs(60),
        });
        
        // LLM (action parsing) - standard
        configs.insert("llm".to_string(), RateLimitConfig {
            max_requests: 30,
            window: Duration::from_secs(60),
        });
        
        // General API - conservative
        configs.insert("api".to_string(), RateLimitConfig {
            max_requests: 100,
            window: Duration::from_secs(60),
        });

        Self {
            buckets: Mutex::new(HashMap::new()),
            default_config: RateLimitConfig::default(),
            configs,
        }
    }

    /// Check if a request is allowed for a given key
    pub fn check(&self, key: &str) -> Result<(), RateLimitError> {
        let mut buckets = self.buckets.lock().unwrap();
        
        let config = self.configs.get(key).unwrap_or(&self.default_config);
        let bucket = buckets.entry(key.to_string()).or_insert_with(|| Bucket::new(config));
        
        bucket.check_and_record()
    }

    /// Get remaining requests for a key
    pub fn remaining(&self, key: &str) -> u32 {
        let mut buckets = self.buckets.lock().unwrap();
        
        let config = self.configs.get(key).unwrap_or(&self.default_config);
        let bucket = buckets.entry(key.to_string()).or_insert_with(|| Bucket::new(config));
        
        bucket.remaining()
    }
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

// Global singleton
lazy_static::lazy_static! {
    pub static ref RATE_LIMITER: RateLimiter = RateLimiter::new();
}

/// Check rate limit for STT requests
pub fn check_stt_limit() -> Result<(), String> {
    RATE_LIMITER.check("stt").map_err(|e| e.to_string())
}

/// Check rate limit for LLM requests
pub fn check_llm_limit() -> Result<(), String> {
    RATE_LIMITER.check("llm").map_err(|e| e.to_string())
}

/// Check rate limit for general API requests
pub fn check_api_limit() -> Result<(), String> {
    RATE_LIMITER.check("api").map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rate_limit() {
        let limiter = RateLimiter::new();
        
        // Should allow requests up to limit
        for _ in 0..30 {
            assert!(limiter.check("test").is_ok());
        }
        
        // Should reject after limit
        assert!(limiter.check("test").is_err());
    }
}
