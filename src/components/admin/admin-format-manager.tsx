"use client";

import { useState } from "react";
import { Check, X, Loader2, Trash2 } from "lucide-react";

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
  });

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
        setFormats((prev) => [
          ...prev,
          {
            id: created.id,
            formatName: newValues.formatName || "",
            channel: newValues.channel || "",
            device: newValues.device || "",
            width: Number(newValues.width) || 0,
            height: Number(newValues.height) || 0,
            safeArea: newValues.safeArea || "",
            outputFormat: newValues.outputFormat || "PNG",
            figmaFrameBase: newValues.figmaFrameBase || "",
            usedBy: [],
          },
        ]);
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
        });
      }
    } finally {
      setSavingId(null);
    }
  };

  const cellCls = "px-3 py-2 text-sm text-gray-700 whitespace-nowrap";
  const inputCls =
    "w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400";

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setAddingNew(true)}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 transition-colors"
        >
          + Add format
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {[
                "Format name",
                "Channel",
                "Dimensions",
                "Device",
                "Safe area",
                "Output",
                "Figma frame base",
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
          <tbody className="divide-y divide-gray-100">
            {addingNew && (
              <tr className="bg-blue-50">
                <td className={cellCls}>
                  <input
                    className={inputCls}
                    value={newValues.formatName}
                    onChange={(e) =>
                      setNewValues((p) => ({ ...p, formatName: e.target.value }))
                    }
                    placeholder="FB_Square"
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
                <td className={cellCls}>
                  <input
                    className={inputCls}
                    value={newValues.figmaFrameBase}
                    onChange={(e) =>
                      setNewValues((p) => ({ ...p, figmaFrameBase: e.target.value }))
                    }
                  />
                </td>
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
            )}

            {formats.map((f) => (
              <tr
                key={f.id}
                className="cursor-pointer hover:bg-gray-50 transition-colors"
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
                      <input
                        className={inputCls}
                        value={editValues.figmaFrameBase}
                        onChange={(e) =>
                          setEditValues((p) => ({ ...p, figmaFrameBase: e.target.value }))
                        }
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className={cellCls + " text-xs text-gray-400"}>
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
                    <td className={cellCls + " text-gray-400"}>
                      {f.safeArea || "—"}
                    </td>
                    <td className={cellCls}>
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          f.outputFormat === "JPG"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {f.outputFormat}
                      </span>
                    </td>
                    <td
                      className={
                        cellCls + " font-mono text-xs text-gray-400 max-w-xs truncate"
                      }
                    >
                      {f.figmaFrameBase || "—"}
                    </td>
                    <td className={cellCls + " text-xs"}>
                      {f.usedBy.length > 0 ? (
                        <span className="text-gray-600">{f.usedBy.join(", ")}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
