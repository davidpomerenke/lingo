"use client";

import { useState, useCallback } from "react";
import { useGeminiLive, ConnectionStatus } from "@/hooks/useGeminiLive";
import { VoiceOrb } from "./VoiceOrb";
import { ConversationPanel } from "./ConversationPanel";
import { LanguageSelector, getLanguageByCode } from "./LanguageSelector";
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

  const lang = language?.name || "Spanish";
  
  const systemInstruction = `You are a friendly language tutor helping someone practice ${lang}. Speak ONLY in ${lang} at all times.

When the user sends <START>, simply greet them warmly in ${lang} and ask a simple conversation starter question. Do not acknowledge or reference the <START> token.

For EACH user response:
1. ECHO: Briefly paraphrase what the user said (from your perspective) to confirm understanding
2. CORRECT/ENRICH (optional): Only if there's a clear mistake to fix OR a notably better way to say something - otherwise skip this
3. CONTINUE: Respond naturally with a follow-up question or comment

Keep it concise: 2-3 sentences max. Be warm and encouraging.`;

  // Handle user speech transcription - append to existing bubble if same speaker
  const handleUserTranscript = useCallback((text: string) => {
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && lastMessage.role === "user") {
        // Don't add extra space - API includes spacing in chunks
        return [
          ...prev.slice(0, -1),
          { ...lastMessage, content: lastMessage.content + text },
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
        // Don't add extra space - API includes spacing in chunks
        return [
          ...prev.slice(0, -1),
          { ...lastMessage, content: lastMessage.content + text },
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

  // Handle orb click - simple on/off toggle
  const handleOrbClick = async () => {
    if (gemini.status === "disconnected" || gemini.status === "error") {
      // Turn on: start session
      setMessages([]);
      await gemini.startSession();
    } else {
      // Turn off: disconnect
      gemini.disconnect();
    }
  };

  const getStatusMessage = (status: ConnectionStatus): string => {
    switch (status) {
      case "connecting":
        return "Connecting...";
      case "connected":
        return "Session active • Click orb to end";
      case "error":
        return gemini.error || "Connection error";
      default:
        return "Click orb to start";
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
            const newLang = getLanguageByCode(code);
            setSelectedLanguage(code);
            // If connected, tell the AI to switch languages (don't disconnect)
            if (gemini.status === "connected" && newLang) {
              gemini.sendPrompt(
                `Please switch to ${newLang.name} now. From this point on, speak ONLY in ${newLang.name}. Acknowledge the switch briefly in ${newLang.name}.`
              );
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
              : gemini.status === "connected"
              ? "text-primary"
              : "text-muted-foreground"
          )}
        >
          {getStatusMessage(gemini.status)}
        </p>

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
