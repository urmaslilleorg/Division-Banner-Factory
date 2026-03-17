"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { VideoTemplate, AnimationEffect } from "./video-templates-manager";

// ── Format definitions ─────────────────────────────────────────────────────────

interface FormatSize {
  label: string;
  width: number;
  height: number;
  group: string;
}

const FORMAT_GROUPS: { group: string; formats: FormatSize[] }[] = [
  {
    group: "META",
    formats: [
      { label: "Meta Story", width: 1080, height: 1920, group: "META" },
      { label: "Meta Reels", width: 1080, height: 1920, group: "META" },
      { label: "Meta Feed Square", width: 1080, height: 1080, group: "META" },
      { label: "Meta Feed Portrait", width: 1080, height: 1350, group: "META" },
      { label: "Meta Feed Landscape", width: 1200, height: 628, group: "META" },
      { label: "Meta Carousel", width: 1080, height: 1080, group: "META" },
    ],
  },
  {
    group: "GOOGLE",
    formats: [
      { label: "Google Display Horizontal", width: 1200, height: 628, group: "GOOGLE" },
      { label: "Google Display Vertical", width: 960, height: 1200, group: "GOOGLE" },
      { label: "Google Display Square", width: 1200, height: 1200, group: "GOOGLE" },
      { label: "Google Bumper (16:9)", width: 1920, height: 1080, group: "GOOGLE" },
      { label: "Google Skyscraper", width: 300, height: 600, group: "GOOGLE" },
    ],
  },
  {
    group: "YOUTUBE",
    formats: [
      { label: "YouTube Pre-roll", width: 1920, height: 1080, group: "YOUTUBE" },
      { label: "YouTube Shorts", width: 1080, height: 1920, group: "YOUTUBE" },
      { label: "YouTube Square", width: 1080, height: 1080, group: "YOUTUBE" },
    ],
  },
];

const ALL_FORMATS: FormatSize[] = FORMAT_GROUPS.flatMap((g) => g.formats);
const DEFAULT_FORMAT = ALL_FORMATS.find((f) => f.label === "Meta Feed Square")!;

// ── Test data defaults ─────────────────────────────────────────────────────────

interface TestData {
  H1: string;
  H2: string;
  H3: string;
  CTA: string;
  Price_Tag: string;
  Illustration: string | null; // object URL or null
  Image: string | null;
}

const DEFAULT_TEST_DATA: TestData = {
  H1: "HEADLINE TEXT",
  H2: "Subheadline goes here",
  H3: "Body copy text",
  CTA: "Shop now",
  Price_Tag: "-30%",
  Illustration: null,
  Image: null,
};

// ── CSS keyframe generation ────────────────────────────────────────────────────

function effectKeyframes(name: string, effect: AnimationEffect): string {
  switch (effect) {
    case "fade_in":
      return `@keyframes ${name} { from { opacity: 0; } to { opacity: 1; } }`;
    case "fade_out":
      return `@keyframes ${name} { from { opacity: 1; } to { opacity: 0; } }`;
    case "slide_up":
      return `@keyframes ${name} { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }`;
    case "slide_down":
      return `@keyframes ${name} { from { opacity: 0; transform: translateY(-40px); } to { opacity: 1; transform: translateY(0); } }`;
    case "slide_left":
      return `@keyframes ${name} { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: translateX(0); } }`;
    case "slide_right":
      return `@keyframes ${name} { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }`;
    case "zoom_in":
      return `@keyframes ${name} { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }`;
    case "zoom_out":
      return `@keyframes ${name} { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.5); } }`;
    case "pop":
      return `@keyframes ${name} { 0% { opacity: 0; transform: scale(0.8); } 60% { transform: scale(1.1); } 100% { opacity: 1; transform: scale(1); } }`;
    case "pulse":
      return `@keyframes ${name} { 0%, 100% { opacity: 1; transform: scale(1); } 50% { transform: scale(1.05); } }`;
    default:
      return "";
  }
}

function buildStylesheet(tpl: VideoTemplate, generation: number): string {
  const lines: string[] = [];

  // Per-variable keyframes
  for (const a of tpl.animations) {
    if (a.effect === "none") continue;
    const kfName = `anim_${generation}_${a.variable}`;
    lines.push(effectKeyframes(kfName, a.effect));
  }

  // Global exit keyframe
  if (tpl.exit.effect !== "none") {
    const kfName = `anim_${generation}_exit`;
    lines.push(effectKeyframes(kfName, tpl.exit.effect));
  }

  return lines.join("\n");
}

// ── Canvas scaling ─────────────────────────────────────────────────────────────

