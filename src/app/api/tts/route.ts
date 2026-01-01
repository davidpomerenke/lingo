import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Convert PCM to WAV format
function pcmToWav(pcmBase64: string, sampleRate: number = 24000, numChannels: number = 1, bitsPerSample: number = 16): string {
  const pcmData = Buffer.from(pcmBase64, "base64");
  const dataLength = pcmData.length;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;

  // Create WAV header (44 bytes)
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM format size
  header.writeUInt16LE(1, 20); // Audio format (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);

  // Combine header and PCM data
  const wavBuffer = Buffer.concat([header, pcmData]);
  return wavBuffer.toString("base64");
}

async function generateTTS(text: string, language: string, retries = 2): Promise<string> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await genAI.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: `Say in ${language || "the original language"}: ${text}`,
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Kore",
              },
            },
          },
        },
      });

      const candidate = response.candidates?.[0];
      const part = candidate?.content?.parts?.[0];
      
      if (part?.inlineData?.data) {
        return part.inlineData.data;
      }
      
      lastError = new Error("No audio in response");
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("TTS request failed");
      console.error(`TTS attempt ${attempt + 1} failed:`, lastError.message);
      
      // Wait briefly before retry
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
  
  throw lastError || new Error("TTS failed after retries");
}

export async function POST(request: NextRequest) {
  try {
    const { text, language } = await request.json();

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const pcmBase64 = await generateTTS(text, language);
    const wavBase64 = pcmToWav(pcmBase64);

    return NextResponse.json({
      audio: wavBase64,
      mimeType: "audio/wav",
    });
  } catch (error) {
    console.error("TTS error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TTS failed" },
      { status: 500 }
    );
  }
}

