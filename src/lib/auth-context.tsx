"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

const DEFAULT_LANGUAGES = ["English","Spanish","French","Italian","German","Arabic","Hindi","Japanese","Korean","Chinese"];

interface User {
  id: string;
  email: string;
  languages: string[];
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAnonymous: boolean;
  effectiveUserId: string | null;
  languages: string[];
  setLanguages: (languages: string[]) => Promise<void>;
  login: (email: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  getEphemeralToken: (provider: "gemini" | "openai") => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_KEY = "lingo_session";
const ANON_KEY = "lingo_anon_id";
const LANGUAGES_KEY = "lingo_languages";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [anonId, setAnonId] = useState<string | null>(null);
  const [languages, setLanguagesState] = useState<string[]>(DEFAULT_LANGUAGES);
  const [isLoading, setIsLoading] = useState(true);

  // Check for session on mount
  useEffect(() => {
    const init = async () => {
      // Check URL for session (from magic link redirect)
      const params = new URLSearchParams(window.location.search);
      const urlSession = params.get("session");
      
      // Get or create anonymous ID
      let storedAnonId = localStorage.getItem(ANON_KEY);
      if (!storedAnonId) {
        storedAnonId = `anon_${crypto.randomUUID()}`;
        localStorage.setItem(ANON_KEY, storedAnonId);
      }
      setAnonId(storedAnonId);
      
      // Load languages from localStorage for anonymous users
      const storedLanguages = localStorage.getItem(LANGUAGES_KEY);
      if (storedLanguages) {
        try {
          setLanguagesState(JSON.parse(storedLanguages));
        } catch {
          // Invalid JSON, use defaults
        }
      }
      
      if (urlSession) {
        // Store session and clean URL
        localStorage.setItem(SESSION_KEY, urlSession);
        window.history.replaceState({}, "", window.location.pathname);
        
        // Migrate anonymous data to this user
        const anonLanguages = localStorage.getItem(LANGUAGES_KEY);
        try {
          await fetch("/api/auth/migrate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-session-id": urlSession,
            },
            body: JSON.stringify({ 
              anonId: storedAnonId,
              languages: anonLanguages ? JSON.parse(anonLanguages) : null,
            }),
          });
          // Clear anon data after migration
          localStorage.removeItem(ANON_KEY);
          localStorage.removeItem(LANGUAGES_KEY);
          setAnonId(null);
        } catch (e) {
          console.error("Failed to migrate:", e);
        }
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
              setLanguagesState(data.user.languages || DEFAULT_LANGUAGES);
            } else {
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
        body: JSON.stringify({ email, anonId }),
      });

      if (!res.ok) {
        const data = await res.json();
        return { success: false, error: data.error || "Failed to send login email" };
      }

      return { success: true };
    } catch {
      return { success: false, error: "Network error" };
    }
  }, [anonId]);

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
    setLanguagesState(DEFAULT_LANGUAGES);
    
    // Create new anon ID for fresh anonymous session
    const newAnonId = `anon_${crypto.randomUUID()}`;
    localStorage.setItem(ANON_KEY, newAnonId);
    setAnonId(newAnonId);
  }, [sessionId]);

  const setLanguages = useCallback(async (newLanguages: string[]) => {
    setLanguagesState(newLanguages);
    
    if (sessionId) {
      // Save to server for authenticated users
      try {
        await fetch("/api/user/languages", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-session-id": sessionId,
          },
          body: JSON.stringify({ languages: newLanguages }),
        });
        // Update user object
        setUser(prev => prev ? { ...prev, languages: newLanguages } : null);
      } catch (e) {
        console.error("Failed to save languages:", e);
      }
    } else {
      // Save to localStorage for anonymous users
      localStorage.setItem(LANGUAGES_KEY, JSON.stringify(newLanguages));
    }
  }, [sessionId]);

  const getEphemeralToken = useCallback(async (provider: "gemini" | "openai"): Promise<string | null> => {
    try {
      const res = await fetch("/api/auth/ephemeral-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionId && { "x-session-id": sessionId }),
          ...(anonId && { "x-anon-id": anonId }),
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
  }, [sessionId, anonId]);

  const isAnonymous = !user && !!anonId;
  const effectiveUserId = user?.id || anonId;

  return (
    <AuthContext.Provider value={{ 
      user, 
      isLoading, 
      isAnonymous,
      effectiveUserId,
      languages,
      setLanguages,
      login, 
      logout, 
      getEphemeralToken 
    }}>
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

export { DEFAULT_LANGUAGES };
