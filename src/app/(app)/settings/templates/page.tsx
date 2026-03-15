import { redirect } from "next/navigation";

/**
 * /settings/templates is now part of the unified client settings page.
 * Redirect to /settings?tab=templates.
 */
export default function TemplatesRedirectPage() {
  redirect("/settings?tab=templates");
}
