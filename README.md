# Lingo - AI-Powered Language Learning

Learn any language through natural voice conversations with AI, powered by Google Gemini Live and OpenAI Realtime APIs.

## Features

- 🎤 **Voice-First Learning** - Practice speaking naturally with real-time AI responses
- 🤖 **Dual AI Providers** - Switch between Gemini and OpenAI mid-conversation
- 🌍 **8 Languages** - Learn Spanish, French, German, Italian, Dutch, Japanese, Greek, and Latin
- 💡 **Smart Feedback** - Get corrections and alternative phrasings from your AI tutor
- 🎮 **Practice Games** - Read Aloud and Guess the Word games for focused practice
- 💾 **Persistent Conversations** - Resume where you left off with per-user storage
- 📍 **Context-Aware** - AI adapts greetings and topics based on time and location
- 🔐 **Magic Link Auth** - Secure, passwordless authentication via email

## Tech Stack

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Beautiful UI components
- **Google Gemini Live API** - Real-time voice AI with ephemeral tokens
- **OpenAI Realtime API** - GPT-4o voice conversations with ephemeral tokens
- **Turso** - SQLite database for users, sessions, and conversations
- **Nodemailer** - Magic link authentication emails

## Getting Started

### Prerequisites

- Node.js 18+
- API keys:
  - [Google AI Studio](https://aistudio.google.com/apikey) for Gemini
  - [OpenAI Platform](https://platform.openai.com/api-keys) for OpenAI (optional)
- [Turso](https://turso.tech) database
- SMTP email account (for magic link auth)

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
   # AI Provider Keys (server-side, secure)
   GEMINI_API_KEY=your_gemini_key
   OPENAI_API_KEY=your_openai_key

   # Database
   TURSO_DATABASE_URL=libsql://your-db.turso.io
   TURSO_AUTH_TOKEN=your_turso_token

   # Email (for magic link auth)
   SMTP_HOST=mail.privateemail.com
   SMTP_PORT=465
   SMTP_USER=hello@yourdomain.com
   SMTP_PASS=your_email_password

   # App URL (for magic links)
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000)

## Security

API keys are kept secure on the server. When users connect to voice AI:
1. Client requests an ephemeral token from the server
2. Server generates a short-lived token (30 min) using the real API key
3. Client uses the ephemeral token for direct WebSocket connection
4. Real API keys are never exposed to the browser

## Usage

1. Sign in with your email (magic link)
2. Select the language you want to learn
3. Choose your AI provider (Gemini or OpenAI)
4. Click the orb to start a conversation
5. Speak naturally - the AI will respond in your target language
6. Try practice games for focused learning!

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/           # Auth endpoints (login, verify, logout, me, ephemeral-token)
│   │   └── messages/       # Conversation persistence
│   ├── login/              # Login page
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── ConversationPanel.tsx
│   ├── GamePills.tsx
│   ├── LanguageSelector.tsx
│   ├── ProviderSelector.tsx
│   ├── VoiceChat.tsx
│   └── VoiceOrb.tsx
├── hooks/
│   ├── useAudioPlayer.ts
│   ├── useAudioRecorder.ts
│   └── useLiveProvider.ts
└── lib/
    ├── auth-context.tsx    # React auth context
    ├── db.ts               # Turso database (users, sessions, messages)
    ├── email.ts            # Magic link emails
    ├── gemini-adapter.ts
    ├── live-provider.ts
    ├── openai-adapter.ts
    └── utils.ts
```

## License

MIT
