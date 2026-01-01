import { NextRequest, NextResponse } from "next/server";
import { initDb, getSession, getUserById, migrateAnonMessages, updateUserLanguages } from "@/lib/db";

export async function POST(request: NextRequest) {
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

    const user = await getUserById(session.user_id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { anonId, languages } = await request.json();

    let migratedCount = 0;
    
    if (anonId && anonId.startsWith("anon_")) {
      // Migrate messages from anonymous to user
      migratedCount = await migrateAnonMessages(anonId, user.id);
    }

    // Migrate language preferences if provided
    if (languages && Array.isArray(languages) && languages.length > 0) {
      await updateUserLanguages(user.id, languages);
    }

    return NextResponse.json({ 
      success: true, 
      migratedMessages: migratedCount 
    });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json({ error: "Failed to migrate" }, { status: 500 });
  }
}

