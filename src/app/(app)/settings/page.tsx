import { redirect } from "next/navigation";

export default function SettingsPage() {
  // Formats and Variables live under /admin/* — redirect to the Templates tab
  redirect("/settings/templates");
}
