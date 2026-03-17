import { redirect } from "next/navigation";

/**
 * /admin/formats is now consolidated into Platform Settings → Formats tab.
 * Redirect permanently to keep any bookmarks working.
 */
export default function AdminFormatsPage() {
  redirect("/admin/settings?tab=formats");
}
