/**
 * Division Banner Factory — Figma Plugin UI
 *
 * Runs in the browser iframe inside Figma.
 * Fetches the sync payload from the platform API and sends it to code.ts.
 */

// ── Types (mirrored from the API response) ────────────────────────────────────

interface SlideCopyPayload {
  index: number;
  copy: Record<string, string>;
  activeVariables: string[];
}

interface FramePayload {
  recordId: string;
  name: string;
  figmaFrame: string;
  type: "Standard" | "Carousel";
  copy: Record<string, string>;
  activeVariables: string[];
  slides?: SlideCopyPayload[];
}

interface SyncPayload {
  fileKey: string;
  campaignId: string;
  campaignName: string;
  syncedAt: string;
  frameCount: number;
  frames: FramePayload[];
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const apiUrlInput = document.getElementById("apiUrl") as HTMLInputElement;
const campaignIdInput = document.getElementById("campaignId") as HTMLInputElement;
const btnFetch = document.getElementById("btnFetch") as HTMLButtonElement;
const btnApply = document.getElementById("btnApply") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const progressWrap = document.getElementById("progressWrap") as HTMLDivElement;
const progressBar = document.getElementById("progressBar") as HTMLDivElement;
const frameListEl = document.getElementById("frameList") as HTMLDivElement;

// ── State ─────────────────────────────────────────────────────────────────────

let currentPayload: SyncPayload | null = null;

// Restore saved values from plugin storage
const savedUrl = localStorage.getItem("dbf_apiUrl");
const savedId = localStorage.getItem("dbf_campaignId");
if (savedUrl) apiUrlInput.value = savedUrl;
if (savedId) campaignIdInput.value = savedId;

// ── Helpers ───────────────────────────────────────────────────────────────────

function showStatus(msg: string, type: "info" | "success" | "error" | "loading") {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
  statusEl.style.display = "block";
}

function hideStatus() {
  statusEl.style.display = "none";
}

function renderFrameList(frames: FramePayload[]) {
  frameListEl.innerHTML = frames
    .map(
      (f) => `
      <div class="frame-item">
        <span class="frame-name">${f.figmaFrame}</span>
        <span class="frame-type">${f.type}${f.slides ? ` · ${f.slides.length} slides` : ""}</span>
      </div>`
    )
    .join("");
  frameListEl.style.display = "block";
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

btnFetch.addEventListener("click", async () => {
  const baseUrl = apiUrlInput.value.trim().replace(/\/$/, "");
  const campaignId = campaignIdInput.value.trim();

  if (!baseUrl || !campaignId) {
    showStatus("Please enter both Platform URL and Campaign ID.", "error");
    return;
  }

  localStorage.setItem("dbf_apiUrl", baseUrl);
  localStorage.setItem("dbf_campaignId", campaignId);

  btnFetch.disabled = true;
  btnApply.disabled = true;
  currentPayload = null;
  frameListEl.style.display = "none";
  showStatus("Fetching frames from platform…", "loading");

  try {
    const url = `${baseUrl}/api/campaigns/${campaignId}/figma-sync`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data: SyncPayload = await res.json();
    currentPayload = data;
    showStatus(
      `✓ ${data.frameCount} frame${data.frameCount !== 1 ? "s" : ""} found for "${data.campaignName}"`,
      "success"
    );
    renderFrameList(data.frames);
    btnApply.disabled = false;
  } catch (err) {
    showStatus(`Fetch failed: ${String(err)}`, "error");
  } finally {
    btnFetch.disabled = false;
  }
});

// ── Apply ─────────────────────────────────────────────────────────────────────

btnApply.addEventListener("click", () => {
  if (!currentPayload) return;
  btnApply.disabled = true;
  btnFetch.disabled = true;
  progressWrap.style.display = "block";
  progressBar.style.width = "0%";
  showStatus("Applying copy to Figma frames…", "loading");

  parent.postMessage(
    {
      pluginMessage: {
        type: "APPLY_COPY",
        campaignName: currentPayload.campaignName,
        frames: currentPayload.frames,
      },
    },
    "*"
  );
});

// ── Messages from plugin code ─────────────────────────────────────────────────

window.onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  if (msg.type === "READY") {
    hideStatus();
  }

  if (msg.type === "PROGRESS") {
    const pct = Math.round((msg.current / msg.total) * 100);
    progressBar.style.width = `${pct}%`;
    showStatus(`Applying: ${msg.frameName} (${msg.current}/${msg.total})`, "loading");
  }

  if (msg.type === "DONE") {
    progressBar.style.width = "100%";
    const parts: string[] = [];
    if (msg.created > 0) parts.push(`${msg.created} created`);
    if (msg.updated > 0) parts.push(`${msg.updated} updated`);
    const errorSummary =
      msg.errors.length > 0 ? `  ⚠ ${msg.errors.length} error(s): ${msg.errors.join("; ")}` : "";
    showStatus(
      `✓ Done — ${parts.join(", ") || "0 frames"}.${errorSummary}`,
      msg.errors.length > 0 ? "error" : "success"
    );
    btnApply.disabled = false;
    btnFetch.disabled = false;
  }

  if (msg.type === "ERROR") {
    showStatus(`Error: ${msg.message}`, "error");
    btnApply.disabled = false;
    btnFetch.disabled = false;
  }
};
