import TemplatesManager from "@/components/templates-manager";
import type { CampaignTemplate } from "@/app/api/clients/[clientId]/templates/route";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const CLIENTS_TABLE = "tblE3eM8D5vlRs6Qq";

interface ClientWithTemplates {
  id: string;
  name: string;
  subdomain: string;
  templates: CampaignTemplate[];
}

async function fetchAllClientsWithTemplates(): Promise<ClientWithTemplates[]> {
  const res = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?fields[]=Client_Name&fields[]=Subdomain&fields[]=Client_Templates`,
    { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, cache: "no-store" }
  );
  if (!res.ok) return [];
  const data = await res.json() as {
    records: Array<{
      id: string;
      fields: {
        Client_Name?: string;
        Subdomain?: string;
        Client_Templates?: string;
      };
    }>;
  };
  return data.records.map((r) => {
    let templates: CampaignTemplate[] = [];
    try {
      const raw = r.fields.Client_Templates;
      if (raw) templates = JSON.parse(raw) as CampaignTemplate[];
    } catch { /* empty */ }
    return {
      id: r.id,
      name: r.fields.Client_Name ?? r.id,
      subdomain: r.fields.Subdomain ?? "",
      templates,
    };
  });
}

export default async function TemplatesSettingsPage() {
  const clients = await fetchAllClientsWithTemplates();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Campaign Templates</h2>
        <p className="text-sm text-gray-500">
          Saved campaign configuration templates per client. Templates can be applied when creating
          or editing a campaign to pre-fill formats, variables, and default copy.
        </p>
      </div>
      <TemplatesManager clients={clients} />
    </div>
  );
}
