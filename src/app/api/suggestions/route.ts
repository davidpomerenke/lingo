import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Languages that don't use Latin script
const NON_LATIN_LANGUAGES = new Set([
  "Arabic", "Hebrew", "Persian", "Urdu", "Pashto", "Dari", "Kurdish",
  "Japanese", "Chinese", "Korean", "Thai", "Hindi", "Bengali", "Tamil",
  "Telugu", "Kannada", "Malayalam", "Gujarati", "Punjabi", "Marathi",
  "Russian", "Ukrainian", "Bulgarian", "Serbian", "Greek", "Georgian",
  "Armenian", "Amharic", "Tigrinya", "Khmer", "Burmese", "Lao", "Tibetan"
]);

export async function POST(req: NextRequest) {
  try {
    const { conversationHistory, targetLanguage, useLatinLetters } = await req.json();

    if (!targetLanguage) {
      return NextResponse.json(
        { error: "Missing targetLanguage" },
        { status: 400 }
      );
    }

    // Build context from recent conversation
    const recentMessages = conversationHistory?.slice(-6) || [];
    const contextText = recentMessages
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join("\n");

    // Add romanization instruction if needed
    const isNonLatin = NON_LATIN_LANGUAGES.has(targetLanguage);
    const romanizationInstruction = isNonLatin && useLatinLetters
      ? `\n\nIMPORTANT: Write ALL suggestions using romanized/Latin letters (transliteration), NOT the native script. For example, Japanese should be written as "Konnichiwa" not "こんにちは".`
      : "";

    const prompt = `You are helping a language learner practice ${targetLanguage}. Based on the conversation below, suggest 3 natural responses the learner could say next.

${contextText ? `Recent conversation:\n${contextText}\n\n` : ""}Generate exactly 3 short, natural responses in ${targetLanguage} that would continue this conversation naturally. Each response should be different in tone or content (e.g., one could ask a question, one could share an opinion, one could be more casual).${romanizationInstruction}

Output ONLY a JSON array of 3 strings, nothing else:
["response 1", "response 2", "response 3"]`;

    const result = await genai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    const responseText = result.text || "";
    
    // Parse JSON array from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const suggestions = JSON.parse(jsonMatch[0]);
      if (Array.isArray(suggestions) && suggestions.length > 0) {
        return NextResponse.json({ suggestions: suggestions.slice(0, 3) });
      }
    }

    return NextResponse.json({ suggestions: [] });
  } catch (error) {
    console.error("Suggestions error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}

