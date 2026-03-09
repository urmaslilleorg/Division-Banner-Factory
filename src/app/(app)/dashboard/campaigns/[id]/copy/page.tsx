import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { fetchCampaignById } from "@/lib/airtable-campaigns";
import { fetchBanners } from "@/lib/airtable";
import CopyEditorTable from "@/components/copy-editor-table";

interface PageProps {
  params: { id: string };
}

export default async function CopyEditorPage({ params }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // TODO: derive role from Clerk session claims
  const userRole = "division_admin";

  const [campaign, banners] = await Promise.all([
    fetchCampaignById(params.id),
    fetchBanners("appIqinespXjbIERp", ""),
  ]);

  // Filter banners for this campaign
  const campaignBanners = banners.filter(
    (b) => b.campaignName === campaign.name
  );

  const fieldConfig = campaign.fieldConfig || {
    variables: ["H1", "H2", "CTA"],
    languages: ["ET"],
    formats: [],
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-light text-gray-900">Copy Editor</h1>
        <p className="mt-1 text-sm text-gray-500">
          {campaign.name} · {campaignBanners.length} banners
        </p>
      </div>
      <CopyEditorTable
        campaignId={params.id}
        banners={campaignBanners}
        fieldConfig={fieldConfig}
        userRole={userRole}
      />
    </main>
  );
}
