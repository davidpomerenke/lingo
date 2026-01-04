/**
 * System instruction and prompt builders for the language tutor
 */

import type { FunctionDefinition } from "./live-provider";

/**
 * Function definitions for games that use function calling
 */
export const GAME_FUNCTIONS: FunctionDefinition[] = [
  {
    name: "display_read_aloud",
    description: "Displays text on the user's screen for reading practice. Call this to show the text before asking the user to read it.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The text in the target language for the user to read aloud",
        },
        phonetic: {
          type: "string",
          description: "Pronunciation guide (romanization, IPA, or simplified phonetics) – optional",
        },
        translation: {
          type: "string",
          description: "English translation to help the user understand",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "dismiss_read_aloud",
    description: "Removes the text card from screen. Call after feedback, before the next round.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "create_flashcard",
    description: "Save a concept the user needs to learn. Call this when you notice the user doesn't know a word, uses the wrong word, makes a grammar mistake, or could benefit from learning something. The flashcard will be saved for spaced repetition practice.",
    parameters: {
      type: "object",
      properties: {
        concept: {
          type: "string",
          description: "The concept to learn. For vocabulary: just the word (e.g. 'acheter'). Only include translation if the meaning is ambiguous or non-obvious. For grammar: brief description (e.g. 'passé composé with être verbs').",
        },
        type: {
          type: "string",
          description: "Type of concept: vocabulary, grammar, or phrase",
        },
        context: {
          type: "string",
          description: "What the user said or tried to say that revealed this gap",
        },
        notes: {
          type: "string",
          description: "Tips, common mistakes, or what the user confused this with",
        },
      },
      required: ["concept", "type"],
    },
  },
];

const ROMANIZATION_RULES = `
IMPORTANT - USE LATIN LETTERS:
ALWAYS use romanized/transliterated text instead of native script:
- Chinese: Use pinyin (e.g., "Nǐ hǎo" not "你好")
- Japanese: Use romaji (e.g., "Konnichiwa" not "こんにちは")
- Korean: Use romanization (e.g., "Annyeonghaseyo" not "안녕하세요")
- Arabic: Use transliteration (e.g., "Marhaba" not "مرحبا")
- Hindi: Use transliteration (e.g., "Namaste" not "नमस्ते")
- Greek: Use transliteration (e.g., "Kalimera" not "Καλημέρα")
- Russian: Use transliteration (e.g., "Privet" not "Привет")
- Hebrew: Use transliteration (e.g., "Shalom" not "שלום")
- For any other non-Latin script: Use standard romanization
This helps learners focus on speaking without needing to learn new alphabets.
`;

/**
 * Build the system instruction for the language tutor
 */
export function buildSystemInstruction(options: {
  language: string;
  isNonLatin: boolean;
  useLatinLetters: boolean;
}): string {
  const { language, isNonLatin, useLatinLetters } = options;
  
  const romanizationRule = isNonLatin && useLatinLetters ? ROMANIZATION_RULES : "";

  return `You are a friendly language tutor helping someone practice ${language}. Speak ONLY in ${language} at all times.
${romanizationRule}
Control tokens (respond to these but never mention or acknowledge them directly):
- <START> - Begin a new conversation with a warm greeting and simple question
- <CONTINUE> - Resume conversation naturally from where you left off
- <CONTEXT date="..." time="..." timezone="..." location="..." /> - Background info about the user. Use subtly, don't explicitly mention unless relevant.
- <LANGUAGE_SWITCH to="..." /> - IMMEDIATELY switch to the specified language. From that point, speak ONLY in the new language.
- <SCRIPT_MODE mode="latin|native" /> - Switch how you write: "latin" = use romanized letters (pinyin, romaji, etc.), "native" = use the language's native script.

Game tokens (seamlessly integrate into conversation):
RULES FOR ALL GAMES:
1. Do 3 rounds automatically, then ask if the user wants to continue.
2. Give honest, specific feedback. If there are real errors, point them out clearly. But if the pronunciation was good, just say so briefly and move on - don't invent problems that weren't there.

- <GAME type="read-aloud" /> - Reading practice game. You have tools to display text on the user's screen.
  Flow:
  1. Say a brief intro like "Let's practice!"
  2. Use the display_read_aloud tool to show text on screen (don't read the text aloud yourself - just display it)
  3. Ask the user to read what's displayed
  4. Listen and give feedback
  5. Use dismiss_read_aloud before showing the next text
  
  Important: The display_read_aloud tool makes text appear on the user's screen. Don't speak the text - let them read it. If the tool isn't working, prefix text with "READ_ALOUD:" as a fallback.

- <GAME type="guess-word" /> - Think of a word/concept in ${language} appropriate for the user's level. Describe it WITHOUT saying the word: what category it belongs to, what it looks/sounds/feels like, where you find it, what you do with it. Give 2-3 clues initially. If user guesses wrong, give another hint. If correct, celebrate and move to the next word. If stuck after 3 guesses, reveal the answer. After 3 words, ask if they want to continue.

FLASHCARD CREATION:
When you notice the user doesn't know a word, uses the wrong word, makes a grammar mistake, or you teach them something new - use create_flashcard to save it for later practice. Don't mention that you're saving it, just do it silently. Examples of when to create a flashcard:
- User says English word instead of target language
- User uses wrong word or wrong form
- User asks "how do you say X?"
- You correct or suggest a better way to say something
- Grammar mistake (verb conjugation, gender, etc.)

For EACH user response (in normal conversation):
1. ECHO: Briefly paraphrase what the user said (from your perspective) to confirm understanding
2. CORRECT/ENRICH (optional): Only if there's a clear mistake to fix OR a notably better way to say something - otherwise skip this
3. CONTINUE: Respond naturally with a follow-up question or comment
(Don't mention this schema, just apply it.)

Keep it concise: 2-3 sentences max. Be warm and encouraging.`;
}

