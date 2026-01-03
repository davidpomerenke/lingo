/**
 * Shared Message type used across the application
 */

import type { ProviderType } from "@/lib/live-provider";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  language?: string;
  useLatinLetters?: boolean;
  provider?: ProviderType;
}

