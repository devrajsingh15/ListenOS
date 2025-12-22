const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const WS_URL = API_URL.replace("http", "ws");

// ============ Types ============

export interface TranscriptionResult {
  text: string;
  is_final: boolean;
  confidence: number | null;
}

export interface IntentResponse {
  intent: "dictation" | "command";
  confidence: number;
  original_text: string;
}

export interface FormatResponse {
  formatted_text: string;
  original_text: string;
}

export type FormattingStyle = "formal" | "casual" | "verycasual";

// ============ Health Check ============

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// ============ Intent Classification ============

export async function classifyIntent(text: string): Promise<IntentResponse> {
  const response = await fetch(`${API_URL}/api/intent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`Intent classification failed: ${response.statusText}`);
  }

  return response.json();
}

// ============ Text Formatting ============

export async function formatText(
  text: string,
  style: FormattingStyle = "formal"
): Promise<FormatResponse> {
  const response = await fetch(`${API_URL}/api/format`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, style }),
  });

  if (!response.ok) {
    throw new Error(`Text formatting failed: ${response.statusText}`);
  }

  return response.json();
}

// ============ WebSocket Transcription ============

export class TranscriptionWebSocket {
  private ws: WebSocket | null = null;
  private onTranscription: (result: TranscriptionResult) => void;
  private onError: (error: Error) => void;
  private onClose: () => void;

  constructor(
    onTranscription: (result: TranscriptionResult) => void,
    onError: (error: Error) => void = console.error,
    onClose: () => void = () => {}
  ) {
    this.onTranscription = onTranscription;
    this.onError = onError;
    this.onClose = onClose;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`${WS_URL}/ws/transcribe`);

        this.ws.onopen = () => {
          console.log("WebSocket connected to transcription service");
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const result: TranscriptionResult = JSON.parse(event.data);
            this.onTranscription(result);
          } catch (e) {
            console.error("Failed to parse transcription result:", e);
          }
        };

        this.ws.onerror = (event) => {
          this.onError(new Error("WebSocket error"));
          reject(new Error("WebSocket connection failed"));
        };

        this.ws.onclose = () => {
          console.log("WebSocket closed");
          this.onClose();
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  sendAudio(audioData: ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(audioData);
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// ============ Audio Recording Utility ============

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;

  async start(onAudioData: (data: ArrayBuffer) => void): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.source = this.audioContext.createMediaStreamSource(this.stream);

      // Create a script processor for raw audio data
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        // Convert float32 to int16
        const int16Data = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        onAudioData(int16Data.buffer);
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
    } catch (error) {
      console.error("Failed to start audio recording:", error);
      throw error;
    }
  }

  stop(): void {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }
}

