import { redirect } from "next/navigation";
import { fetchCampaignById } from "@/lib/airtable-campaigns";

/**
 * Backward-compat redirect:
 * /dashboard/campaigns/[id]/copy → /campaigns/[id]?tab=copy&preview=true
 *
 * The copy editor is now embedded inline in the campaign detail page
 * under the "Copy & Assets" tab.
 */
interface PageProps {
  params: { id: string };
}

export default async function CopyEditorRedirectPage({ params }: PageProps) {
  const userId = "mock-user-id";
  if (!userId) redirect("/sign-in");

  try {
    const campaign = await fetchCampaignById(params.id);
    redirect(`/campaigns/${campaign.id}?tab=copy&preview=true`);
  } catch {
    redirect(`/campaigns/${params.id}?tab=copy&preview=true`);
  }
}
