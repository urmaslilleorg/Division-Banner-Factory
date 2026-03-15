import VariablesManager, { VariableDefinition } from "@/components/variables-manager";
import VariableLabelsEditor from "@/components/variable-labels-editor";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import { fetchAllClients, fetchClientBySubdomain } from "@/lib/airtable-clients";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

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
  const { sessionClaims } = await auth();
  const role = (sessionClaims?.metadata as Record<string, string> | undefined)?.role;
  const isAdmin = role === "division_admin";
  if (!isAdmin) redirect("/");

  const clientConfig = getClientConfigFromHeaders();
  const isClientSubdomain =
    clientConfig &&
    clientConfig.id !== "demo" &&
    clientConfig.id !== "admin";

  const [variables, allClients] = await Promise.all([
    fetchVariables(),
    isClientSubdomain ? Promise.resolve([]) : fetchAllClients(),
  ]);

  let subdomainClient = null;
  if (isClientSubdomain) {
    subdomainClient = await fetchClientBySubdomain(clientConfig.subdomain);
  }

  return (
    <div className="space-y-10">
      {/* Section 1: Global Variables Registry */}
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

      <hr className="border-gray-200" />

      {/* Section 2: Per-client variable labels */}
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Client Variable Labels</h2>
          <p className="text-sm text-gray-500">
            Rename variable slots per client. Custom labels appear in Copy &amp; Assets
            columns, Add Format modal, Campaign Builder, and the Figma plugin.
          </p>
        </div>

        {isClientSubdomain && subdomainClient ? (
          <VariableLabelsEditor
            clientId={subdomainClient.id}
            clientName={subdomainClient.name}
            initialVariables={subdomainClient.clientVariables}
          />
        ) : (
          <div className="space-y-8">
            {allClients.map((client) => (
              <div key={client.id} className="rounded-lg border border-gray-200 p-4">
                <VariableLabelsEditor
                  clientId={client.id}
                  clientName={client.name}
                  initialVariables={client.clientVariables}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
