"use client";

import { useState, useRef } from "react";
import { Loader2, Upload, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_OPTIONS = [
  "Brief_received",
  "Draft",
  "Ready",
  "Client_Review",
  "Approved",
  "Exported",
  "Archived",
];

interface DesignerControlsProps {
  bannerId: string;
  currentStatus: string;
  onStatusChange?: (newStatus: string) => void;
}

export default function DesignerControls({
  bannerId,
  currentStatus,
  onStatusChange,
}: DesignerControlsProps) {
  const [status, setStatus] = useState(currentStatus);
  const [isMarkingReady, setIsMarkingReady] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const patchBanner = async (fields: Record<string, unknown>) => {
    const res = await fetch(`/api/banners/${bannerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Update failed");
    }
    return res.json();
  };

  const handleMarkReady = async () => {
    setIsMarkingReady(true);
    setStatusMessage(null);
    try {
      await patchBanner({ Status: "Client_Review" });
      setStatus("Client_Review");
      onStatusChange?.("Client_Review");
      setStatusMessage("Marked as ready for review");
      setTimeout(() => setStatusMessage(null), 2000);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Failed");
    } finally {
      setIsMarkingReady(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setStatusMessage(null);
    try {
      await patchBanner({ Status: newStatus });
      setStatus(newStatus);
      onStatusChange?.(newStatus);
      setStatusMessage(`Status → ${newStatus}`);
      setTimeout(() => setStatusMessage(null), 2000);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setUploadMessage("Only PNG and JPG files are accepted.");
      return;
    }

    setIsUploading(true);
    setUploadMessage(null);

    try {
      // Upload via API route
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bannerId", bannerId);

      const res = await fetch(`/api/banners/${bannerId}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      setUploadMessage(`Uploaded: ${data.url ? "✓" : "done"}`);
      setTimeout(() => setUploadMessage(null), 3000);
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100 mt-2">
      {/* Mark ready for review */}
      {status !== "Client_Review" && status !== "Approved" && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleMarkReady}
          disabled={isMarkingReady}
          className="text-xs"
        >
          {isMarkingReady ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : null}
          Mark ready for review
        </Button>
      )}

      {/* Status dropdown */}
      <div className="relative">
        <select
          value={status}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="appearance-none rounded-md border border-gray-200 bg-white py-1.5 pl-2.5 pr-7 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-900 cursor-pointer"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
      </div>

      {/* Upload new version */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleFileUpload}
          className="hidden"
          id={`upload-${bannerId}`}
        />
        <label htmlFor={`upload-${bannerId}`}>
          <Button
            size="sm"
            variant="outline"
            disabled={isUploading}
            className="text-xs cursor-pointer"
            asChild
          >
            <span>
              {isUploading ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Upload className="mr-1 h-3 w-3" />
              )}
              Upload new version
            </span>
          </Button>
        </label>
      </div>

      {/* Feedback messages */}
      {(statusMessage || uploadMessage) && (
        <span className="text-xs text-gray-500">{statusMessage || uploadMessage}</span>
      )}
    </div>
  );
}
