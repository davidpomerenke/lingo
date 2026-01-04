"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useLiveProvider } from "@/hooks/useLiveProvider";
import { useMessages } from "@/hooks/useMessages";
import type { ProviderType } from "@/lib/live-provider";
import type { Message } from "@/types/message";
import { VoiceOrb } from "./VoiceOrb";
import { ConversationPanel } from "./ConversationPanel";
import { LanguageSelector } from "./LanguageSelector";
import { ProviderSelector } from "./ProviderSelector";
import { GamePills } from "./GamePills";
import { ReadAloudCard } from "./ReadAloudCard";
import { SignInPrompt } from "./SignInPrompt";
import type { Flashcard } from "./FlashcardIndicator";
import { Toggle } from "./ui/toggle";
import { TrashIcon } from "./ui/icons";
import { LoadingSpinner } from "./ui/loading";
import { useAuth } from "@/lib/auth-context";
import { hasGoodAudioSupport, getUserContext } from "@/lib/utils";
import { buildSystemInstruction, GAME_FUNCTIONS } from "@/lib/prompts";
import type { FunctionCall } from "@/lib/live-provider";
import { 
  isNonLatinLanguage, 
  isSupportedLanguage, 
  getLanguageCode,
} from "@/lib/languages";

// Structured data for read-aloud card (from function calling)
interface ReadAloudCard {
  text: string;
  phonetic?: string;
  translation?: string;
}

