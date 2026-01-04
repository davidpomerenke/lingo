"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Message } from "@/types/message";
import { useAuth } from "@/lib/auth-context";

const SHOW_SIGNIN_AFTER_MESSAGES = 10;

interface UseMessagesOptions {
  onSignInPrompt?: () => void;
}

export function useMessages(options: UseMessagesOptions = {}) {
  const { effectiveUserId, authFetch } = useAuth();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Trigger to force save effect to run when messages are sealed
  const [saveTrigger, setSaveTrigger] = useState(0);
  
  // Track what's already saved to avoid duplicate saves
  const lastSavedRef = useRef<Map<string, string>>(new Map());
  // Track "sealed" message IDs - messages we should never append to
  const sealedMessageIdsRef = useRef<Set<string>>(new Set());
  // Keep messages ref updated for callbacks that need current value
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // Store callback in ref to avoid dependency issues
  const onSignInPromptRef = useRef(options.onSignInPrompt);
  onSignInPromptRef.current = options.onSignInPrompt;
  // Track if we've already loaded to prevent re-fetching
  const hasLoadedRef = useRef(false);

  // Load messages from database on mount (only once)
  useEffect(() => {
    if (!effectiveUserId || hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    
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
          
          // Show sign-in suggestion after threshold
          if (data.isAnonymous && data.messageCount >= SHOW_SIGNIN_AFTER_MESSAGES) {
            onSignInPromptRef.current?.();
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
  // Only save SEALED messages (complete, not still streaming)
  useEffect(() => {
    if (isLoading || !effectiveUserId) return;

    async function saveMessages() {
      for (const msg of messages) {
        // Only save messages that are sealed (complete)
        if (!sealedMessageIdsRef.current.has(msg.id)) continue;
        
        const savedContent = lastSavedRef.current.get(msg.id);
        if (savedContent === undefined) {
          // Mark as "in-flight" IMMEDIATELY to prevent concurrent duplicate inserts
          lastSavedRef.current.set(msg.id, msg.content);
          
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
          
          // Show sign-in suggestion after threshold
          if (res.ok) {
            const data = await res.json();
            if (data.isAnonymous && data.messageCount >= SHOW_SIGNIN_AFTER_MESSAGES) {
              onSignInPromptRef.current?.();
            }
          }
        } else if (savedContent !== msg.content) {
          // Mark as "in-flight" IMMEDIATELY to prevent concurrent duplicate updates
          lastSavedRef.current.set(msg.id, msg.content);
          
          // Existing message - update
          await authFetch("/api/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: msg.id, content: msg.content, update: true }),
          });
        }
      }
    }
    saveMessages();
  }, [messages, isLoading, effectiveUserId, authFetch, saveTrigger]);

  // Check if a message is sealed
  const isSealed = useCallback((id: string) => {
    return sealedMessageIdsRef.current.has(id);
  }, []);

  // Seal all current messages
  const sealAll = useCallback(() => {
    const currentMessages = messagesRef.current;
    currentMessages.forEach(m => sealedMessageIdsRef.current.add(m.id));
    setSaveTrigger(t => t + 1);
  }, []);

  // Seal the last message of a given role
  const sealLastOfRole = useCallback((role: "user" | "assistant") => {
    const currentMessages = messagesRef.current;
    for (let i = currentMessages.length - 1; i >= 0; i--) {
      if (currentMessages[i].role === role) {
        sealedMessageIdsRef.current.add(currentMessages[i].id);
        setSaveTrigger(t => t + 1);
        break;
      }
    }
  }, []);

  // Add or append to a message (for streaming transcripts)
  const addTranscript = useCallback((
    role: "user" | "assistant",
    text: string,
    metadata: { language: string; useLatinLetters: boolean; provider: "gemini" | "openai" }
  ) => {
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      const lastIsSealed = lastMessage && sealedMessageIdsRef.current.has(lastMessage.id);
      
      if (lastIsSealed || !lastMessage || lastMessage.role !== role) {
        return [...prev, { 
          id: crypto.randomUUID(), 
          role, 
          content: text,
          language: metadata.language,
          useLatinLetters: metadata.useLatinLetters,
          provider: metadata.provider,
        }];
      }
      return [
        ...prev.slice(0, -1),
        { ...lastMessage, content: lastMessage.content + text },
      ];
    });
  }, []);

  // Clear all messages
  const clearHistory = useCallback(async () => {
    await authFetch("/api/messages", { method: "DELETE" });
    setMessages([]);
    lastSavedRef.current.clear();
    sealedMessageIdsRef.current.clear();
  }, [authFetch]);

  // Get last message by role
  const getLastMessageByRole = useCallback((role: "user" | "assistant"): Message | undefined => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === role) {
        return messages[i];
      }
    }
    return undefined;
  }, [messages]);

  // Get the last message's metadata (for restoring session state)
  const lastMessageMeta = messages.length > 0 ? {
    language: messages[messages.length - 1].language,
    provider: messages[messages.length - 1].provider,
  } : null;

  return {
    messages,
    messagesRef,
    isLoading,
    isSealed,
    sealAll,
    sealLastOfRole,
    addTranscript,
    clearHistory,
    getLastMessageByRole,
    lastMessageMeta,
  };
}

