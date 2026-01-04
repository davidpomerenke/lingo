import { NextRequest, NextResponse } from "next/server";
import { initDb, getUserById, createAnonymousUser, createSession } from "@/lib/db";

// Initialize a user session
// - If userId provided and valid: return existing user
// - If userId provided but not found: create new anonymous user
// - If no userId: create new anonymous user
// Returns: { user, sessionId }
export async function POST(request: NextRequest) {
  await initDb();
  
  try {
    const body = await request.json().catch(() => ({}));
    const { userId } = body;
    
    // Try to get existing user
    if (userId) {
      const existingUser = await getUserById(userId);
      if (existingUser) {
        // Create a new session for this user
        const sessionId = await createSession(existingUser.id);
        return NextResponse.json({ 
          user: existingUser, 
          sessionId,
          isNew: false,
        });
      }
    }
    
    // Create new anonymous user
    const newUser = await createAnonymousUser();
    const sessionId = await createSession(newUser.id);
    
    return NextResponse.json({ 
      user: newUser, 
      sessionId,
      isNew: true,
    });
  } catch (error) {
    console.error("Error initializing user:", error);
    return NextResponse.json(
      { error: "Failed to initialize user" },
      { status: 500 }
    );
  }
}

