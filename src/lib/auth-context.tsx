"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  sessionId: string | null;
  login: (email: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  getEphemeralToken: (provider: "gemini" | "openai") => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_KEY = "lingo_session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for session on mount
  useEffect(() => {
    const init = async () => {
      // Check URL for session (from magic link redirect)
      const params = new URLSearchParams(window.location.search);
      const urlSession = params.get("session");
      
      if (urlSession) {
        // Store session and clean URL
        localStorage.setItem(SESSION_KEY, urlSession);
        window.history.replaceState({}, "", window.location.pathname);
      }

      // Get session from localStorage
      const storedSession = localStorage.getItem(SESSION_KEY);
      
      if (storedSession) {
        setSessionId(storedSession);
        
        // Validate session and get user
        try {
          const res = await fetch("/api/auth/me", {
            headers: { "x-session-id": storedSession },
          });
          
          if (res.ok) {
            const data = await res.json();
            if (data.user) {
              setUser(data.user);
            } else {
              // Invalid session
              localStorage.removeItem(SESSION_KEY);
              setSessionId(null);
            }
          } else {
            localStorage.removeItem(SESSION_KEY);
            setSessionId(null);
          }
        } catch {
          localStorage.removeItem(SESSION_KEY);
          setSessionId(null);
        }
      }
      
      setIsLoading(false);
    };

    init();
  }, []);

  const login = useCallback(async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        return { success: false, error: data.error || "Failed to send login email" };
      }

      return { success: true };
    } catch {
      return { success: false, error: "Network error" };
    }
  }, []);

  const logout = useCallback(async () => {
    if (sessionId) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "x-session-id": sessionId },
        });
      } catch {
        // Ignore errors
      }
    }
    
    localStorage.removeItem(SESSION_KEY);
    setSessionId(null);
    setUser(null);
  }, [sessionId]);

  const getEphemeralToken = useCallback(async (provider: "gemini" | "openai"): Promise<string | null> => {
    if (!sessionId) return null;

    try {
      const res = await fetch("/api/auth/ephemeral-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({ provider }),
      });

      if (!res.ok) {
        console.error("Failed to get ephemeral token");
        return null;
      }

      const data = await res.json();
      return data.token;
    } catch (error) {
      console.error("Error getting ephemeral token:", error);
      return null;
    }
  }, [sessionId]);

  return (
    <AuthContext.Provider value={{ user, isLoading, sessionId, login, logout, getEphemeralToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

