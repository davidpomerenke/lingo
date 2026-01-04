/**
 * OpenAI Realtime API Adapter
 * 
 * Implements the LiveProvider interface for OpenAI's Realtime API.
 * Uses direct WebSocket connection to OpenAI's realtime endpoint.
 * 
 * Key differences from Gemini:
 * - Uses event-based protocol over WebSocket
 * - Audio format: 24kHz PCM16 (same as Gemini output)
 * - Input audio: 24kHz PCM16 (different from Gemini's 16kHz)
 * - Function calling via tools configuration
 */

import type { 
  LiveProvider, 
  LiveProviderConfig, 
  LiveProviderCallbacks, 
  FunctionDefinition, 
  FunctionResult 
} from "./live-provider";
import { blobToBase64, base64ToPcmBlob } from "./audio-utils";
import { reportErrorToBackend } from "./utils";

// OpenAI Realtime event types
interface RealtimeEvent {
  type: string;
  [key: string]: unknown;
}

interface SessionConfig {
  modalities: string[];
  instructions: string;
  voice: string;
  input_audio_format: string;
  output_audio_format: string;
  input_audio_transcription: { model: string; language?: string } | null;
  turn_detection: { type: string; threshold?: number; silence_duration_ms?: number } | null;
  tools?: Array<{
    type: "function";
    name: string;
    description: string;
    parameters: object;
  }>;
}

// Voice mapping from Gemini names to OpenAI names
const VOICE_MAP: Record<string, string> = {
  "Kore": "alloy",
  "Zephyr": "shimmer",
  "Puck": "echo",
  "Charon": "onyx",
  "Fenrir": "fable",
  "Aoede": "nova",
};

export class OpenAIRealtimeAdapter implements LiveProvider {
  readonly providerType = "openai" as const;
  
  private ws: WebSocket | null = null;
  private callbacks: LiveProviderCallbacks;
  private config: LiveProviderConfig;
  private sessionReadyResolve: (() => void) | null = null;
  private sessionReadyPromise: Promise<void> | null = null;
  private pendingSessionUpdateResolve: (() => void) | null = null;
  
  // Transcript ordering: buffer AI transcript until user transcript arrives
  private waitingForUserTranscript = false;
  private bufferedModelTranscript: string[] = [];

  constructor(config: LiveProviderConfig, callbacks: LiveProviderCallbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17";
      
      this.ws = new WebSocket(url, [
        "realtime",
        `openai-insecure-api-key.${this.config.apiKey}`,
        "openai-beta.realtime-v1",
      ]);

      this.ws.onopen = async () => {
        await this.configureSession();
        this.callbacks.onOpen?.();
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as RealtimeEvent;
          this.handleEvent(data);
        } catch (err) {
          console.error("Error parsing message:", err);
        }
      };

      this.ws.onerror = (event) => {
        console.error("OpenAI Realtime Error:", event);
        this.callbacks.onError?.(new Error("WebSocket error"));
        reject(new Error("WebSocket error"));
      };

