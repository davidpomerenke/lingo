/**
 * Unified interface for realtime voice AI providers (Gemini, OpenAI, etc.)
 * 
 * Both Gemini Live and OpenAI Realtime have similar structures:
 * - WebSocket-based connection
 * - Audio streaming (input/output)
 * - Transcription support
 * - Function calling
 * - Turn-based conversation
 */

export type ProviderType = "gemini" | "openai";

// Function definition for function calling
export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

// Function call from the model
export interface FunctionCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// Function result to send back
export interface FunctionResult {
  callId: string;
  result: unknown;
}

export interface LiveProviderConfig {
  apiKey: string;
  voiceName?: string;
  systemInstruction: string;
  functions?: FunctionDefinition[];
  inputLanguage?: string; // ISO-639-1 language code for expected user audio (e.g., "en", "ja", "ar")
}

export interface LiveProviderCallbacks {
  onOpen?: () => void;
  onAudio?: (audioData: Blob) => void;
  onUserTranscript?: (text: string) => void;
  onModelTranscript?: (text: string) => void;
  onTurnComplete?: () => void;
  onFunctionCall?: (call: FunctionCall) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

/**
 * Abstract interface that both Gemini and OpenAI adapters implement
 */
export interface LiveProvider {
  readonly providerType: ProviderType;
  
  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  
  // Audio streaming
  sendAudio(audioBlob: Blob): Promise<void>;
  
  // Text prompts
  sendPrompt(text: string): void;
  sendHistoryAndPrompt(
    history: Array<{ role: "user" | "assistant"; content: string }>,
    prompt: string
  ): void;
  
  // Function calling
  sendFunctionResult(result: FunctionResult): void;
  
  // Update transcription language (for mid-session language switches)
  updateInputLanguage?(language: string): void;
}