export function VoiceChat() {
  const { isAnonymous, effectiveUserId, getEphemeralToken, login, languages, scriptModes, setScriptMode, authFetch } = useAuth();
  
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>("gemini");
  const [readAloudCard, setReadAloudCard] = useState<ReadAloudCard | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsAfterMessageIndex, setSuggestionsAfterMessageIndex] = useState<number>(-1);
  const [showBrowserWarning, setShowBrowserWarning] = useState(false);
  
  // Use the messages hook for persistence
  const { 
    messages,
    messagesRef, 
    isLoading, 
    sealAll, 
    sealLastOfRole, 
    addTranscript, 
    clearHistory,
    lastMessageMeta,
  } = useMessages({
    onSignInPrompt: () => setShowSignInPrompt(true),
  });
  
  // Check browser compatibility on mount
  useEffect(() => {
    setShowBrowserWarning(!hasGoodAudioSupport());
  }, []);
  
  // Track suggestion generation to only do once per AI turn
  const suggestionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastAiMessageIdForSuggestionsRef = useRef<string | null>(null);

  // Track if we've done initial setup from loaded messages
  const hasInitializedFromMessagesRef = useRef(false);
  
  // Set initial language and provider from loaded messages (only once)
  useEffect(() => {
    // Only set from loaded messages once, and only after loading is complete
    if (!isLoading && !hasInitializedFromMessagesRef.current) {
      hasInitializedFromMessagesRef.current = true;
      
      // Prioritize language from last message, then fall back to user's first language
      const langToSet = lastMessageMeta?.language || (languages.length > 0 ? languages[0] : null);
      if (langToSet && !selectedLanguage) {
        setSelectedLanguage(langToSet);
      }
      
      if (lastMessageMeta?.provider) {
        setSelectedProvider(lastMessageMeta.provider);
      }
    }
  }, [isLoading, lastMessageMeta, selectedLanguage, languages]);

  const lang = selectedLanguage || "Spanish";
  const langIsNonLatin = isNonLatinLanguage(lang);
  // Default to true (Latin letters) for non-Latin languages if not set
  const useLatinLetters = langIsNonLatin ? (scriptModes[lang] ?? true) : false;
  // Check if language is well-supported
  const langIsSupported = isSupportedLanguage(lang);

  const systemInstruction = buildSystemInstruction({
    language: lang,
    isNonLatin: langIsNonLatin,
    useLatinLetters,
  });

  // Handle transcript - append to existing bubble if same speaker and not sealed
  const handleUserTranscript = useCallback((text: string) => {
    addTranscript("user", text, { language: lang, useLatinLetters, provider: selectedProvider });
  }, [addTranscript, lang, useLatinLetters, selectedProvider]);
  
  const handleModelTranscript = useCallback((text: string) => {
    addTranscript("assistant", text, { language: lang, useLatinLetters, provider: selectedProvider });
  }, [addTranscript, lang, useLatinLetters, selectedProvider]);

  // Handle function calls from the AI (for games like read-aloud)
  const handleFunctionCall = useCallback((call: FunctionCall) => {
    switch (call.name) {
      case "display_read_aloud": {
        const args = call.arguments as { text: string; phonetic?: string; translation?: string };
        setReadAloudCard({
          text: args.text,
          phonetic: args.phonetic,
          translation: args.translation,
        });
        // Send result back to continue the conversation
        liveProviderRef.current?.sendFunctionResult({
          callId: call.id,
          name: call.name,
          result: { displayed: true },
        });
        break;
      }
      case "dismiss_read_aloud": {
        setReadAloudCard(null);
        // Send result back to continue the conversation
        liveProviderRef.current?.sendFunctionResult({
          callId: call.id,
          name: call.name,
          result: { dismissed: true },
        });
        break;
      }
      case "create_flashcard": {
        const args = call.arguments as { 
          concept: string; 
          type: string; 
          context?: string; 
          notes?: string;
        };
        
        // Create flashcard immediately for UI (position after the last user message, before AI reply)
        // Find the last user message index
        let lastUserMessageIndex = -1;
        for (let i = messagesRef.current.length - 1; i >= 0; i--) {
          if (messagesRef.current[i].role === "user") {
            lastUserMessageIndex = i;
            break;
          }
        }
        
        const flashcard: Flashcard = {
          id: crypto.randomUUID(),
          concept: args.concept,
          type: (args.type as "vocabulary" | "grammar" | "phrase") || "vocabulary",
          context: args.context,
          notes: args.notes,
          createdAt: new Date().toISOString(),
          afterMessageIndex: lastUserMessageIndex, // Position after user's message, before AI's reply
        };
        
        setFlashcards(prev => [...prev, flashcard]);
        
        // Save to database in background (fire and forget)
        if (effectiveUserId) {
          authFetch("/api/flashcards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: effectiveUserId,
              language: lang,
              concept: args.concept,
              type: args.type || "vocabulary",
              context: args.context,
              notes: args.notes,
            }),
          }).catch(err => console.error("Failed to save flashcard:", err));
        }
        
        // Send result back to continue the conversation
        liveProviderRef.current?.sendFunctionResult({
          callId: call.id,
          name: call.name,
          result: { saved: true },
        });
        break;
      }
      default:
        console.warn("Unknown function call:", call.name);
    }
  }, [effectiveUserId, authFetch, lang]);

  // Reference to liveProvider for use in callbacks
  const liveProviderRef = useRef<ReturnType<typeof useLiveProvider> | null>(null);

  const liveProvider = useLiveProvider({
    provider: selectedProvider,
    voiceName: "Kore",
    systemInstruction,
    functions: GAME_FUNCTIONS,
    inputLanguage: getLanguageCode(lang), // Help transcription recognize the expected language
    onUserTranscript: handleUserTranscript,
    onModelTranscript: handleModelTranscript,
    onFunctionCall: handleFunctionCall,
  });
  
  // Keep ref updated
  liveProviderRef.current = liveProvider;

  // Fallback: Parse READ_ALOUD: markers from messages (for providers without function calling)
  // This works alongside function calling - functions take priority when available
  useEffect(() => {
    // Skip if card is already shown
    if (readAloudCard !== null) return;
    
    // Look for READ_ALOUD: marker in recent messages
    for (let i = messages.length - 1; i >= Math.max(0, messages.length - 3); i--) {
      const msg = messages[i];
      if (msg.role === "assistant" && msg.content.includes("READ_ALOUD:")) {
        const match = msg.content.match(/READ_ALOUD:\s*([\s\S]+)/);
        if (match) {
          const text = match[1].trim();
          setReadAloudCard({ text });
          return;
        }
      }
    }
  }, [messages, readAloudCard]);

  // Auto-dismiss marker-based card after conversation progresses (3+ messages after the marker)
  useEffect(() => {
    if (readAloudCard === null) return;
    
    // Find the marker message
    let markerIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && messages[i].content.includes("READ_ALOUD:")) {
        markerIndex = i;
        break;
      }
    }
    
    // If we found a marker and there are 3+ messages after it, dismiss the card
    if (markerIndex >= 0) {
      const messagesAfter = messages.length - 1 - markerIndex;
      if (messagesAfter > 2) {
        setReadAloudCard(null);
      }
    }
  }, [messages, readAloudCard]);

  // Track previous isModelSpeaking state to detect when model STOPS speaking
  const wasModelSpeakingRef = useRef(false);
  const langRef = useRef(lang);
  langRef.current = lang;
  const useLatinLettersRef = useRef(useLatinLetters);
  useLatinLettersRef.current = useLatinLetters;

  // Track message count when model stopped speaking (to detect if user has spoken)
  const messageCountWhenModelStoppedRef = useRef<number>(-1);
  
  // Handle turn transitions: seal messages and generate suggestions
  useEffect(() => {
    const wasModelSpeaking = wasModelSpeakingRef.current;
    wasModelSpeakingRef.current = liveProvider.isModelSpeaking;

    const modelJustStarted = liveProvider.isModelSpeaking && !wasModelSpeaking;
    const modelJustStopped = !liveProvider.isModelSpeaking && wasModelSpeaking && liveProvider.status === "connected";

    // Model just STARTED speaking → user's turn is complete
    if (modelJustStarted) {
      sealLastOfRole("user");
      setSuggestions([]);
      setSuggestionsAfterMessageIndex(-1);
    }

    // Model just STOPPED speaking → model's turn is complete
    if (modelJustStopped) {
      sealLastOfRole("assistant");
      messageCountWhenModelStoppedRef.current = messagesRef.current.length;
    }

    // Clear suggestion timer if model starts speaking or disconnects
    if (liveProvider.status !== "connected" || liveProvider.isModelSpeaking) {
      if (suggestionTimerRef.current) {
        clearTimeout(suggestionTimerRef.current);
        suggestionTimerRef.current = null;
      }
      return;
    }

    // Only start suggestion timer when model just stopped
    if (!modelJustStopped || suggestionTimerRef.current) return;

    // Start 5-second timer to generate suggestions
    suggestionTimerRef.current = setTimeout(async () => {
      suggestionTimerRef.current = null;
      
      const currentMessages = messagesRef.current;
      
      // Check if user has started talking (new messages since model stopped)
      if (currentMessages.length > messageCountWhenModelStoppedRef.current) {
        return; // User has spoken, don't show suggestions
      }
      
      const lastAssistantMessage = [...currentMessages].reverse().find(m => m.role === "assistant");
      if (!lastAssistantMessage || lastAiMessageIdForSuggestionsRef.current === lastAssistantMessage.id) return;
      
      lastAiMessageIdForSuggestionsRef.current = lastAssistantMessage.id;

      try {
        const res = await fetch("/api/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationHistory: currentMessages.slice(-6).map(m => ({ role: m.role, content: m.content })),
            targetLanguage: langRef.current,
            useLatinLetters: useLatinLettersRef.current,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          // Only show suggestions if user still hasn't spoken
          const latestMessages = messagesRef.current;
          if (data.suggestions?.length > 0 && latestMessages.length <= messageCountWhenModelStoppedRef.current) {
            setSuggestions(data.suggestions);
            setSuggestionsAfterMessageIndex(latestMessages.length - 1);
          }
        }
      } catch (err) {
        console.error("Failed to fetch suggestions:", err);
      }
    }, 5000);
  }, [liveProvider.status, liveProvider.isModelSpeaking, sealLastOfRole]);


  // Handle orb click - simple on/off toggle
  const handleOrbClick = async () => {
    if (liveProvider.status === "disconnected" || liveProvider.status === "error") {
      const token = await getEphemeralToken(selectedProvider);
      if (!token) return console.error("Failed to get ephemeral token");
      
      sealAll();
      const context = await getUserContext();
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      await liveProvider.startSession(token, history, context);
    } else {
      sealAll();
      liveProvider.disconnect();
    }
  };

  // Handle game selection - works even when not connected
  const handleGameSelect = async (gameId: string) => {
    sealAll();
    setReadAloudCard(null); // Clear any existing read-aloud card
    
    if (liveProvider.status !== "connected") {
      const token = await getEphemeralToken(selectedProvider);
      if (!token) return console.error("Failed to get ephemeral token");
      
      const context = await getUserContext();
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      await liveProvider.startSession(token, history, `${context}\n<GAME type="${gameId}" />`, true);
    } else {
      liveProvider.sendPrompt(`<GAME type="${gameId}" />`);
    }
  };

  const isActive = liveProvider.status === "connected" || liveProvider.status === "connecting";

  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Handle provider switch - automatically restart session with new provider
  const handleProviderSwitch = async (newProvider: ProviderType) => {
    if (newProvider === selectedProvider) return;
    
    sealAll();
    setSelectedProvider(newProvider);
    
    if (isActive) {
      const token = await getEphemeralToken(newProvider);
      if (!token) return;
      
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      await liveProvider.switchProvider(newProvider, history, token);
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
              sealAll();
              const newLangCode = getLanguageCode(newLang);
              if (newLangCode) liveProvider.updateInputLanguage(newLangCode);
              
              const newLangIsNonLatin = isNonLatinLanguage(newLang);
              const newLangUseLatinLetters = newLangIsNonLatin ? (scriptModes[newLang] ?? true) : false;
              const scriptMode = newLangIsNonLatin && newLangUseLatinLetters ? "latin" : "native";
              const scriptInstruction = newLangIsNonLatin && newLangUseLatinLetters 
                ? ` Use ROMANIZED/LATIN letters only (e.g., romaji for Japanese, pinyin for Chinese).`
                : "";
              liveProvider.sendPrompt(
                `<LANGUAGE_SWITCH to="${newLang}" script="${scriptMode}" /> IMPORTANT: From this point forward, you are now teaching ${newLang}. Speak ONLY in ${newLang}.${scriptInstruction} Greet the user briefly in ${newLang}.`
              );
            }
          }}
        />
        
        {/* Latin letters toggle - only for non-Latin script languages */}
        {langIsNonLatin && (
          <div className="flex items-center justify-center mt-3">
            <Toggle
              checked={useLatinLetters}
              onChange={(newValue) => {
                setScriptMode(lang, newValue);
                if (liveProvider.status === "connected") {
                  sealAll();
                  const prompt = newValue
                    ? `<SCRIPT_MODE mode="latin" /> From now on, ALWAYS use romanized/Latin letters instead of native script. For example: use "Nǐ hǎo" not "你好", use "Konnichiwa" not "こんにちは". Acknowledge briefly.`
                    : `<SCRIPT_MODE mode="native" /> From now on, use the native script/alphabet of the language (not romanization). For example: use "你好" not "Nǐ hǎo", use "こんにちは" not "Konnichiwa". Acknowledge briefly.`;
                  liveProvider.sendPrompt(prompt);
                }
              }}
              label="Latin letters"
              badge="ABC"
            />
          </div>
        )}
        
        {/* Disclaimer for unsupported languages */}
        {!langIsSupported && (
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
        
        {/* Browser compatibility warning */}
        {showBrowserWarning && (
          <p className="text-center text-xs text-amber-500/80 mt-3 px-4 max-w-xs">
            ⚠️ For best audio quality, use Chrome or Safari. Other browsers may have issues.
          </p>
        )}
      </div>

      {/* Read Aloud Display (via function calling) */}
      {readAloudCard && (
        <ReadAloudCard
          text={readAloudCard.text}
          phonetic={readAloudCard.phonetic}
          translation={readAloudCard.translation}
          onDismiss={() => setReadAloudCard(null)}
        />
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
                await clearHistory();
              }
            }}
            className="absolute top-2 right-2 p-1.5 rounded-full text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Clear chat history"
          >
            <TrashIcon />
          </button>
          <ConversationPanel
            messages={messages}
            flashcards={flashcards}
            onDeleteFlashcard={(id) => setFlashcards(prev => prev.filter(f => f.id !== id))}
            isModelSpeaking={liveProvider.isModelSpeaking}
            currentLanguage={selectedLanguage}
            suggestions={suggestions}
            suggestionsAfterMessageIndex={suggestionsAfterMessageIndex}
          />
        </div>
      )}

      {/* Sign-in suggestion for anonymous users */}
      {isAnonymous && showSignInPrompt && (
        <SignInPrompt onLogin={login} />
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
