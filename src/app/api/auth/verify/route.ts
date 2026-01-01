import { NextRequest, NextResponse } from "next/server";
import { initDb, verifyAuthToken, getOrCreateUser, createSession } from "@/lib/db";
import { sendNewUserNotification } from "@/lib/email";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");

    if (!token) {
      return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
    }

    await initDb();

    // Verify the token
    const email = await verifyAuthToken(token);

    if (!email) {
      return NextResponse.redirect(new URL("/login?error=invalid_token", request.url));
    }

    // Get or create user
    const { user, isNew } = await getOrCreateUser(email);

    // Notify admin of new registration (non-blocking)
    if (isNew) {
      sendNewUserNotification(email);
    }

    // Create session
    const sessionId = await createSession(user.id);

    // Redirect to home with session in URL (client will store in localStorage)
    const redirectUrl = new URL("/", request.url);
    redirectUrl.searchParams.set("session", sessionId);
    
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error("Verify error:", error);
    return NextResponse.redirect(new URL("/login?error=server_error", request.url));
  }
}

