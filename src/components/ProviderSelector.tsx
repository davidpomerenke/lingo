"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import type { ProviderType } from "@/lib/live-provider";

interface Provider {
  id: ProviderType;
  name: string;
  icon: React.ReactNode;
  description: string;
}

const providers: Provider[] = [
  {
    id: "gemini",
    name: "Gemini",
    icon: <span className="text-base">✦</span>,
    description: "Google's native audio model",
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: <Image src="/openai-logo.svg" alt="OpenAI" width={16} height={16} className="dark:invert" />,
    description: "GPT-4o realtime voice",
  },
];

interface ProviderSelectorProps {
  selectedProvider: ProviderType;
  onSelectProvider: (provider: ProviderType) => void;
  className?: string;
}

export function ProviderSelector({
  selectedProvider,
  onSelectProvider,
  className,
}: ProviderSelectorProps) {
  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      {providers.map((provider) => (
        <button
          key={provider.id}
          onClick={() => onSelectProvider(provider.id)}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200",
            "border text-sm font-medium",
            selectedProvider === provider.id
              ? "bg-primary/20 border-primary text-foreground"
              : "bg-secondary/30 border-border text-muted-foreground hover:bg-secondary/50"
          )}
          title={provider.description}
        >
          {provider.icon}
          <span>{provider.name}</span>
        </button>
      ))}
    </div>
  );
}

export function getProviderById(id: ProviderType): Provider | undefined {
  return providers.find((p) => p.id === id);
}

