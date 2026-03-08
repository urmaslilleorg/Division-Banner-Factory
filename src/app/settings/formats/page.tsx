import { redirect } from "next/navigation";

/**
 * /settings/formats is now superseded by /admin/formats.
 * Redirect division_admin users to the new location.
 * Kept for backward compatibility.
 */
export default function FormatsSettingsPage() {
  redirect("/admin/formats");
}
