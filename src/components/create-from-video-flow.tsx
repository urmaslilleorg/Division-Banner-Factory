"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import type { VideoTemplate, AnimationEntry, AnimationEffect } from "./video-templates-manager";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_VARIABLES = ["H1", "H2", "H3", "CTA", "Price_Tag", "Illustration", "Image"];
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_AI_SECONDS = 30;
const FRAME_INTERVAL = 0.5;
const FRAME_MAX_WIDTH = 960;
const FRAME_QUALITY = 0.6;

const EFFECT_OPTIONS: { value: AnimationEffect; label: string }[] = [
  { value: "none", label: "none" },
  { value: "fade_in", label: "fade_in" },
  { value: "fade_out", label: "fade_out" },
  { value: "slide_up", label: "slide_up" },
  { value: "slide_down", label: "slide_down" },
  { value: "slide_left", label: "slide_left" },
  { value: "slide_right", label: "slide_right" },
  { value: "zoom_in", label: "zoom_in" },
  { value: "zoom_out", label: "zoom_out" },
  { value: "pop", label: "pop" },
  { value: "pulse", label: "pulse" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type FlowStep =
  | "upload"       // drop zone + mode selection
  | "manual"       // Mode A: manual marking
  | "ai_extract"   // Mode B step 1: frame extraction
  | "ai_analyze"   // Mode B step 2: Claude analysis
  | "ai_review";   // Mode B step 3: review results

interface MarkerState {
  entry: number | null;
  exit: number | null;
  effect: AnimationEffect;
}

type MarkersMap = Record<string, MarkerState>;

interface ExitMarker {
  start: number | null;
  effect: AnimationEffect;
}

interface AiElement {
  slot: string;
  text_content: string;
  entry_frame: number;
  exit_frame: number;
  entry_effect: AnimationEffect;
  confidence: number;
  included: boolean;
}

interface AiResult {
  template: VideoTemplate;
  analysis: {
    elements: AiElement[];
    global_exit: { start_frame: number; effect: AnimationEffect; confidence: number } | null;
    notes: string;
  };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CreateFromVideoFlowProps {
  onTemplateReady: (tpl: VideoTemplate) => void;
  onCancel: () => void;
  hasAiKey: boolean;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CreateFromVideoFlow({
  onTemplateReady,
  onCancel,
  hasAiKey,
}: CreateFromVideoFlowProps) {
  const [step, setStep] = useState<FlowStep>("upload");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Manual marking state
  const [markers, setMarkers] = useState<MarkersMap>(() =>
    Object.fromEntries(
      ALL_VARIABLES.map((v) => [v, { entry: null, exit: null, effect: "fade_in" as AnimationEffect }])
    )
  );
  const [exitMarker, setExitMarker] = useState<ExitMarker>({ start: null, effect: "fade_out" });

  // AI state
  const [extractProgress, setExtractProgress] = useState<{ current: number; total: number } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiElements, setAiElements] = useState<AiElement[]>([]);

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  // ── File handling ────────────────────────────────────────────────────────────

  const handleFile = (file: File) => {
    setUploadError(null);
    if (!file.type.startsWith("video/")) {
      setUploadError("Please upload an MP4 or WebM video file.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setUploadError("File too large. Maximum size is 50 MB.");
      return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // ── Mode selection ───────────────────────────────────────────────────────────

  const handleSelectManual = () => setStep("manual");

  const handleSelectAi = () => {
    setAiError(null);
    setStep("ai_extract");
    startFrameExtraction();
  };

  // ── Frame extraction ─────────────────────────────────────────────────────────

  const startFrameExtraction = useCallback(() => {
    if (!videoUrl) return;

    const vid = document.createElement("video");
    vid.src = videoUrl;
    vid.muted = true;
    vid.preload = "auto";

    vid.addEventListener("loadedmetadata", () => {
      const duration = vid.duration;
      if (duration > MAX_AI_SECONDS) {
        setAiError(
          `Video too long for AI (${Math.round(duration)}s, max ${MAX_AI_SECONDS}s). Use manual marking.`
        );
        setStep("upload");
        return;
      }

      const totalFrames = Math.ceil(duration / FRAME_INTERVAL);
      const frames: string[] = [];
      setExtractProgress({ current: 0, total: totalFrames });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;

      let frameIdx = 0;

      const seekNext = () => {
        if (frameIdx >= totalFrames) {
          // All frames extracted — send to Claude
          runAiAnalysis(frames, duration, vid.videoWidth, vid.videoHeight);
          return;
        }
        const t = frameIdx * FRAME_INTERVAL;
        vid.currentTime = t;
      };

      vid.addEventListener("seeked", () => {
        // Scale canvas
        const scale = Math.min(1, FRAME_MAX_WIDTH / vid.videoWidth);
        canvas.width = Math.round(vid.videoWidth * scale);
        canvas.height = Math.round(vid.videoHeight * scale);
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", FRAME_QUALITY);
        // Strip data URL prefix to get base64
        frames.push(dataUrl.replace(/^data:image\/jpeg;base64,/, ""));
        frameIdx++;
        setExtractProgress({ current: frameIdx, total: totalFrames });
        seekNext();
      });

      seekNext();
    });

    vid.addEventListener("error", () => {
      setAiError("Could not load video for frame extraction.");
      setStep("upload");
    });
  }, [videoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI analysis ──────────────────────────────────────────────────────────────

  const runAiAnalysis = async (
    frames: string[],
    duration: number,
    width: number,
    height: number
  ) => {
    setStep("ai_analyze");
    setAiError(null);
    try {
      const res = await fetch("/api/video/detect-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames, duration, width, height, interval: FRAME_INTERVAL }),
        signal: AbortSignal.timeout(35000),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data: AiResult = await res.json();
      setAiResult(data);
      setAiElements(
        data.analysis.elements.map((el) => ({ ...el, included: true }))
      );
      setStep("ai_review");
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : "AI analysis failed. Try manual marking."
      );
      setStep("upload");
    }
  };

  // ── Generate template from manual markers ────────────────────────────────────

  const videoRef = useRef<HTMLVideoElement>(null);

  const handleGenerateFromManual = () => {
    const duration = videoRef.current?.duration ?? 15;
    const animations: AnimationEntry[] = ALL_VARIABLES.map((v) => {
      const m = markers[v];
      if (m.entry === null && m.exit === null) {
        return { variable: v, effect: "none", start: 0, end: 1 };
      }
      return {
        variable: v,
        effect: m.effect,
        start: m.entry ?? 0,
        end: m.exit ?? Math.min((m.entry ?? 0) + 2, duration),
      };
    });

    const exitStart = exitMarker.start ?? Math.max(duration - 1, 0);
    const exitDuration = Math.max(duration - exitStart, 0.1);

    const tpl: VideoTemplate = {
      id: `vtpl_${Date.now().toString(36)}`,
      name: "",
      duration: Math.round(duration * 10) / 10,
      createdAt: new Date().toISOString().slice(0, 10),
      exit: { effect: exitMarker.effect, duration: exitDuration },
      animations,
    };
    onTemplateReady(tpl);
  };

  // ── Use AI template ──────────────────────────────────────────────────────────

  const handleUseAiTemplate = () => {
    if (!aiResult) return;
    // Rebuild template from included elements only
    const includedSlots = new Set(
      aiElements.filter((el) => el.included).map((el) => el.slot)
    );
    const animations: AnimationEntry[] = aiResult.template.animations.map((a) => {
      if (!includedSlots.has(a.variable)) {
        return { ...a, effect: "none" };
      }
      return a;
    });
    const tpl: VideoTemplate = { ...aiResult.template, animations };
    onTemplateReady(tpl);
  };

  // ── Switch to manual with AI pre-fill ───────────────────────────────────────

  const handleEditManually = () => {
    if (!aiResult) return;
    const newMarkers: MarkersMap = Object.fromEntries(
      ALL_VARIABLES.map((v) => [v, { entry: null, exit: null, effect: "fade_in" as AnimationEffect }])
    );
    for (const el of aiResult.analysis.elements) {
      if (newMarkers[el.slot]) {
        newMarkers[el.slot] = {
          entry: el.entry_frame * FRAME_INTERVAL,
          exit: el.exit_frame * FRAME_INTERVAL,
          effect: el.entry_effect,
        };
      }
    }
    setMarkers(newMarkers);
    if (aiResult.analysis.global_exit) {
      setExitMarker({
        start: aiResult.analysis.global_exit.start_frame * FRAME_INTERVAL,
        effect: aiResult.analysis.global_exit.effect,
      });
    }
    setStep("manual");
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="shrink-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step !== "upload" && (
              <button
                onClick={() => setStep("upload")}
                className="text-gray-400 hover:text-gray-700 text-sm"
              >
                ← Back
              </button>
            )}
            <h2 className="text-base font-semibold text-gray-900">
              {step === "upload" && "Create from video"}
              {step === "manual" && "Manual marking"}
              {step === "ai_extract" && "Extracting frames…"}
              {step === "ai_analyze" && "Analysing with AI…"}
              {step === "ai_review" && "AI detection results"}
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
            <UploadStep
              videoFile={videoFile}
              videoUrl={videoUrl}
              uploadError={uploadError || aiError}
              hasAiKey={hasAiKey}
              onFile={handleFile}
              onDrop={handleDrop}
              onSelectManual={handleSelectManual}
              onSelectAi={handleSelectAi}
            />
          )}

          {step === "manual" && videoUrl && (
            <ManualMarkingStep
              videoUrl={videoUrl}
              videoRef={videoRef}
              markers={markers}
              setMarkers={setMarkers}
              exitMarker={exitMarker}
              setExitMarker={setExitMarker}
              onGenerate={handleGenerateFromManual}
            />
          )}

          {step === "ai_extract" && (
            <AiExtractStep progress={extractProgress} />
          )}

          {step === "ai_analyze" && (
            <AiAnalyzeStep />
          )}

          {step === "ai_review" && aiResult && videoUrl && (
            <AiReviewStep
              videoUrl={videoUrl}
              elements={aiElements}
              setElements={setAiElements}
              globalExit={aiResult.analysis.global_exit}
              notes={aiResult.analysis.notes}
              onUseTemplate={handleUseAiTemplate}
              onEditManually={handleEditManually}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── UploadStep ────────────────────────────────────────────────────────────────

function UploadStep({
  videoFile,
  videoUrl,
  uploadError,
  hasAiKey,
  onFile,
  onDrop,
  onSelectManual,
  onSelectAi,
}: {
  videoFile: File | null;
  videoUrl: string | null;
  uploadError: string | null;
  hasAiKey: boolean;
  onFile: (f: File) => void;
  onDrop: (e: React.DragEvent) => void;
  onSelectManual: () => void;
  onSelectAi: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer ${
          videoFile ? "border-gray-400 bg-gray-50" : "border-gray-200 hover:border-gray-400"
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => !videoFile && inputRef.current?.click()}
      >
        {videoFile ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900">{videoFile.name}</p>
            <p className="text-xs text-gray-400">
              {(videoFile.size / 1024 / 1024).toFixed(1)} MB
            </p>
            {videoUrl && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={videoUrl}
                className="mx-auto mt-3 max-h-32 rounded-lg"
                muted
              />
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              className="text-xs text-indigo-600 hover:text-indigo-800 underline"
            >
              Change video
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Drop MP4 or WebM here</p>
            <p className="text-xs text-gray-400">or click to browse · max 50 MB</p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/webm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {uploadError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {uploadError}
        </p>
      )}

      {/* Mode selection — only shown when a file is loaded */}
      {videoFile && (
        <div className={`grid gap-4 ${hasAiKey ? "grid-cols-2" : "grid-cols-1"}`}>
          {/* Manual mode card */}
          <button
            type="button"
            onClick={onSelectManual}
            className="flex flex-col items-start gap-2 rounded-2xl border-2 border-gray-200 p-5 text-left hover:border-gray-900 hover:bg-gray-50 transition-colors"
          >
            <p className="text-sm font-semibold text-gray-900">Mark manually</p>
            <p className="text-xs text-gray-500">
              Play the video and click to mark entry/exit times for each variable. Full control.
            </p>
          </button>

          {/* AI mode card — only shown when ANTHROPIC_API_KEY is set */}
          {hasAiKey && (
            <button
              type="button"
              onClick={onSelectAi}
              className="flex flex-col items-start gap-2 rounded-2xl border-2 border-gray-200 p-5 text-left hover:border-gray-900 hover:bg-gray-50 transition-colors"
            >
              <p className="text-sm font-semibold text-gray-900">Auto-detect with AI</p>
              <p className="text-xs text-gray-500">
                Claude analyses the video frames and suggests animation timings. You review before saving.
                Max 30s.
              </p>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── ManualMarkingStep ─────────────────────────────────────────────────────────

function ManualMarkingStep({
  videoUrl,
  videoRef,
  markers,
  setMarkers,
  exitMarker,
  setExitMarker,
  onGenerate,
}: {
  videoUrl: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  markers: MarkersMap;
  setMarkers: React.Dispatch<React.SetStateAction<MarkersMap>>;
  exitMarker: ExitMarker;
  setExitMarker: React.Dispatch<React.SetStateAction<ExitMarker>>;
  onGenerate: () => void;
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const scrubberRef = useRef<HTMLDivElement>(null);

  const vid = videoRef;

  // ── Playback helpers ─────────────────────────────────────────────────────────

  const togglePlay = useCallback(() => {
    if (!vid.current) return;
    if (vid.current.paused) {
      vid.current.play();
      setPlaying(true);
    } else {
      vid.current.pause();
      setPlaying(false);
    }
  }, [vid]);

  const seek = useCallback((delta: number) => {
    if (!vid.current) return;
    vid.current.currentTime = Math.max(0, Math.min(vid.current.duration, vid.current.currentTime + delta));
  }, [vid]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only handle if not in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      if (e.code === "ArrowLeft") { e.preventDefault(); seek(e.shiftKey ? -0.1 : -0.5); }
      if (e.code === "ArrowRight") { e.preventDefault(); seek(e.shiftKey ? 0.1 : 0.5); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, seek]);

  // Speed
  useEffect(() => {
    if (vid.current) vid.current.playbackRate = speed;
  }, [speed, vid]);

  // Scrubber click
  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrubberRef.current || !vid.current || !duration) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    vid.current.currentTime = ratio * duration;
  };

  // ── Marker helpers ───────────────────────────────────────────────────────────

  const markEntry = (variable: string) => {
    setMarkers((m) => ({
      ...m,
      [variable]: { ...m[variable], entry: Math.round(currentTime * 10) / 10 },
    }));
  };

  const markExit = (variable: string) => {
    setMarkers((m) => ({
      ...m,
      [variable]: { ...m[variable], exit: Math.round(currentTime * 10) / 10 },
    }));
  };

  const clearMarker = (variable: string) => {
    setMarkers((m) => ({
      ...m,
      [variable]: { entry: null, exit: null, effect: m[variable].effect },
    }));
  };

  const setEffect = (variable: string, effect: AnimationEffect) => {
    setMarkers((m) => ({ ...m, [variable]: { ...m[variable], effect } }));
  };

  const activeCount = ALL_VARIABLES.filter(
    (v) => markers[v].entry !== null || markers[v].exit !== null
  ).length;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* ── Left: Video player ── */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={vid}
          src={videoUrl}
          className="w-full rounded-xl bg-black"
          onTimeUpdate={() => setCurrentTime(vid.current?.currentTime ?? 0)}
          onLoadedMetadata={() => setDuration(vid.current?.duration ?? 0)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />

        {/* Scrubber */}
        <div
          ref={scrubberRef}
          className="relative h-2 bg-gray-200 rounded-full cursor-pointer overflow-hidden"
          onClick={handleScrubberClick}
        >
          <div
            className="absolute inset-y-0 left-0 bg-gray-900 rounded-full"
            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {playing ? "⏸ Pause" : "▶ Play"}
          </button>
          <span className="text-xs text-gray-500 tabular-nums">
            {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Speed:</span>
            {[0.5, 1, 2].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
                  speed === s
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 text-gray-600 hover:border-gray-400"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
        <p className="text-[10px] text-gray-400">
          Space = play/pause · ← / → = ±0.5s · Shift+← / → = ±0.1s
        </p>
      </div>

      {/* ── Right: Variable markers ── */}
      <div className="w-full lg:w-72 shrink-0 space-y-3">
        <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
          Variable markers
        </p>

        <div className="space-y-2">
          {ALL_VARIABLES.map((v) => {
            const m = markers[v];
            const isActive = m.entry !== null || m.exit !== null;
            return (
              <div
                key={v}
                className={`rounded-xl border p-3 space-y-2 ${
                  isActive ? "border-gray-300 bg-white" : "border-gray-100 bg-gray-50/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-800">{v}</span>
                  {isActive && (
                    <button
                      type="button"
                      onClick={() => clearMarker(v)}
                      className="text-gray-400 hover:text-red-500 text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="flex gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => markEntry(v)}
                    className="rounded-md border border-gray-200 px-2 py-0.5 text-[10px] text-gray-600 hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
                  >
                    Mark entry
                  </button>
                  <button
                    type="button"
                    onClick={() => markExit(v)}
                    className="rounded-md border border-gray-200 px-2 py-0.5 text-[10px] text-gray-600 hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
                  >
                    Mark exit
                  </button>
                </div>

                {isActive && (
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                    {m.entry !== null && <span className="text-indigo-600">entry: {m.entry}s</span>}
                    {m.exit !== null && <span className="text-violet-600">exit: {m.exit}s</span>}
                  </div>
                )}

                {isActive && (
                  <select
                    value={m.effect}
                    onChange={(e) => setEffect(v, e.target.value as AnimationEffect)}
                    className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-gray-900"
                  >
                    {EFFECT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>

        {/* Global exit */}
        <div className="rounded-xl border border-gray-200 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-700">Global exit</p>
          <button
            type="button"
            onClick={() =>
              setExitMarker((e) => ({
                ...e,
                start: Math.round(currentTime * 10) / 10,
              }))
            }
            className="rounded-md border border-gray-200 px-2 py-0.5 text-[10px] text-gray-600 hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
          >
            Mark exit start
          </button>
          {exitMarker.start !== null && (
            <p className="text-[10px] text-indigo-600">start: {exitMarker.start}s</p>
          )}
          <select
            value={exitMarker.effect}
            onChange={(e) =>
              setExitMarker((ex) => ({ ...ex, effect: e.target.value as AnimationEffect }))
            }
            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-gray-900"
          >
            {EFFECT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Generate button */}
        <button
          type="button"
          onClick={onGenerate}
          disabled={activeCount === 0}
          className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          Generate template →
        </button>
        {activeCount === 0 && (
          <p className="text-[10px] text-gray-400 text-center">
            Mark at least one variable to generate.
          </p>
        )}
      </div>
    </div>
  );
}

// ── AiExtractStep ─────────────────────────────────────────────────────────────

function AiExtractStep({
  progress,
}: {
  progress: { current: number; total: number } | null;
}) {
  const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0;
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16">
      <div className="space-y-2 text-center">
        <p className="text-sm font-medium text-gray-900">Extracting frames…</p>
        {progress && (
          <p className="text-xs text-gray-500">
            {progress.current} / {progress.total} frames
          </p>
        )}
      </div>
      <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gray-900 rounded-full transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── AiAnalyzeStep ─────────────────────────────────────────────────────────────

function AiAnalyzeStep() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16">
      <div className="space-y-2 text-center">
        <p className="text-sm font-medium text-gray-900">Analysing with Claude…</p>
        <p className="text-xs text-gray-500">This may take up to 30 seconds.</p>
      </div>
    </div>
  );
}

// ── AiReviewStep ──────────────────────────────────────────────────────────────

function AiReviewStep({
  videoUrl,
  elements,
  setElements,
  globalExit,
  notes,
  onUseTemplate,
  onEditManually,
}: {
  videoUrl: string;
  elements: AiElement[];
  setElements: React.Dispatch<React.SetStateAction<AiElement[]>>;
  globalExit: { start_frame: number; effect: AnimationEffect; confidence: number } | null;
  notes: string;
  onUseTemplate: () => void;
  onEditManually: () => void;
}) {
  const toggleInclude = (slot: string) => {
    setElements((els) =>
      els.map((el) => (el.slot === slot ? { ...el, included: !el.included } : el))
    );
  };

  const includedCount = elements.filter((el) => el.included).length;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left: video preview */}
      <div className="flex-1 min-w-0">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={videoUrl}
          controls
          className="w-full rounded-xl bg-black"
        />
        {notes && (
          <p className="mt-2 text-xs text-gray-500 italic">{notes}</p>
        )}
      </div>

      {/* Right: detected elements */}
      <div className="w-full lg:w-80 shrink-0 space-y-3">
        <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
          Detected elements
        </p>

        <div className="space-y-2">
          {elements.map((el) => (
            <label
              key={el.slot}
              className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                el.included ? "border-gray-300 bg-white" : "border-gray-100 bg-gray-50/50"
              }`}
            >
              <input
                type="checkbox"
                checked={el.included}
                onChange={() => toggleInclude(el.slot)}
                className="mt-0.5 shrink-0"
              />
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-800">{el.slot}</span>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      el.confidence >= 0.8
                        ? "bg-green-100 text-green-700"
                        : el.confidence >= 0.5
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {Math.round(el.confidence * 100)}%
                  </span>
                </div>
                {el.text_content && (
                  <p className="text-[10px] text-gray-500 truncate">{el.text_content}</p>
                )}
                <p className="text-[10px] text-gray-400 font-mono">
                  {(el.entry_frame * FRAME_INTERVAL).toFixed(1)}s →{" "}
                  {(el.exit_frame * FRAME_INTERVAL).toFixed(1)}s · {el.entry_effect}
                </p>
              </div>
            </label>
          ))}
        </div>

        {globalExit && (
          <div className="rounded-xl border border-gray-200 p-3 space-y-1">
            <p className="text-xs font-semibold text-gray-700">Global exit</p>
            <p className="text-[10px] text-gray-500 font-mono">
              {(globalExit.start_frame * FRAME_INTERVAL).toFixed(1)}s · {globalExit.effect} ·{" "}
              {Math.round(globalExit.confidence * 100)}% confidence
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={onUseTemplate}
            disabled={includedCount === 0}
            className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            Use this template →
          </button>
          <button
            type="button"
            onClick={onEditManually}
            className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Edit manually
          </button>
        </div>
      </div>
    </div>
  );
}
