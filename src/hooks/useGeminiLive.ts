"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { GeminiLive, GeminiLiveConfig } from "@/lib/gemini-live";
import { useAudioPlayer } from "./useAudioPlayer";
import { useAudioRecorder } from "./useAudioRecorder";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface UseGeminiLiveOptions {
  apiKey: string;
  voiceName?: string;
  systemInstruction: string;
  onUserTranscript?: (text: string) => void;
  onModelTranscript?: (text: string) => void;
}

export function useGeminiLive(options: UseGeminiLiveOptions) {
  const { apiKey, voiceName, systemInstruction, onUserTranscript, onModelTranscript } = options;
  
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  
  const geminiRef = useRef<GeminiLive | null>(null);
  const connectResolveRef = useRef<(() => void) | null>(null);
  const audioPlayer = useAudioPlayer(24000);
  
  const handleAudioData = useCallback((audioBlob: Blob) => {
    if (geminiRef.current?.isConnected()) {
      geminiRef.current.sendAudio(audioBlob);
    }
  }, []);
  
  const audioRecorder = useAudioRecorder({
    sampleRate: 16000,
    onAudioData: handleAudioData,
  });

  // Keep a ref to audioRecorder so callbacks always have the latest
  const audioRecorderRef = useRef(audioRecorder);
  useEffect(() => {
    audioRecorderRef.current = audioRecorder;
  }, [audioRecorder]);

  // Keep refs for callbacks
  const onUserTranscriptRef = useRef(onUserTranscript);
  const onModelTranscriptRef = useRef(onModelTranscript);
  useEffect(() => {
    onUserTranscriptRef.current = onUserTranscript;
    onModelTranscriptRef.current = onModelTranscript;
  }, [onUserTranscript, onModelTranscript]);

  // Connect to Gemini Live - returns promise that resolves when connected
  const connect = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
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

      setStatus("connecting");
      setError(null);
      connectResolveRef.current = resolve;

      const config: GeminiLiveConfig = {
        apiKey,
        voiceName,
        systemInstruction,
      };

      geminiRef.current = new GeminiLive(config, {
        onOpen: () => {
          setStatus("connected");
          connectResolveRef.current?.();
          connectResolveRef.current = null;
        },
        onAudio: (audioBlob) => {
          setIsModelSpeaking(true);
          audioPlayer.queueAudio(audioBlob);
        },
        onUserTranscript: (text) => {
          onUserTranscriptRef.current?.(text);
        },
        onModelTranscript: (text) => {
          onModelTranscriptRef.current?.(text);
        },
        onTurnComplete: () => {
          setIsModelSpeaking(false);
          // Auto-start recording after AI finishes speaking (use ref for latest)
          audioRecorderRef.current.startRecording();
        },
        onError: (err) => {
          setError(err.message);
          setStatus("error");
          reject(err);
        },
        onClose: () => {
          setStatus("disconnected");
          setIsModelSpeaking(false);
        },
      });

      geminiRef.current.connect().catch(reject);
    });
  }, [apiKey, voiceName, systemInstruction, audioPlayer, status]);

  // Disconnect from Gemini Live
  const disconnect = useCallback(() => {
    audioRecorder.stopRecording();
    audioPlayer.stop();
    geminiRef.current?.disconnect();
    geminiRef.current = null;
    setStatus("disconnected");
    setIsModelSpeaking(false);
  }, [audioRecorder, audioPlayer]);

  // Start a new session - connects and prompts AI to greet or continue
  const startSession = useCallback(async (
    history: Array<{ role: "user" | "assistant"; content: string }> = [],
    context: string = ""
  ) => {
    try {
      if (status !== "connected") {
        await connect();
      }
      // Small delay to ensure session is ready
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const contextPrefix = context ? `${context}\n` : "";
      
      if (history.length > 0) {
        // Resume: send history as context, then continue prompt
        geminiRef.current?.sendHistoryAndPrompt(history, `${contextPrefix}<CONTINUE>`);
      } else {
        // New session: just send start prompt with context
        geminiRef.current?.sendPrompt(`${contextPrefix}<START>`);
      }
    } catch (err) {
      console.error("Failed to start session:", err);
    }
  }, [status, connect]);

  // Start talking - starts recording (must be connected first)
  const startTalking = useCallback(async () => {
    if (status !== "connected") return;
    audioPlayer.stop();
    await audioRecorder.startRecording();
  }, [status, audioRecorder, audioPlayer]);

  // Stop talking
  const stopTalking = useCallback(() => {
    audioRecorder.stopRecording();
  }, [audioRecorder]);

  // Send a text prompt to the AI (e.g., to switch languages)
  const sendPrompt = useCallback((text: string) => {
    if (status !== "connected") return;
    audioRecorder.stopRecording();
    geminiRef.current?.sendPrompt(text);
  }, [status, audioRecorder]);

  return {
    status,
    error,
    isRecording: audioRecorder.isRecording,
    isModelSpeaking,
    startSession,
    disconnect,
    startTalking,
    stopTalking,
    sendPrompt,
  };
}
