import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { fetchFormats } from "@/lib/airtable-campaigns";
import CampaignBuilderForm from "@/components/campaign-builder-form";

export default async function NewCampaignPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Fetch formats server-side
  const formats = await fetchFormats();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-light text-gray-900">New Campaign</h1>
        <p className="mt-1 text-sm text-gray-500">
          Set up a campaign and generate banner records automatically.
        </p>
      </div>
      <CampaignBuilderForm formats={formats} />
    </main>
  );
}
