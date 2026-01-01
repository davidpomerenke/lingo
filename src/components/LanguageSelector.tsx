"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

// Common languages with metadata (for suggestions and flags)
const LANGUAGE_DATA: Record<string, { nativeName: string; flag: string }> = {
  "English": { nativeName: "English", flag: "🇬🇧" },
  "Spanish": { nativeName: "Español", flag: "🇪🇸" },
  "French": { nativeName: "Français", flag: "🇫🇷" },
  "German": { nativeName: "Deutsch", flag: "🇩🇪" },
  "Italian": { nativeName: "Italiano", flag: "🇮🇹" },
  "Dutch": { nativeName: "Nederlands", flag: "🇳🇱" },
  "Greek": { nativeName: "Ελληνικά", flag: "🇬🇷" },
  "Latin": { nativeName: "Latina", flag: "🏛️" },
  "Japanese": { nativeName: "日本語", flag: "🇯🇵" },
  "Korean": { nativeName: "한국어", flag: "🇰🇷" },
  "Chinese": { nativeName: "中文", flag: "🇨🇳" },
  "Arabic": { nativeName: "العربية", flag: "🇸🇦" },
  "Hindi": { nativeName: "हिन्दी", flag: "🇮🇳" },
  "Portuguese": { nativeName: "Português", flag: "🇵🇹" },
  "Russian": { nativeName: "Русский", flag: "🇷🇺" },
  "Turkish": { nativeName: "Türkçe", flag: "🇹🇷" },
  "Polish": { nativeName: "Polski", flag: "🇵🇱" },
  "Swedish": { nativeName: "Svenska", flag: "🇸🇪" },
  "Norwegian": { nativeName: "Norsk", flag: "🇳🇴" },
  "Danish": { nativeName: "Dansk", flag: "🇩🇰" },
  "Finnish": { nativeName: "Suomi", flag: "🇫🇮" },
  "Czech": { nativeName: "Čeština", flag: "🇨🇿" },
  "Hungarian": { nativeName: "Magyar", flag: "🇭🇺" },
  "Romanian": { nativeName: "Română", flag: "🇷🇴" },
  "Ukrainian": { nativeName: "Українська", flag: "🇺🇦" },
  "Vietnamese": { nativeName: "Tiếng Việt", flag: "🇻🇳" },
  "Thai": { nativeName: "ไทย", flag: "🇹🇭" },
  "Indonesian": { nativeName: "Bahasa Indonesia", flag: "🇮🇩" },
  "Malay": { nativeName: "Bahasa Melayu", flag: "🇲🇾" },
  "Hebrew": { nativeName: "עברית", flag: "🇮🇱" },
  "Persian": { nativeName: "فارسی", flag: "🇮🇷" },
  "Swahili": { nativeName: "Kiswahili", flag: "🇰🇪" },
};

const ALL_SUGGESTIONS = Object.keys(LANGUAGE_DATA);

function getLanguageInfo(name: string) {
  const data = LANGUAGE_DATA[name];
  return {
    name,
    nativeName: data?.nativeName || name,
    flag: data?.flag || "🌐",
  };
}

interface LanguageSelectorProps {
  selectedLanguage: string;
  onSelectLanguage: (language: string) => void;
}

export function LanguageSelector({ selectedLanguage, onSelectLanguage }: LanguageSelectorProps) {
  const { languages, setLanguages } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [newLanguage, setNewLanguage] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close modal on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    if (showSettings) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSettings]);

  // Update suggestions as user types
  useEffect(() => {
    if (!newLanguage.trim()) {
      setSuggestions([]);
      return;
    }
    const query = newLanguage.toLowerCase();
    const matches = ALL_SUGGESTIONS.filter(
      (lang) =>
        lang.toLowerCase().includes(query) &&
        !languages.includes(lang)
    ).slice(0, 5);
    setSuggestions(matches);
  }, [newLanguage, languages]);

  const addLanguage = (lang: string) => {
    const trimmed = lang.trim();
    if (trimmed && !languages.includes(trimmed)) {
      setLanguages([...languages, trimmed]);
    }
    setNewLanguage("");
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const removeLanguage = (lang: string) => {
    if (languages.length <= 1) return; // Keep at least one
    const newLangs = languages.filter((l) => l !== lang);
    setLanguages(newLangs);
    // If removed the selected language, select first available
    if (selectedLanguage === lang && newLangs.length > 0) {
      onSelectLanguage(newLangs[0]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && newLanguage.trim()) {
      e.preventDefault();
      // If there's a matching suggestion, use it (preserves casing)
      const match = suggestions.find(
        (s) => s.toLowerCase() === newLanguage.toLowerCase()
      );
      addLanguage(match || newLanguage);
    }
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap justify-center gap-2">
        {languages.map((langName) => {
          const info = getLanguageInfo(langName);
          return (
            <button
              key={langName}
              onClick={() => onSelectLanguage(langName)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200",
                "border text-sm font-medium",
                selectedLanguage === langName
                  ? "bg-primary/20 border-primary text-foreground"
                  : "bg-secondary/50 border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <span className="text-lg">{info.flag}</span>
              <span>{info.name}</span>
            </button>
          );
        })}
        
        {/* Settings button - 46×46px matches pill height exactly */}
        <button
          onClick={() => setShowSettings(true)}
          className={cn(
            "flex items-center justify-center w-[46px] h-[46px] rounded-full transition-all duration-200",
            "border bg-secondary/30 border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
          title="Edit languages"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            ref={modalRef}
            className="glass rounded-2xl p-6 w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Edit Languages</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-5 h-5"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            {/* Current languages */}
            <div className="flex flex-wrap gap-2 mb-4">
              {languages.map((lang) => {
                const info = getLanguageInfo(lang);
                return (
                  <div
                    key={lang}
                    className="flex items-center gap-1 px-3 py-1.5 bg-secondary/50 border border-border rounded-full text-sm"
                  >
                    <span>{info.flag}</span>
                    <span>{lang}</span>
                    {languages.length > 1 && (
                      <button
                        onClick={() => removeLanguage(lang)}
                        className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-3.5 h-3.5"
                        >
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add new language */}
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={newLanguage}
                onChange={(e) => setNewLanguage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a language..."
                className="w-full px-4 py-3 bg-secondary/50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              
              {/* Suggestions dropdown */}
              {suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-secondary border border-border rounded-xl overflow-hidden z-10">
                  {suggestions.map((suggestion) => {
                    const info = getLanguageInfo(suggestion);
                    return (
                      <button
                        key={suggestion}
                        onClick={() => addLanguage(suggestion)}
                        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-primary/10 text-left transition-colors"
                      >
                        <span>{info.flag}</span>
                        <span>{suggestion}</span>
                        <span className="text-muted-foreground text-sm">
                          {info.nativeName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-3">
              Type any language name and press Enter to add it.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function getLanguageByName(name: string) {
  return getLanguageInfo(name);
}
