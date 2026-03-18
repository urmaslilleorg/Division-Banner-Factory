"use client";

import { useState, useMemo, useEffect } from "react";
import { Check, X, Loader2, Trash2, ChevronRight, ChevronDown } from "lucide-react";

interface FormatRow {
  id: string;
  formatName: string;
  channel: string;
  device: string;
  width: number;
  height: number;
  safeArea: string;
  outputFormat: string;
  figmaFrameBase: string;
  nexdTemplateId: string;
  nexdTemplateIds: string[];
  usedBy: string[];
}

interface Props {
  initialFormats: FormatRow[];
}

export default function AdminFormatManager({ initialFormats }: Props) {
  const [formats, setFormats] = useState(initialFormats);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<FormatRow>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newValues, setNewValues] = useState<Partial<FormatRow>>({
    formatName: "",
    channel: "Google",
    device: "Desktop",
    width: 1200,
    height: 628,
    safeArea: "",
    outputFormat: "PNG",
    figmaFrameBase: "",
    nexdTemplateId: "",
    nexdTemplateIds: [],
  });
  // Nexd template id → name map (fetched from cached route)
  const [nexdTemplatesMap, setNexdTemplatesMap] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/nexd/templates")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.templates) return;
        const map: Record<string, string> = {};
        for (const t of data.templates) map[t.id] = t.name;
        setNexdTemplatesMap(map);
      })
      .catch(() => {});
  }, []);

  // All sections collapsed by default; set of open channel names
  const [openChannels, setOpenChannels] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const toggleChannel = (channel: string) => {
    setOpenChannels((prev) => {
      const next = new Set(Array.from(prev));
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
  };

  // Group and sort formats
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? formats.filter(
          (f) =>
            f.formatName.toLowerCase().includes(q) ||
            f.channel.toLowerCase().includes(q) ||
            f.device.toLowerCase().includes(q)
        )
      : formats;

    const map = new Map<string, FormatRow[]>();
    for (const f of filtered) {
      const ch = f.channel || "Other";
      if (!map.has(ch)) map.set(ch, []);
      map.get(ch)!.push(f);
    }
    // Sort formats within each channel alphabetically
    Array.from(map.values()).forEach((rows) => {
      rows.sort((a, b) => a.formatName.localeCompare(b.formatName));
    });
    // Sort channels alphabetically
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [formats, search]);

  // When search is active, auto-expand channels that have matches
  const effectiveOpen = useMemo(() => {
    if (!search.trim()) return openChannels;
    const expanded = new Set(Array.from(openChannels));
    for (const [ch] of grouped) expanded.add(ch);
    return expanded;
  }, [openChannels, grouped, search]);

  const startEdit = (f: FormatRow) => {
    setEditingId(f.id);
    setEditValues({
      formatName: f.formatName,
      channel: f.channel,
      device: f.device,
      width: f.width,
      height: f.height,
      safeArea: f.safeArea,
      outputFormat: f.outputFormat,
      figmaFrameBase: f.figmaFrameBase,
      nexdTemplateId: f.nexdTemplateId,
      nexdTemplateIds: f.nexdTemplateIds,
    });
  };

  const saveEdit = async (id: string) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/formats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editValues),
      });
      if (res.ok) {
        setFormats((prev) =>
          prev.map((f) =>
            f.id === id
              ? {
                  ...f,
                  formatName: editValues.formatName ?? f.formatName,
                  channel: editValues.channel ?? f.channel,
                  device: editValues.device ?? f.device,
                  width: Number(editValues.width) || f.width,
                  height: Number(editValues.height) || f.height,
                  safeArea: editValues.safeArea ?? f.safeArea,
                  outputFormat: editValues.outputFormat ?? f.outputFormat,
                  figmaFrameBase: editValues.figmaFrameBase ?? f.figmaFrameBase,
                  nexdTemplateId: editValues.nexdTemplateId ?? f.nexdTemplateId,
                  nexdTemplateIds: f.nexdTemplateIds,
                }
              : f
          )
        );
        setEditingId(null);
      }
    } finally {
      setSavingId(null);
    }
  };

  const deleteFormat = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/formats/${id}`, { method: "DELETE" });
      if (res.ok) {
        setFormats((prev) => prev.filter((f) => f.id !== id));
        setConfirmDeleteId(null);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const addFormat = async () => {
    setSavingId("new");
    try {
      const res = await fetch("/api/formats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newValues),
      });
      if (res.ok) {
        const created = await res.json();
        const newRow: FormatRow = {
          id: created.id,
          formatName: newValues.formatName || "",
          channel: newValues.channel || "",
          device: newValues.device || "",
          width: Number(newValues.width) || 0,
          height: Number(newValues.height) || 0,
          safeArea: newValues.safeArea || "",
          outputFormat: newValues.outputFormat || "PNG",
          figmaFrameBase: newValues.figmaFrameBase || "",
          nexdTemplateId: newValues.nexdTemplateId || "",
          nexdTemplateIds: [],
          usedBy: [],
        };
        setFormats((prev) => [...prev, newRow]);
        // Auto-expand the channel the new format belongs to
        if (newValues.channel) {
          setOpenChannels((prev) => new Set(Array.from(prev).concat(newValues.channel!)));
        }
        setAddingNew(false);
        setNewValues({
          formatName: "",
          channel: "Google",
          device: "Desktop",
          width: 1200,
          height: 628,
          safeArea: "",
          outputFormat: "PNG",
          figmaFrameBase: "",
          nexdTemplateId: "",
          nexdTemplateIds: [],
        });
      }
    } finally {
      setSavingId(null);
    }
  };

  const cellCls = "px-3 py-2 text-sm whitespace-nowrap";
  const inputCls =
    "w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400";

  const tableHeader = (
    <thead>
      <tr className="border-b border-gray-200 bg-gray-50">
        {[
          "Format name",
          "Channel",
          "Dimensions",
          "Device",
          "Safe area",
          "Output",
          "Nexd",
          "Used by",
          "",
        ].map((h) => (
          <th
            key={h}
            className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );

  const renderRow = (f: FormatRow) => (
    <tr
      key={f.id}
      className={`cursor-pointer hover:bg-gray-50 transition-colors ${
        f.nexdTemplateIds.length > 0 ? "text-emerald-600" : "text-gray-700"
      }`}
      onClick={() => !editingId && startEdit(f)}
    >
      {editingId === f.id ? (
        <>
          <td className={cellCls}>
            <input
              className={inputCls}
              value={editValues.formatName}
              onChange={(e) =>
                setEditValues((p) => ({ ...p, formatName: e.target.value }))
              }
              onClick={(e) => e.stopPropagation()}
            />
          </td>
          <td className={cellCls}>
            <input
              className={inputCls}
              value={editValues.channel}
              onChange={(e) =>
                setEditValues((p) => ({ ...p, channel: e.target.value }))
              }
              onClick={(e) => e.stopPropagation()}
            />
          </td>
          <td className={cellCls}>
            <div className="flex gap-1">
              <input
                className={inputCls}
                type="number"
                value={editValues.width}
                onChange={(e) =>
                  setEditValues((p) => ({ ...p, width: Number(e.target.value) }))
                }
                onClick={(e) => e.stopPropagation()}
              />
              <input
                className={inputCls}
                type="number"
                value={editValues.height}
                onChange={(e) =>
                  setEditValues((p) => ({ ...p, height: Number(e.target.value) }))
                }
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </td>
          <td className={cellCls}>
            <input
              className={inputCls}
              value={editValues.device}
              onChange={(e) =>
                setEditValues((p) => ({ ...p, device: e.target.value }))
              }
              onClick={(e) => e.stopPropagation()}
            />
          </td>
          <td className={cellCls}>
            <input
              className={inputCls}
              value={editValues.safeArea}
              onChange={(e) =>
                setEditValues((p) => ({ ...p, safeArea: e.target.value }))
              }
              onClick={(e) => e.stopPropagation()}
            />
          </td>
          <td className={cellCls}>
            <select
              className={inputCls}
              value={editValues.outputFormat}
              onChange={(e) =>
                setEditValues((p) => ({ ...p, outputFormat: e.target.value }))
              }
              onClick={(e) => e.stopPropagation()}
            >
              <option>PNG</option>
              <option>JPG</option>
            </select>
          </td>
          <td className={cellCls}>
            {f.nexdTemplateIds.length > 0 ? (
              <span className="text-xs font-medium">
                {f.nexdTemplateIds.map((id) => nexdTemplatesMap[id] ?? id).join(", ")}
              </span>
            ) : (
              <span className="opacity-40">—</span>
            )}
          </td>
          <td className={cellCls + " text-xs opacity-60"}>
            {f.usedBy.length > 0 ? f.usedBy.join(", ") : "—"}
          </td>
          <td className={cellCls} onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-1">
              <button
                onClick={() => saveEdit(f.id)}
                disabled={savingId === f.id}
                className="rounded bg-gray-900 px-2 py-1 text-xs text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {savingId === f.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </td>
        </>
      ) : (
        <>
          <td className={cellCls + " font-medium"}>{f.formatName}</td>
          <td className={cellCls}>{f.channel}</td>
          <td className={cellCls + " tabular-nums"}>
            {f.width}×{f.height}
          </td>
          <td className={cellCls}>{f.device}</td>
          <td className={cellCls}>
            {f.safeArea || "—"}
          </td>
          <td className={cellCls}>
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                f.outputFormat === "JPG" ? "bg-amber-50" : "bg-blue-50"
              }`}
            >
              {f.outputFormat}
            </span>
          </td>
          <td className={cellCls}>
            {f.nexdTemplateIds.length > 0 ? (
              <span className="text-xs font-medium">
                {f.nexdTemplateIds.map((id) => nexdTemplatesMap[id] ?? id).join(", ")}
              </span>
            ) : (
              <span className="opacity-40">—</span>
            )}
          </td>
          <td className={cellCls + " text-xs"}>
            {f.usedBy.length > 0 ? (
              <span>{f.usedBy.join(", ")}</span>
            ) : (
              <span className="opacity-40">—</span>
            )}
          </td>
          <td className={cellCls} onClick={(e) => e.stopPropagation()}>
            {confirmDeleteId === f.id ? (
              <div className="flex gap-1">
                <button
                  onClick={() => deleteFormat(f.id)}
                  disabled={deletingId === f.id}
                  className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deletingId === f.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Delete"
                  )}
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDeleteId(f.id)}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </td>
        </>
      )}
    </tr>
  );

  return (
    <div className="space-y-3">
      {/* Top bar: search + add */}
      <div className="flex items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search formats…"
          className="flex-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <button
          onClick={() => setAddingNew(true)}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 transition-colors whitespace-nowrap"
        >
          + Add format
        </button>
      </div>

      {/* New format row — shown at the top as a standalone table */}
      {addingNew && (
        <div className="overflow-x-auto rounded-lg border border-blue-200 bg-blue-50">
          <table className="w-full border-collapse text-left">
            {tableHeader}
            <tbody>
              <tr className="bg-blue-50">
                <td className={cellCls}>
                  <input
                    className={inputCls}
                    value={newValues.formatName}
                    onChange={(e) =>
                      setNewValues((p) => ({ ...p, formatName: e.target.value }))
                    }
                    placeholder="FB_Square"
                    autoFocus
                  />
                </td>
                <td className={cellCls}>
                  <input
                    className={inputCls}
                    value={newValues.channel}
                    onChange={(e) =>
                      setNewValues((p) => ({ ...p, channel: e.target.value }))
                    }
                  />
                </td>
                <td className={cellCls}>
                  <div className="flex gap-1">
                    <input
                      className={inputCls}
                      type="number"
                      value={newValues.width}
                      onChange={(e) =>
                        setNewValues((p) => ({ ...p, width: Number(e.target.value) }))
                      }
                    />
                    <input
                      className={inputCls}
                      type="number"
                      value={newValues.height}
                      onChange={(e) =>
                        setNewValues((p) => ({ ...p, height: Number(e.target.value) }))
                      }
                    />
                  </div>
                </td>
                <td className={cellCls}>
                  <input
                    className={inputCls}
                    value={newValues.device}
                    onChange={(e) =>
                      setNewValues((p) => ({ ...p, device: e.target.value }))
                    }
                  />
                </td>
                <td className={cellCls}>
                  <input
                    className={inputCls}
                    value={newValues.safeArea}
                    onChange={(e) =>
                      setNewValues((p) => ({ ...p, safeArea: e.target.value }))
                    }
                  />
                </td>
                <td className={cellCls}>
                  <select
                    className={inputCls}
                    value={newValues.outputFormat}
                    onChange={(e) =>
                      setNewValues((p) => ({ ...p, outputFormat: e.target.value }))
                    }
                  >
                    <option>PNG</option>
                    <option>JPG</option>
                  </select>
                </td>
                <td className={cellCls + " text-gray-300 text-xs"}>—</td>
                <td className={cellCls + " text-gray-400 text-xs"}>—</td>
                <td className={cellCls}>
                  <div className="flex gap-1">
                    <button
                      onClick={addFormat}
                      disabled={savingId === "new"}
                      className="rounded bg-gray-900 px-2 py-1 text-xs text-white hover:bg-gray-700 disabled:opacity-50"
                    >
                      {savingId === "new" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      onClick={() => setAddingNew(false)}
                      className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Channel accordion sections */}
      <div className="space-y-2">
        {grouped.map(([channel, rows]) => {
          const isOpen = effectiveOpen.has(channel);
          return (
            <div key={channel} className="rounded-lg border border-gray-200 overflow-hidden">
              {/* Channel header */}
              <button
                type="button"
                onClick={() => toggleChannel(channel)}
                className="flex w-full items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                )}
                <span className="flex-1 text-sm font-semibold text-gray-700">
                  {channel}
                </span>
                <span className="text-xs text-gray-400">
                  {rows.length} {rows.length === 1 ? "format" : "formats"}
                </span>
              </button>

              {/* Formats table — shown when expanded */}
              {isOpen && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    {tableHeader}
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((f) => renderRow(f))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <p className="text-xs text-gray-400 text-right">
        {formats.length} formats across {grouped.length} channels
      </p>
    </div>
  );
}
