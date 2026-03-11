"use client";

import { useState, useRef } from "react";
import { Loader2, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DesignerControlsProps {
  bannerId: string;
  onUploadSuccess?: () => void;
  onDelete?: (bannerId: string) => void;
}

export default function DesignerControls({
  bannerId,
  onUploadSuccess,
  onDelete,
}: DesignerControlsProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setUploadMessage("Only PNG and JPG files are accepted.");
      return;
    }

    setIsUploading(true);
    setUploadMessage(null);

    try {
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

      setUploadMessage("Uploaded ✓");
      setTimeout(() => setUploadMessage(null), 3000);
      onUploadSuccess?.();
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/banners/${bannerId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
      onDelete?.(bannerId);
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : "Delete failed");
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100 mt-2">
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

      {/* Delete button */}
      {!showDeleteConfirm ? (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            setShowDeleteConfirm(true);
          }}
          className="text-xs text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
        >
          <Trash2 className="mr-1 h-3 w-3" />
          Delete
        </Button>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Delete?</span>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteConfirm();
            }}
            disabled={isDeleting}
            className="text-xs text-red-600 border-red-300 hover:bg-red-50 px-2"
          >
            {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes, delete"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(false);
            }}
            className="text-xs px-2"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Feedback messages */}
      {uploadMessage && (
        <span className="text-xs text-gray-500">{uploadMessage}</span>
      )}
    </div>
  );
}
