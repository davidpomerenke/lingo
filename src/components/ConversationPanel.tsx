"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

// RTL languages
const RTL_LANGUAGES = new Set([
  "Arabic", "Hebrew", "Persian", "Urdu", "Pashto", "Dari", "Kurdish"
]);

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
}

// Check if a message should be displayed RTL
function isMessageRTL(message: Message): boolean {
  if (!message.language) return false;
  // Only RTL when using native script (not Latin letters)
  if (message.useLatinLetters) return false;
  return RTL_LANGUAGES.has(message.language);
}

export function ConversationPanel({ messages, isModelSpeaking }: ConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="w-full max-w-md mx-auto">
      <div
        ref={scrollRef}
        className={cn(
          "h-48 overflow-y-auto px-4 py-3",
          "scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
        )}
      >
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground/60 text-sm italic">
            Start speaking to begin the conversation...
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              const rtl = isMessageRTL(message);
              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    dir={rtl ? "rtl" : "ltr"}
                    className={cn(
                      "max-w-[85%] px-4 py-2 rounded-2xl text-sm",
                      message.role === "user"
                        ? "bg-primary/20 text-foreground rounded-br-sm"
                        : "bg-secondary text-foreground rounded-bl-sm",
                      rtl && "text-right"
                    )}
                  >
                    {message.content}
                  </div>
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
    </div>
  );
}

