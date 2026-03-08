"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Loader2, Check, X } from "lucide-react";

interface Format {
  id: string;
  formatName: string;
  channel: string;
  device: string;
  width: number;
  height: number;
  safeArea: string;
  outputFormat: string;
  figmaFrameBase: string;
}

interface FormatManagerProps {
  initialFormats: Format[];
}

const EMPTY_FORM = {
  formatName: "",
  channel: "",
  device: "",
  width: "",
  height: "",
  safeArea: "",
  outputFormat: "PNG",
  figmaFrameBase: "",
};

export default function FormatManager({ initialFormats }: FormatManagerProps) {
  const [formats, setFormats] = useState<Format[]>(initialFormats);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const startEdit = (f: Format) => {
    setEditingId(f.id);
    setEditValues({
      formatName: f.formatName,
      channel: f.channel,
      device: f.device,
      width: String(f.width),
      height: String(f.height),
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
        body: JSON.stringify({
          formatName: editValues.formatName,
          channel: editValues.channel,
          device: editValues.device,
          width: editValues.width,
          height: editValues.height,
          safeArea: editValues.safeArea,
          outputFormat: editValues.outputFormat,
          figmaFrameBase: editValues.figmaFrameBase,
        }),
      });
      if (res.ok) {
        setFormats((prev) =>
          prev.map((f) =>
            f.id === id
              ? {
                  ...f,
                  formatName: editValues.formatName,
                  channel: editValues.channel,
                  device: editValues.device,
                  width: Number(editValues.width),
                  height: Number(editValues.height),
                  safeArea: editValues.safeArea,
                  outputFormat: editValues.outputFormat,
                  figmaFrameBase: editValues.figmaFrameBase,
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
    if (!addForm.formatName || !addForm.channel) return;
    setIsAdding(true);
    try {
      const res = await fetch("/api/formats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      if (res.ok) {
        const record = await res.json();
        const newFormat: Format = {
          id: record.id,
          formatName: record.fields.Format_Name || addForm.formatName,
          channel: record.fields.Channel || addForm.channel,
          device: record.fields.Device || addForm.device,
          width: record.fields.Width || Number(addForm.width),
          height: record.fields.Height || Number(addForm.height),
          safeArea: record.fields.Safe_Area || addForm.safeArea,
          outputFormat: record.fields.Output_Format || addForm.outputFormat,
          figmaFrameBase: record.fields.Figma_Frame_Base || addForm.figmaFrameBase,
        };
        setFormats((prev) => [...prev, newFormat]);
        setAddForm(EMPTY_FORM);
        setShowAddForm(false);
      }
    } finally {
      setIsAdding(false);
    }
  };

  const inputCls = "w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900";
  const cellCls = "px-3 py-2 text-sm text-gray-700 align-top";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{formats.length} formats</p>
        <Button size="sm" onClick={() => setShowAddForm(true)} disabled={showAddForm}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add format
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              {["Format Name", "Channel", "W × H", "Device", "Safe Area", "Output", "Figma Frame Base", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {/* Add form row */}
            {showAddForm && (
              <tr className="bg-blue-50">
                <td className={cellCls}>
                  <input className={inputCls} placeholder="Format_Name" value={addForm.formatName}
                    onChange={(e) => setAddForm((p) => ({ ...p, formatName: e.target.value }))} />
                </td>
                <td className={cellCls}>
                  <input className={inputCls} placeholder="Channel" value={addForm.channel}
                    onChange={(e) => setAddForm((p) => ({ ...p, channel: e.target.value }))} />
                </td>
                <td className={cellCls}>
                  <div className="flex gap-1">
                    <input className={inputCls} placeholder="W" type="number" value={addForm.width}
                      onChange={(e) => setAddForm((p) => ({ ...p, width: e.target.value }))} />
                    <input className={inputCls} placeholder="H" type="number" value={addForm.height}
                      onChange={(e) => setAddForm((p) => ({ ...p, height: e.target.value }))} />
                  </div>
                </td>
                <td className={cellCls}>
                  <input className={inputCls} placeholder="Device" value={addForm.device}
                    onChange={(e) => setAddForm((p) => ({ ...p, device: e.target.value }))} />
                </td>
                <td className={cellCls}>
                  <input className={inputCls} placeholder="e.g. 720x400" value={addForm.safeArea}
                    onChange={(e) => setAddForm((p) => ({ ...p, safeArea: e.target.value }))} />
                </td>
                <td className={cellCls}>
                  <select className={inputCls} value={addForm.outputFormat}
                    onChange={(e) => setAddForm((p) => ({ ...p, outputFormat: e.target.value }))}>
                    <option>PNG</option><option>JPG</option>
                  </select>
                </td>
                <td className={cellCls}>
                  <input className={inputCls} placeholder="_MASTER_..." value={addForm.figmaFrameBase}
                    onChange={(e) => setAddForm((p) => ({ ...p, figmaFrameBase: e.target.value }))} />
                </td>
                <td className={cellCls}>
                  <div className="flex gap-1">
                    <button onClick={addFormat} disabled={isAdding}
                      className="rounded bg-gray-900 px-2 py-1 text-xs text-white hover:bg-gray-700 disabled:opacity-50">
                      {isAdding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    </button>
                    <button onClick={() => { setShowAddForm(false); setAddForm(EMPTY_FORM); }}
                      className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {formats.map((f) => (
              <tr key={f.id} className="hover:bg-gray-50 cursor-pointer"
                onClick={() => editingId !== f.id && startEdit(f)}>
                {editingId === f.id ? (
                  <>
                    <td className={cellCls}>
                      <input className={inputCls} value={editValues.formatName}
                        onChange={(e) => setEditValues((p) => ({ ...p, formatName: e.target.value }))}
                        onClick={(e) => e.stopPropagation()} />
                    </td>
                    <td className={cellCls}>
                      <input className={inputCls} value={editValues.channel}
                        onChange={(e) => setEditValues((p) => ({ ...p, channel: e.target.value }))}
                        onClick={(e) => e.stopPropagation()} />
                    </td>
                    <td className={cellCls}>
                      <div className="flex gap-1">
                        <input className={inputCls} type="number" value={editValues.width}
                          onChange={(e) => setEditValues((p) => ({ ...p, width: e.target.value }))}
                          onClick={(e) => e.stopPropagation()} />
                        <input className={inputCls} type="number" value={editValues.height}
                          onChange={(e) => setEditValues((p) => ({ ...p, height: e.target.value }))}
                          onClick={(e) => e.stopPropagation()} />
                      </div>
                    </td>
                    <td className={cellCls}>
                      <input className={inputCls} value={editValues.device}
                        onChange={(e) => setEditValues((p) => ({ ...p, device: e.target.value }))}
                        onClick={(e) => e.stopPropagation()} />
                    </td>
                    <td className={cellCls}>
                      <input className={inputCls} value={editValues.safeArea}
                        onChange={(e) => setEditValues((p) => ({ ...p, safeArea: e.target.value }))}
                        onClick={(e) => e.stopPropagation()} />
                    </td>
                    <td className={cellCls}>
                      <select className={inputCls} value={editValues.outputFormat}
                        onChange={(e) => setEditValues((p) => ({ ...p, outputFormat: e.target.value }))}
                        onClick={(e) => e.stopPropagation()}>
                        <option>PNG</option><option>JPG</option>
                      </select>
                    </td>
                    <td className={cellCls}>
                      <input className={inputCls} value={editValues.figmaFrameBase}
                        onChange={(e) => setEditValues((p) => ({ ...p, figmaFrameBase: e.target.value }))}
                        onClick={(e) => e.stopPropagation()} />
                    </td>
                    <td className={cellCls} onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button onClick={() => saveEdit(f.id)} disabled={savingId === f.id}
                          className="rounded bg-gray-900 px-2 py-1 text-xs text-white hover:bg-gray-700 disabled:opacity-50">
                          {savingId === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className={cellCls + " font-medium"}>{f.formatName}</td>
                    <td className={cellCls}>{f.channel}</td>
                    <td className={cellCls + " tabular-nums"}>{f.width}×{f.height}</td>
                    <td className={cellCls}>{f.device}</td>
                    <td className={cellCls + " text-gray-400"}>{f.safeArea || "—"}</td>
                    <td className={cellCls}>
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${f.outputFormat === "JPG" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
                        {f.outputFormat}
                      </span>
                    </td>
                    <td className={cellCls + " font-mono text-xs text-gray-400 max-w-xs truncate"}>{f.figmaFrameBase || "—"}</td>
                    <td className={cellCls} onClick={(e) => e.stopPropagation()}>
                      {confirmDeleteId === f.id ? (
                        <div className="flex gap-1">
                          <button onClick={() => deleteFormat(f.id)} disabled={deletingId === f.id}
                            className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50">
                            {deletingId === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete"}
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)}
                            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(f.id)}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
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
