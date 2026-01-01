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
  language?: string;      // Language at time of message
  useLatinLetters?: boolean;  // Script mode at time of message
  provider?: "gemini" | "openai";  // AI provider at time of message
}

// Languages that use non-Latin scripts
const NON_LATIN_LANGUAGES = new Set([
  // East Asian
  "Chinese", "Japanese", "Korean", "Classical Chinese",
  // South Asian
  "Hindi", "Bengali", "Tamil", "Telugu", "Marathi", "Gujarati", "Kannada", 
  "Malayalam", "Punjabi", "Urdu", "Nepali", "Sinhala", "Sanskrit",
  // Southeast Asian
  "Thai", "Burmese", "Khmer", "Lao",
  // Middle Eastern
  "Arabic", "Hebrew", "Persian", "Kurdish", "Pashto", "Dari",
  // Cyrillic
  "Russian", "Ukrainian", "Bulgarian", "Serbian", "Macedonian", "Belarusian", 
  "Mongolian", "Kazakh",
  // Other scripts
  "Greek", "Georgian", "Armenian", "Amharic", "Tigrinya"
]);

// Languages that are written right-to-left
const RTL_LANGUAGES = new Set([
  "Arabic", "Hebrew", "Persian", "Urdu", "Pashto", "Dari", "Kurdish"
]);

// Languages known to be well-supported by AI models
const SUPPORTED_LANGUAGES = new Set([
  "English", "Spanish", "French", "German", "Italian", "Portuguese", "Russian",
  "Chinese", "Japanese", "Korean", "Arabic", "Hindi", "Dutch", "Greek", "Polish",
  "Swedish", "Norwegian", "Danish", "Finnish", "Czech", "Hungarian", "Romanian",
  "Ukrainian", "Turkish", "Bulgarian", "Croatian", "Serbian", "Slovak", "Slovenian",
  "Lithuanian", "Latvian", "Estonian", "Vietnamese", "Thai", "Indonesian", "Malay",
  "Filipino", "Tagalog", "Bengali", "Tamil", "Telugu", "Marathi", "Gujarati",
  "Kannada", "Malayalam", "Punjabi", "Urdu", "Hebrew", "Persian", "Swahili",
  "Catalan", "Basque", "Galician", "Irish", "Welsh", "Icelandic", "Albanian",
  "Macedonian", "Bosnian", "Georgian", "Armenian", "Azerbaijani", "Kazakh",
  "Uzbek", "Nepali", "Sinhala", "Amharic", "Afrikaans", "Latin"
]);

// ISO 639-1 language codes for transcription
const LANGUAGE_CODES: Record<string, string> = {
  "English": "en", "Spanish": "es", "French": "fr", "German": "de", "Italian": "it",
  "Portuguese": "pt", "Russian": "ru", "Chinese": "zh", "Japanese": "ja", "Korean": "ko",
  "Arabic": "ar", "Hindi": "hi", "Dutch": "nl", "Greek": "el", "Polish": "pl",
  "Swedish": "sv", "Norwegian": "no", "Danish": "da", "Finnish": "fi", "Czech": "cs",
  "Hungarian": "hu", "Romanian": "ro", "Ukrainian": "uk", "Turkish": "tr", "Bulgarian": "bg",
  "Croatian": "hr", "Serbian": "sr", "Slovak": "sk", "Slovenian": "sl", "Lithuanian": "lt",
  "Latvian": "lv", "Estonian": "et", "Vietnamese": "vi", "Thai": "th", "Indonesian": "id",
  "Malay": "ms", "Filipino": "tl", "Tagalog": "tl", "Bengali": "bn", "Tamil": "ta",
  "Telugu": "te", "Marathi": "mr", "Gujarati": "gu", "Kannada": "kn", "Malayalam": "ml",
  "Punjabi": "pa", "Urdu": "ur", "Hebrew": "he", "Persian": "fa", "Swahili": "sw",
  "Catalan": "ca", "Basque": "eu", "Galician": "gl", "Irish": "ga", "Welsh": "cy",
  "Icelandic": "is", "Albanian": "sq", "Macedonian": "mk", "Bosnian": "bs",
  "Georgian": "ka", "Armenian": "hy", "Azerbaijani": "az", "Kazakh": "kk",
  "Uzbek": "uz", "Nepali": "ne", "Sinhala": "si", "Amharic": "am", "Afrikaans": "af",
  "Latin": "la", "Pashto": "ps", "Kurdish": "ku", "Dari": "fa",
};

