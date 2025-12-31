"use client";

import { useState, useCallback } from "react";
import { useGeminiLive, ConnectionStatus } from "@/hooks/useGeminiLive";
import { VoiceOrb } from "./VoiceOrb";
import { ConversationPanel } from "./ConversationPanel";
import { LanguageSelector, getLanguageByCode } from "./LanguageSelector";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface VoiceChatProps {
  apiKey: string;
}

export function VoiceChat({ apiKey }: VoiceChatProps) {
  const [selectedLanguage, setSelectedLanguage] = useState("es");
  const [messages, setMessages] = useState<Message[]>([]);

  const language = getLanguageByCode(selectedLanguage);

  const systemInstruction = `You are a friendly language tutor helping someone practice ${language?.name || "Spanish"}.

IMPORTANT: Respond ONLY in ${language?.name || "Spanish"}. Do not speak in English unless the user specifically asks for help in English.

Your role:
- Speak naturally in ${language?.name || "Spanish"} at a conversational pace
- Keep responses short (1-3 sentences)
- Gently correct mistakes by naturally rephrasing what the user said correctly
- Be warm, encouraging, and patient
- Adjust your vocabulary and speed based on the learner's level

Start by greeting the user in ${language?.name || "Spanish"} and asking a simple question to start the conversation.`;

  // Handle user speech transcription - append to existing bubble if same speaker
  const handleUserTranscript = useCallback((text: string) => {
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && lastMessage.role === "user") {
        return [
          ...prev.slice(0, -1),
          { ...lastMessage, content: lastMessage.content + " " + text },
        ];
      }
      return [...prev, { id: crypto.randomUUID(), role: "user", content: text }];
    });
  }, []);

  // Handle model speech transcription - append to existing bubble if same speaker
  const handleModelTranscript = useCallback((text: string) => {
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && lastMessage.role === "assistant") {
        return [
          ...prev.slice(0, -1),
          { ...lastMessage, content: lastMessage.content + " " + text },
        ];
      }
      return [...prev, { id: crypto.randomUUID(), role: "assistant", content: text }];
    });
  }, []);

  const gemini = useGeminiLive({
    apiKey,
    voiceName: "Kore",
    systemInstruction,
    onUserTranscript: handleUserTranscript,
    onModelTranscript: handleModelTranscript,
  });

  // Handle orb click - connects and starts talking, or toggles recording
  const handleOrbClick = async () => {
    if (gemini.isRecording) {
      gemini.stopTalking();
    } else {
      await gemini.startTalking();
    }
  };

  const getStatusMessage = (status: ConnectionStatus): string => {
    switch (status) {
      case "connecting":
        return "Connecting...";
      case "connected":
        return gemini.isRecording
          ? "Listening..."
          : gemini.isModelSpeaking
          ? "Speaking..."
          : "Click to talk";
      case "error":
        return gemini.error || "Connection error";
      default:
        return "Click to start";
    }
  };

  const isActive = gemini.status === "connected" || gemini.status === "connecting";

  return (
    <div className="w-full space-y-8">
      {/* Language Selector */}
      <div className="space-y-3">
        <h3 className="text-center text-sm font-medium text-muted-foreground">
          I want to learn
        </h3>
        <LanguageSelector
          selectedLanguage={selectedLanguage}
          onSelectLanguage={(code) => {
            setSelectedLanguage(code);
            if (gemini.status === "connected") {
              gemini.disconnect();
              setMessages([]);
            }
          }}
        />
      </div>

      {/* Main Voice Interface */}
      <div className="flex flex-col items-center gap-6">
        {/* Voice Orb */}
        <div className="relative py-8">
          <VoiceOrb
            isActive={isActive}
            isListening={gemini.isRecording}
            isSpeaking={gemini.isModelSpeaking}
            onClick={handleOrbClick}
            disabled={gemini.status === "connecting"}
          />
        </div>

        {/* Status Message */}
        <p
          className={cn(
            "text-sm font-medium transition-colors",
            gemini.status === "error"
              ? "text-destructive"
              : gemini.isRecording
              ? "text-accent"
              : gemini.isModelSpeaking
              ? "text-primary"
              : "text-muted-foreground"
          )}
        >
          {getStatusMessage(gemini.status)}
        </p>

        {/* End Session button - only show when connected */}
        {gemini.status === "connected" && !gemini.isRecording && !gemini.isModelSpeaking && (
          <Button
            onClick={() => {
              gemini.disconnect();
              setMessages([]);
            }}
            variant="outline"
            size="sm"
            className="rounded-full"
          >
            End Session
          </Button>
        )}
      </div>

      {/* Conversation Panel */}
      {messages.length > 0 && (
        <div className="glass rounded-2xl p-4 mt-8">
          <ConversationPanel
            messages={messages}
            isModelSpeaking={gemini.isModelSpeaking}
          />
        </div>
      )}
    </div>
  );
}
