"use client";

import { cn } from "@/lib/utils";
import React, { useEffect, useRef, useState, useCallback } from "react";

// RTL languages
const RTL_LANGUAGES = new Set([
  "Arabic", "Hebrew", "Persian", "Urdu", "Pashto", "Dari", "Kurdish"
]);

const ONBOARDING_KEY = "lingo-translate-tip-seen";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  language?: string;
  useLatinLetters?: boolean;
}

interface ConversationPanelProps {
  messages: Message[];
  isModelSpeaking: boolean;
  currentLanguage?: string;
  suggestions?: string[];
  suggestionsAfterMessageIndex?: number;
}

interface WordBreakdown {
  word: string;
  translation: string;
  romanization?: string;
  note?: string;
}

interface TooltipData {
  text: string;
  x: number;
  y: number;
  language: string;
  translation?: string;
  romanization?: string;
  words?: WordBreakdown[];
  explanation?: string;
  loading: boolean;
}

// Helper to check if a character is CJK or other non-space script
function isCJKChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Extension A
    (code >= 0x3040 && code <= 0x309F) ||   // Hiragana
    (code >= 0x30A0 && code <= 0x30FF) ||   // Katakana
    (code >= 0xAC00 && code <= 0xD7AF) ||   // Korean Hangul
    (code >= 0x0E00 && code <= 0x0E7F) ||   // Thai
    (code >= 0x0600 && code <= 0x06FF) ||   // Arabic
    (code >= 0x0590 && code <= 0x05FF) ||   // Hebrew
    (code >= 0x0900 && code <= 0x097F) ||   // Devanagari (Hindi)
    (code >= 0x0400 && code <= 0x04FF) ||   // Cyrillic
    (code >= 0x0370 && code <= 0x03FF)      // Greek
  );
}

// Find word boundaries - works for both Latin and CJK scripts
function findWordBoundaries(text: string, offset: number): { start: number; end: number } | null {
  if (offset < 0 || offset >= text.length) return null;
  
  const char = text[offset];
  
  // For CJK characters, select just that character (or small cluster)
  if (isCJKChar(char)) {
    let start = offset;
    let end = offset + 1;
    
    // For Japanese, try to include attached hiragana (okurigana)
    while (end < text.length && /[\u3040-\u309F]/.test(text[end])) {
      end++;
    }
    
    return { start, end };
  }
  
  // For Latin/space-based scripts, find word boundaries
  if (/\w/.test(char)) {
    let start = offset;
    let end = offset;
    
    while (start > 0 && /\w/.test(text[start - 1])) {
      start--;
    }
    while (end < text.length && /\w/.test(text[end])) {
      end++;
    }
    
    return { start, end };
  }
  
  return null;
}

// Check if a message should be displayed RTL
function isMessageRTL(message: Message): boolean {
  if (!message.language) return false;
  // Only RTL when using native script (not Latin letters)
  if (message.useLatinLetters) return false;
  return RTL_LANGUAGES.has(message.language);
}

