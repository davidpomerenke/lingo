"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useGeminiLive, ConnectionStatus } from "@/hooks/useGeminiLive";
import { VoiceOrb } from "./VoiceOrb";
import { ConversationPanel } from "./ConversationPanel";
import { LanguageSelector, getLanguageByCode } from "./LanguageSelector";
import { GamePills } from "./GamePills";
import { cn } from "@/lib/utils";

// Get user context (date, time, location)
async function getUserContext(): Promise<string> {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  let locationStr = "unknown";
  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 5000,
        maximumAge: 300000, // Cache for 5 minutes
      });
    });
    const { latitude, longitude } = position.coords;
    // Try to get city name via reverse geocoding
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=10`
      );
      if (res.ok) {
        const data = await res.json();
        const city = data.address?.city || data.address?.town || data.address?.village || "";
        const country = data.address?.country || "";
        locationStr = [city, country].filter(Boolean).join(", ") || `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
      }
    } catch {
      locationStr = `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
    }
  } catch {
    // Geolocation denied or unavailable
    locationStr = "not available";
  }

  return `<CONTEXT date="${dateStr}" time="${timeStr}" timezone="${timezone}" location="${locationStr}" />`;
}

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
  const [isLoading, setIsLoading] = useState(true);
  const [readAloudText, setReadAloudText] = useState<string | null>(null);
  // Track which message triggered the card and how many messages after it to keep it visible
  const cardSourceMessageIdRef = useRef<string | null>(null);
  const lastSavedRef = useRef<Map<string, string>>(new Map());
  // Track "sealed" message IDs - messages we should never append to
  const sealedMessageIdsRef = useRef<Set<string>>(new Set());

  const language = getLanguageByCode(selectedLanguage);
  const lang = language?.name || "Spanish";

  // Load messages from database on mount
  useEffect(() => {
    async function loadMessages() {
      try {
        const res = await fetch("/api/messages");
        if (res.ok) {
          const data = await res.json();
          setMessages(data);
          // Track what's already saved AND seal these messages
          data.forEach((msg: Message) => {
            lastSavedRef.current.set(msg.id, msg.content);
            sealedMessageIdsRef.current.add(msg.id);
          });
        }
      } catch (err) {
        console.error("Failed to load messages:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadMessages();
  }, []);

  // Save messages to database when they change
  useEffect(() => {
    if (isLoading) return;

    async function saveMessages() {
      for (const msg of messages) {
        const savedContent = lastSavedRef.current.get(msg.id);
        if (savedContent === undefined) {
          // New message - insert
          await fetch("/api/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: msg.id, role: msg.role, content: msg.content }),
          });
          lastSavedRef.current.set(msg.id, msg.content);
        } else if (savedContent !== msg.content) {
          // Existing message - update
          await fetch("/api/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: msg.id, content: msg.content, update: true }),
          });
          lastSavedRef.current.set(msg.id, msg.content);
        }
      }
    }
    saveMessages();
  }, [messages, isLoading]);

  const systemInstruction = `You are a friendly language tutor helping someone practice ${lang}. Speak ONLY in ${lang} at all times.

Control tokens (never mention or acknowledge these directly):
- <START> - Begin a new conversation with a warm greeting and simple question
- <CONTINUE> - Resume conversation naturally from where you left off
- <CONTEXT date="..." time="..." timezone="..." location="..." /> - Current user context; use naturally in conversation when relevant (e.g., time-appropriate greetings, location-based topics)

Game tokens (seamlessly integrate into conversation):
- <GAME type="read-aloud" /> - Generate a short text (1-3 sentences) in ${lang} for the user to read aloud. Say a brief intro like "Let's practice reading!", then say "TEXT:" followed by the exact text (DO NOT say the text before TEXT:, just say it once after the marker). The text will be displayed visually. Wait for the user to read it aloud, then give DETAILED and CRITICAL feedback on their pronunciation. Be specific: identify exact words that were mispronounced, explain HOW they should be pronounced correctly (phonetically if helpful), note rhythm/intonation issues. Don't just say "good job" - this is pronunciation practice, so be thorough and honest about errors while remaining constructive. End by asking if they want to try again or continue with another text.

For EACH user response (in normal conversation):
1. ECHO: Briefly paraphrase what the user said (from your perspective) to confirm understanding
2. CORRECT/ENRICH (optional): Only if there's a clear mistake to fix OR a notably better way to say something - otherwise skip this
3. CONTINUE: Respond naturally with a follow-up question or comment

Keep it concise: 2-3 sentences max. Be warm and encouraging.`;

  // Handle user speech transcription - append to existing bubble if same speaker and not sealed
  const handleUserTranscript = useCallback((text: string) => {
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      const isSealed = lastMessage && sealedMessageIdsRef.current.has(lastMessage.id);
      
      if (isSealed || !lastMessage || lastMessage.role !== "user") {
        return [...prev, { id: crypto.randomUUID(), role: "user", content: text }];
      }
      return [
        ...prev.slice(0, -1),
        { ...lastMessage, content: lastMessage.content + text },
      ];
    });
  }, []);

  // Handle model speech transcription - append to existing bubble if same speaker and not sealed
  const handleModelTranscript = useCallback((text: string) => {
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      const isSealed = lastMessage && sealedMessageIdsRef.current.has(lastMessage.id);
      
      if (isSealed || !lastMessage || lastMessage.role !== "assistant") {
        return [...prev, { id: crypto.randomUUID(), role: "assistant", content: text }];
      }
      return [
        ...prev.slice(0, -1),
        { ...lastMessage, content: lastMessage.content + text },
      ];
    });
  }, []);

  const gemini = useGeminiLive({
    apiKey,
    voiceName: "Kore",
    systemInstruction,
    onUserTranscript: handleUserTranscript,
    onModelTranscript: handleModelTranscript,
  });

  // Manage read-aloud card based on messages
  useEffect(() => {
    if (messages.length === 0) {
      if (cardSourceMessageIdRef.current) {
        setReadAloudText(null);
        cardSourceMessageIdRef.current = null;
      }
      return;
    }
    
    // Find the most recent message with TEXT: marker
    let textMessageIndex = -1;
    let extractedText = "";
    
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant" && msg.content.includes("TEXT:")) {
        const match = msg.content.match(/TEXT:\s*([\s\S]+)/);
        if (match) {
          textMessageIndex = i;
          extractedText = match[1].trim();
          break;
        }
      }
    }
    
    if (textMessageIndex === -1) {
      // No TEXT: message found, clear card
      if (cardSourceMessageIdRef.current) {
        setReadAloudText(null);
        cardSourceMessageIdRef.current = null;
      }
      return;
    }
    
    // Count how many messages AFTER the TEXT: message
    const messagesAfter = messages.length - 1 - textMessageIndex;
    
    if (messagesAfter <= 2) {
      // Show/update card - update text as message streams
      cardSourceMessageIdRef.current = messages[textMessageIndex].id;
      setReadAloudText(extractedText);
    } else {
      // More than 2 messages after, hide card
      if (cardSourceMessageIdRef.current) {
        setReadAloudText(null);
        cardSourceMessageIdRef.current = null;
      }
    }
  }, [messages]); // Only depend on messages, not readAloudText


  // Handle orb click - simple on/off toggle
  const handleOrbClick = async () => {
    if (gemini.status === "disconnected" || gemini.status === "error") {
      // Seal all existing messages before starting session
      messages.forEach(m => sealedMessageIdsRef.current.add(m.id));
      
      // Get user context (date, time, location)
      const context = await getUserContext();
      
      // Turn on: start or resume session
      if (messages.length > 0) {
        await gemini.startSession(messages.map(m => ({ role: m.role, content: m.content })), context);
      } else {
        await gemini.startSession([], context);
      }
    } else {
      // Turn off: disconnect (and seal current messages for next session)
      messages.forEach(m => sealedMessageIdsRef.current.add(m.id));
      gemini.disconnect();
    }
  };

  // Handle game selection - works even when not connected
  const handleGameSelect = async (gameId: string) => {
    // Seal existing messages for fresh bubble
    messages.forEach(m => sealedMessageIdsRef.current.add(m.id));
    
    // Clear any previous read-aloud text
    setReadAloudText(null);
    cardSourceMessageIdRef.current = null;
    
    if (gemini.status !== "connected") {
      // Not connected - start session with game command
      const context = await getUserContext();
      const gamePrompt = `${context}\n<GAME type="${gameId}" />`;
      await gemini.startSession(messages.map(m => ({ role: m.role, content: m.content })), gamePrompt, true);
    } else {
      // Already connected - just send game command
      gemini.sendPrompt(`<GAME type="${gameId}" />`);
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
        return messages.length > 0 ? "Click orb to continue" : "Click orb to start";
    }
  };

  const isActive = gemini.status === "connected" || gemini.status === "connecting";

  if (isLoading) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <div className="text-muted-foreground">Loading conversation...</div>
      </div>
    );
  }

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
            if (gemini.status === "connected" && newLang) {
              // Seal all current messages to force fresh bubble
              messages.forEach(m => sealedMessageIdsRef.current.add(m.id));
              gemini.sendPrompt(
                `Please switch to ${newLang.name} now. From this point on, speak ONLY in ${newLang.name}. Acknowledge the switch briefly in ${newLang.name}.`
              );
            }
          }}
        />
      </div>

      {/* Main Voice Interface */}
      <div className="flex flex-col items-center gap-6">
        <div className="relative py-8">
          <VoiceOrb
            isActive={isActive}
            onClick={handleOrbClick}
            disabled={gemini.status === "connecting"}
          />
        </div>

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

      {/* Read Aloud Display */}
      {readAloudText && (
        <div className="glass rounded-2xl p-6 mt-4 text-center">
          <p className="text-xs text-muted-foreground mb-2">Read this aloud:</p>
          <p className="text-xl font-medium text-foreground leading-relaxed">
            {readAloudText}
          </p>
          <button
            onClick={() => setReadAloudText(null)}
            className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Practice Games - always visible and clickable */}
      <div className="mt-6">
        <GamePills
          onSelectGame={handleGameSelect}
          disabled={gemini.status === "connecting"}
        />
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
