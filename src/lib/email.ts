/**
 * Email notification service using Resend.
 *
 * Fire-and-forget: errors are logged but never thrown.
 * Status changes must always succeed regardless of email delivery.
 *
 * From address: notifications@menteproduction.com
 * (falls back to onboarding@resend.dev until domain is verified)
 */

import { Resend } from "resend";

export interface NotificationOptions {
  /** Recipient email addresses */
  to: string[];
  subject: string;
  /** Recipient name shown in greeting (optional) */
  recipientName?: string;
  campaignName: string;
  clientName: string;
  /** Main body message */
  message: string;
  /** Full URL to the campaign page */
  actionUrl: string;
}

function buildHtml(opts: NotificationOptions): string {
  const { recipientName, message, actionUrl, campaignName, clientName } = opts;
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${opts.subject}</title>
</head>
<body style="margin:0;padding:0;background:#F5F5F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F0;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Wordmark -->
          <tr>
            <td style="padding:0 0 32px 0;text-align:left;">
              <span style="font-size:18px;font-weight:700;letter-spacing:0.12em;color:#111827;text-transform:uppercase;">MENTE</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#FFFFFF;border-radius:12px;padding:40px;border:1px solid #E5E7EB;">

              <!-- Greeting -->
              <p style="margin:0 0 8px 0;font-size:15px;color:#374151;">${greeting}</p>

              <!-- Message -->
              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.6;color:#374151;">${message}</p>

              <!-- Campaign info -->
              <table cellpadding="0" cellspacing="0" style="background:#F9FAFB;border-radius:8px;padding:16px 20px;margin-bottom:28px;width:100%;border:1px solid #E5E7EB;">
                <tr>
                  <td style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#9CA3AF;padding-bottom:6px;">Campaign</td>
                </tr>
                <tr>
                  <td style="font-size:15px;font-weight:600;color:#111827;">${campaignName}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#6B7280;padding-top:2px;">${clientName}</td>
                </tr>
              </table>

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:8px;background:#111827;">
                    <a href="${actionUrl}"
                       style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:500;color:#FFFFFF;text-decoration:none;letter-spacing:0.01em;">
                      View campaign &rarr;
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0 0;text-align:left;">
              <p style="margin:0;font-size:12px;color:#9CA3AF;">
                Division &middot;
                <a href="https://menteproduction.com" style="color:#9CA3AF;text-decoration:none;">menteproduction.com</a>
              </p>
              <p style="margin:4px 0 0 0;font-size:11px;color:#D1D5DB;">
                You received this because you have an active account on the Division Banner Factory.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send a notification email via Resend.
 * Never throws — failures are logged only.
 */
export async function sendNotification(
  opts: NotificationOptions
): Promise<void> {
  if (!opts.to || opts.to.length === 0) return;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping notification");
    return;
  }

  // Use verified domain address once DNS is confirmed; fall back to Resend test domain
  const fromAddress = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: opts.to,
      subject: opts.subject,
      html: buildHtml(opts),
    });

    if (error) {
      console.error("[email] Resend error:", error);
    } else {
      console.log(`[email] Sent "${opts.subject}" to ${opts.to.join(", ")}`);
    }
  } catch (err) {
    console.error("[email] Failed to send notification:", err);
  }
}
