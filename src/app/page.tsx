"use client";

import Link from "next/link";
import { VoiceChat } from "@/components/VoiceChat";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, isLoading, logout, isAnonymous } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-secondary/20" />
      
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-primary/5 to-transparent rounded-full" />

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-12">
        {/* User menu */}
        <div className="absolute top-4 right-4 flex items-center gap-3">
          {user?.email ? (
            <>
              <span className="text-sm text-muted-foreground">{user.email}</span>
              <button
                onClick={logout}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>

        {/* Header */}
        <header className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-6">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-medium text-primary">AI-Powered</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-4">
            <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">
              Lingo
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground max-w-md mx-auto">
            Learn any language through natural conversation with AI
          </p>
        </header>

        {/* Main Content */}
        <main className="w-full max-w-2xl mx-auto">
          <VoiceChat />
        </main>

        {/* Footer */}
        <footer className="mt-16 text-center">
          <p className="text-xs text-muted-foreground/40">
            Powered by Gemini & OpenAI Realtime APIs
          </p>
        </footer>
      </div>
    </div>
  );
}
