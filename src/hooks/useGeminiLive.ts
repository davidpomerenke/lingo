"use client";

import { useCallback, useRef, useState } from "react";
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
          onUserTranscript?.(text);
        },
        onModelTranscript: (text) => {
          onModelTranscript?.(text);
        },
        onTurnComplete: () => {
          setIsModelSpeaking(false);
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
  }, [apiKey, voiceName, systemInstruction, audioPlayer, onUserTranscript, onModelTranscript, status]);

  // Disconnect from Gemini Live
  const disconnect = useCallback(() => {
    audioRecorder.stopRecording();
    audioPlayer.stop();
    geminiRef.current?.disconnect();
    geminiRef.current = null;
    setStatus("disconnected");
    setIsModelSpeaking(false);
  }, [audioRecorder, audioPlayer]);

  // Start talking - connects first if needed, then starts recording
  const startTalking = useCallback(async () => {
    try {
      // Connect if not already connected
      if (status !== "connected") {
        await connect();
      }
      
      // Start recording
      audioPlayer.stop();
      await audioRecorder.startRecording();
    } catch (err) {
      console.error("Failed to start talking:", err);
    }
  }, [status, connect, audioRecorder, audioPlayer]);

  // Stop talking
  const stopTalking = useCallback(() => {
    audioRecorder.stopRecording();
  }, [audioRecorder]);

  return {
    status,
    error,
    isRecording: audioRecorder.isRecording,
    isModelSpeaking,
    disconnect,
    startTalking,
    stopTalking,
  };
}
