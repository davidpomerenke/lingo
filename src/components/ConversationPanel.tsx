"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState, useCallback } from "react";

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

export function ConversationPanel({ messages, isModelSpeaking, currentLanguage }: ConversationPanelProps) {
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
  }, [messages]);

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

  const fetchTranslation = useCallback(async (text: string, x: number, y: number, sourceMessage?: Message | null) => {
    setTooltip({ text, x, y, loading: true });

    const targetLanguage = sourceMessage?.language || currentLanguage || "English";
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

  const handleMouseUp = useCallback(() => {
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

    // Find the source message from the selection
    const sourceMessage = findMessageFromElement(range.startContainer);

    // Position tooltip above the selection
    const x = rect.left + rect.width / 2 - containerRect.left;
    const y = rect.top - containerRect.top - 10;

    fetchTranslation(selectedText, x, y, sourceMessage);
  }, [fetchTranslation, findMessageFromElement]);

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
          "h-48 overflow-y-auto px-4 py-3",
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
              return (
                <div
                  key={message.id}
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
              );
            })}
            
            {isModelSpeaking && (
              <div className="flex justify-start">
                <div className="bg-secondary px-4 py-2 rounded-2xl rounded-bl-sm">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0s" }} />
                    <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.15s" }} />
                    <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.3s" }} />
                  </div>
                </div>
              </div>
            )}
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
