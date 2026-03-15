import { redirect } from "next/navigation";

/**
 * /settings/variables is now part of the unified client settings page.
 * Redirect to /settings?tab=variables.
 */
export default function VariablesRedirectPage() {
  redirect("/settings?tab=variables");
}
