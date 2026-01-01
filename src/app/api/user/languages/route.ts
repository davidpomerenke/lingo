import { NextRequest, NextResponse } from "next/server";
import { initDb, getSession, updateUserLanguages, updateUserScriptModes } from "@/lib/db";

export async function PUT(request: NextRequest) {
  try {
    const sessionId = request.headers.get("x-session-id");

    if (!sessionId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await initDb();

    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { languages, scriptModes } = await request.json();

    // Update languages if provided
    if (languages !== undefined) {
      if (!Array.isArray(languages) || languages.length === 0) {
        return NextResponse.json({ error: "Languages must be a non-empty array" }, { status: 400 });
      }

      // Validate each language is a non-empty string
      const cleanedLanguages = languages
        .filter((l): l is string => typeof l === "string" && l.trim().length > 0)
        .map(l => l.trim());

      if (cleanedLanguages.length === 0) {
        return NextResponse.json({ error: "At least one valid language required" }, { status: 400 });
      }

      await updateUserLanguages(session.user_id, cleanedLanguages);
    }

    // Update script modes if provided
    if (scriptModes !== undefined && typeof scriptModes === "object") {
      await updateUserScriptModes(session.user_id, scriptModes);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update user preferences error:", error);
    return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 });
  }
}

