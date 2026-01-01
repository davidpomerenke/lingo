import { NextRequest, NextResponse } from "next/server";
import { initDb, getSession } from "@/lib/db";
import { GoogleGenAI } from "@google/genai";

export async function POST(request: NextRequest) {
  try {
    const sessionId = request.headers.get("x-session-id");
    const anonId = request.headers.get("x-anon-id");

    // Allow either authenticated session OR anonymous user
    if (sessionId) {
      await initDb();
      const session = await getSession(sessionId);
      if (!session) {
        return NextResponse.json({ error: "Invalid session" }, { status: 401 });
      }
    } else if (!anonId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { provider } = await request.json();

    if (provider === "gemini") {
      // Generate Gemini ephemeral token
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });
      }

      const client = new GoogleGenAI({ 
        apiKey,
        httpOptions: { apiVersion: "v1alpha" },
      });

      const now = new Date();
      const expireTime = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes
      const newSessionExpireTime = new Date(now.getTime() + 2 * 60 * 1000); // 2 minutes to start

      const token = await client.authTokens.create({
        config: {
          uses: 1,
          expireTime: expireTime.toISOString(),
          newSessionExpireTime: newSessionExpireTime.toISOString(),
          httpOptions: { apiVersion: "v1alpha" },
        },
      });

      return NextResponse.json({
        provider: "gemini",
        token: token.name,
        expiresAt: expireTime.toISOString(),
      });
    } else if (provider === "openai") {
      // For OpenAI, we need to create an ephemeral token via their API
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
      }

      // OpenAI Realtime ephemeral tokens
      const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview-2024-12-17",
          voice: "alloy",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("OpenAI ephemeral token error:", error);
        return NextResponse.json({ error: "Failed to create OpenAI token" }, { status: 500 });
      }

      const data = await response.json();

      return NextResponse.json({
        provider: "openai",
        token: data.client_secret?.value,
        expiresAt: data.expires_at,
      });
    } else {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }
  } catch (error) {
    console.error("Ephemeral token error:", error);
    return NextResponse.json({ error: "Failed to generate token" }, { status: 500 });
  }
}

