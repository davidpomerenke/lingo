# Lingo - AI-Powered Language Learning

Learn any language through natural voice conversations with AI, powered by Google Gemini Live and OpenAI Realtime APIs.

## Features

- 🎤 **Voice-First Learning** - Practice speaking naturally with real-time AI responses
- 🤖 **Dual AI Providers** - Switch between Gemini and OpenAI mid-conversation
- 🌍 **8 Languages** - Learn Spanish, French, German, Italian, Dutch, Japanese, Greek, and Latin
- 💡 **Smart Feedback** - Get corrections and alternative phrasings from your AI tutor
- 🎮 **Practice Games** - Read Aloud and Guess the Word games for focused practice
- 💾 **Persistent Conversations** - Resume where you left off with Turso database storage
- 📍 **Context-Aware** - AI adapts greetings and topics based on time and location

## Tech Stack

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Beautiful UI components
- **Google Gemini Live API** - Real-time voice AI (native audio model)
- **OpenAI Realtime API** - GPT-4o voice conversations
- **Turso** - SQLite database for conversation persistence

## Getting Started

### Prerequisites

- Node.js 18+
- API keys:
  - [Google AI Studio](https://aistudio.google.com/apikey) for Gemini
  - [OpenAI Platform](https://platform.openai.com/api-keys) for OpenAI (optional)
- [Turso](https://turso.tech) database (for persistence)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/lingo.git
   cd lingo
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env.local` with your credentials:
   ```env
   NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_key
   NEXT_PUBLIC_OPENAI_API_KEY=your_openai_key
   TURSO_DATABASE_URL=libsql://your-db.turso.io
   TURSO_AUTH_TOKEN=your_turso_token
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000)

## Usage

1. Select the language you want to learn
2. Choose your AI provider (Gemini or OpenAI)
3. Click the orb to start a conversation
4. Speak naturally - the AI will respond in your target language
5. Try practice games for focused learning!

## Project Structure

```
src/
├── app/
│   ├── api/messages/       # Conversation persistence API
│   ├── globals.css         # Global styles and theme
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Main page
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── ConversationPanel.tsx
│   ├── GamePills.tsx       # Practice game buttons
│   ├── LanguageSelector.tsx
│   ├── ProviderSelector.tsx # Gemini/OpenAI toggle
│   ├── VoiceChat.tsx       # Main voice chat interface
│   └── VoiceOrb.tsx        # Animated voice button
├── hooks/
│   ├── useAudioPlayer.ts   # Audio playback
│   ├── useAudioRecorder.ts # Microphone recording
│   └── useLiveProvider.ts  # Unified AI provider hook
└── lib/
    ├── db.ts               # Turso database client
    ├── gemini-adapter.ts   # Gemini Live implementation
    ├── live-provider.ts    # Provider interface
    ├── openai-adapter.ts   # OpenAI Realtime implementation
    └── utils.ts
```

## License

MIT