export function ConversationPanel({ messages, isModelSpeaking, currentLanguage, suggestions = [], suggestionsAfterMessageIndex = -1 }: ConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const firstMessageRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(true); // Start true to prevent flash

  // Check localStorage on mount
  useEffect(() => {
    const seen = localStorage.getItem(ONBOARDING_KEY);
    setOnboardingDismissed(seen === "true");
  }, []);

  // Show onboarding when first message appears
  useEffect(() => {
    if (messages.length > 0 && !onboardingDismissed && !showOnboarding) {
      // Small delay for the message to render
      const timer = setTimeout(() => setShowOnboarding(true), 500);
      return () => clearTimeout(timer);
    }
  }, [messages.length, onboardingDismissed, showOnboarding]);


  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
    setOnboardingDismissed(true);
    localStorage.setItem(ONBOARDING_KEY, "true");
  }, []);

  // Also dismiss onboarding when user successfully uses the feature
  useEffect(() => {
    if (tooltip && !tooltip.loading && tooltip.translation) {
      dismissOnboarding();
    }
  }, [tooltip, dismissOnboarding]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, suggestions]);

  // Find message from DOM element by traversing up to find data-message-id
  const findMessageFromElement = useCallback((element: Node | null): Message | null => {
    let current: Node | null = element;
    while (current && current !== containerRef.current) {
      if (current instanceof HTMLElement && current.dataset.messageId) {
        const messageId = current.dataset.messageId;
        return messages.find(m => m.id === messageId) || null;
      }
      current = current.parentNode;
    }
    return null;
  }, [messages]);

  // Play TTS audio for selected text
  const playTTS = useCallback(async (text: string, language: string) => {
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language }),
      });

      if (!response.ok) return;

      const data = await response.json();
      if (data.audio) {
        // Create audio from base64
        const audioData = atob(data.audio);
        const audioArray = new Uint8Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          audioArray[i] = audioData.charCodeAt(i);
        }
        const audioBlob = new Blob([audioArray], { type: data.mimeType });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.onended = () => URL.revokeObjectURL(audioUrl);
        audio.play().catch(console.error);
      }
    } catch (error) {
      console.error("TTS error:", error);
    }
  }, []);

  const fetchTranslation = useCallback(async (text: string, x: number, y: number, sourceMessage?: Message | null) => {
    const targetLanguage = sourceMessage?.language || currentLanguage || "English";
    setTooltip({ text, x, y, language: targetLanguage, loading: true });

    const context = sourceMessage?.content; // Full bubble text for context

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetLanguage, context }),
      });

      if (!response.ok) throw new Error("Translation failed");

      const data = await response.json();
      setTooltip((prev) =>
        prev && prev.text === text
          ? { 
              ...prev, 
              translation: data.translation, 
              romanization: data.romanization,  // undefined if not present
              words: data.words,  // undefined if not present
              explanation: data.explanation,  // undefined if not present
              loading: false 
            }
          : prev
      );
    } catch (error) {
      console.error("Translation error:", error);
      setTooltip((prev) =>
        prev && prev.text === text
          ? { ...prev, translation: "Translation failed", loading: false }
          : prev
      );
    }
  }, [currentLanguage]);

  // Shared logic for handling text selection (works for both mouse and touch)
  const handleSelection = useCallback(() => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    if (!selectedText || selectedText.length < 2) {
      return;
    }

    // Get selection position
    const range = selection?.getRangeAt(0);
    if (!range) return;

    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();

    if (!containerRect) return;

    // Check if selection is within our container
    const startNode = range.startContainer;
    if (!containerRef.current?.contains(startNode)) return;

    // Find the source message from the selection
    const sourceMessage = findMessageFromElement(startNode);

    // Position tooltip above the selection
    const x = rect.left + rect.width / 2 - containerRect.left;
    const y = rect.top - containerRect.top - 10;

    fetchTranslation(selectedText, x, y, sourceMessage);
  }, [fetchTranslation, findMessageFromElement]);

  const handleMouseUp = useCallback(() => {
    handleSelection();
  }, [handleSelection]);

  // Handle mobile text selection via selectionchange event
  // Mobile browsers finalize selection after touch interaction
  const selectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    const handleSelectionChange = () => {
      // Debounce selection changes - wait for user to finish selecting
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }
      
      selectionTimeoutRef.current = setTimeout(() => {
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim();
        
        // Only process if we have a substantial selection (not just a tap)
        if (selectedText && selectedText.length >= 2) {
          handleSelection();
        }
      }, 300); // Wait 300ms for selection to stabilize
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }
    };
  }, [handleSelection]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    // Only trigger if there's no text selection (simple click, not drag-select)
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      return; // Let handleMouseUp deal with selections
    }

    // Find the word at click position
    const target = e.target as HTMLElement;
    if (!target.textContent) return;

    // Get caret position from click
    let range: Range | null = null;
    
    // Use caretRangeFromPoint (WebKit) or caretPositionFromPoint (Firefox)
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(e.clientX, e.clientY);
    } else if ((document as unknown as { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } }).caretPositionFromPoint) {
      const pos = (document as unknown as { caretPositionFromPoint: (x: number, y: number) => { offsetNode: Node; offset: number } }).caretPositionFromPoint(e.clientX, e.clientY);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.setEnd(pos.offsetNode, pos.offset);
      }
    }

    if (!range || !range.startContainer.textContent) return;

    const text = range.startContainer.textContent;
    const offset = range.startOffset;

    // Find word boundaries (works for both Latin and CJK scripts)
    const boundaries = findWordBoundaries(text, offset);
    if (!boundaries) return;
    
    const { start, end } = boundaries;
    const word = text.slice(start, end).trim();
    if (!word) return;

    // Get position for tooltip
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    // Find the source message from the clicked element
    const sourceMessage = findMessageFromElement(range.startContainer);

    // Create a range for the word to highlight it and get its position
    const wordRange = document.createRange();
    wordRange.setStart(range.startContainer, start);
    wordRange.setEnd(range.startContainer, end);
    
    // Highlight the word by selecting it
    const newSelection = window.getSelection();
    if (newSelection) {
      newSelection.removeAllRanges();
      newSelection.addRange(wordRange);
    }
    
    const wordRect = wordRange.getBoundingClientRect();

    const x = wordRect.left + wordRect.width / 2 - containerRect.left;
    const y = wordRect.top - containerRect.top - 10;

    fetchTranslation(word, x, y, sourceMessage);
  }, [fetchTranslation, findMessageFromElement]);

  const handleMouseDown = useCallback(() => {
    // Clear tooltip when starting a new selection
    setTooltip(null);
  }, []);

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tooltip && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setTooltip(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [tooltip]);

  // Find first assistant message for onboarding tooltip positioning
  const firstAssistantMessage = messages.find(m => m.role === "assistant");

  return (
    <div className="w-full max-w-md mx-auto relative" ref={containerRef}>
      <div
        ref={scrollRef}
        className={cn(
          "h-72 overflow-y-auto px-4 py-3",
          "scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
        )}
        onMouseUp={handleMouseUp}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
      >
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground/60 text-sm italic">
            Start speaking to begin the conversation...
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => {
              const rtl = isMessageRTL(message);
              const isFirstAssistant = message.id === firstAssistantMessage?.id;
              // Show suggestions after the message at suggestionsAfterMessageIndex
              const showSuggestionsAfterThis = index === suggestionsAfterMessageIndex && suggestions.length > 0 && !isModelSpeaking;
              
              return (
                <React.Fragment key={message.id}>
                  <div
                    ref={isFirstAssistant ? firstMessageRef : undefined}
                    className={cn(
                      "flex relative",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      dir={rtl ? "rtl" : "ltr"}
                      data-message-id={message.id}
                      className={cn(
                        "max-w-[85%] px-4 py-2 rounded-2xl text-sm select-text cursor-text",
                        message.role === "user"
                          ? "bg-primary/20 text-foreground rounded-br-sm"
                          : "bg-secondary text-foreground rounded-bl-sm",
                        rtl && "text-right"
                      )}
                    >
                      {message.content}
                    </div>

                    {/* Onboarding tooltip - appears below first assistant message */}
                    {isFirstAssistant && showOnboarding && (
                      <div
                        className={cn(
                          "absolute left-0 top-full z-50",
                          "animate-in fade-in slide-in-from-top-2 duration-300"
                        )}
                        style={{ marginTop: "-8px" }}
                      >
                        {/* Primary color triangle pointing up into text */}
                        <div 
                          className="absolute left-5 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-b-[14px] border-b-primary"
                          style={{ top: "-12px" }}
                        />
                        <div 
                          className="relative bg-popover text-popover-foreground px-3 py-2 rounded-lg border-[1.5px] border-primary shadow-lg shadow-primary/20"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base">💡</span>
                            <p className="text-sm">Select any text to translate it!</p>
                            <button
                              onClick={dismissOnboarding}
                              className="ml-auto px-3 py-1 text-xs font-medium rounded-md bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
                            >
                              Got it
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Suggestions - shown inline after the message where they were generated */}
                  {showSuggestionsAfterThis && (
                    <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <div className="max-w-[85%] space-y-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 text-right mb-1">
                          You could say...
                        </div>
                        {suggestions.map((suggestion, i) => (
                          <div
                            key={i}
                            data-suggestion={i}
                            className={cn(
                              "px-3 py-1.5 rounded-xl text-sm cursor-text select-text",
                              "bg-primary/5 border border-dashed border-primary/30 text-foreground/70",
                              "animate-in fade-in slide-in-from-right-2 duration-300"
                            )}
                            style={{ animationDelay: `${i * 100}ms`, animationFillMode: "backwards" }}
                          >
                            {suggestion}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
            
          </div>
        )}
      </div>

      {/* Translation Tooltip */}
      {tooltip && (
        <div
          className={cn(
            "absolute z-50 px-3 py-2 rounded-lg shadow-lg",
            "bg-popover border border-border text-popover-foreground",
            "transform -translate-x-1/2 -translate-y-full",
            tooltip.words && tooltip.words.length > 0 ? "max-w-md" : "max-w-xs"
          )}
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
          }}
        >
          {/* Arrow */}
          <div
            className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0"
            style={{
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "6px solid hsl(var(--border))",
            }}
          />
          <div
            className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0"
            style={{
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: "5px solid hsl(var(--popover))",
              marginTop: "-1px",
            }}
          />

          {/* Close button */}
          <button
            onClick={() => setTooltip(null)}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-muted hover:bg-muted-foreground/20 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="text-xs">×</span>
          </button>

          {tooltip.loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Translating...
            </div>
          ) : (
            <div>
              {/* Overall translation */}
              <div className="text-sm font-medium">{tooltip.translation}</div>
              
              {/* Overall romanization */}
              {tooltip.romanization && (
                <div className="text-xs text-muted-foreground italic">{tooltip.romanization}</div>
              )}
              
              {/* Per-word breakdown table */}
              {tooltip.words && tooltip.words.length > 0 && (
                <table className="text-xs border-collapse mt-2">
                  <tbody>
                    {tooltip.words.map((w, i) => (
                      <tr key={i} className="border-t border-border/50">
                        <td className="py-0.5 pr-3 font-medium text-muted-foreground whitespace-nowrap">{w.word}</td>
                        {w.romanization && (
                          <td className="py-0.5 pr-3 text-muted-foreground italic whitespace-nowrap">{w.romanization}</td>
                        )}
                        <td className="py-0.5 pr-3 whitespace-nowrap">{w.translation}</td>
                        {w.note && <td className="py-0.5 text-muted-foreground italic text-[10px]">{w.note}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              
              {/* Overall explanation */}
              {tooltip.explanation && (
                <div className={cn(
                  "text-xs text-muted-foreground",
                  tooltip.words && tooltip.words.length > 0 ? "pt-1 mt-1 border-t border-border/50" : "mt-1"
                )}>
                  {tooltip.explanation}
                </div>
              )}
              
              {/* TTS button */}
              <button
                onClick={() => playTTS(tooltip.text, tooltip.language)}
                className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                title="Listen to pronunciation"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg>
                Listen
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
