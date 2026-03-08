import { fetchAllClients } from "@/lib/airtable-clients";
import ClientCard from "@/components/admin/client-card";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let clients: import("@/lib/airtable-clients").ClientRecord[] = [];
  try {
    clients = await fetchAllClients();
  } catch (err) {
    console.error("Failed to fetch clients:", err);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Clients</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage client configurations, formats, and asset libraries.
          </p>
        </div>
        <Link
          href="/admin/new"
          className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Client
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((client) => (
          <ClientCard key={client.id} client={client} />
        ))}

        {/* Add Client placeholder */}
        <Link
          href="/admin/new"
          className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 p-8 text-center hover:border-gray-300 hover:bg-gray-50 transition-colors group"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 group-hover:bg-gray-200 transition-colors">
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <span className="mt-3 text-sm font-medium text-gray-500 group-hover:text-gray-700">
            Add Client
          </span>
        </Link>
      </div>
    </div>
  );
}
