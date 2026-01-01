import { NextRequest, NextResponse } from "next/server";
import { initDb, getSession, getMessages, addMessage, updateMessage, clearMessages, countMessages } from "@/lib/db";

// Helper to get effective user ID (authenticated or anonymous)
async function getEffectiveUserId(request: NextRequest): Promise<string | null> {
  const sessionId = request.headers.get("x-session-id");
  const anonId = request.headers.get("x-anon-id");
  
  if (sessionId) {
    await initDb();
    const session = await getSession(sessionId);
    if (session) return session.user_id;
  }
  
  // Fall back to anonymous ID
  if (anonId && anonId.startsWith("anon_")) {
    return anonId;
  }
  
  return null;
}

// GET - fetch all messages for user (authenticated or anonymous)
export async function GET(request: NextRequest) {
  try {
    const userId = await getEffectiveUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await initDb();
    const messages = await getMessages(userId);
    const messageCount = messages.length;
    
    return NextResponse.json({ 
      messages, 
      messageCount,
      isAnonymous: userId.startsWith("anon_"),
    });
  } catch (error) {
    console.error("Failed to get messages:", error);
    return NextResponse.json({ error: "Failed to get messages" }, { status: 500 });
  }
}

// POST - add or update a message
export async function POST(request: NextRequest) {
  try {
    const userId = await getEffectiveUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await initDb();
    const { id, role, content, update } = await request.json();
    
    if (update) {
      await updateMessage(id, content);
    } else {
      await addMessage(id, userId, role, content);
    }
    
    // Return current message count
    const messageCount = await countMessages(userId);
    
    return NextResponse.json({ 
      success: true,
      messageCount,
      isAnonymous: userId.startsWith("anon_"),
    });
  } catch (error) {
    console.error("Failed to save message:", error);
    return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
  }
}

// DELETE - clear all messages for user
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getEffectiveUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await initDb();
    await clearMessages(userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to clear messages:", error);
    return NextResponse.json({ error: "Failed to clear messages" }, { status: 500 });
  }
}
