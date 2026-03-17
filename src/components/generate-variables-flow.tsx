"use client";

import { useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ClientVariable {
  slot: string;
  label: string;
}

interface RawAnalysisItem {
  slot: string;
  detected: boolean;
  suggestedLabel: string;
  detectedText: string | null;
  confidence: number;
}

interface ReviewItem extends RawAnalysisItem {
  included: boolean;
  editedLabel: string;
}

interface Props {
  clientName: string;
  onApply: (variables: ClientVariable[]) => void;
  onClose: () => void;
  /** If provided, the "Use this config" button will also PATCH the client directly */
  clientId?: string;
}

const ALL_SLOTS = ["H1", "H2", "H3", "CTA", "Price_Tag", "Illustration", "Image"];

// ─── Component ────────────────────────────────────────────────────────────────
export default function GenerateVariablesFlow({
  clientName,
  onApply,
  onClose,
  clientId,
}: Props) {
  const [step, setStep] = useState<"upload" | "analyzing" | "review" | "error">("upload");
  const [images, setImages] = useState<{ file: File; url: string }[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [applying, setApplying] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Upload helpers ──────────────────────────────────────────────────────────
  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const remaining = 3 - images.length;
    const toAdd = Array.from(files).slice(0, remaining);
    const newImages = toAdd
      .filter((f) => f.type.startsWith("image/") && f.size <= 5 * 1024 * 1024)
      .map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    setImages((prev) => [...prev, ...newImages]);
  };

  const removeImage = (idx: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  // ── Analyze ─────────────────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (images.length === 0) return;
    setStep("analyzing");
    setErrorMsg("");

    // Convert files to base64
    const base64Images = await Promise.all(
      images.map(
        (img) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(img.file);
          })
      )
    );

    try {
      const res = await fetch("/api/clients/analyze-variables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: base64Images, clientName }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data: { rawAnalysis: RawAnalysisItem[]; notes: string } = await res.json();

      // Build review items — ensure all 7 slots are present
      const analysisMap = new Map(data.rawAnalysis.map((v) => [v.slot, v]));
      const items: ReviewItem[] = ALL_SLOTS.map((slot) => {
        const found = analysisMap.get(slot);
        if (found) {
          return {
            ...found,
            included: found.detected,
            editedLabel: found.suggestedLabel,
          };
        }
        return {
          slot,
          detected: false,
          suggestedLabel: slot,
          detectedText: null,
          confidence: 0,
          included: false,
          editedLabel: slot,
        };
      });

      setReviewItems(items);
      setNotes(data.notes ?? "");
      setStep("review");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  };

  // ── Apply ───────────────────────────────────────────────────────────────────
  const handleApply = async () => {
    const variables: ClientVariable[] = reviewItems
      .filter((item) => item.included)
      .map((item) => ({ slot: item.slot, label: item.editedLabel || item.slot }));

    if (clientId) {
      // Client Settings mode: PATCH directly
      setApplying(true);
      try {
        const res = await fetch(`/api/admin/clients/${clientId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientVariables: JSON.stringify(variables) }),
        });
        if (!res.ok) throw new Error(await res.text());
        setFlash("Variables updated from banner analysis");
        onApply(variables);
        setTimeout(onClose, 1200);
      } catch (err) {
        setFlash(`Error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setApplying(false);
      }
    } else {
      // Wizard mode: just pass back and close
      onApply(variables);
      onClose();
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            Generate Variables from Banner
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Step: Upload ── */}
          {step === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Upload 1–3 existing banners from <strong>{clientName}</strong>. The AI will detect
                which variable slots are used and suggest Estonian labels.
              </p>

              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => images.length < 3 && fileInputRef.current?.click()}
                className={`rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
                  images.length < 3
                    ? "cursor-pointer border-gray-200 hover:border-gray-400 hover:bg-gray-50"
                    : "border-gray-100 bg-gray-50 cursor-not-allowed"
                }`}
              >
                <svg className="mx-auto h-8 w-8 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-gray-500">
                  {images.length < 3
                    ? "Drop banners here or click to browse"
                    : "Maximum 3 banners reached"}
                </p>
                <p className="mt-1 text-xs text-gray-400">PNG or JPG, max 5 MB each</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />

              {/* Thumbnails */}
              {images.length > 0 && (
                <div className="flex gap-3 flex-wrap">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt={`Banner ${idx + 1}`}
                        className="h-20 w-20 rounded-lg object-cover border border-gray-200"
                      />
                      <button
                        onClick={() => removeImage(idx)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-gray-400">
                Tip: upload banners of different sizes from the same client for best results.
              </p>
            </div>
          )}

          {/* ── Step: Analyzing ── */}
          {step === "analyzing" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-gray-700 animate-spin" />
              <p className="text-sm text-gray-600">Analyzing banners with AI…</p>
              <p className="text-xs text-gray-400">This usually takes 5–15 seconds</p>
            </div>
          )}

          {/* ── Step: Review ── */}
          {step === "review" && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">
                  AI detected{" "}
                  <strong>{reviewItems.filter((i) => i.detected).length}</strong> variable
                  types. Review and adjust the labels for{" "}
                  <strong>{clientName}</strong>.
                </p>
                {notes && (
                  <p className="mt-1 text-xs text-gray-400 italic">{notes}</p>
                )}
              </div>

              <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                {reviewItems.map((item) => (
                  <div key={item.slot} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={item.included}
                        onChange={(e) =>
                          setReviewItems((prev) =>
                            prev.map((r) =>
                              r.slot === item.slot
                                ? { ...r, included: e.target.checked }
                                : r
                            )
                          )
                        }
                        className="h-4 w-4 rounded border-gray-300 text-gray-900 cursor-pointer"
                      />
                      <span className="w-24 text-sm font-mono text-gray-500 shrink-0">
                        {item.slot}
                      </span>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={item.editedLabel}
                          disabled={!item.included}
                          onChange={(e) =>
                            setReviewItems((prev) =>
                              prev.map((r) =>
                                r.slot === item.slot
                                  ? { ...r, editedLabel: e.target.value }
                                  : r
                              )
                            )
                          }
                          placeholder={item.suggestedLabel || item.slot}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
                        />
                      </div>
                      {item.detected && (
                        <span className="shrink-0 text-xs text-gray-400">
                          {Math.round(item.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    {item.detected && item.detectedText && (
                      <p className="ml-7 text-xs text-gray-400 truncate">
                        Detected: &ldquo;{item.detectedText}&rdquo;
                      </p>
                    )}
                    {!item.detected && (
                      <p className="ml-7 text-xs text-gray-400">
                        Not detected in any banner
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Reference thumbnails */}
              {images.length > 0 && (
                <div className="flex gap-2">
                  {images.map((img, idx) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={idx}
                      src={img.url}
                      alt={`Banner ${idx + 1}`}
                      className="h-14 w-14 rounded object-cover border border-gray-200"
                    />
                  ))}
                </div>
              )}

              {flash && (
                <p
                  className={`text-sm ${
                    flash.startsWith("Error") ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {flash}
                </p>
              )}
            </div>
          )}

          {/* ── Step: Error ── */}
          {step === "error" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                <p className="text-sm font-medium text-red-700">Analysis failed</p>
                <p className="mt-1 text-sm text-red-600">{errorMsg}</p>
              </div>
              <p className="text-sm text-gray-500">
                You can try again or configure variables manually.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 shrink-0">
          <button
            onClick={() => {
              if (step === "review" || step === "error") {
                setStep("upload");
              } else {
                onClose();
              }
            }}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            {step === "review" || step === "error" ? "← Back" : "Cancel"}
          </button>

          <div className="flex gap-2">
            {step === "error" && (
              <button
                onClick={() => setStep("upload")}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Configure manually
              </button>
            )}
            {step === "upload" && (
              <button
                onClick={handleAnalyze}
                disabled={images.length === 0}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Analyze →
              </button>
            )}
            {step === "review" && (
              <button
                onClick={handleApply}
                disabled={applying || reviewItems.filter((i) => i.included).length === 0}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {applying ? "Saving…" : "Use this config →"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
