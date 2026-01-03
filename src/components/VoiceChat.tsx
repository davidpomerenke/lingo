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
import { Toggle } from "./ui/toggle";
import { TrashIcon } from "./ui/icons";
import { LoadingSpinner } from "./ui/loading";
import { useAuth } from "@/lib/auth-context";
import { hasGoodAudioSupport, getUserContext } from "@/lib/utils";
import { buildSystemInstruction } from "@/lib/prompts";
import { 
  isNonLatinLanguage, 
  isSupportedLanguage, 
  getLanguageCode,
} from "@/lib/languages";

export function VoiceChat() {
  const { isAnonymous, getEphemeralToken, login, languages, scriptModes, setScriptMode } = useAuth();
  
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>("gemini");
  const [readAloudText, setReadAloudText] = useState<string | null>(null);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInStatus, setSignInStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
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
  
  // Track which message triggered the card
  const cardSourceMessageIdRef = useRef<string | null>(null);
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

  const liveProvider = useLiveProvider({
    provider: selectedProvider,
    voiceName: "Kore",
    systemInstruction,
    inputLanguage: getLanguageCode(lang), // Help transcription recognize the expected language
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
    setReadAloudText(null);
    cardSourceMessageIdRef.current = null;
    
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
            isModelSpeaking={liveProvider.isModelSpeaking}
            currentLanguage={selectedLanguage}
            suggestions={suggestions}
            suggestionsAfterMessageIndex={suggestionsAfterMessageIndex}
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
