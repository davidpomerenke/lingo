import { NextRequest, NextResponse } from "next/server";
import { initDb, verifyAuthToken, getOrCreateUser, claimUser, getUserByEmail, createSession } from "@/lib/db";
import { sendNewUserNotification } from "@/lib/email";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");

    if (!token) {
      return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
    }

    await initDb();

    // Verify the token
    const tokenData = await verifyAuthToken(token);

    if (!tokenData) {
      return NextResponse.redirect(new URL("/login?error=invalid_token", request.url));
    }

    const { email, userId: claimUserId } = tokenData;
    let user;
    let isNew = false;

    // Check if email is already registered
    const existingUserWithEmail = await getUserByEmail(email);

    if (existingUserWithEmail) {
      // Email already registered - use that account
      // (If they had anonymous data, it stays orphaned - they need to merge manually)
      user = existingUserWithEmail;
    } else if (claimUserId) {
      // Claim the anonymous user by setting their email
      user = await claimUser(claimUserId, email);
      if (!user) {
        // This shouldn't happen since we checked email doesn't exist
        const result = await getOrCreateUser(email);
        user = result.user;
        isNew = result.isNew;
      }
      isNew = true; // First time this user has an email
    } else {
      // No existing user and no user to claim - create new
      const result = await getOrCreateUser(email);
      user = result.user;
      isNew = result.isNew;
    }

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

