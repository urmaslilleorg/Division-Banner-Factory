# Resend Domain Setup — menteproduction.com

This guide walks through verifying `menteproduction.com` in Resend so that campaign status notification emails arrive from `notifications@menteproduction.com` instead of the generic `onboarding@resend.dev` test address.

---

## 1. Create a Resend account and API key

1. Go to [resend.com](https://resend.com) and sign up (or log in).
2. Navigate to **API Keys** → **Create API Key**.
3. Name it `division-banner-factory-production`, set permission to **Sending access**, and click **Create**.
4. Copy the key (`re_...`) immediately — it is shown only once.
5. Add it to Vercel: **Project → Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | `re_xxxxxxxxxxxx` |
| `RESEND_FROM_EMAIL` | `notifications@menteproduction.com` |

---

## 2. Add the domain in Resend

1. In Resend, go to **Domains** → **Add Domain**.
2. Enter `menteproduction.com` and click **Add**.
3. Resend will show you three DNS records to add. They will look similar to this:

| Type | Name | Value |
|---|---|---|
| `TXT` | `resend._domainkey.menteproduction.com` | `p=MIGfMA0GCSqGSIb3DQEB...` (DKIM public key) |
| `MX` | `send.menteproduction.com` | `feedback-smtp.eu-west-1.amazonses.com` (or similar) |
| `TXT` | `menteproduction.com` | `v=spf1 include:amazonses.com ~all` (SPF) |

> The exact values are generated per-account — always use the records shown in your Resend dashboard, not the examples above.

---

## 3. Add DNS records

Log in to your DNS provider (wherever `menteproduction.com` is registered — typically Cloudflare, Namecheap, or a registrar).

Add each record exactly as shown in the Resend dashboard. Key points:

- **DKIM TXT record**: the name includes `resend._domainkey` as a subdomain prefix. Some DNS providers auto-append the root domain — if so, enter only `resend._domainkey` in the name field.
- **SPF TXT record**: if you already have an SPF record on the root domain, merge the `include:amazonses.com` into it rather than creating a second TXT record. DNS allows only one SPF record per name.
- **MX record**: this is for bounce handling only, not for receiving regular email. It is safe to add even if you already have MX records for Google Workspace or similar.

DNS propagation typically takes **5–30 minutes**, but can take up to 48 hours in rare cases.

---

## 4. Verify in Resend

1. Return to **Domains** in Resend and click **Verify** next to `menteproduction.com`.
2. Once all three records show a green checkmark, the domain status changes to **Verified**.
3. You can now send from any address at `@menteproduction.com`.

---

## 5. Confirm in the app

Once `RESEND_FROM_EMAIL=notifications@menteproduction.com` is set in Vercel and the domain is verified, all status notification emails will arrive from `notifications@menteproduction.com`.

**To test:** Manually change a campaign status to `Ready_For_Figma` or `Pending_Review` from the campaign detail page. If there are active users with matching roles, they will receive an email within a few seconds. Check the **Logs** section in Resend for delivery confirmation.

---

## Temporary state (before domain verification)

Until the domain is verified, the app falls back to `onboarding@resend.dev`. Emails will still be sent and delivered, but they will show Resend's test sender address. This is fine for internal testing but should not be used in production.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No email received | `RESEND_API_KEY` not set in Vercel | Add the env var and redeploy |
| Emails from `onboarding@resend.dev` | Domain not yet verified | Complete DNS verification |
| `DKIM` record not verifying | DNS provider appended root domain twice | Remove the `.menteproduction.com` suffix from the record name |
| SPF fails | Existing SPF record conflict | Merge `include:amazonses.com` into the existing SPF record |
| Emails go to spam | Missing DMARC record | Add `TXT` `_dmarc.menteproduction.com` → `v=DMARC1; p=none; rua=mailto:dmarc@menteproduction.com` |
