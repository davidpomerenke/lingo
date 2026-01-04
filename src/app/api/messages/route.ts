import { NextRequest, NextResponse } from "next/server";
import { initDb, getSession, getUserById, getMessages, addMessage, updateMessage, clearMessages, countMessages } from "@/lib/db";

// Helper to get user info from session
async function getUserFromSession(request: NextRequest): Promise<{ userId: string; isAnonymous: boolean } | null> {
  const sessionId = request.headers.get("x-session-id");
  
  if (!sessionId) return null;
  
  await initDb();
  const session = await getSession(sessionId);
  if (!session) return null;
  
  const user = await getUserById(session.user_id);
  if (!user) return null;
  
  return {
    userId: user.id,
    isAnonymous: !user.email, // Anonymous if no email
  };
}

// GET - fetch all messages for user
export async function GET(request: NextRequest) {
  try {
    const userInfo = await getUserFromSession(request);
    if (!userInfo) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await initDb();
    const messages = await getMessages(userInfo.userId);
    const messageCount = messages.length;
    
    return NextResponse.json({ 
      messages, 
      messageCount,
      isAnonymous: userInfo.isAnonymous,
    });
  } catch (error) {
    console.error("Failed to get messages:", error);
    return NextResponse.json({ error: "Failed to get messages" }, { status: 500 });
  }
}

// POST - add or update a message
export async function POST(request: NextRequest) {
  try {
    const userInfo = await getUserFromSession(request);
    if (!userInfo) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await initDb();
    const { id, role, content, language, useLatinLetters, provider, update } = await request.json();
    
    if (update) {
      await updateMessage(id, content);
    } else {
      await addMessage(id, userInfo.userId, role, content, language, useLatinLetters, provider);
    }
    
    // Return current message count
    const messageCount = await countMessages(userInfo.userId);
    
    return NextResponse.json({ 
      success: true,
      messageCount,
      isAnonymous: userInfo.isAnonymous,
    });
  } catch (error) {
    console.error("Failed to save message:", error);
    return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
  }
}

// DELETE - clear all messages for user
export async function DELETE(request: NextRequest) {
  try {
    const userInfo = await getUserFromSession(request);
    if (!userInfo) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await initDb();
    await clearMessages(userInfo.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to clear messages:", error);
    return NextResponse.json({ error: "Failed to clear messages" }, { status: 500 });
  }
}
