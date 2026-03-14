/**
 * Division Banner Factory — Figma Plugin UI
 *
 * Runs in the browser iframe inside Figma.
 *
 * The user enters:
 *   1. Platform URL  — e.g. https://sydameapteek.menteproduction.com
 *   2. Campaign URL  — the full campaign URL (or just the slug after /campaigns/)
 *                      e.g. https://sydameapteek.menteproduction.com/campaigns/avene_sprin2026
 *                      or just: avene_sprin2026
 *
 * On Fetch:
 *   a) Extract the slug from the campaign URL (or use it as-is if it's already a slug/rec ID).
 *   b) Call GET /api/campaigns/lookup?slug=<slug> to resolve it to a rec... ID.
 *   c) Call GET /api/campaigns/<recordId>/figma-sync to get the full frame payload.
 *   d) Render the frame list and enable Apply.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface SlideCopyPayload {
  index: number;
  copy: Record<string, string>;
  activeVariables: string[];
}

interface FramePayload {
  recordId: string;
  name: string;
  figmaFrame: string;
  width: number;
  height: number;
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

interface LookupResponse {
  recordId: string;
  campaignName: string;
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const apiUrlInput = document.getElementById("apiUrl") as HTMLInputElement;
const campaignUrlInput = document.getElementById("campaignUrl") as HTMLInputElement;
const btnFetch = document.getElementById("btnFetch") as HTMLButtonElement;
const btnApply = document.getElementById("btnApply") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const progressWrap = document.getElementById("progressWrap") as HTMLDivElement;
const progressBar = document.getElementById("progressBar") as HTMLDivElement;
const frameListEl = document.getElementById("frameList") as HTMLDivElement;

// ── State ─────────────────────────────────────────────────────────────────────

let currentPayload: SyncPayload | null = null;

// Restore saved values
const savedUrl = localStorage.getItem("dbf_apiUrl");
const savedCampaignUrl = localStorage.getItem("dbf_campaignUrl");
if (savedUrl) apiUrlInput.value = savedUrl;
if (savedCampaignUrl) campaignUrlInput.value = savedCampaignUrl;

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

/**
 * Extract the campaign identifier from user input.
 *
 * Accepts:
 *   - Campaign name:  "Avene_Sprin2026"
 *   - Full URL:       "https://…/campaigns/avene_sprin2026?preview=true"
 *   - Record ID:      "recXeEZWcSvQZekf0"
 *
 * In all cases returns the bare slug/name/ID to pass to the lookup endpoint.
 */
function extractSlug(input: string): string {
  const trimmed = input.trim();
  // If it looks like a URL, extract the segment after /campaigns/
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const parts = url.pathname.split("/").filter(Boolean);
      const idx = parts.indexOf("campaigns");
      if (idx !== -1 && parts[idx + 1]) {
        return parts[idx + 1];
      }
    } catch {
      // fall through
    }
  }
  // Otherwise treat the whole input as the campaign name / slug / rec ID
  return trimmed;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

btnFetch.addEventListener("click", async () => {
  const baseUrl = apiUrlInput.value.trim().replace(/\/$/, "");
  const campaignInput = campaignUrlInput.value.trim();

  if (!baseUrl || !campaignInput) {
    showStatus("Please enter both Platform URL and Campaign URL.", "error");
    return;
  }

  localStorage.setItem("dbf_apiUrl", baseUrl);
  localStorage.setItem("dbf_campaignUrl", campaignInput);

  btnFetch.disabled = true;
  btnApply.disabled = true;
  currentPayload = null;
  frameListEl.style.display = "none";

  // Step 1: extract slug and resolve to record ID
  const slug = extractSlug(campaignInput);
  showStatus(`Looking up campaign "${slug}"…`, "loading");

  let recordId: string;
  try {
    const lookupUrl = `${baseUrl}/api/campaigns/lookup?slug=${encodeURIComponent(slug)}`;
    const lookupRes = await fetch(lookupUrl);
    if (!lookupRes.ok) {
      const err = await lookupRes.json().catch(() => ({ error: lookupRes.statusText }));
      throw new Error(err.error || `HTTP ${lookupRes.status}`);
    }
    const lookup: LookupResponse = await lookupRes.json();
    recordId = lookup.recordId;
    showStatus(`Found "${lookup.campaignName}" — fetching frames…`, "loading");
  } catch (err) {
    showStatus(`Campaign lookup failed: ${String(err)}`, "error");
    btnFetch.disabled = false;
    return;
  }

  // Step 2: fetch the sync payload
  try {
    const syncUrl = `${baseUrl}/api/campaigns/${recordId}/figma-sync`;
    const res = await fetch(syncUrl, { method: "GET" });
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
