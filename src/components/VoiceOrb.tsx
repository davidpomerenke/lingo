"use client";

import { cn } from "@/lib/utils";

interface VoiceOrbProps {
  isActive: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export function VoiceOrb({ isActive, onClick, disabled }: VoiceOrbProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative w-40 h-40 rounded-full transition-all duration-500",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/50",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {/* Outer glow rings - always show when active */}
      {isActive && (
        <>
          <div
            className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 to-accent/20 animate-pulse-ring"
            style={{ animationDelay: "0s" }}
          />
          <div
            className="absolute -inset-4 rounded-full bg-gradient-to-br from-primary/20 to-accent/10 animate-pulse-ring"
            style={{ animationDelay: "0.3s" }}
          />
          <div
            className="absolute -inset-8 rounded-full bg-gradient-to-br from-primary/10 to-accent/5 animate-pulse-ring"
            style={{ animationDelay: "0.6s" }}
          />
        </>
      )}

      {/* Main orb */}
      <div
        className={cn(
          "absolute inset-0 rounded-full transition-all duration-300 shadow-2xl bg-gradient-to-br",
          isActive
            ? "from-primary via-primary/80 to-accent shadow-primary/30 scale-105"
            : "from-muted via-secondary to-muted hover:from-secondary hover:via-muted hover:to-secondary"
        )}
      />

      {/* Inner highlight */}
      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-white/10 to-transparent" />

      {/* Waveform visualization when active */}
      {isActive && (
        <div className="absolute inset-0 flex items-center justify-center gap-1">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="waveform-bar"
              style={{
                height: `${8 + Math.sin((i / 8) * Math.PI) * 24}px`,
                opacity: 0.9,
              }}
            />
          ))}
        </div>
      )}

      {/* Microphone icon when idle */}
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-12 h-12 text-muted-foreground/60"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        </div>
      )}
    </button>
  );
}
