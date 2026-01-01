import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Languages that don't typically use spaces between words
const NO_SPACE_LANGUAGES = new Set([
  "Japanese", "Chinese", "Thai", "Lao", "Khmer", "Burmese", "Tibetan"
]);

// Check if text contains non-Latin characters (needs romanization)
function containsNonLatinChars(text: string): boolean {
  // Match characters outside basic Latin, extended Latin, numbers, and common punctuation
  const nonLatinRegex = /[^\u0000-\u024F\u1E00-\u1EFF\d\s\p{P}]/u;
  return nonLatinRegex.test(text);
}

export async function POST(req: NextRequest) {
  try {
    const { text, targetLanguage, context } = await req.json();

    if (!text || !targetLanguage) {
      return NextResponse.json(
        { error: "Missing text or targetLanguage" },
        { status: 400 }
      );
    }
    
    // Context is the full bubble text for disambiguation only
    const contextInfo = context && context !== text 
      ? `\n\n(For disambiguation only, DO NOT translate this - the full sentence is: "${context}")`
      : "";

    // Determine if we need word breakdown
    // For no-space languages: always break down if more than 1 character
    // For space-based languages: break down if more than 1 word
    const isNoSpaceLanguage = NO_SPACE_LANGUAGES.has(targetLanguage);
    
    // Only need romanization if the actual text contains non-Latin characters
    const needsRomanization = containsNonLatinChars(text);
    
    let needsWordBreakdown: boolean;
    if (isNoSpaceLanguage) {
      // For CJK etc., break down if more than 1 character (excluding spaces/punctuation)
      const meaningfulChars = text.replace(/[\s\p{P}]/gu, "").length;
      needsWordBreakdown = meaningfulChars > 1;
    } else {
      // For space-based languages, break down if more than 1 word
      const wordCount = text.trim().split(/\s+/).length;
      needsWordBreakdown = wordCount > 1;
    }

    // Build the prompt based on needs
    let prompt: string;
    
    if (needsWordBreakdown) {
      const romanizationInstructions = needsRomanization 
        ? `
  "romanization": "romanized/Latin alphabet version of the full text (e.g., pinyin, romaji, etc.)",`
        : "";
      
      const wordRomanizationField = needsRomanization
        ? `, "romanization": "romanized form"`
        : "";

      prompt = `You are a language learning assistant. The user is learning ${targetLanguage} and has selected some text to translate.

IMPORTANT: Only translate the SELECTED TEXT below, nothing else.

Selected text: "${text}"${contextInfo}

Provide a helpful translation with per-word/character breakdown in this exact JSON format:
{
  "translation": "the overall translation to English (or if already English, translate to ${targetLanguage})",${romanizationInstructions}
  "words": [
    { "word": "original word/character", "translation": "translation"${wordRomanizationField}, "note": "optional brief grammar/usage note or empty string" }
  ],
  "explanation": "brief overall explanation of grammar structure, idioms, or interesting linguistic notes (1-2 sentences max, or empty string if nothing notable)"
}

Rules:
- Break down into meaningful units (words for space-based languages, characters/morphemes for ${isNoSpaceLanguage ? "character-based languages like Japanese/Chinese" : "the selected language"})
- The "word" field must contain the EXACT text as it appears in the selected text (if romanized/transliterated, keep it romanized)
- SKIP punctuation marks
- Keep notes very brief (2-4 words) or omit if not useful
- Focus on educational value for language learners
- Only output valid JSON, nothing else.`;
    } else {
      const romanizationField = needsRomanization
        ? `
  "romanization": "romanized/Latin alphabet version (e.g., pinyin, romaji, etc.)",`
        : "";

      prompt = `You are a language learning assistant. The user is learning ${targetLanguage} and has selected a single word/character to translate.

IMPORTANT: Only translate the SELECTED TEXT below, nothing else.

Selected text: "${text}"${contextInfo}

Provide a helpful translation in this exact JSON format:
{
  "translation": "the translation to English (or if already English, translate to ${targetLanguage})",${romanizationField}
  "explanation": "brief explanation of grammar, usage, or interesting linguistic notes (1-2 sentences max, or empty string if nothing notable)"
}

Keep it concise and educational. Only output valid JSON, nothing else.`;
    }

    const result = await genai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    const responseText = result.text || "";
    
    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Build response, only including non-empty fields
      const response: { 
        translation: string; 
        romanization?: string;
        words?: Array<{ word: string; translation: string; romanization?: string; note?: string }>; 
        explanation?: string 
      } = {
        translation: parsed.translation || "",
      };
      
      // Include romanization if present
      if (parsed.romanization?.trim()) {
        response.romanization = parsed.romanization;
      }
      
      // Only include words if breakdown was requested and has content
      if (needsWordBreakdown && Array.isArray(parsed.words) && parsed.words.length > 0) {
        response.words = parsed.words;
      }
      
      // Only include explanation if it has content
      const explanation = parsed.explanation || parsed.breakdown || "";
      if (explanation.trim()) {
        response.explanation = explanation;
      }
      
      return NextResponse.json(response);
    }

    return NextResponse.json({
      translation: responseText,
    });
  } catch (error) {
    console.error("Translation error:", error);
    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 }
    );
  }
}