      this.ws.onclose = () => {
        this.callbacks.onClose?.();
      };
    });
  }

  private async configureSession(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Create a promise that will resolve when session.updated is received
    this.sessionReadyPromise = new Promise((resolve) => {
      this.sessionReadyResolve = resolve;
    });

    // Map voice name
    const voice = VOICE_MAP[this.config.voiceName || "Kore"] || "alloy";

    // Build tools config
    const tools = this.config.functions?.map(fn => ({
      type: "function" as const,
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters,
    }));

    const sessionConfig: SessionConfig = {
      modalities: ["audio", "text"], // audio first is required for audio output
      instructions: this.config.systemInstruction,
      voice,
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      input_audio_transcription: { 
        model: "whisper-1",
        ...(this.config.inputLanguage && { language: this.config.inputLanguage }),
      },
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        silence_duration_ms: 500,
      },
      tools,
    };
    
    this.send({
      type: "session.update",
      session: sessionConfig,
    });

    // Wait for session.updated confirmation
    await this.sessionReadyPromise;
  }

  private handleEvent(event: RealtimeEvent): void {
    switch (event.type) {
      case "session.created":
        break;

      case "session.updated":
        // Resolve the session ready promise (initial configuration)
        if (this.sessionReadyResolve) {
          this.sessionReadyResolve();
          this.sessionReadyResolve = null;
        }
        // Resolve any pending session update promise (for history updates)
        if (this.pendingSessionUpdateResolve) {
          this.pendingSessionUpdateResolve();
          this.pendingSessionUpdateResolve = null;
        }
        break;

      case "response.audio.delta":
        // Audio chunk received - convert base64 to blob and send immediately
        if (event.delta && typeof event.delta === "string") {
          const blob = base64ToPcmBlob(event.delta, 24000);
          this.callbacks.onAudio?.(blob);
        }
        break;

      case "response.audio_transcript.delta":
        // Model speech transcription
        if (event.delta && typeof event.delta === "string") {
          if (this.waitingForUserTranscript) {
            // Buffer until user transcript arrives to maintain correct order
            this.bufferedModelTranscript.push(event.delta);
          } else {
            this.callbacks.onModelTranscript?.(event.delta);
          }
        }
        break;

      case "conversation.item.input_audio_transcription.completed":
        // User speech transcription completed
        if (event.transcript && typeof event.transcript === "string") {
          // First emit the user transcript
          this.callbacks.onUserTranscript?.(event.transcript);
          
          // Then flush any buffered model transcript (in correct order now)
          if (this.bufferedModelTranscript.length > 0) {
            const buffered = this.bufferedModelTranscript.join("");
            this.bufferedModelTranscript = [];
            this.callbacks.onModelTranscript?.(buffered);
          }
          
          this.waitingForUserTranscript = false;
        }
        break;

      case "response.done": {
        // Check if the response failed
        const response = event.response as { status?: string; status_details?: { error?: { type?: string; message?: string } } } | undefined;
        if (response?.status === "failed" && response?.status_details?.error) {
          const error = response.status_details.error;
          const errorMessage = error.message || "Unknown error";
          const errorType = error.type || "unknown";
          
          console.error("OpenAI: Response failed:", errorType, errorMessage);
          
          // Report quota errors to backend for admin notification
          if (errorType === "insufficient_quota") {
            reportErrorToBackend("openai", errorType, errorMessage);
          }
          
          // Create user-friendly error message
          let userMessage = errorMessage;
          if (errorType === "insufficient_quota") {
            userMessage = "OpenAI API quota exceeded. Please try Gemini instead.";
          }
          
          this.callbacks.onError?.(new Error(userMessage));
        }
        
        this.callbacks.onTurnComplete?.();
        break;
      }

      case "response.function_call_arguments.done":
        // Function call received
        if (event.name && typeof event.name === "string") {
          try {
            const args = JSON.parse((event.arguments as string) || "{}");
            this.callbacks.onFunctionCall?.({
              id: (event.call_id as string) || crypto.randomUUID(),
              name: event.name,
              arguments: args,
            });
          } catch {
            // Ignore parse errors for malformed function arguments
          }
        }
        break;

      case "error":
        console.error("OpenAI Realtime Error:", event.error);
        this.callbacks.onError?.(new Error(JSON.stringify(event.error)));
        break;

      case "input_audio_buffer.speech_started":
        // User started speaking - mark that we're waiting for their transcript
        this.waitingForUserTranscript = true;
        break;

      // Silently ignore these common events
      case "response.created":
      case "response.output_item.added":
      case "response.content_part.added":
      case "response.content_part.done":
      case "response.output_item.done":
      case "response.audio.done":
      case "response.audio_transcript.done":
      case "response.text.delta":
      case "response.text.done":
      case "input_audio_buffer.speech_stopped":
      case "input_audio_buffer.committed":
      case "conversation.item.created":
      case "conversation.item.input_audio_transcription.failed":
      case "rate_limits.updated":
        break;

      default:
        break;
    }
  }

  private send(event: RealtimeEvent): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  sendPrompt(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Create a conversation item with the user message
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text,
          },
        ],
      },
    });

    // Request a response with audio output (audio must be first)
    this.send({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
      },
    });
  }

  async sendHistoryAndPrompt(
    history: Array<{ role: "user" | "assistant"; content: string }>,
    prompt: string
  ): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // IMPORTANT: For OpenAI Realtime API, sending history as conversation.item.create
    // causes the model to switch to text-only mode. Instead, we include history
    // in the system instructions to preserve audio output.
    
    if (history.length > 0) {
      // Limit history to last ~20 messages to avoid token limits
      const recentHistory = history.slice(-20);
      const recentHistoryText = recentHistory
        .map(msg => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
        .join("\n");
      
      // Update session with history in instructions
      const updatedInstructions = `${this.config.systemInstruction}

--- Previous Conversation ---
${recentHistoryText}
--- End of Previous Conversation ---

Continue the conversation naturally based on the above context.`;

      // Create a promise to wait for session.updated
      const sessionUpdatePromise = new Promise<void>((resolve) => {
        this.pendingSessionUpdateResolve = resolve;
      });

      this.send({
        type: "session.update",
        session: {
          instructions: updatedInstructions,
        },
      });

      // Wait for session to be updated before sending prompt
      await sessionUpdatePromise;
    }

    // Add the prompt as a single conversation item
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt,
          },
        ],
      },
    });

    // Request a response with audio output (audio must be first)
    this.send({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
      },
    });
  }

  async sendAudio(audioBlob: Blob): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    try {
      // OpenAI expects 24kHz audio, but we're recording at 16kHz
      // For now, we'll send as-is and rely on OpenAI to handle it
      // TODO: Implement proper resampling from 16kHz to 24kHz
      const base64Data = await blobToBase64(audioBlob);

      this.send({
        type: "input_audio_buffer.append",
        audio: base64Data,
      });
    } catch (err) {
      console.error("Error sending audio:", err);
    }
  }

  sendFunctionResult(result: FunctionResult): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: result.callId,
        output: JSON.stringify(result.result),
      },
    });

    // Request a response with audio output after function result (audio must be first)
    this.send({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
      },
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.waitingForUserTranscript = false;
    this.bufferedModelTranscript = [];
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // Update transcription language mid-session
  updateInputLanguage(language: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    this.send({
      type: "session.update",
      session: {
        input_audio_transcription: {
          model: "whisper-1",
          language,
        },
      },
    });
  }
}

