/**
 * POST /api/admin/platform-settings/test-email
 * Sends a test notification to the currently logged-in admin's email.
 * division_admin only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/get-user";
import { sendNotification } from "@/lib/email";

export async function POST(req: NextRequest) {
  const user = getUser(req.headers);
  if (!user || user.role !== "division_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 503 });
  }

  try {
    await sendNotification({
      to: [user.email],
      subject: "✅ Mente — test email",
      recipientName: user.name,
      campaignName: "Test Email",
      clientName: "Platform Admin",
      message: `This is a test notification from the Mente platform. If you received this, email delivery is working correctly.\n\nSent to: ${user.email}`,
      actionUrl: `https://${process.env.NEXT_PUBLIC_APP_DOMAIN ?? "menteproduction.com"}/admin/settings?tab=email`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[test-email]", err);
    return NextResponse.json({ error: "Failed to send test email" }, { status: 500 });
  }
}
