"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

const DEFAULT_LANGUAGES = ["English","Spanish","French","Italian","German","Arabic","Hindi","Japanese","Korean","Chinese"];

interface User {
  id: string;
  email: string | null; // null for anonymous users
  languages: string[];
  script_modes: Record<string, boolean>;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAnonymous: boolean;
  effectiveUserId: string | null;
  languages: string[];
  scriptModes: Record<string, boolean>; // Per-language: true = Latin letters, false = native
  setLanguages: (languages: string[]) => Promise<void>;
  setScriptMode: (language: string, useLatinLetters: boolean) => Promise<void>;
  login: (email: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  getEphemeralToken: (provider: "gemini" | "openai") => Promise<string | null>;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_KEY = "lingo_session";
const USER_ID_KEY = "lingo_user_id";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [languages, setLanguagesState] = useState<string[]>(DEFAULT_LANGUAGES);
  const [scriptModes, setScriptModesState] = useState<Record<string, boolean>>({});
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
      const storedSession = urlSession || localStorage.getItem(SESSION_KEY);
      
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
              setScriptModesState(data.user.script_modes || {});
              localStorage.setItem(USER_ID_KEY, data.user.id);
              setIsLoading(false);
              return;
            }
          }
        } catch {
          // Session invalid, continue to create new user
        }
        
        // Session was invalid, clear it
        localStorage.removeItem(SESSION_KEY);
      }
      
      // No valid session - initialize user (create or retrieve)
      const storedUserId = localStorage.getItem(USER_ID_KEY);
      
      try {
        const res = await fetch("/api/auth/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: storedUserId }),
        });
        
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setSessionId(data.sessionId);
          setLanguagesState(data.user.languages || DEFAULT_LANGUAGES);
          setScriptModesState(data.user.script_modes || {});
          localStorage.setItem(SESSION_KEY, data.sessionId);
          localStorage.setItem(USER_ID_KEY, data.user.id);
        }
      } catch (e) {
        console.error("Failed to initialize user:", e);
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
        body: JSON.stringify({ email, userId: user?.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        return { success: false, error: data.error || "Failed to send login email" };
      }

      return { success: true };
    } catch {
      return { success: false, error: "Network error" };
    }
  }, [user?.id]);

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
    localStorage.removeItem(USER_ID_KEY);
    setSessionId(null);
    setUser(null);
    setLanguagesState(DEFAULT_LANGUAGES);
    setScriptModesState({});
    
    // Create new anonymous user
    try {
      const res = await fetch("/api/auth/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setSessionId(data.sessionId);
        setLanguagesState(data.user.languages || DEFAULT_LANGUAGES);
        setScriptModesState(data.user.script_modes || {});
        localStorage.setItem(SESSION_KEY, data.sessionId);
        localStorage.setItem(USER_ID_KEY, data.user.id);
      }
    } catch (e) {
      console.error("Failed to create new user after logout:", e);
    }
  }, [sessionId]);

  const setLanguages = useCallback(async (newLanguages: string[]) => {
    setLanguagesState(newLanguages);
    setUser(prev => prev ? { ...prev, languages: newLanguages } : null);
    
    if (sessionId) {
      try {
        await fetch("/api/user/languages", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-session-id": sessionId,
          },
          body: JSON.stringify({ languages: newLanguages }),
        });
      } catch (e) {
        console.error("Failed to save languages:", e);
      }
    }
  }, [sessionId]);

  const setScriptMode = useCallback(async (language: string, useLatinLetters: boolean) => {
    const newScriptModes = { ...scriptModes, [language]: useLatinLetters };
    setScriptModesState(newScriptModes);
    setUser(prev => prev ? { ...prev, script_modes: newScriptModes } : null);
    
    if (sessionId) {
      try {
        await fetch("/api/user/languages", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-session-id": sessionId,
          },
          body: JSON.stringify({ scriptModes: newScriptModes }),
        });
      } catch (e) {
        console.error("Failed to save script mode:", e);
      }
    }
  }, [sessionId, scriptModes]);

  const getEphemeralToken = useCallback(async (provider: "gemini" | "openai"): Promise<string | null> => {
    try {
      const res = await fetch("/api/auth/ephemeral-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionId && { "x-session-id": sessionId }),
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

  // Helper to make authenticated API calls
  const authFetch = useCallback((url: string, options: RequestInit = {}): Promise<Response> => {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    
    if (sessionId) {
      headers["x-session-id"] = sessionId;
    }
    
    return fetch(url, { ...options, headers });
  }, [sessionId]);

  // Anonymous = user exists but has no email
  const isAnonymous = !!user && !user.email;
  const effectiveUserId = user?.id || null;

  return (
    <AuthContext.Provider value={{ 
      user, 
      isLoading, 
      isAnonymous,
      effectiveUserId,
      languages,
      scriptModes,
      setLanguages,
      setScriptMode,
      login, 
      logout, 
      getEphemeralToken,
      authFetch,
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
