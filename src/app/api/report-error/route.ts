import { NextRequest, NextResponse } from "next/server";
import { sendQuotaExhaustedNotification } from "@/lib/email";

// Track when we last sent a notification to avoid spamming
const lastNotificationTime: Record<string, number> = {};
const NOTIFICATION_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: NextRequest) {
  try {
    const { provider, errorType, errorMessage } = await request.json();

    if (!provider || !errorType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Only send email for quota-related errors
    if (errorType === "insufficient_quota" || errorType === "RESOURCE_EXHAUSTED") {
      const cacheKey = `${provider}-${errorType}`;
      const now = Date.now();
      const lastTime = lastNotificationTime[cacheKey] || 0;

      // Only send notification if cooldown has passed
      if (now - lastTime > NOTIFICATION_COOLDOWN_MS) {
        lastNotificationTime[cacheKey] = now;
        await sendQuotaExhaustedNotification(provider, errorMessage);
        console.log(`Sent quota exhausted notification for ${provider}`);
      } else {
        console.log(`Skipping notification for ${provider} - cooldown not passed`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error reporting error:", error);
    return NextResponse.json({ error: "Failed to report error" }, { status: 500 });
  }
}

