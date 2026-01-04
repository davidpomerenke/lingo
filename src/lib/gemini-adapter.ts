/**
 * Gemini Live API Adapter
 * 
 * Implements the LiveProvider interface for Google's Gemini Live API.
 * Uses the @google/genai SDK for WebSocket communication.
 */

import { GoogleGenAI, LiveServerMessage, Modality, Session, Blob as GeminiBlob, FunctionDeclaration, Type } from "@google/genai";
import type { LiveProvider, LiveProviderConfig, LiveProviderCallbacks, FunctionDefinition, FunctionResult } from "./live-provider";
import { blobToBase64, base64ToPcmBlob } from "./audio-utils";
import { reportErrorToBackend } from "./utils";

// Map our function definitions to Gemini's format
function toGeminiFunctionDeclarations(functions?: FunctionDefinition[]): FunctionDeclaration[] | undefined {
  if (!functions || functions.length === 0) return undefined;
  
  return functions.map(fn => ({
    name: fn.name,
    description: fn.description,
    parameters: {
      type: Type.OBJECT,
      properties: Object.fromEntries(
        Object.entries(fn.parameters.properties).map(([key, value]) => [
          key,
          {
            type: value.type === "string" ? Type.STRING : 
                  value.type === "number" ? Type.NUMBER :
                  value.type === "boolean" ? Type.BOOLEAN :
                  value.type === "array" ? Type.ARRAY : Type.STRING,
            description: value.description,
            enum: value.enum,
          }
        ])
      ),
      required: fn.parameters.required,
    },
  }));
}

export class GeminiLiveAdapter implements LiveProvider {
  readonly providerType = "gemini" as const;
  
  private ai: GoogleGenAI;
  private session: Session | null = null;
  private callbacks: LiveProviderCallbacks;
  private config: LiveProviderConfig;
  private connectionOpen = false;  // Track actual WebSocket state

  constructor(config: LiveProviderConfig, callbacks: LiveProviderCallbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;
    
    // Ephemeral tokens start with "auth_tokens/" and require v1alpha API version
    const isEphemeralToken = config.apiKey.startsWith("auth_tokens/");
    this.ai = new GoogleGenAI({ 
      apiKey: config.apiKey,
      ...(isEphemeralToken && { httpOptions: { apiVersion: "v1alpha" } }),
    });
  }