export function VoiceChat() {
  const { user, isAnonymous, effectiveUserId, getEphemeralToken, login, languages, scriptModes, setScriptMode } = useAuth();
  
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
  const isNonLatinLanguage = NON_LATIN_LANGUAGES.has(lang);
  // Default to true (Latin letters) for non-Latin languages if not set
  const useLatinLetters = isNonLatinLanguage ? (scriptModes[lang] ?? true) : false;
  // Check if language is well-supported
  const isLanguageSupported = SUPPORTED_LANGUAGES.has(lang);

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
          const loadedMessages: Message[] = data.messages || [];
          setMessages(loadedMessages);
          // Track what's already saved AND seal these messages
          loadedMessages.forEach((msg: Message) => {
            lastSavedRef.current.set(msg.id, msg.content);
            sealedMessageIdsRef.current.add(msg.id);
          });
          
          // Set language and provider from the last message if available
          if (loadedMessages.length > 0) {
            const lastMessage = loadedMessages[loadedMessages.length - 1];
            if (lastMessage.language) {
              setSelectedLanguage(lastMessage.language);
            }
            if (lastMessage.provider) {
              setSelectedProvider(lastMessage.provider);
            }
          }
          
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
          // New message - insert with language info
          const res = await authFetch("/api/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              id: msg.id, 
              role: msg.role, 
              content: msg.content,
              language: msg.language,
              useLatinLetters: msg.useLatinLetters,
              provider: msg.provider,
            }),
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

  const romanizationRule = isNonLatinLanguage && useLatinLetters ? `
IMPORTANT - USE LATIN LETTERS:
ALWAYS use romanized/transliterated text instead of native script:
- Chinese: Use pinyin (e.g., "Nǐ hǎo" not "你好")
- Japanese: Use romaji (e.g., "Konnichiwa" not "こんにちは")
- Korean: Use romanization (e.g., "Annyeonghaseyo" not "안녕하세요")
- Arabic: Use transliteration (e.g., "Marhaba" not "مرحبا")
- Hindi: Use transliteration (e.g., "Namaste" not "नमस्ते")
- Greek: Use transliteration (e.g., "Kalimera" not "Καλημέρα")
- Russian: Use transliteration (e.g., "Privet" not "Привет")
- Hebrew: Use transliteration (e.g., "Shalom" not "שלום")
- For any other non-Latin script: Use standard romanization
This helps learners focus on speaking without needing to learn new alphabets.
` : "";

  const systemInstruction = `You are a friendly language tutor helping someone practice ${lang}. Speak ONLY in ${lang} at all times.
${romanizationRule}
Control tokens (respond to these but never mention or acknowledge them directly):
- <START> - Begin a new conversation with a warm greeting and simple question
- <CONTINUE> - Resume conversation naturally from where you left off
- <CONTEXT date="..." time="..." timezone="..." location="..." /> - Background info about the user. Use subtly, don't explicitly mention unless relevant.
- <LANGUAGE_SWITCH to="..." /> - IMMEDIATELY switch to the specified language. From that point, speak ONLY in the new language.
- <SCRIPT_MODE mode="latin|native" /> - Switch how you write: "latin" = use romanized letters (pinyin, romaji, etc.), "native" = use the language's native script.

Game tokens (seamlessly integrate into conversation):
IMPORTANT RULES FOR ALL GAMES:
1. Do 3 rounds automatically, then ask if the user wants to continue.
2. Be CRITICAL and PRECISE with feedback - don't just say "good job!" The user wants to learn, so point out ALL errors, mispronunciations, grammar issues, and areas for improvement. Be constructive but thorough - being too nice doesn't help them improve.

- <GAME type="read-aloud" /> - Generate a short text (1-3 sentences) in ${lang} for the user to read aloud. Say a brief intro, then say "READ_ALOUD:" followed by the exact text in romanized form (DO NOT say the text before the marker). The text will be displayed visually. Wait for the user to read it, then give DETAILED and CRITICAL feedback on pronunciation: identify exact mispronounced words, explain correct pronunciation phonetically, note rhythm/intonation issues. Be thorough and honest, not just nice. After 3 texts, ask if they want to continue.

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
        return [...prev, { 
          id: crypto.randomUUID(), 
          role: "user", 
          content: text,
          language: lang,
          useLatinLetters,
          provider: selectedProvider,
        }];
      }
      return [
        ...prev.slice(0, -1),
        { ...lastMessage, content: lastMessage.content + text },
      ];
    });
  }, [lang, useLatinLetters, selectedProvider]);

  // Handle model speech transcription - append to existing bubble if same speaker and not sealed
  const handleModelTranscript = useCallback((text: string) => {
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      const isSealed = lastMessage && sealedMessageIdsRef.current.has(lastMessage.id);
      
      if (isSealed || !lastMessage || lastMessage.role !== "assistant") {
        return [...prev, { 
          id: crypto.randomUUID(), 
          role: "assistant", 
          content: text,
          language: lang,
          useLatinLetters,
          provider: selectedProvider,
        }];
      }
      return [
        ...prev.slice(0, -1),
        { ...lastMessage, content: lastMessage.content + text },
      ];
    });
  }, [lang, useLatinLetters, selectedProvider]);

  const liveProvider = useLiveProvider({
    provider: selectedProvider,
    voiceName: "Kore",
    systemInstruction,
    inputLanguage: LANGUAGE_CODES[lang], // Help transcription recognize the expected language
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
              // Update transcription language for OpenAI (Gemini uses system prompt)
              const newLangCode = LANGUAGE_CODES[newLang];
              if (newLangCode) {
                liveProvider.updateInputLanguage(newLangCode);
              }
              // Include script mode for the NEW language (not current)
              const isNewLangNonLatin = NON_LATIN_LANGUAGES.has(newLang);
              const newLangUseLatinLetters = isNewLangNonLatin ? (scriptModes[newLang] ?? true) : false;
              const scriptMode = isNewLangNonLatin && newLangUseLatinLetters ? "latin" : "native";
              const scriptInstruction = isNewLangNonLatin && newLangUseLatinLetters 
                ? ` Use ROMANIZED/LATIN letters only (e.g., romaji for Japanese, pinyin for Chinese).`
                : "";
              liveProvider.sendPrompt(
                `<LANGUAGE_SWITCH to="${newLang}" script="${scriptMode}" /> IMPORTANT: From this point forward, you are now teaching ${newLang}. Speak ONLY in ${newLang}.${scriptInstruction} Greet the user briefly in ${newLang}.`
              );
            }
          }}
        />
        
        {/* Latin letters toggle - only for non-Latin script languages */}
        {isNonLatinLanguage && (
          <div className="flex items-center justify-center gap-3 mt-3">
            <button
              onClick={() => {
                const newValue = !useLatinLetters;
                setScriptMode(lang, newValue);
                if (liveProvider.status === "connected") {
                  // Seal messages for fresh bubble
                  messages.forEach(m => sealedMessageIdsRef.current.add(m.id));
                  if (newValue) {
                    liveProvider.sendPrompt(
                      `<SCRIPT_MODE mode="latin" /> From now on, ALWAYS use romanized/Latin letters instead of native script. For example: use "Nǐ hǎo" not "你好", use "Konnichiwa" not "こんにちは". Acknowledge briefly.`
                    );
                  } else {
                    liveProvider.sendPrompt(
                      `<SCRIPT_MODE mode="native" /> From now on, use the native script/alphabet of the language (not romanization). For example: use "你好" not "Nǐ hǎo", use "こんにちは" not "Konnichiwa". Acknowledge briefly.`
                    );
                  }
                }
              }}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 border ${
                useLatinLetters 
                  ? "bg-primary/20 border-primary" 
                  : "bg-secondary/50 border-border"
              }`}
              role="switch"
              aria-checked={useLatinLetters}
            >
              <span
                className={`absolute top-1/2 -translate-y-1/2 left-0.5 w-5 h-5 rounded-full shadow-sm transition-transform duration-200 ${
                  useLatinLetters 
                    ? "translate-x-[18px] bg-primary" 
                    : "translate-x-0 bg-muted-foreground/50"
                }`}
              />
            </button>
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              Latin letters
              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-secondary/50 text-muted-foreground/80">ABC</span>
            </span>
          </div>
        )}
        
        {/* Disclaimer for unsupported languages */}
        {!isLanguageSupported && (
          <p className="text-center text-xs text-amber-500/80 mt-3 px-4">
            ⚠️ {lang} may not be well supported by AI models. Quality may vary.
          </p>
        )}
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
        <div className="glass rounded-2xl p-4 relative">
          {/* Clear history button */}
          <button
            onClick={async () => {
              if (confirm("Clear all chat history?")) {
                // Stop session if active
                if (liveProvider.status === "connected") {
                  liveProvider.disconnect();
                }
                await authFetch("/api/messages", { method: "DELETE" });
                setMessages([]);
                lastSavedRef.current.clear();
                sealedMessageIdsRef.current.clear();
              }
            }}
            className="absolute top-2 right-2 p-1.5 rounded-full text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Clear chat history"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
          <ConversationPanel
            messages={messages}
            isModelSpeaking={liveProvider.isModelSpeaking}
            currentLanguage={selectedLanguage}
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
