"use client";

import { useState } from "react";

interface SignInPromptProps {
  onLogin: (email: string) => Promise<{ success: boolean }>;
}

export function SignInPrompt({ onLogin }: SignInPromptProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setStatus("sending");
    const result = await onLogin(email);
    setStatus(result.success ? "sent" : "error");
  };

  return (
    <div className="glass rounded-2xl p-6">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold">Save your progress</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Sign in to keep your conversation history
        </p>
      </div>
      
      {status === "sent" ? (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground">
            Check your email for a magic link to sign in.<br />
            Your conversation will be saved!
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full px-4 py-3 bg-secondary/50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
            disabled={status === "sending"}
          />
          <button
            type="submit"
            disabled={status === "sending" || !email}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-all"
          >
            {status === "sending" ? "Sending..." : "Sign in with Email"}
          </button>
          {status === "error" && (
            <p className="text-sm text-destructive text-center">Failed to send email. Try again.</p>
          )}
        </form>
      )}
    </div>
  );
}

