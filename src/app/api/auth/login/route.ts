import { NextRequest, NextResponse } from "next/server";
import { initDb, createAuthToken } from "@/lib/db";
import { sendMagicLinkEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const { email, userId } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    await initDb();

    // Create auth token (include userId so verify can claim the user)
    const token = await createAuthToken(email, userId);

    // Get base URL for magic link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
      `${request.nextUrl.protocol}//${request.nextUrl.host}`;

    // Send magic link email
    await sendMagicLinkEmail(email, token, baseUrl);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Failed to send login email" },
      { status: 500 }
    );
  }
}

