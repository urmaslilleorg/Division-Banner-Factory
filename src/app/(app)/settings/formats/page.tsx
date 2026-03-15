import { redirect } from "next/navigation";

/**
 * /settings/formats → /admin/formats (Master Formats library).
 * Kept for backward compatibility.
 */
export default function FormatsSettingsPage() {
  redirect("/admin/formats");
}