function computeCanvasSize(
  fw: number,
  fh: number,
  maxW: number,
  maxH: number
): { w: number; h: number; scale: number } {
  const scaleW = maxW / fw;
  const scaleH = maxH / fh;
  const scale = Math.min(scaleW, scaleH, 1);
  return { w: Math.round(fw * scale), h: Math.round(fh * scale), scale };
}

// ── Aspect ratio layout ────────────────────────────────────────────────────────

type AspectLayout = "portrait" | "square" | "landscape";

function getLayout(fw: number, fh: number): AspectLayout {
  const ratio = fw / fh;
  if (ratio < 0.85) return "portrait";
  if (ratio > 1.15) return "landscape";
  return "square";
}

// ── Main component ─────────────────────────────────────────────────────────────

interface AnimationPreviewPanelProps {
  template: VideoTemplate;
}

export default function AnimationPreviewPanel({ template }: AnimationPreviewPanelProps) {
  // Format state
  const [format, setFormat] = useState<FormatSize>(DEFAULT_FORMAT);
  const [customW, setCustomW] = useState(300);
  const [customH, setCustomH] = useState(600);
  const [isCustom, setIsCustom] = useState(false);

  // Test data state
  const [testData, setTestData] = useState<TestData>(DEFAULT_TEST_DATA);
  const [testDataOpen, setTestDataOpen] = useState(false);

  // Playback state
  const [generation, setGeneration] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [loopPause, setLoopPause] = useState(false);

  // Panel ref for sizing
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(380);

  // RAF ref
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const pausedAtRef = useRef<number>(0);
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeFormat = isCustom ? { label: "Custom", width: customW, height: customH, group: "CUSTOM" } : format;
  const totalDuration = template.duration;

  // ── Observe panel width ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!panelRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 380;
      setPanelWidth(Math.max(w - 32, 120));
    });
    ro.observe(panelRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Canvas dimensions ────────────────────────────────────────────────────────

  const MAX_H = 460;
  const { w: canvasW, h: canvasH, scale: canvasScale } = computeCanvasSize(
    activeFormat.width,
    activeFormat.height,
    panelWidth,
    MAX_H
  );

  // ── RAF loop ─────────────────────────────────────────────────────────────────

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startRaf = useCallback(() => {
    stopRaf();
    const tick = (ts: number) => {
      if (startTimeRef.current === null) startTimeRef.current = ts - pausedAtRef.current * 1000;
      const el = Math.min((ts - startTimeRef.current) / 1000, totalDuration);
      setElapsed(el);
      if (el >= totalDuration) {
        setElapsed(totalDuration);
        stopRaf();
        setLoopPause(true);
        loopTimerRef.current = setTimeout(() => {
          setLoopPause(false);
          pausedAtRef.current = 0;
          startTimeRef.current = null;
          setGeneration((g) => g + 1);
          setElapsed(0);
        }, 1000);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopRaf, totalDuration]);

  // Start/stop RAF based on playing state
  useEffect(() => {
    if (playing && !loopPause) {
      startRaf();
    } else {
      stopRaf();
    }
    return stopRaf;
  }, [playing, loopPause, startRaf, stopRaf, generation]);

  // ── Playback handlers ────────────────────────────────────────────────────────

  const handlePlay = () => {
    setPlaying(true);
  };

  const handlePause = () => {
    setPlaying(false);
    pausedAtRef.current = elapsed;
    startTimeRef.current = null;
  };

  const handleRestart = useCallback(() => {
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    setLoopPause(false);
    pausedAtRef.current = 0;
    startTimeRef.current = null;
    setElapsed(0);
    setPlaying(true);
    setGeneration((g) => g + 1);
  }, []);

  // Auto-restart when template changes
  useEffect(() => {
    handleRestart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRaf();
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    };
  }, [stopRaf]);

  // ── Image upload handlers ────────────────────────────────────────────────────

  const handleImageUpload = (key: "Illustration" | "Image", file: File) => {
    if (file.size > 5 * 1024 * 1024) return;
    const url = URL.createObjectURL(file);
    setTestData((d) => ({ ...d, [key]: url }));
  };

  const handleImageRemove = (key: "Illustration" | "Image") => {
    setTestData((d) => {
      if (d[key]) URL.revokeObjectURL(d[key]!);
      return { ...d, [key]: null };
    });
  };

  // ── Stylesheet ───────────────────────────────────────────────────────────────

  const stylesheet = buildStylesheet(template, generation);

  // ── Layout ───────────────────────────────────────────────────────────────────

  const layout = getLayout(activeFormat.width, activeFormat.height);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div ref={panelRef} className="flex flex-col gap-4 min-w-0">
      {/* Injected keyframes */}
      <style>{stylesheet}</style>

      {/* Format selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
          Format size
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={isCustom ? "__custom__" : format.label}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                setIsCustom(true);
              } else {
                setIsCustom(false);
                const found = ALL_FORMATS.find((f) => f.label === e.target.value);
                if (found) setFormat(found);
              }
              handleRestart();
            }}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {FORMAT_GROUPS.map((g) => (
              <optgroup key={g.group} label={`── ${g.group} ──`}>
                {g.formats.map((f) => (
                  <option key={f.label} value={f.label}>
                    {f.label} ({f.width}×{f.height})
                  </option>
                ))}
              </optgroup>
            ))}
            <optgroup label="── CUSTOM ──">
              <option value="__custom__">Custom</option>
            </optgroup>
          </select>

          {!isCustom && (
            <span className="text-xs text-gray-400">
              {format.width} × {format.height}
            </span>
          )}

          {isCustom && (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={100}
                max={5200}
                value={customW}
                onChange={(e) => {
                  const v = Math.max(100, Math.min(5200, parseInt(e.target.value) || 100));
                  setCustomW(v);
                  handleRestart();
                }}
                className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
              <span className="text-xs text-gray-400">×</span>
              <input
                type="number"
                min={100}
                max={5200}
                value={customH}
                onChange={(e) => {
                  const v = Math.max(100, Math.min(5200, parseInt(e.target.value) || 100));
                  setCustomH(v);
                  handleRestart();
                }}
                className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
              <span className="text-xs text-gray-400">px</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleRestart}
            title="Fit to panel"
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
          >
            ⟳ Fit
          </button>
        </div>
      </div>

      {/* Preview canvas */}
      <div className="flex flex-col items-center gap-2">
        <AnimationCanvas
          key={generation}
          template={template}
          generation={generation}
          testData={testData}
          layout={layout}
          canvasW={canvasW}
          canvasH={canvasH}
          playing={playing}
        />
        <p className="text-[10px] text-gray-400">
          {activeFormat.width} × {activeFormat.height}
          {canvasScale < 0.99 && ` (scaled to ${canvasW} × ${canvasH})`}
        </p>
      </div>

      {/* Playback controls */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePlay}
            disabled={playing && !loopPause}
            title="Play"
            className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            ▶
          </button>
          <button
            type="button"
            onClick={handlePause}
            disabled={!playing || loopPause}
            title="Pause"
            className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            ⏸
          </button>
          <button
            type="button"
            onClick={handleRestart}
            title="Restart"
            className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ⟳
          </button>
          {loopPause && (
            <span className="text-xs text-gray-400 animate-pulse">↻</span>
          )}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <div className="relative flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-gray-900 rounded-full transition-none"
                style={{ width: `${totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-400 shrink-0 tabular-nums">
              {elapsed.toFixed(1)}s / {totalDuration.toFixed(1)}s
            </span>
          </div>
        </div>
      </div>

      {/* Test data section */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setTestDataOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-600 uppercase tracking-wide bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <span>Test data</span>
          <span className={`transition-transform ${testDataOpen ? "rotate-180" : ""}`}>▼</span>
        </button>
        {testDataOpen && (
          <div className="p-3 space-y-2 bg-white">
            {(["H1", "H2", "H3", "CTA", "Price_Tag"] as const).map((key) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-gray-500 w-16 shrink-0">{key}</span>
                <input
                  type="text"
                  value={testData[key]}
                  onChange={(e) => setTestData((d) => ({ ...d, [key]: e.target.value }))}
                  className="flex-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>
            ))}
            {(["Illustration", "Image"] as const).map((key) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-gray-500 w-16 shrink-0">{key}</span>
                <ImageDropZone
                  value={testData[key]}
                  onUpload={(f) => handleImageUpload(key, f)}
                  onRemove={() => handleImageRemove(key)}
                  shape={key === "Image" ? "circle" : "rect"}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ImageDropZone ─────────────────────────────────────────────────────────────

function ImageDropZone({
  value,
  onUpload,
  onRemove,
  shape,
}: {
  value: string | null;
  onUpload: (f: File) => void;
  onRemove: () => void;
  shape: "circle" | "rect";
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) onUpload(file);
  };

  return (
    <div className="relative flex items-center gap-2">
      <div
        className={`w-16 h-16 border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer hover:border-gray-400 transition-colors overflow-hidden ${
          shape === "circle" ? "rounded-full" : "rounded-xl"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[9px] text-gray-400 text-center px-1">Drop image</span>
        )}
      </div>
      {value && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gray-900 text-white text-[9px] flex items-center justify-center hover:bg-red-600 transition-colors"
        >
          ×
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ── AnimationCanvas ───────────────────────────────────────────────────────────

interface AnimationCanvasProps {
  template: VideoTemplate;
  generation: number;
  testData: TestData;
  layout: AspectLayout;
  canvasW: number;
  canvasH: number;
  playing: boolean;
}

function AnimationCanvas({
  template,
  generation,
  testData,
  layout,
  canvasW,
  canvasH,
  playing,
}: AnimationCanvasProps) {
  const animMap = Object.fromEntries(
    template.animations.map((a) => [a.variable, a])
  );

  function layerStyle(variable: string): React.CSSProperties {
    const a = animMap[variable];
    if (!a || a.effect === "none") {
      return { opacity: 1 };
    }
    const dur = Math.max(a.end - a.start, 0.1);
    const kfName = `anim_${generation}_${variable}`;
    return {
      opacity: 0,
      animation: `${kfName} ${dur}s ease forwards`,
      animationDelay: `${a.start}s`,
      animationPlayState: playing ? "running" : "paused",
    };
  }

  const exitDur = template.exit.duration;
  const exitStart = Math.max(template.duration - exitDur, 0);
  const exitKfName = `anim_${generation}_exit`;
  const canvasStyle: React.CSSProperties =
    template.exit.effect !== "none"
      ? {
          animation: `${exitKfName} ${exitDur}s ease forwards`,
          animationDelay: `${exitStart}s`,
          animationPlayState: playing ? "running" : "paused",
        }
      : {};

  // Layout-aware flex direction
  const isPortrait = layout === "portrait";
  const isLandscape = layout === "landscape";

  return (
    <div
      className="relative border border-gray-200 bg-white overflow-hidden select-none"
      style={{ width: canvasW, height: canvasH, ...canvasStyle }}
    >
      <div
        className={`absolute inset-0 flex gap-2 p-3 ${
          isPortrait
            ? "flex-col items-center"
            : isLandscape
            ? "flex-row items-start"
            : "flex-col items-center"
        }`}
      >
        {/* Text block */}
        <div
          className={`flex flex-col gap-1 ${
            isLandscape ? "flex-1 min-w-0" : "w-full"
          }`}
        >
          {/* H1 */}
          <div style={layerStyle("H1")}>
            <p
              className="font-bold text-gray-900 leading-tight truncate"
              style={{ fontSize: Math.max(canvasW * 0.055, 10) }}
            >
              {testData.H1}
            </p>
          </div>
          {/* H2 */}
          <div style={layerStyle("H2")}>
            <p
              className="text-gray-700 leading-tight truncate"
              style={{ fontSize: Math.max(canvasW * 0.04, 8) }}
            >
              {testData.H2}
            </p>
          </div>
          {/* H3 */}
          <div style={layerStyle("H3")}>
            <p
              className="text-gray-500 leading-tight truncate"
              style={{ fontSize: Math.max(canvasW * 0.032, 7) }}
            >
              {testData.H3}
            </p>
          </div>
          {/* CTA */}
          <div style={layerStyle("CTA")}>
            <span
              className="inline-block bg-gray-900 text-white font-bold rounded-full px-2 py-0.5 truncate"
              style={{ fontSize: Math.max(canvasW * 0.035, 7) }}
            >
              {testData.CTA}
            </span>
          </div>
          {/* Price_Tag */}
          <div style={layerStyle("Price_Tag")}>
            <p
              className="font-bold text-red-500 leading-tight"
              style={{ fontSize: Math.max(canvasW * 0.045, 8) }}
            >
              {testData.Price_Tag}
            </p>
          </div>
        </div>

        {/* Image block */}
        <div
          className={`flex gap-2 items-end ${
            isLandscape ? "flex-col justify-center" : "flex-row justify-center"
          }`}
        >
          {/* Illustration */}
          <div
            style={{
              ...layerStyle("Illustration"),
              width: Math.max(canvasW * 0.28, 30),
              height: Math.max(canvasW * 0.28, 30),
              flexShrink: 0,
            }}
          >
            {testData.Illustration ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={testData.Illustration}
                alt=""
                className="w-full h-full object-cover rounded-xl"
              />
            ) : (
              <div
                className="w-full h-full rounded-xl"
                style={{ background: "#E5E5E5" }}
              />
            )}
          </div>

          {/* Image */}
          <div
            style={{
              ...layerStyle("Image"),
              width: Math.max(canvasW * 0.24, 26),
              height: Math.max(canvasW * 0.24, 26),
              flexShrink: 0,
            }}
          >
            {testData.Image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={testData.Image}
                alt=""
                className="w-full h-full object-cover rounded-full"
              />
            ) : (
              <div
                className="w-full h-full rounded-full"
                style={{ background: "#E5E5E5" }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
