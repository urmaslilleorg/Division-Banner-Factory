import { redirect } from "next/navigation";
import Link from "next/link";
import { fetchCampaignById } from "@/lib/airtable-campaigns";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import { fetchClientBySubdomain } from "@/lib/airtable-clients";
import CampaignBuilderForm, { CampaignInitialData } from "@/components/campaign-builder-form";
import type { ClientVariable } from "@/lib/types";
import type { VariableDefinition } from "@/components/variables-manager";
import type { CampaignTemplate } from "@/app/api/clients/[clientId]/templates/route";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const CLIENTS_TABLE = "tblE3eM8D5vlRs6Qq";

/** Parse "March 2026" → "/2026/3?preview=true" */
function launchMonthToUrl(launchMonth: string | null | undefined): string {
  if (!launchMonth) return "/campaigns?preview=true";
  const months: Record<string, number> = {
    January: 1, February: 2, March: 3, April: 4,
    May: 5, June: 6, July: 7, August: 8,
    September: 9, October: 10, November: 11, December: 12,
  };
  const [monthName, yearStr] = launchMonth.split(" ");
  const month = months[monthName];
  const year = parseInt(yearStr, 10);
  if (!month || isNaN(year)) return "/campaigns?preview=true";
  return `/${year}/${month}?preview=true`;
}

async function fetchVariableRegistry(): Promise<VariableDefinition[]> {
  const BRAND_ASSETS_TABLE = "tblXAWuxJ47Bejj5w";
  const REGISTRY_RECORD_ID = "recCjnJ8I3v3STPfW";
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${BRAND_ASSETS_TABLE}/${REGISTRY_RECORD_ID}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const record = await res.json();
    return JSON.parse(record.fields.Registry_JSON || "[]");
  } catch {
    return [];
  }
}

async function fetchClientTemplates(recordId: string): Promise<CampaignTemplate[]> {
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${recordId}?fields[]=Client_Templates`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json() as { fields: { Client_Templates?: string } };
    const raw = data.fields.Client_Templates;
    if (!raw) return [];
    return JSON.parse(raw) as CampaignTemplate[];
  } catch {
    return [];
  }
}

interface PageProps {
  params: { id: string };
}

export default async function CampaignEditPage({ params }: PageProps) {
  const userId = "mock-user-id";
  if (!userId) redirect("/sign-in");

  const campaign = await fetchCampaignById(params.id);
  if (!campaign) redirect("/campaigns?preview=true");

  const clientConfig = getClientConfigFromHeaders();
  const clientSubdomain = clientConfig?.subdomain;

  const [variableRegistry, clientRecord] = await Promise.all([
    fetchVariableRegistry(),
    clientSubdomain && clientSubdomain !== "admin"
      ? fetchClientBySubdomain(clientSubdomain)
      : null,
  ]);

  const clientVariables: ClientVariable[] = clientRecord?.clientVariables ?? [];
  const clientName = clientRecord?.campaignFilter || clientConfig?.name || "";

  // Fetch only client-linked formats when on a client subdomain
  let formats: import("@/lib/airtable-campaigns").AirtableFormat[] = [];
  if (clientRecord?.formatIds && clientRecord.formatIds.length > 0) {
    const { fetchFormatsByIds } = await import("@/lib/airtable-campaigns");
    formats = await fetchFormatsByIds(clientRecord.formatIds);
  } else {
    const { fetchFormats } = await import("@/lib/airtable-campaigns");
    formats = await fetchFormats();
  }

  // Fetch saved templates for this client
  const templates = clientRecord?.id
    ? await fetchClientTemplates(clientRecord.id)
    : [];

  // Parse Field_Config JSON from campaign record
  let parsedFieldConfig: CampaignInitialData["fieldConfig"] = undefined;
  try {
    if (campaign.fieldConfig) {
      parsedFieldConfig = typeof campaign.fieldConfig === "string"
        ? JSON.parse(campaign.fieldConfig)
        : campaign.fieldConfig;
    }
  } catch {
    parsedFieldConfig = undefined;
  }

  const initialData: CampaignInitialData = {
    campaignName: campaign.name,
    productName: campaign.productName || "",
    launchMonth: campaign.launchMonth || "",
    startDate: campaign.startDate || "",
    endDate: campaign.endDate || "",
    columnMapping: campaign.columnMapping ?? null,
    lastImport: campaign.lastImport ?? null,
    fieldConfig: parsedFieldConfig,
  };

  const backUrl = launchMonthToUrl(campaign.launchMonth);
  const backLabel = campaign.launchMonth ?? "Calendar";

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link
          href={backUrl}
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          ← Back to {backLabel}
        </Link>
      </div>
      <div className="mb-8">
        <h1 className="text-2xl font-light text-gray-900">Edit Campaign</h1>
        <p className="mt-1 text-sm text-gray-500">
          Update campaign metadata. Banner records are not affected.
        </p>
      </div>
      <CampaignBuilderForm
        mode="edit"
        campaignId={campaign.id}
        initialData={initialData}
        formats={formats}
        variableRegistry={variableRegistry}
        clientVariables={clientVariables}
        clientName={clientName}
        clientId={clientSubdomain !== "admin" ? clientSubdomain : undefined}
        templates={templates}
      />
    </main>
  );
}
