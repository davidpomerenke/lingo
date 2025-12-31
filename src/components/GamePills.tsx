"use client";

import { cn } from "@/lib/utils";

// Game definitions with descriptions for future implementation
const games = [
  // === READING & PRONUNCIATION ===
  {
    id: "read-aloud",
    emoji: "📖",
    label: "Read Aloud",
    enabled: true, // IMPLEMENTED
    // Description: Display text in target language, user reads it aloud,
    // AI listens and comments on pronunciation mistakes, rhythm, and intonation.
    // Good for: pronunciation practice, reading fluency
  },
  {
    id: "tongue-twisters",
    emoji: "👅",
    label: "Tongue Twisters",
    enabled: false,
    // Description: AI presents tongue twisters in target language.
    // User practices saying them, AI provides feedback on pronunciation.
    // Good for: difficult sound combinations, speed, clarity
  },
  {
    id: "minimal-pairs",
    emoji: "🔊",
    label: "Minimal Pairs",
    enabled: false,
    // Description: Practice distinguishing similar sounds (ship/sheep, rue/roux).
    // AI says pairs, user identifies or repeats the correct one.
    // Good for: phoneme discrimination, accent reduction
  },

  // === LISTENING & REPETITION ===
  {
    id: "listen-repeat",
    emoji: "👂",
    label: "Listen & Repeat",
    enabled: false,
    // Description: AI says a phrase WITHOUT displaying it.
    // User must repeat what they heard. AI confirms or corrects.
    // Difficulty scales with user level (single words → complex sentences).
    // Good for: listening comprehension, auditory memory, pronunciation
  },
  {
    id: "emotion-echo",
    emoji: "🎭",
    label: "Emotion Echo",
    enabled: false,
    // Description: AI says a phrase with specific emotion/intonation.
    // User repeats with the SAME emotion. AI evaluates intonation match.
    // Good for: prosody, emotional expression, natural speech patterns
  },

  // === TRANSLATION & VOCABULARY ===
  {
    id: "translate-this",
    emoji: "🔄",
    label: "Translate This",
    enabled: false,
    // Description: AI says a phrase in user's native language.
    // User translates it to target language. AI confirms or provides correction.
    // Good for: active vocabulary, sentence construction, grammar
  },
  {
    id: "guess-word",
    emoji: "🎯",
    label: "Guess the Word",
    enabled: true, // IMPLEMENTED
    // Description: AI describes a concept/object without saying the word.
    // User guesses the word in target language.
    // Good for: vocabulary, circumlocution, listening comprehension
  },
  {
    id: "word-association",
    emoji: "⚡",
    label: "Word Association",
    enabled: false,
    // Description: AI says a word, user says first related word in target language.
    // Fast-paced, trains quick recall. AI may ask "why that word?"
    // Good for: vocabulary breadth, quick thinking, semantic networks
  },

  // === NUMBERS & PRACTICAL ===
  {
    id: "numbers-game",
    emoji: "🔢",
    label: "Numbers Game",
    enabled: false,
    // Description: Practice numbers, dates, times, prices, phone numbers.
    // AI says or asks for numbers, user responds. Can include math problems.
    // Good for: practical fluency, numbers (often tricky), listening precision
  },

  // === QUICK RESPONSE ===
  {
    id: "quick-questions",
    emoji: "❓",
    label: "Quick Questions",
    enabled: false,
    // Description: AI rapid-fires simple personal questions.
    // (Name, age, weather, what did you eat, what will you do tomorrow)
    // User answers quickly without overthinking.
    // Good for: fluency, common question patterns, automatic responses
  },
  {
    id: "fill-the-gap",
    emoji: "📝",
    label: "Fill the Gap",
    enabled: false,
    // Description: AI says a sentence with a *beep* or pause for missing word.
    // User provides the missing word. Tests grammar, vocabulary, context.
    // Good for: grammar patterns, collocations, listening + production
  },
  {
    id: "speed-round",
    emoji: "⏱️",
    label: "Speed Round",
    enabled: false,
    // Description: 30-60 second challenge with rapid simple prompts.
    // "Say a fruit! A color! An animal! Count to 10! Say today's date!"
    // Good for: automaticity, time pressure practice, confidence
  },

  // === CONVERSATION & CONTEXT ===
  {
    id: "role-play",
    emoji: "🎬",
    label: "Role Play",
    enabled: false,
    // Description: Practice real-life scenarios: ordering food, asking directions,
    // job interview, doctor visit, hotel check-in, phone call, complaint, etc.
    // AI plays the other role. User must navigate the situation.
    // Good for: practical fluency, cultural context, confidence
  },
  {
    id: "story-builder",
    emoji: "📖",
    label: "Story Builder",
    enabled: false,
    // Description: Collaborative storytelling. AI starts a story with 1-2 sentences.
    // User continues. AI continues. Back and forth.
    // Good for: creativity, narrative tenses, vocabulary in context
  },
  {
    id: "debate-me",
    emoji: "💬",
    label: "Debate Me",
    enabled: false,
    // Description: AI takes a position on a topic (pineapple on pizza, remote work).
    // User must argue the opposite. AI pushes back.
    // Good for: advanced grammar, argumentation, opinion vocabulary
  },

  // === CULTURE & IDIOMS ===
  {
    id: "idiom-day",
    emoji: "🌍",
    label: "Idiom of the Day",
    enabled: false,
    // Description: AI teaches an idiom/proverb, explains meaning and origin.
    // User must use it in a sentence. AI confirms or helps.
    // Good for: cultural fluency, natural expressions, advanced vocabulary
  },
  {
    id: "sing-along",
    emoji: "🎵",
    label: "Sing Along",
    enabled: false,
    // Description: Learn phrases through popular song lyrics.
    // AI presents lines, explains meaning, user repeats/sings.
    // Good for: rhythm, pronunciation, cultural connection, memory
  },

  // === GRAMMAR ===
  {
    id: "conjugation",
    emoji: "🔧",
    label: "Conjugation Drill",
    enabled: false,
    // Description: Verb conjugation practice. AI gives infinitive + subject/tense.
    // User conjugates. Focused drill on specific tenses or irregular verbs.
    // Good for: verb mastery, automatic conjugation
  },
  {
    id: "grammar-focus",
    emoji: "📐",
    label: "Grammar Focus",
    enabled: false,
    // Description: Practice specific grammar structures (cases, gender, articles,
    // subjunctive, conditionals, relative clauses, etc.)
    // AI provides context sentences, user completes or transforms.
    // Good for: targeted grammar improvement
  },

  // === ALPHABET (for non-Latin scripts) ===
  {
    id: "alphabet-practice",
    emoji: "🔤",
    label: "Alphabet Practice",
    enabled: false,
    // Description: For languages with different alphabets (Greek, Russian, Arabic, etc.)
    // AI creates text in user's language, transliterates to target alphabet.
    // User reads aloud the transliterated text (reading their own language in new script).
    // Uses alphabetify.js or similar for transliteration.
    // Good for: alphabet recognition, reading fluency before vocabulary
  },
];

interface GamePillsProps {
  onSelectGame: (gameId: string) => void;
  disabled?: boolean;
}

export function GamePills({ onSelectGame, disabled }: GamePillsProps) {
  return (
    <div className="w-full">
      <h4 className="text-xs font-medium text-muted-foreground/60 mb-2 text-center">
        Practice Games
      </h4>
      <div className="flex flex-wrap justify-center gap-1.5">
        {games.map((game) => (
          <button
            key={game.id}
            onClick={() => onSelectGame(game.id)}
            disabled={disabled || !game.enabled}
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
              "border",
              game.enabled && !disabled
                ? "bg-secondary/50 border-border text-foreground hover:bg-secondary hover:border-primary/30 cursor-pointer"
                : "bg-muted/30 border-transparent text-muted-foreground/40 cursor-not-allowed"
            )}
          >
            <span>{game.emoji}</span>
            <span>{game.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function getGameById(id: string) {
  return games.find((g) => g.id === id);
}

