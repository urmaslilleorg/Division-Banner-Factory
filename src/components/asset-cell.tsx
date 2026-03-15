"use client";

/**
 * AssetCell
 *
 * Renders an image upload / URL paste UI for Image and Illustration cells
 * in the Copy & Assets table. Supports:
 *   - File upload (PNG, JPG, WebP, SVG) — reads as base64 data URL
 *   - URL paste — validates and saves the URL directly
 *   - Drag & drop onto the cell
 *   - Thumbnail preview when a value is set
 *   - Replace / Remove actions
 *
 * The parent is responsible for persisting the value via PATCH.
 * This component calls onSave(url) immediately on any change.
 */

import { useState, useRef, useCallback, useEffect } from "react";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

type Mode = "idle" | "url-input" | "uploading";

interface AssetCellProps {
  value: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** Called with the new URL (or empty string for remove) after user action */
  onSave: (url: string) => void;
  /** Accent color for focus rings etc. Defaults to gray-900 */
  accent?: "gray" | "purple";
}

export default function AssetCell({
  value,
  disabled = false,
  readOnly = false,
  onSave,
  accent = "gray",
}: AssetCellProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [imgError, setImgError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Reset img error when value changes
  useEffect(() => {
    setImgError(false);
  }, [value]);

  // Focus URL input when mode switches to url-input
  useEffect(() => {
    if (mode === "url-input") {
      setTimeout(() => urlInputRef.current?.focus(), 50);
    }
  }, [mode]);

  const ringClass = accent === "purple"
    ? "focus:ring-purple-400"
    : "focus:ring-gray-900";

  // ── File handling ──────────────────────────────────────────────────────────

  const processFile = useCallback(
    (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        alert("Unsupported file type. Please use PNG, JPG, WebP, or SVG.");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        alert("File too large. Maximum size is 2 MB.");
        return;
      }
      setMode("uploading");
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setMode("idle");
        onSave(dataUrl);
      };
      reader.onerror = () => {
        setMode("idle");
        alert("Failed to read file.");
      };
      reader.readAsDataURL(file);
    },
    [onSave]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  };

  // ── URL handling ───────────────────────────────────────────────────────────

  const handleUrlConfirm = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setMode("idle");
      setUrlInput("");
      return;
    }
    try {
      new URL(trimmed);
    } catch {
      setUrlError("Invalid URL");
      return;
    }
    setUrlError(null);
    setMode("idle");
    setUrlInput("");
    onSave(trimmed);
  };

  // ── Drag & drop ────────────────────────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || readOnly) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasValue = value && value.trim() !== "";
  const isUploading = mode === "uploading";

  // Hidden file input (always rendered)
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={ACCEPTED_TYPES.join(",")}
      className="hidden"
      onChange={handleFileChange}
      disabled={disabled || readOnly}
    />
  );

  // ── HAS VALUE ──────────────────────────────────────────────────────────────
  if (hasValue) {
    return (
      <div
        className={`flex flex-col gap-1.5 p-1 rounded transition-colors ${isDragging ? "bg-blue-50 ring-2 ring-blue-300" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {fileInput}
        {/* Thumbnail */}
        <div className="relative w-12 h-12 rounded overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0">
          {imgError ? (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="h-5 w-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt="Asset preview"
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          )}
        </div>
        {/* Actions */}
        {!readOnly && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
              title="Replace image"
              className="flex-1 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-40"
            >
              {isUploading ? "…" : "Replace"}
            </button>
            <button
              type="button"
              onClick={() => onSave("")}
              disabled={disabled}
              title="Remove image"
              className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-50 hover:border-red-200 transition-colors disabled:opacity-40"
            >
              ×
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── URL INPUT MODE ─────────────────────────────────────────────────────────
  if (mode === "url-input") {
    return (
      <div className="flex flex-col gap-1 p-1">
        {fileInput}
        <div className="flex gap-1">
          <input
            ref={urlInputRef}
            type="url"
            value={urlInput}
            onChange={(e) => { setUrlInput(e.target.value); setUrlError(null); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleUrlConfirm();
              if (e.key === "Escape") { setMode("idle"); setUrlInput(""); setUrlError(null); }
            }}
            placeholder="https://…"
            className={`flex-1 min-w-0 rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 ${ringClass} ${urlError ? "border-red-300" : ""}`}
          />
          <button
            type="button"
            onClick={handleUrlConfirm}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ✓
          </button>
        </div>
        {urlError && <p className="text-[10px] text-red-500">{urlError}</p>}
      </div>
    );
  }

  // ── UPLOADING STATE ────────────────────────────────────────────────────────
  if (mode === "uploading") {
    return (
      <div className="flex items-center gap-1.5 p-1">
        {fileInput}
        <svg className="h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span className="text-[11px] text-gray-400">Uploading…</span>
      </div>
    );
  }

  // ── EMPTY STATE ────────────────────────────────────────────────────────────
  return (
    <div
      className={`flex gap-1 p-1 rounded transition-colors ${isDragging ? "bg-blue-50 ring-2 ring-blue-300" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {fileInput}
      {readOnly ? (
        <span className="block min-h-[28px] text-xs text-gray-300 select-none">—</span>
      ) : (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            title="Upload image file"
            className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-40"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload
          </button>
          <button
            type="button"
            onClick={() => setMode("url-input")}
            disabled={disabled}
            title="Paste image URL"
            className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-40"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            URL
          </button>
        </>
      )}
    </div>
  );
}
