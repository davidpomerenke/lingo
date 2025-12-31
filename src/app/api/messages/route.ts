import { NextResponse } from "next/server";
import { getMessages, addMessage, updateMessage, clearMessages } from "@/lib/db";

// GET - fetch all messages
export async function GET() {
  try {
    const messages = await getMessages();
    return NextResponse.json(messages);
  } catch (error) {
    console.error("Failed to get messages:", error);
    return NextResponse.json({ error: "Failed to get messages" }, { status: 500 });
  }
}

// POST - add or update a message
export async function POST(request: Request) {
  try {
    const { id, role, content, update } = await request.json();
    
    if (update) {
      await updateMessage(id, content);
    } else {
      await addMessage(id, role, content);
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save message:", error);
    return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
  }
}

// DELETE - clear all messages
export async function DELETE() {
  try {
    await clearMessages();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to clear messages:", error);
    return NextResponse.json({ error: "Failed to clear messages" }, { status: 500 });
  }
}

