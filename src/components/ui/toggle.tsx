"use client";

import { cn } from "@/lib/utils";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  badge?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, badge, disabled }: ToggleProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={cn(
          "relative w-11 h-6 rounded-full transition-colors duration-200 border",
          checked
            ? "bg-primary/20 border-primary"
            : "bg-secondary/50 border-border",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={cn(
            "absolute top-1/2 -translate-y-1/2 left-0.5 w-5 h-5 rounded-full shadow-sm transition-transform duration-200",
            checked
              ? "translate-x-[18px] bg-primary"
              : "translate-x-0 bg-muted-foreground/50"
          )}
        />
      </button>
      {(label || badge) && (
        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
          {label}
          {badge && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-secondary/50 text-muted-foreground/80">
              {badge}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

