import VariablesManager, { VariableDefinition } from "@/components/variables-manager";

async function fetchVariables(): Promise<VariableDefinition[]> {
  const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
  const BASE_ID = "appIqinespXjbIERp";
  const BRAND_ASSETS_TABLE = "tblXAWuxJ47Bejj5w";
  const REGISTRY_RECORD_ID = "recCjnJ8I3v3STPfW";

  const res = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${BRAND_ASSETS_TABLE}/${REGISTRY_RECORD_ID}`,
    {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
      cache: "no-store",
    }
  );
  if (!res.ok) return [];
  const record = await res.json();
  try {
    return JSON.parse(record.fields.Registry_JSON || "[]");
  } catch {
    return [];
  }
}

export default async function VariablesSettingsPage() {
  const variables = await fetchVariables();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Variables Registry</h2>
        <p className="text-sm text-gray-500">
          Define the copy variables available in the Campaign Builder and Copy Editor.
          Changes are saved to Airtable immediately.
        </p>
      </div>
      <VariablesManager initialVariables={variables} />
    </div>
  );
}
