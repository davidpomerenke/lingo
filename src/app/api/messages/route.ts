import { NextRequest, NextResponse } from "next/server";
import { initDb, getSession, getMessages, addMessage, updateMessage, clearMessages } from "@/lib/db";

// Helper to get user_id from session
async function getUserId(request: NextRequest): Promise<string | null> {
  const sessionId = request.headers.get("x-session-id");
  if (!sessionId) return null;
  
  await initDb();
  const session = await getSession(sessionId);
  return session?.user_id || null;
}

// GET - fetch all messages for user
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const messages = await getMessages(userId);
    return NextResponse.json(messages);
  } catch (error) {
    console.error("Failed to get messages:", error);
    return NextResponse.json({ error: "Failed to get messages" }, { status: 500 });
  }
}

// POST - add or update a message
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, role, content, update } = await request.json();
    
    if (update) {
      await updateMessage(id, content);
    } else {
      await addMessage(id, userId, role, content);
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save message:", error);
    return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
  }
}

// DELETE - clear all messages for user
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await clearMessages(userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to clear messages:", error);
    return NextResponse.json({ error: "Failed to clear messages" }, { status: 500 });
  }
}
