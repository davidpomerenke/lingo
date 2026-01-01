"use client";

import { VoiceChat } from "@/components/VoiceChat";

export default function Home() {
  const geminiApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
  const openaiApiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || "";

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
          <VoiceChat 
            geminiApiKey={geminiApiKey} 
            openaiApiKey={openaiApiKey} 
          />
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