  async connect(): Promise<void> {
    const model = "models/gemini-2.5-flash-native-audio-preview-12-2025";

    // Build tools config if functions are defined
    const tools = this.config.functions ? [{
      functionDeclarations: toGeminiFunctionDeclarations(this.config.functions),
    }] : undefined;

    const sessionConfig = {
      responseModalities: [Modality.AUDIO],
      systemInstruction: this.config.systemInstruction,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: this.config.voiceName || "Kore",
          },
        },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      tools,
    };

    this.session = await this.ai.live.connect({
      model,
      config: sessionConfig,
      callbacks: {
        onopen: () => {
          this.connectionOpen = true;
          this.callbacks.onOpen?.();
        },
        onmessage: (message: LiveServerMessage) => {
          this.handleMessage(message);
        },
        onerror: (e: ErrorEvent) => {
          console.error("Gemini Live Error:", e.message);
          this.connectionOpen = false;
          
          // Check for quota-related errors
          const errorMessage = e.message || "";
          const isQuotaError = errorMessage.includes("RESOURCE_EXHAUSTED") || 
                               errorMessage.includes("quota") ||
                               errorMessage.includes("billing");
          
          if (isQuotaError) {
            reportErrorToBackend("gemini", "RESOURCE_EXHAUSTED", errorMessage);
            this.callbacks.onError?.(new Error("Gemini API quota exceeded. Please try OpenAI instead."));
          } else {
            this.callbacks.onError?.(new Error(e.message));
          }
        },
        onclose: () => {
          this.connectionOpen = false;
          this.callbacks.onClose?.();
        },
      },
    });
  }

  private handleMessage(message: LiveServerMessage): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageAny = message as any;

    // Handle tool calls (per Gemini Live API docs - comes as message.toolCall)
    if (messageAny.toolCall?.functionCalls) {
      for (const fc of messageAny.toolCall.functionCalls) {
        this.callbacks.onFunctionCall?.({
          id: fc.id || crypto.randomUUID(),
          name: fc.name || "",
          arguments: (fc.args as Record<string, unknown>) || {},
        });
      }
    }

    // Handle model audio responses
    if (message.serverContent?.modelTurn?.parts) {
      for (const part of message.serverContent.modelTurn.parts) {
        if (part.inlineData && part.inlineData.data) {
          const blob = base64ToPcmBlob(part.inlineData.data, 24000);
          this.callbacks.onAudio?.(blob);
        }
        
        // Also check for function calls in parts (legacy/alternative format)
        if (part.functionCall) {
          this.callbacks.onFunctionCall?.({
            id: part.functionCall.id || crypto.randomUUID(),
            name: part.functionCall.name || "",
            arguments: (part.functionCall.args as Record<string, unknown>) || {},
          });
        }
      }
    }

    // Handle transcriptions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serverContentAny = message.serverContent as any;
    if (serverContentAny?.inputTranscription?.text) {
      this.callbacks.onUserTranscript?.(serverContentAny.inputTranscription.text);
    }
    if (serverContentAny?.outputTranscription?.text) {
      this.callbacks.onModelTranscript?.(serverContentAny.outputTranscription.text);
    }

    if (message.serverContent?.turnComplete) {
      this.callbacks.onTurnComplete?.();
    }
  }

  sendPrompt(text: string): void {
    if (!this.session) return;
    
    this.session.sendClientContent({
      turns: [
        {
          role: "user",
          parts: [{ text }],
        },
      ],
      turnComplete: true,
    });
  }

  sendHistoryAndPrompt(
    history: Array<{ role: "user" | "assistant"; content: string }>,
    prompt: string
  ): void {
    if (!this.session) return;

    // Convert history to turns format
    const turns = history.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    // Add the prompt as the final user turn
    turns.push({
      role: "user",
      parts: [{ text: prompt }],
    });

    this.session.sendClientContent({
      turns,
      turnComplete: true,
    });
  }

  async sendAudio(audioBlob: Blob): Promise<void> {
    // Check both session existence and connection state
    if (!this.session || !this.isConnected()) return;
    
    try {
      const base64Data = await blobToBase64(audioBlob);
      
      const audioData: GeminiBlob = {
        mimeType: "audio/pcm;rate=16000",
        data: base64Data,
      };
      
      this.session.sendRealtimeInput({
        audio: audioData,
      });
    } catch (err) {
      // Silently ignore WebSocket closed errors - they're expected during disconnect
      const errMsg = String(err);
      if (!errMsg.includes("CLOSING") && !errMsg.includes("CLOSED")) {
        console.error("Error sending audio:", err);
      }
    }
  }

  sendFunctionResult(result: FunctionResult): void {
    if (!this.session || !this.connectionOpen) return;
    
    try {
      this.session.sendToolResponse({
        functionResponses: [{
          id: result.callId,
          name: result.name,
          response: result.result as Record<string, unknown>,
        }],
      });
    } catch (err) {
      // Silently ignore if connection is closed
      const errMsg = String(err);
      if (!errMsg.includes("CLOSING") && !errMsg.includes("CLOSED")) {
        console.error("Error sending function result:", err);
      }
    }
  }

  disconnect(): void {
    this.connectionOpen = false;
    if (this.session) {
      this.session.close();
      this.session = null;
    }
  }

  isConnected(): boolean {
    return this.session !== null && this.connectionOpen;
  }
}

// Re-export for backwards compatibility
export { pcmBlobToFloat32Array } from "./audio-utils";

