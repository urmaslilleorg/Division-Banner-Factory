"use client";

import { useState, useRef } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_VARIABLES = ["H1", "H2", "H3", "CTA", "Price_Tag", "Illustration", "Image"];
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB each

// ── Types ─────────────────────────────────────────────────────────────────────

interface BannerElement {
  slot: string;
  text_content: string;
  confidence: number;
}

interface AnalysisResult {
  banners: Array<{ index: number; elements: BannerElement[] }>;
  recommended_variables: string[];
  common_copy: Record<string, string>;
  notes: string;
}

interface PrefilledConfig {
  variables: string[];
  copy: Record<string, string>;
}

type FlowStep = "upload" | "analyzing" | "review";

interface ImageItem {
  file: File;
  url: string;
  base64: string;
  mimeType: string;
}

interface CreateFromBannersFlowProps {
  onConfigReady: (config: PrefilledConfig) => void;
  onCancel: () => void;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CreateFromBannersFlow({
  onConfigReady,
  onCancel,
}: CreateFromBannersFlowProps) {
  const [step, setStep] = useState<FlowStep>("upload");
  const [images, setImages] = useState<ImageItem[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [selectedVars, setSelectedVars] = useState<Set<string>>(new Set());
  const [copyValues, setCopyValues] = useState<Record<string, string>>({});

  const inputRef = useRef<HTMLInputElement>(null);

  // ── Image handling ────────────────────────────────────────────────────────────

  const addFiles = async (files: FileList | File[]) => {
    setUploadError(null);
    const arr = Array.from(files);
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      setUploadError(`Maximum ${MAX_IMAGES} images allowed.`);
      return;
    }
    const toAdd = arr.slice(0, remaining);
    const newItems: ImageItem[] = [];
    for (const file of toAdd) {
      if (!file.type.startsWith("image/")) {
        setUploadError("Only PNG and JPEG images are supported.");
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setUploadError(`${file.name} is too large (max 10 MB).`);
        continue;
      }
      const url = URL.createObjectURL(file);
      const base64 = await fileToBase64(file);
      newItems.push({ file, url, base64, mimeType: file.type });
    }
    setImages((prev) => [...prev, ...newItems]);
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  // ── Analysis ──────────────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    if (images.length === 0) return;
    setAnalyzeError(null);
    setStep("analyzing");

    try {
      const res = await fetch("/api/banners/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: images.map((img) => img.base64),
          mimeTypes: images.map((img) => img.mimeType),
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const data: AnalysisResult = await res.json();
      setResult(data);

      // Pre-select recommended variables
      const recommended = new Set(data.recommended_variables);
      setSelectedVars(recommended);

      // Pre-fill copy from common_copy
      const copy: Record<string, string> = {};
      for (const v of ALL_VARIABLES) {
        copy[v] = data.common_copy?.[v] ?? "";
      }
      setCopyValues(copy);

      setStep("review");
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Analysis failed.");
      setStep("upload");
    }
  };

  // ── Use config ────────────────────────────────────────────────────────────────

  const handleUseConfig = () => {
    const variables = Array.from(selectedVars);
    const copy: Record<string, string> = {};
    for (const v of variables) {
      if (copyValues[v]) copy[v] = copyValues[v];
    }
    onConfigReady({ variables, copy });
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="shrink-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step === "review" && (
              <button
                onClick={() => setStep("upload")}
                className="text-gray-400 hover:text-gray-700 text-sm"
              >
                ← Back
              </button>
            )}
            <h2 className="text-base font-semibold text-gray-900">
              {step === "upload" && "Create from existing banners"}
              {step === "analyzing" && "Analysing banners…"}
              {step === "review" && "Detected variables"}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === "upload" && (
            <UploadBannersStep
              images={images}
              uploadError={uploadError}
              analyzeError={analyzeError}
              inputRef={inputRef}
              onDrop={handleDrop}
              onAddFiles={addFiles}
              onRemove={removeImage}
              onAnalyze={handleAnalyze}
            />
          )}

          {step === "analyzing" && <AnalyzingStep />}

