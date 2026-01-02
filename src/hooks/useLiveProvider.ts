"use client";

/**
 * Unified hook for realtime voice AI providers
 * 
 * This hook abstracts the choice between Gemini and OpenAI,
 * providing a consistent API for audio streaming, transcription,
 * and function calling.
 */

import { useCallback, useRef, useState, useEffect } from "react";
import type { 
  LiveProvider, 
  LiveProviderConfig, 
  ProviderType,
  FunctionDefinition,
  FunctionCall,
  FunctionResult,
} from "@/lib/live-provider";
import { GeminiLiveAdapter } from "@/lib/gemini-adapter";
import { OpenAIRealtimeAdapter } from "@/lib/openai-adapter";
import { useAudioPlayer } from "./useAudioPlayer";
import { useAudioRecorder } from "./useAudioRecorder";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface UseLiveProviderOptions {
  provider: ProviderType;
  voiceName?: string;
  systemInstruction: string;
  functions?: FunctionDefinition[];
  inputLanguage?: string; // ISO-639-1 code for expected user audio language
  onUserTranscript?: (text: string) => void;
  onModelTranscript?: (text: string) => void;
  onFunctionCall?: (call: FunctionCall) => void;
}

export function useLiveProvider(options: UseLiveProviderOptions) {
  const { 
    provider, 
    voiceName, 
    systemInstruction, 
    functions,
    inputLanguage,
    onUserTranscript, 
    onModelTranscript,
    onFunctionCall,
  } = options;
  
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [currentProvider, setCurrentProvider] = useState<ProviderType>(provider);
  const [error, setError] = useState<string | null>(null);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  
  const providerRef = useRef<LiveProvider | null>(null);
  const connectResolveRef = useRef<(() => void) | null>(null);
  // Generation counter to prevent stale callbacks from old providers affecting state
  const providerGenerationRef = useRef(0);
  
  // Audio player uses 24kHz for both providers (both output 24kHz)
  const audioPlayer = useAudioPlayer(24000);
  
  const handleAudioData = useCallback((audioBlob: Blob) => {
    if (providerRef.current?.isConnected()) {
      providerRef.current.sendAudio(audioBlob);
    }
  }, []);
  
  const audioRecorder = useAudioRecorder({
    sampleRate: 16000, // Both providers accept 16kHz input
    onAudioData: handleAudioData,
  });

  // Keep refs for latest callbacks
  const audioRecorderRef = useRef(audioRecorder);
  useEffect(() => {
    audioRecorderRef.current = audioRecorder;
  }, [audioRecorder]);

  const onUserTranscriptRef = useRef(onUserTranscript);
  const onModelTranscriptRef = useRef(onModelTranscript);
  const onFunctionCallRef = useRef(onFunctionCall);
  
  useEffect(() => {
    onUserTranscriptRef.current = onUserTranscript;
    onModelTranscriptRef.current = onModelTranscript;
    onFunctionCallRef.current = onFunctionCall;
  }, [onUserTranscript, onModelTranscript, onFunctionCall]);

  // Build callbacks for provider - extracted to avoid duplication
  // Each callback captures the generation at creation time to prevent stale updates
  const buildCallbacks = useCallback((type: ProviderType, generation: number) => ({
    onOpen: () => {
      // Only update state if this is still the current provider
      if (providerGenerationRef.current !== generation) return;
      setStatus("connected");
      setCurrentProvider(type);
      connectResolveRef.current?.();
      connectResolveRef.current = null;
    },
    onAudio: (audioBlob: Blob) => {
      if (providerGenerationRef.current !== generation) return;
      setIsModelSpeaking(true);
      audioPlayer.queueAudio(audioBlob);
    },
    onUserTranscript: (text: string) => {
      if (providerGenerationRef.current !== generation) return;
      onUserTranscriptRef.current?.(text);
    },
    onModelTranscript: (text: string) => {
      if (providerGenerationRef.current !== generation) return;
      onModelTranscriptRef.current?.(text);
    },
    onTurnComplete: () => {
      if (providerGenerationRef.current !== generation) return;
      setIsModelSpeaking(false);
      // Don't start recording here - wait for audio to finish playing
      // to avoid echo on Android. See useEffect below.
    },
    onFunctionCall: (call: FunctionCall) => {
      if (providerGenerationRef.current !== generation) return;
      onFunctionCallRef.current?.(call);
    },
    onError: (err: Error) => {
      if (providerGenerationRef.current !== generation) return;
      setError(err.message);
      setStatus("error");
    },
    onClose: () => {
      // Only update state if this is still the current provider
      // This prevents old provider's close event from affecting new connection
      if (providerGenerationRef.current !== generation) return;
      setStatus("disconnected");
      setIsModelSpeaking(false);
    },
  }), [audioPlayer]);

  // Track if we should auto-resume recording after model stops
  const shouldResumeRecordingRef = useRef(false);
  
  // Start recording when model is done speaking AND audio finished playing
  // This prevents echo on Android Firefox
  useEffect(() => {
    if (status === "connected" && !isModelSpeaking && !audioPlayer.isPlaying && shouldResumeRecordingRef.current) {
      shouldResumeRecordingRef.current = false;
      audioRecorderRef.current.startRecording();
    }
  }, [status, isModelSpeaking, audioPlayer.isPlaying]);

  // When model starts speaking, mark that we should resume recording after
  useEffect(() => {
    if (isModelSpeaking) {
      shouldResumeRecordingRef.current = true;
    }
  }, [isModelSpeaking]);

  // Store current API key in ref so it persists across connect calls
  const apiKeyRef = useRef<string>("");

  // Create provider instance
  const createProvider = useCallback((type: ProviderType, apiKey: string): LiveProvider => {
    // Increment generation to invalidate callbacks from previous providers
    providerGenerationRef.current += 1;
    const generation = providerGenerationRef.current;
    
    const config: LiveProviderConfig = {
      apiKey,
      voiceName,
      systemInstruction,
      functions,
      inputLanguage,
    };

    const callbacks = buildCallbacks(type, generation);

    if (type === "gemini") {
      return new GeminiLiveAdapter(config, callbacks);
    } else {
      return new OpenAIRealtimeAdapter(config, callbacks);
    }
  }, [voiceName, systemInstruction, functions, inputLanguage, buildCallbacks]);

  // Connect to provider
  const connect = useCallback((apiKey: string, type?: ProviderType): Promise<void> => {
    // Unlock audio playback for iOS Safari - must be called from user gesture
    audioPlayer.unlock();
    
    return new Promise((resolve, reject) => {
      const targetProvider = type || provider;
      
      if (!apiKey) {
        setError("API key is required");
        setStatus("error");
        reject(new Error("API key is required"));
        return;
      }

      if (status === "connecting" || status === "connected") {
        resolve();
        return;
      }

      // Store for later use
      apiKeyRef.current = apiKey;
      
      setStatus("connecting");
      setError(null);
      connectResolveRef.current = resolve;

      providerRef.current = createProvider(targetProvider, apiKey);
      providerRef.current.connect().catch(reject);
    });
  }, [provider, status, createProvider, audioPlayer]);

  // Disconnect
  const disconnect = useCallback(() => {
    audioRecorder.stopRecording();
    audioPlayer.stop();
    providerRef.current?.disconnect();
    providerRef.current = null;
    setStatus("disconnected");
    setIsModelSpeaking(false);
  }, [audioRecorder, audioPlayer]);

  // Switch provider mid-conversation
  const switchProvider = useCallback(async (
    newProvider: ProviderType,
    history: Array<{ role: "user" | "assistant"; content: string }>,
    apiKey: string
  ): Promise<void> => {
    // Disconnect current provider
    audioRecorder.stopRecording();
    audioPlayer.stop();
    providerRef.current?.disconnect();
    providerRef.current = null;
    
    // Store for later use
    apiKeyRef.current = apiKey;
    
    // Create new provider
    setStatus("connecting");
    providerRef.current = createProvider(newProvider, apiKey);
    await providerRef.current.connect();
    
    // Send history to new provider
    if (history.length > 0) {
      providerRef.current.sendHistoryAndPrompt(
        history,
        "<CONTINUE> (You just switched to a different AI provider. Continue the conversation naturally.)"
      );
    }
  }, [audioRecorder, audioPlayer, createProvider]);

  // Start a session
  const startSession = useCallback(async (
    apiKey: string,
    history: Array<{ role: "user" | "assistant"; content: string }> = [],
    contextOrPrompt: string = "",
    isCustomPrompt: boolean = false
  ) => {
    try {
      if (status !== "connected") {
        await connect(apiKey);
      }
      await new Promise(resolve => setTimeout(resolve, 200));
      
      if (isCustomPrompt) {
        if (history.length > 0) {
          providerRef.current?.sendHistoryAndPrompt(history, contextOrPrompt);
        } else {
          providerRef.current?.sendPrompt(contextOrPrompt);
        }
      } else {
        const contextPrefix = contextOrPrompt ? `${contextOrPrompt}\n` : "";
        if (history.length > 0) {
          providerRef.current?.sendHistoryAndPrompt(history, `${contextPrefix}<CONTINUE>`);
        } else {
          providerRef.current?.sendPrompt(`${contextPrefix}<START>`);
        }
      }
    } catch (err) {
      console.error("Failed to start session:", err);
    }
  }, [status, connect]);

  // Start recording
  const startTalking = useCallback(async () => {
    if (status !== "connected") return;
    audioPlayer.stop();
    await audioRecorder.startRecording();
  }, [status, audioRecorder, audioPlayer]);

  // Stop recording
  const stopTalking = useCallback(() => {
    audioRecorder.stopRecording();
  }, [audioRecorder]);

  // Send a text prompt
  const sendPrompt = useCallback((text: string) => {
    if (status !== "connected") return;
    audioRecorder.stopRecording();
    providerRef.current?.sendPrompt(text);
  }, [status, audioRecorder]);

  // Send function result
  const sendFunctionResult = useCallback((result: FunctionResult) => {
    if (status !== "connected") return;
    providerRef.current?.sendFunctionResult(result);
  }, [status]);

  // Update input language mid-session (for transcription)
  const updateInputLanguage = useCallback((language: string) => {
    if (status !== "connected") return;
    providerRef.current?.updateInputLanguage?.(language);
  }, [status]);

  // Combined state: model is "speaking" if generating OR if audio is still playing
  const isSpeakingOrPlaying = isModelSpeaking || audioPlayer.isPlaying;

  return {
    status,
    currentProvider,
    error,
    isRecording: audioRecorder.isRecording,
    isModelSpeaking: isSpeakingOrPlaying, // Use combined state so UI waits for audio to finish
    connect,
    disconnect,
    switchProvider,
    startSession,
    startTalking,
    stopTalking,
    sendPrompt,
    sendFunctionResult,
    updateInputLanguage,
  };
}

