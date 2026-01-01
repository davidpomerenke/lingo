"use client";

import { cn } from "@/lib/utils";

interface VoiceOrbProps {
  isActive: boolean;
  label?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export function VoiceOrb({ isActive, label, onClick, disabled }: VoiceOrbProps) {
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

      {/* Label text when idle */}
      {!isActive && label && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-medium text-muted-foreground/80 select-none">
            {label}
          </span>
        </div>
      )}
    </button>
  );
}