          {step === "review" && result && (
            <ReviewStep
              images={images}
              result={result}
              selectedVars={selectedVars}
              setSelectedVars={setSelectedVars}
              copyValues={copyValues}
              setCopyValues={setCopyValues}
              onUseConfig={handleUseConfig}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── UploadBannersStep ─────────────────────────────────────────────────────────

function UploadBannersStep({
  images,
  uploadError,
  analyzeError,
  inputRef,
  onDrop,
  onAddFiles,
  onRemove,
  onAnalyze,
}: {
  images: ImageItem[];
  uploadError: string | null;
  analyzeError: string | null;
  inputRef: React.RefObject<HTMLInputElement>;
  onDrop: (e: React.DragEvent) => void;
  onAddFiles: (files: FileList | File[]) => void;
  onRemove: (i: number) => void;
  onAnalyze: () => void;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">
        Upload 1–5 banner images. Claude will detect variables and extract copy to pre-fill the
        Campaign Builder.
      </p>

      {/* Drop zone */}
      <div
        className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center hover:border-gray-400 transition-colors cursor-pointer"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className="text-3xl mb-2">🖼️</div>
        <p className="text-sm text-gray-600 font-medium">Drop PNG/JPEG banners here</p>
        <p className="text-xs text-gray-400 mt-1">or click to browse · max {MAX_IMAGES} images · 10 MB each</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) onAddFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Image thumbnails */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((img, i) => (
            <div key={i} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.file.name}
                className="h-24 w-auto rounded-lg border border-gray-200 object-cover"
              />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
              <p className="text-[9px] text-gray-400 mt-0.5 max-w-[80px] truncate">{img.file.name}</p>
            </div>
          ))}
          {images.length < MAX_IMAGES && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="h-24 w-16 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 hover:border-gray-400 transition-colors text-2xl"
            >
              +
            </button>
          )}
        </div>
      )}

      {(uploadError || analyzeError) && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {uploadError || analyzeError}
        </p>
      )}

      <button
        type="button"
        onClick={onAnalyze}
        disabled={images.length === 0}
        className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
      >
        Analyse with AI →
      </button>
    </div>
  );
}

// ── AnalyzingStep ─────────────────────────────────────────────────────────────

function AnalyzingStep() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16">
      <div className="text-4xl animate-pulse">✨</div>
      <div className="space-y-2 text-center">
        <p className="text-sm font-medium text-gray-900">Analysing banners with Claude…</p>
        <p className="text-xs text-gray-500">Detecting variables and extracting copy. This may take up to 30 seconds.</p>
      </div>
    </div>
  );
}

// ── ReviewStep ────────────────────────────────────────────────────────────────

function ReviewStep({
  images,
  result,
  selectedVars,
  setSelectedVars,
  copyValues,
  setCopyValues,
  onUseConfig,
}: {
  images: ImageItem[];
  result: AnalysisResult;
  selectedVars: Set<string>;
  setSelectedVars: React.Dispatch<React.SetStateAction<Set<string>>>;
  copyValues: Record<string, string>;
  setCopyValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onUseConfig: () => void;
}) {
  // Build a map of slot -> highest confidence across all banners
  const confidenceMap: Record<string, number> = {};
  for (const banner of result.banners) {
    for (const el of banner.elements) {
      if (!confidenceMap[el.slot] || el.confidence > confidenceMap[el.slot]) {
        confidenceMap[el.slot] = el.confidence;
      }
    }
  }

  const toggleVar = (v: string) => {
    setSelectedVars((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };

  const detectedSlots = ALL_VARIABLES.filter((v) => confidenceMap[v] !== undefined);

  return (
    <div className="space-y-6">
      {/* Banner thumbnails */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={img.url}
              alt={`Banner ${i + 1}`}
              className="h-20 w-auto rounded-lg border border-gray-200 object-cover"
            />
          ))}
        </div>
      )}

      {result.notes && (
        <p className="text-xs text-gray-500 italic">{result.notes}</p>
      )}

      {/* Variable checkboxes */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
          Detected variables — select to include
        </p>
        {detectedSlots.map((v) => {
          const conf = confidenceMap[v] ?? 0;
          const isRecommended = result.recommended_variables.includes(v);
          return (
            <label
              key={v}
              className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                selectedVars.has(v) ? "border-gray-300 bg-white" : "border-gray-100 bg-gray-50/50"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedVars.has(v)}
                onChange={() => toggleVar(v)}
                className="mt-0.5 shrink-0"
              />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-gray-800">{v}</span>
                  {isRecommended && (
                    <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">
                      recommended
                    </span>
                  )}
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ml-auto ${
                      conf >= 0.8
                        ? "bg-green-100 text-green-700"
                        : conf >= 0.5
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {Math.round(conf * 100)}%
                  </span>
                </div>

                {/* Copy input */}
                {selectedVars.has(v) && (
                  <input
                    type="text"
                    value={copyValues[v] ?? ""}
                    onChange={(e) =>
                      setCopyValues((prev) => ({ ...prev, [v]: e.target.value }))
                    }
                    placeholder={v === "Illustration" || v === "Image" ? "Description (optional)" : `Default copy for ${v}`}
                    className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
                  />
                )}

                {/* Per-banner detected text */}
                {result.banners.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {result.banners.map((b, bi) => {
                      const el = b.elements.find((e) => e.slot === v);
                      if (!el) return null;
                      return (
                        <span
                          key={bi}
                          className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full"
                        >
                          B{bi + 1}: {el.text_content || "—"}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </label>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onUseConfig}
        disabled={selectedVars.size === 0}
        className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
      >
        Use this config →
      </button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix
      resolve(result.replace(/^data:[^;]+;base64,/, ""));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
