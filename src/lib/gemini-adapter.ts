/**
 * Gemini Live API Adapter
 * 
 * Implements the LiveProvider interface for Google's Gemini Live API.
 * Uses the @google/genai SDK for WebSocket communication.
 */

import { GoogleGenAI, LiveServerMessage, Modality, Session, Blob as GeminiBlob, FunctionDeclaration, Type } from "@google/genai";
import type { LiveProvider, LiveProviderConfig, LiveProviderCallbacks, FunctionDefinition, FunctionResult } from "./live-provider";

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

  constructor(config: LiveProviderConfig, callbacks: LiveProviderCallbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;
    this.ai = new GoogleGenAI({ apiKey: config.apiKey });
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
          console.log("Gemini Live: Connected");
          this.callbacks.onOpen?.();
        },
        onmessage: (message: LiveServerMessage) => {
          this.handleMessage(message);
        },
        onerror: (e: ErrorEvent) => {
          console.error("Gemini Live Error:", e.message);
          this.callbacks.onError?.(new Error(e.message));
        },
        onclose: (e: CloseEvent) => {
          console.log("Gemini Live: Disconnected", e.reason);
          this.callbacks.onClose?.();
        },
      },
    });
  }

  private handleMessage(message: LiveServerMessage): void {
    // Handle model audio responses
    if (message.serverContent?.modelTurn?.parts) {
      for (const part of message.serverContent.modelTurn.parts) {
        if (part.inlineData && part.inlineData.data) {
          const binaryString = atob(part.inlineData.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { 
            type: part.inlineData.mimeType || "audio/pcm;rate=24000" 
          });
          this.callbacks.onAudio?.(blob);
        }
        
        // Handle function calls
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
    if (!this.session) return;
    
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);
      
      const audioData: GeminiBlob = {
        mimeType: "audio/pcm;rate=16000",
        data: base64Data,
      };
      
      this.session.sendRealtimeInput({
        audio: audioData,
      });
    } catch (err) {
      console.error("Error sending audio:", err);
    }
  }

  sendFunctionResult(result: FunctionResult): void {
    if (!this.session) return;
    
    this.session.sendToolResponse({
      functionResponses: [{
        id: result.callId,
        response: result.result as Record<string, unknown>,
      }],
    });
  }

  disconnect(): void {
    if (this.session) {
      this.session.close();
      this.session = null;
    }
  }

  isConnected(): boolean {
    return this.session !== null;
  }
}

// Audio utilities
export function pcmBlobToFloat32Array(blob: Blob): Promise<Float32Array> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      const int16Array = new Int16Array(arrayBuffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }
      resolve(float32Array);
    };
    reader.readAsArrayBuffer(blob);
  });
}

