"use client";

import { useState } from "react";
import { Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CampaignTemplate } from "@/app/api/clients/[clientId]/templates/route";

interface ClientWithTemplates {
  id: string;
  name: string;
  subdomain: string;
  templates: CampaignTemplate[];
}

interface TemplatesManagerProps {
  clients: ClientWithTemplates[];
}

export default function TemplatesManager({ clients }: TemplatesManagerProps) {
  // Local state mirrors the server-fetched data so deletes are instant
  const [clientData, setClientData] = useState<ClientWithTemplates[]>(clients);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(clients.map((c) => [c.id, c.templates.length > 0]))
  );
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (subdomain: string, templateId: string) => {
    setDeleting(templateId);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${subdomain}/templates/${templateId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setClientData((prev) =>
        prev.map((c) =>
          c.subdomain === subdomain
            ? { ...c, templates: c.templates.filter((t) => t.id !== templateId) }
            : c
        )
      );
    } catch {
      setError("Failed to delete template. Please try again.");
    } finally {
      setDeleting(null);
    }
  };

  const totalTemplates = clientData.reduce((sum, c) => sum + c.templates.length, 0);

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {totalTemplates === 0 && (
        <div className="rounded-lg border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-gray-400">
          No templates saved yet. Create a campaign and click &ldquo;Save as Template&rdquo; to get started.
        </div>
      )}

      {clientData.map((client) => (
        <div key={client.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          {/* Client header */}
          <button
            type="button"
            onClick={() => setExpanded((prev) => ({ ...prev, [client.id]: !prev[client.id] }))}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {expanded[client.id]
                ? <ChevronDown className="h-4 w-4 text-gray-400" />
                : <ChevronRight className="h-4 w-4 text-gray-400" />
              }
              <span className="text-sm font-medium text-gray-900">{client.name}</span>
              <span className="text-xs text-gray-400">({client.subdomain})</span>
            </div>
            <span className="text-xs text-gray-400">
              {client.templates.length} template{client.templates.length !== 1 ? "s" : ""}
            </span>
          </button>

          {/* Template list */}
          {expanded[client.id] && (
            <div className="border-t border-gray-100">
              {client.templates.length === 0 ? (
                <p className="px-6 py-4 text-sm text-gray-400 italic">No templates for this client.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Created</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Formats</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Languages</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {client.templates.map((tpl) => {
                      const formats = Array.isArray(tpl.fieldConfig.formats)
                        ? (tpl.fieldConfig.formats as string[])
                        : Object.keys(tpl.fieldConfig.formats ?? {});
                      const langs = tpl.fieldConfig.languages ?? [];
                      return (
                        <tr key={tpl.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{tpl.name}</td>
                          <td className="px-4 py-3 text-gray-500">{tpl.createdAt}</td>
                          <td className="px-4 py-3 text-gray-500">
                            {formats.length > 0
                              ? <span title={formats.join(", ")}>{formats.length} format{formats.length !== 1 ? "s" : ""}</span>
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {langs.length > 0 ? langs.join(", ") : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={deleting === tpl.id}
                              onClick={() => void handleDelete(client.subdomain, tpl.id)}
                              className="text-red-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
