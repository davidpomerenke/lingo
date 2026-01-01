"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useLiveProvider } from "@/hooks/useLiveProvider";
import type { ProviderType } from "@/lib/live-provider";
import { VoiceOrb } from "./VoiceOrb";
import { ConversationPanel } from "./ConversationPanel";
import { LanguageSelector } from "./LanguageSelector";
import { ProviderSelector } from "./ProviderSelector";
import { GamePills } from "./GamePills";
import { useAuth } from "@/lib/auth-context";

const SHOW_SIGNIN_AFTER_MESSAGES = 20;

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

export function VoiceChat() {
  const { user, isAnonymous, effectiveUserId, getEphemeralToken, login, languages } = useAuth();
  
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>("gemini");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [readAloudText, setReadAloudText] = useState<string | null>(null);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInStatus, setSignInStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  
  // Track which message triggered the card and how many messages after it to keep it visible
  const cardSourceMessageIdRef = useRef<string | null>(null);
  const lastSavedRef = useRef<Map<string, string>>(new Map());
  // Track "sealed" message IDs - messages we should never append to
  const sealedMessageIdsRef = useRef<Set<string>>(new Set());

  // Set initial language from user's languages
  useEffect(() => {
    if (!selectedLanguage && languages.length > 0) {
      setSelectedLanguage(languages[0]);
    }
  }, [languages, selectedLanguage]);

  const lang = selectedLanguage || "Spanish";

  // Helper to make API calls with auth headers
  const authFetch = useCallback((url: string, options: RequestInit = {}) => {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    
    // Add appropriate auth header
    if (user) {
      // Get session from localStorage for authenticated users
      const sessionId = localStorage.getItem("lingo_session");
      if (sessionId) headers["x-session-id"] = sessionId;
    } else if (effectiveUserId) {
      // Use anonymous ID
      headers["x-anon-id"] = effectiveUserId;
    }
    
    return fetch(url, { ...options, headers });
  }, [user, effectiveUserId]);

  // Load messages from database on mount
  useEffect(() => {
    if (!effectiveUserId) return;
    
    async function loadMessages() {
      try {
        const res = await authFetch("/api/messages");
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
          // Track what's already saved AND seal these messages
          (data.messages || []).forEach((msg: Message) => {
            lastSavedRef.current.set(msg.id, msg.content);
            sealedMessageIdsRef.current.add(msg.id);
          });
          
          // Show sign-in suggestion after threshold (but don't block)
          if (data.isAnonymous && data.messageCount >= SHOW_SIGNIN_AFTER_MESSAGES) {
            setShowSignInPrompt(true);
          }
        }
      } catch (err) {
        console.error("Failed to load messages:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadMessages();
  }, [effectiveUserId, authFetch]);

  // Save messages to database when they change
  useEffect(() => {
    if (isLoading || !effectiveUserId) return;

    async function saveMessages() {
      for (const msg of messages) {
        const savedContent = lastSavedRef.current.get(msg.id);
        if (savedContent === undefined) {
          // New message - insert
          const res = await authFetch("/api/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: msg.id, role: msg.role, content: msg.content }),
          });
          lastSavedRef.current.set(msg.id, msg.content);
          
          // Show sign-in suggestion after threshold
          if (res.ok) {
            const data = await res.json();
            if (data.isAnonymous && data.messageCount >= SHOW_SIGNIN_AFTER_MESSAGES) {
              setShowSignInPrompt(true);
            }
          }
        } else if (savedContent !== msg.content) {
          // Existing message - update
          await authFetch("/api/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: msg.id, content: msg.content, update: true }),
          });
          lastSavedRef.current.set(msg.id, msg.content);
        }
      }
    }
    saveMessages();
  }, [messages, isLoading, effectiveUserId, authFetch]);

  const systemInstruction = `You are a friendly language tutor helping someone practice ${lang}. Speak ONLY in ${lang} at all times.

Control tokens (never mention or acknowledge these directly):
- <START> - Begin a new conversation with a warm greeting and simple question
- <CONTINUE> - Resume conversation naturally from where you left off
- <CONTEXT date="..." time="..." timezone="..." location="..." /> - Background info about the user. DO NOT explicitly mention these facts. Use them subtly: appropriate greeting for time of day, awareness of local context. Only mention directly if truly relevant to conversation.

Game tokens (seamlessly integrate into conversation):
IMPORTANT RULES FOR ALL GAMES:
1. Do 3 rounds automatically, then ask if the user wants to continue.
2. Be CRITICAL and PRECISE with feedback - don't just say "good job!" The user wants to learn, so point out ALL errors, mispronunciations, grammar issues, and areas for improvement. Be constructive but thorough - being too nice doesn't help them improve.

- <GAME type="read-aloud" /> - Generate a short text (1-3 sentences) in ${lang} for the user to read aloud. Say a brief intro, then say "READ_ALOUD:" followed by the exact text (DO NOT say the text before the marker). The text will be displayed visually. Wait for the user to read it, then give DETAILED and CRITICAL feedback on pronunciation: identify exact mispronounced words, explain correct pronunciation phonetically, note rhythm/intonation issues. Be thorough and honest, not just nice. After 3 texts, ask if they want to continue.

- <GAME type="guess-word" /> - Think of a word/concept in ${lang} appropriate for the user's level. Describe it WITHOUT saying the word: what category it belongs to, what it looks/sounds/feels like, where you find it, what you do with it. Give 2-3 clues initially. If user guesses wrong, give another hint. If correct, celebrate and move to the next word. If stuck after 3 guesses, reveal the answer. After 3 words, ask if they want to continue.

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

  const liveProvider = useLiveProvider({
    provider: selectedProvider,
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
      if (msg.role === "assistant" && msg.content.includes("READ_ALOUD:")) {
        const match = msg.content.match(/READ_ALOUD:\s*([\s\S]+)/);
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
    if (liveProvider.status === "disconnected" || liveProvider.status === "error") {
      // Get ephemeral token first
      const token = await getEphemeralToken(selectedProvider);
      if (!token) {
        console.error("Failed to get ephemeral token");
        return;
      }
      
      // Seal all existing messages before starting session
      messages.forEach(m => sealedMessageIdsRef.current.add(m.id));
      
      // Get user context (date, time, location)
      const context = await getUserContext();
      
      // Turn on: start or resume session (pass token directly)
      if (messages.length > 0) {
        await liveProvider.startSession(token, messages.map(m => ({ role: m.role, content: m.content })), context);
      } else {
        await liveProvider.startSession(token, [], context);
      }
    } else {
      // Turn off: disconnect (and seal current messages for next session)
      messages.forEach(m => sealedMessageIdsRef.current.add(m.id));
      liveProvider.disconnect();
    }
  };

  // Handle game selection - works even when not connected
  const handleGameSelect = async (gameId: string) => {
    // Seal existing messages for fresh bubble
    messages.forEach(m => sealedMessageIdsRef.current.add(m.id));
    
    // Clear any previous read-aloud text
    setReadAloudText(null);
    cardSourceMessageIdRef.current = null;
    
    if (liveProvider.status !== "connected") {
      // Get ephemeral token first
      const token = await getEphemeralToken(selectedProvider);
      if (!token) {
        console.error("Failed to get ephemeral token");
        return;
      }
      
      // Not connected - start session with game command
      const context = await getUserContext();
      const gamePrompt = `${context}\n<GAME type="${gameId}" />`;
      await liveProvider.startSession(token, messages.map(m => ({ role: m.role, content: m.content })), gamePrompt, true);
    } else {
      // Already connected - just send game command
      liveProvider.sendPrompt(`<GAME type="${gameId}" />`);
    }
  };

  // Handle sign-in from prompt
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInEmail) return;
    
    setSignInStatus("sending");
    const result = await login(signInEmail);
    
    if (result.success) {
      setSignInStatus("sent");
    } else {
      setSignInStatus("error");
    }
  };

  const isActive = liveProvider.status === "connected" || liveProvider.status === "connecting";

  if (isLoading) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Handle provider switch - automatically restart session with new provider
  const handleProviderSwitch = async (newProvider: ProviderType) => {
    if (newProvider === selectedProvider) return;
    
    // Seal existing messages for fresh bubble
    messages.forEach(m => sealedMessageIdsRef.current.add(m.id));
    
    // Update UI state
    setSelectedProvider(newProvider);
    
    // If session is active, switch provider (transfers context automatically)
    if (isActive) {
      // Get new ephemeral token for the new provider
      const token = await getEphemeralToken(newProvider);
      if (!token) return;
      
      await liveProvider.switchProvider(
        newProvider,
        messages.map(m => ({ role: m.role, content: m.content })),
        token
      );
    }
  };
  
  // Get orb label based on state
  const getOrbLabel = () => {
    if (liveProvider.status === "connecting") return "...";
    if (isActive) return undefined; // No label when active (shows waveform)
    return messages.length > 0 ? "Continue" : "Start";
  };

  return (
    <div className="w-full space-y-6">
      {/* Language Selector */}
      <div className="space-y-3">
        <h3 className="text-center text-sm font-medium text-muted-foreground">
          I want to learn
        </h3>
        <LanguageSelector
          selectedLanguage={selectedLanguage}
          onSelectLanguage={(newLang) => {
            setSelectedLanguage(newLang);
            if (liveProvider.status === "connected") {
              // Seal all current messages to force fresh bubble
              messages.forEach(m => sealedMessageIdsRef.current.add(m.id));
              liveProvider.sendPrompt(
                `Please switch to ${newLang} now. From this point on, speak ONLY in ${newLang}. Acknowledge the switch briefly in ${newLang}.`
              );
            }
          }}
        />
      </div>

      {/* Provider Selector */}
      <div className="space-y-3">
        <h3 className="text-center text-sm font-medium text-muted-foreground">
          AI teacher
        </h3>
        <ProviderSelector
          selectedProvider={selectedProvider}
          onSelectProvider={handleProviderSwitch}
        />
      </div>

      {/* Main Voice Interface */}
      <div className="flex flex-col items-center">
        <div className="relative py-6">
          <VoiceOrb
            isActive={isActive}
            label={getOrbLabel()}
            onClick={handleOrbClick}
            disabled={liveProvider.status === "connecting"}
          />
        </div>

        {/* Only show error messages */}
        {liveProvider.status === "error" && (
          <p className="text-sm font-medium text-destructive mt-2">
            {liveProvider.error || "Connection error"}
          </p>
        )}
      </div>

      {/* Read Aloud Display */}
      {readAloudText && (
        <div className="glass rounded-2xl p-6 text-center">
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

      {/* Conversation Panel */}
      {messages.length > 0 && (
        <div className="glass rounded-2xl p-4">
          <ConversationPanel
            messages={messages}
            isModelSpeaking={liveProvider.isModelSpeaking}
          />
        </div>
      )}

      {/* Sign-in suggestion for anonymous users */}
      {isAnonymous && showSignInPrompt && (
        <div className="glass rounded-2xl p-6">
          <div className="text-center mb-4">
            <h3 className="text-lg font-semibold">Save your progress</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in to keep your conversation history
            </p>
          </div>
          
          {signInStatus === "sent" ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">
                Check your email for a magic link to sign in.<br />
                Your conversation will be saved!
              </p>
            </div>
          ) : (
            <form onSubmit={handleSignIn} className="space-y-3">
              <input
                type="email"
                value={signInEmail}
                onChange={(e) => setSignInEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-4 py-3 bg-secondary/50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
                disabled={signInStatus === "sending"}
              />
              <button
                type="submit"
                disabled={signInStatus === "sending" || !signInEmail}
                className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-all"
              >
                {signInStatus === "sending" ? "Sending..." : "Sign in with Email"}
              </button>
              {signInStatus === "error" && (
                <p className="text-sm text-destructive text-center">Failed to send email. Try again.</p>
              )}
            </form>
          )}
        </div>
      )}

      {/* Practice Games - below conversation */}
      <div className="pt-2">
        <GamePills
          onSelectGame={handleGameSelect}
          disabled={liveProvider.status === "connecting"}
        />
      </div>
    </div>
  );
}
