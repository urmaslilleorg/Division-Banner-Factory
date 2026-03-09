import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchClientById } from "@/lib/airtable-clients";
import { fetchFormats } from "@/lib/airtable-campaigns";

export const dynamic = "force-dynamic";

interface Props {
  params: { clientId: string };
}

const STATUS_BADGE: Record<string, string> = {
  Active: "bg-green-50 text-green-700 ring-green-600/20",
  Draft: "bg-gray-50 text-gray-600 ring-gray-500/20",
  Archived: "bg-red-50 text-red-700 ring-red-600/20",
};

const STATUS_DOT: Record<string, string> = {
  Active: "bg-green-500",
  Draft: "bg-gray-400",
  Archived: "bg-red-400",
};

export default async function ClientOverviewPage({ params }: Props) {
  const [client, allFormats] = await Promise.all([
    fetchClientById(params.clientId),
    fetchFormats(),
  ]);

  if (!client) notFound();

  // Build a lookup of format records linked to this client
  const linkedFormats = allFormats.filter((f) =>
    client.formatIds.includes(f.id)
  );

  // Group linked formats by channel
  const byChannel: Record<string, typeof linkedFormats> = {};
  for (const f of linkedFormats) {
    const ch = f.channel || "Other";
    if (!byChannel[ch]) byChannel[ch] = [];
    byChannel[ch].push(f);
  }
  const channels = Object.keys(byChannel).sort();

  const colours = [
    { label: "Primary", value: client.primaryColor },
    { label: "Secondary", value: client.secondaryColor },
    { label: "Accent", value: client.accentColor },
    { label: "Background", value: client.backgroundColor },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/admin" className="hover:text-gray-700 transition-colors">
          Clients
        </Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">{client.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={`h-3 w-3 rounded-full shrink-0 mt-1 ${STATUS_DOT[client.status] || "bg-gray-400"}`}
          />
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{client.name}</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {client.subdomain}.divisionbanners.ee
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[client.status] || STATUS_BADGE.Draft}`}
          >
            {client.status}
          </span>
          <Link
            href={`/admin/${params.clientId}/edit`}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
          >
            Edit client
          </Link>
          <Link
            href="/"
            className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            View campaigns
          </Link>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Details card */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
            Details
          </h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Subdomain</dt>
              <dd className="text-gray-900 font-mono text-xs">{client.subdomain}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Languages</dt>
              <dd className="text-gray-900">
                {client.languages.length ? client.languages.join(", ") : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Campaign filter</dt>
              <dd className="text-gray-900">{client.campaignFilter || "—"}</dd>
            </div>
            {client.figmaAssetFile && (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Figma file</dt>
                <dd className="text-gray-900 font-mono text-xs truncate max-w-[160px]">
                  {client.figmaAssetFile}
                </dd>
              </div>
            )}
          </dl>
          {client.notes && (
            <p className="text-xs text-gray-500 border-t border-gray-100 pt-3 leading-relaxed">
              {client.notes}
            </p>
          )}
        </div>

        {/* Brand colours card */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
            Brand colours
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {colours.map(({ label, value }) => (
              <div key={label} className="flex items-center gap-2.5">
                <span
                  className="h-7 w-7 rounded-md border border-gray-200 shrink-0"
                  style={{ backgroundColor: value }}
                />
                <div>
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-xs font-mono text-gray-700">{value}</p>
                </div>
              </div>
            ))}
          </div>
          {client.logoUrl && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-500 mb-2">Logo preview</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={client.logoUrl}
                alt={`${client.name} logo`}
                className="h-10 object-contain"
              />
            </div>
          )}
        </div>
      </div>

      {/* Formats card */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
            Formats
          </h2>
          <span className="text-xs text-gray-400">
            {linkedFormats.length} format{linkedFormats.length !== 1 ? "s" : ""} linked
          </span>
        </div>

        {linkedFormats.length === 0 ? (
          <p className="text-sm text-gray-400">
            No formats linked yet.{" "}
            <Link
              href={`/admin/${params.clientId}/edit`}
              className="text-gray-700 underline hover:no-underline"
            >
              Edit client
            </Link>{" "}
            to add formats.
          </p>
        ) : (
          <div className="space-y-3">
            {channels.map((ch) => (
              <div key={ch}>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  {ch}{" "}
                  <span className="font-normal text-gray-300">
                    ({byChannel[ch].length})
                  </span>
                </p>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {byChannel[ch].map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-1.5 text-xs"
                    >
                      <span className="text-gray-700 truncate">{f.formatName}</span>
                      <span className="text-gray-400 shrink-0 ml-2">
                        {f.widthPx}×{f.heightPx}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
