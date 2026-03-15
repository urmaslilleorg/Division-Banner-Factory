/**
 * Division Banner Factory — Figma Plugin UI
 *
 * IMPORT flow:
 *   1. On open → fetch client list from /api/clients/list
 *   2. Populate Client dropdown (auto-select if only 1)
 *   3. User selects client → fetch campaign list from /api/campaigns/list?client=<name>
 *   4. Build Month dropdown from campaigns' month values (most recent first)
 *   5. User selects month → filter Campaign dropdown
 *   6. User selects campaign → Fetch frames becomes active
 *   7. Click Fetch → GET /api/campaigns/<id>/figma-sync
 *   8. Click Apply → sends APPLY_COPY to plugin main thread
 *
 * EXPORT flow:
 *   1. Fetch must have been run first (needs frame data for record ID matching)
 *   2. Button shows "Export all (N)" or "Export N selected" based on selection
 *   3. Click Export → sends EXPORT_TO_MENTE to main thread
 *   4. Main thread exports each frame as PNG, sends FRAME_EXPORTED per frame
 *   5. UI uploads each PNG to /api/banners/[id]/upload-image
 *   6. UI updates status to Client_Review via /api/banners/[id]/plugin-update
 *   7. Shows per-frame result: ✅ uploaded / ⚠ failed / ⏭ skipped (no match)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClientItem {
  id: string;
  name: string;
  subdomain: string;
}

interface CampaignItem {
  id: string;
  name: string;
  month: string;
  bannerCount: number;
  formatCount: number;
}

interface SlideCopyPayload {
  index: number;
  copy: Record<string, string>;
  activeVariables: string[];
  recordId?: string;
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

// ── Constants ─────────────────────────────────────────────────────────────────

/** Root domain — client list is always fetched from here */
const ROOT_API = "https://sydameapteek.menteproduction.com";

// ── DOM refs ──────────────────────────────────────────────────────────────────

const clientSelect        = document.getElementById("clientSelect")        as HTMLSelectElement;
const monthSelect         = document.getElementById("monthSelect")         as HTMLSelectElement;
const campaignSelect      = document.getElementById("campaignSelect")      as HTMLSelectElement;
const btnFetch            = document.getElementById("btnFetch")            as HTMLButtonElement;
const btnApply            = document.getElementById("btnApply")            as HTMLButtonElement;
const statusEl            = document.getElementById("status")              as HTMLDivElement;
const progressWrap        = document.getElementById("progressWrap")        as HTMLDivElement;
const progressBar         = document.getElementById("progressBar")         as HTMLDivElement;
const frameListEl         = document.getElementById("frameList")           as HTMLDivElement;

const btnExport           = document.getElementById("btnExport")           as HTMLButtonElement;
const exportStatusEl      = document.getElementById("exportStatus")        as HTMLDivElement;
const exportProgressWrap  = document.getElementById("exportProgressWrap")  as HTMLDivElement;
const exportProgressBar   = document.getElementById("exportProgressBar")   as HTMLDivElement;
const exportListEl        = document.getElementById("exportList")          as HTMLDivElement;

// ── State ─────────────────────────────────────────────────────────────────────

let clients: ClientItem[] = [];
let campaigns: CampaignItem[] = [];
let currentPayload: SyncPayload | null = null;
let selectedFrameCount = 0; // updated via SELECTION_CHANGED from main thread

// In-memory prefs (populated from figma.clientStorage via READY message)
let savedClientId: string | undefined;
let savedCampaignId: string | undefined;
let savedMonth: string | undefined;

// Export state
interface ExportFrameState {
  frameName: string;
  status: "waiting" | "uploading" | "done" | "failed" | "skipped";
  error?: string;
}
let exportFrames: ExportFrameState[] = [];
let exportTotal = 0;
let exportDoneCount = 0;

function savePrefs(clientId?: string, campaignId?: string, month?: string) {
  if (clientId !== undefined)   savedClientId   = clientId;
  if (campaignId !== undefined) savedCampaignId = campaignId;
  if (month !== undefined)      savedMonth      = month;
  parent.postMessage(
    { pluginMessage: { type: "SAVE_PREFS", clientId, campaignId, month } },
    "*"
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function showStatus(msg: string, type: "info" | "success" | "error" | "loading") {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
  statusEl.style.display = "block";
}

function hideStatus() { statusEl.style.display = "none"; }

function showExportStatus(msg: string, type: "info" | "success" | "error" | "loading") {
  exportStatusEl.textContent = msg;
  exportStatusEl.className = `status ${type}`;
  exportStatusEl.style.display = "block";
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

function renderExportList() {
  exportListEl.innerHTML = exportFrames
    .map((f) => {
      const icon =
        f.status === "done"      ? "✅" :
        f.status === "failed"    ? "⚠" :
        f.status === "skipped"   ? "⏭" :
        f.status === "uploading" ? "🔄" : "⏳";
      const stateLabel =
        f.status === "done"      ? "uploaded" :
        f.status === "failed"    ? `failed${f.error ? `: ${f.error.substring(0, 40)}` : ""}` :
        f.status === "skipped"   ? "skipped (no match)" :
        f.status === "uploading" ? "uploading…" : "waiting";
      return `
        <div class="export-item">
          <span class="export-icon">${icon}</span>
          <span class="export-name">${f.frameName}</span>
          <span class="export-state">${stateLabel}</span>
        </div>`;
    })
    .join("");
  exportListEl.style.display = "block";
}

function campaignLabel(c: CampaignItem): string {
  const parts: string[] = [];
  if (c.formatCount > 0) parts.push(`${c.formatCount} formats`);
  return parts.length > 0 ? `${c.name}  (${parts.join(" · ")})` : c.name;
}

function updateExportButton() {
  if (!currentPayload) {
    btnExport.disabled = true;
    btnExport.textContent = "Export all";
    return;
  }
  btnExport.disabled = false;
  if (selectedFrameCount > 0) {
    btnExport.textContent = `Export ${selectedFrameCount} selected`;
  } else {
    // Count all frames including carousel slides
    let total = 0;
    for (const f of currentPayload.frames) {
      if (f.type === "Carousel" && f.slides) {
        total += f.slides.length;
      } else {
        total += 1;
      }
    }
    btnExport.textContent = `Export all (${total})`;
  }
}

// ── Month helpers ─────────────────────────────────────────────────────────────

/**
 * Parse a month string like "March 2026" into a sortable number (YYYYMM).
 * Returns 0 for unrecognised strings.
 */
function monthSortKey(monthStr: string): number {
  const MONTHS: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4,
    may: 5, june: 6, july: 7, august: 8,
    september: 9, october: 10, november: 11, december: 12,
  };
  const parts = monthStr.trim().split(/\s+/);
  if (parts.length !== 2) return 0;
  const monthNum = MONTHS[parts[0].toLowerCase()];
  const year = parseInt(parts[1], 10);
  if (!monthNum || isNaN(year)) return 0;
  return year * 100 + monthNum;
}

/**
 * Build and populate the Month dropdown from the loaded campaigns list.
 * Restores saved month selection if available.
 */
function buildMonthDropdown() {
  // Collect unique, non-empty months
  const monthSet = new Set<string>();
  for (const c of campaigns) {
    if (c.month && c.month.trim()) monthSet.add(c.month.trim());
  }

  // Sort most recent first
  const sortedMonths = Array.from(monthSet).sort(
    (a, b) => monthSortKey(b) - monthSortKey(a)
  );

  monthSelect.innerHTML = "";

  // "All months" option
  const allOpt = document.createElement("option");
  allOpt.value = "__all__";
  allOpt.textContent = "All months";
  monthSelect.appendChild(allOpt);

  // Separator (disabled option)
  if (sortedMonths.length > 0) {
    const sep = document.createElement("option");
    sep.disabled = true;
    sep.textContent = "─────────────";
    monthSelect.appendChild(sep);
  }

  for (const m of sortedMonths) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    monthSelect.appendChild(opt);
  }

  monthSelect.disabled = false;

  // Restore saved month
  if (savedMonth && (savedMonth === "__all__" || monthSet.has(savedMonth))) {
    monthSelect.value = savedMonth;
  } else {
    monthSelect.value = "__all__";
  }

  // Populate campaign dropdown based on selected month
  populateCampaignDropdown(monthSelect.value);
}

/**
 * Populate the campaign dropdown filtered by the given month value.
 * Pass "__all__" to show all campaigns.
 */
function populateCampaignDropdown(monthValue: string) {
  const filtered =
    monthValue === "__all__"
      ? campaigns
      : campaigns.filter((c) => c.month === monthValue);

  campaignSelect.innerHTML = "";

  if (filtered.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No campaigns for this month";
    campaignSelect.appendChild(opt);
    campaignSelect.disabled = true;
    btnFetch.disabled = true;
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select campaign…";
  campaignSelect.appendChild(placeholder);

  for (const c of filtered) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = campaignLabel(c);
    campaignSelect.appendChild(opt);
  }

  campaignSelect.disabled = false;

  // Restore saved campaign if it's in the filtered list
  if (savedCampaignId && filtered.find((c) => c.id === savedCampaignId)) {
    campaignSelect.value = savedCampaignId;
    btnFetch.disabled = false;
  } else if (filtered.length === 1) {
    campaignSelect.value = filtered[0].id;
    btnFetch.disabled = false;
  } else {
    btnFetch.disabled = true;
  }
}

// ── Step 1: Load clients ──────────────────────────────────────────────────────

async function loadClients() {
  clientSelect.disabled = true;
  clientSelect.innerHTML = '<option value="">Loading clients…</option>';

  try {
    const res = await fetch(`${ROOT_API}/api/clients/list`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    clients = await res.json();

    if (clients.length === 0) {
      clientSelect.innerHTML = '<option value="">No active clients found</option>';
      return;
    }

    clientSelect.innerHTML = '<option value="">Select client…</option>';
    for (const c of clients) {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      clientSelect.appendChild(opt);
    }
    clientSelect.disabled = false;

    // Restore saved selection
    if (savedClientId && clients.find((c) => c.id === savedClientId)) {
      clientSelect.value = savedClientId;
      await loadCampaigns(savedClientId);
    } else if (clients.length === 1) {
      clientSelect.value = clients[0].id;
      await loadCampaigns(clients[0].id);
    }
  } catch (err) {
    clientSelect.innerHTML = `<option value="">Error loading clients</option>`;
    showStatus(`Failed to load clients: ${String(err)}`, "error");
  }
}

// ── Step 2: Load campaigns ────────────────────────────────────────────────────

async function loadCampaigns(clientId: string) {
  const client = clients.find((c) => c.id === clientId);
  if (!client) return;

  monthSelect.disabled = true;
  monthSelect.innerHTML = '<option value="">Loading…</option>';
  campaignSelect.disabled = true;
  campaignSelect.innerHTML = '<option value="">Loading campaigns…</option>';
  btnFetch.disabled = true;
  currentPayload = null;
  frameListEl.style.display = "none";
  hideStatus();
  updateExportButton();

  try {
    const url = `${ROOT_API}/api/campaigns/list?client=${encodeURIComponent(client.name)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    campaigns = await res.json();

    if (campaigns.length === 0) {
      monthSelect.innerHTML = '<option value="">No active campaigns</option>';
      campaignSelect.innerHTML = '<option value="">No active campaigns</option>';
      return;
    }

    buildMonthDropdown();
  } catch (err) {
    monthSelect.innerHTML = `<option value="">Error</option>`;
    campaignSelect.innerHTML = `<option value="">Error loading campaigns</option>`;
    showStatus(`Failed to load campaigns: ${String(err)}`, "error");
  }
}

// ── Event: client selection ───────────────────────────────────────────────────

clientSelect.addEventListener("change", async () => {
  const clientId = clientSelect.value;
  if (!clientId) {
    monthSelect.innerHTML = '<option value="">Select a client first</option>';
    monthSelect.disabled = true;
    campaignSelect.innerHTML = '<option value="">Select a client first</option>';
    campaignSelect.disabled = true;
    btnFetch.disabled = true;
    return;
  }
  savePrefs(clientId, "", "");
  savedCampaignId = undefined;
  savedMonth = undefined;
  await loadCampaigns(clientId);
});

// ── Event: month selection ────────────────────────────────────────────────────

monthSelect.addEventListener("change", () => {
  const monthValue = monthSelect.value;
  savePrefs(undefined, undefined, monthValue);
  savedCampaignId = undefined;
  currentPayload = null;
  btnApply.disabled = true;
  frameListEl.style.display = "none";
  hideStatus();
  updateExportButton();
  populateCampaignDropdown(monthValue);
});

// ── Event: campaign selection ─────────────────────────────────────────────────

campaignSelect.addEventListener("change", () => {
  const campaignId = campaignSelect.value;
  if (campaignId) {
    savePrefs(undefined, campaignId);
    btnFetch.disabled = false;
  } else {
    btnFetch.disabled = true;
  }
  currentPayload = null;
  btnApply.disabled = true;
  frameListEl.style.display = "none";
  hideStatus();
  updateExportButton();
});

// ── Step 3: Fetch frames ──────────────────────────────────────────────────────

btnFetch.addEventListener("click", async () => {
  const campaignId = campaignSelect.value;
  if (!campaignId) return;

  btnFetch.disabled = true;
  btnApply.disabled = true;
  currentPayload = null;
  frameListEl.style.display = "none";
  updateExportButton();

  const campaign = campaigns.find((c) => c.id === campaignId);
  showStatus(`Fetching frames for "${campaign?.name ?? campaignId}"…`, "loading");

  try {
    const url = `${ROOT_API}/api/campaigns/${campaignId}/figma-sync`;
    const res = await fetch(url);
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
    updateExportButton();
  } catch (err) {
    showStatus(`Fetch failed: ${String(err)}`, "error");
  } finally {
    btnFetch.disabled = false;
  }
});

// ── Step 4: Apply copy ────────────────────────────────────────────────────────

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

// ── Step 5: Export to Mente ───────────────────────────────────────────────────

btnExport.addEventListener("click", () => {
  if (!currentPayload) return;

  // Reset export state
  exportFrames = [];
  exportDoneCount = 0;
  exportListEl.style.display = "none";
  exportListEl.innerHTML = "";
  exportProgressWrap.style.display = "block";
  exportProgressBar.style.width = "0%";
  showExportStatus("Exporting frames…", "loading");

  btnExport.disabled = true;
  btnFetch.disabled = true;
  btnApply.disabled = true;

  parent.postMessage({ pluginMessage: { type: "EXPORT_TO_MENTE" } }, "*");
});

// ── Upload helper ─────────────────────────────────────────────────────────────

/**
 * Find the Airtable record ID for a given Figma frame name.
 * Handles both standard frames and carousel slides (_Slide_N suffix).
 */
function findRecordId(frameName: string): string | null {
  if (!currentPayload) return null;

  // Standard frame: exact match on figmaFrame
  const standard = currentPayload.frames.find((f) => f.figmaFrame === frameName);
  if (standard) return standard.recordId;

  // Carousel slide: ..._Slide_N
  const slideMatch = frameName.match(/^(.+)_Slide_(\d+)$/);
  if (slideMatch) {
    const parentName = slideMatch[1];
    const slideIndex = parseInt(slideMatch[2], 10); // 1-based
    const parent = currentPayload.frames.find(
      (f) => f.type === "Carousel" && f.figmaFrame === parentName
    );
    if (parent && parent.slides) {
      const slide = parent.slides.find((s) => s.index === slideIndex);
      if (slide && slide.recordId) return slide.recordId;
      // Fallback: use array position
      const byPosition = parent.slides[slideIndex - 1];
      if (byPosition && byPosition.recordId) return byPosition.recordId;
    }
  }

  return null;
}

/**
 * Get the client subdomain for the selected client.
 */
function getClientSubdomain(): string {
  const clientId = clientSelect.value;
  const client = clients.find((c) => c.id === clientId);
  return client?.subdomain ?? "sydameapteek";
}

async function uploadFrame(frameName: string, base64: string): Promise<void> {
  const idx = exportFrames.findIndex((f) => f.frameName === frameName);

  // Find record ID
  const recordId = findRecordId(frameName);
  if (!recordId) {
    if (idx >= 0) exportFrames[idx].status = "skipped";
    renderExportList();
    return;
  }

  if (idx >= 0) exportFrames[idx].status = "uploading";
  renderExportList();

  const subdomain = getClientSubdomain();
  const clientUrl = `https://${subdomain}.menteproduction.com`;
  const imageData = `data:image/png;base64,${base64}`;

  try {
    // 1. Upload image
    const uploadRes = await fetch(`${clientUrl}/api/banners/${recordId}/upload-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageData, fileName: `${frameName}.png` }),
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({ error: uploadRes.statusText }));
      throw new Error(err.error || `HTTP ${uploadRes.status}`);
    }

    // 2. Update status to Client_Review
    await fetch(`${clientUrl}/api/banners/${recordId}/plugin-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Client_Review" }),
    });

    if (idx >= 0) exportFrames[idx].status = "done";
  } catch (err) {
    if (idx >= 0) {
      exportFrames[idx].status = "failed";
      exportFrames[idx].error = String(err);
    }
  }

  renderExportList();
}

// ── Messages from plugin main thread ─────────────────────────────────────────

window.onmessage = async (event: MessageEvent) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  // ── IMPORT messages ──────────────────────────────────────────────────────

  if (msg.type === "READY") {
    if (msg.savedClientId)   savedClientId   = msg.savedClientId;
    if (msg.savedCampaignId) savedCampaignId = msg.savedCampaignId;
    if (msg.savedMonth)      savedMonth      = msg.savedMonth;
    hideStatus();
    loadClients();
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
      msg.errors.length > 0
        ? `\n⚠ ${msg.errors.length} error(s):\n${msg.errors.join("\n")}`
        : "";
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

  // ── EXPORT messages ──────────────────────────────────────────────────────

  if (msg.type === "SELECTION_CHANGED") {
    selectedFrameCount = msg.count as number;
    updateExportButton();
  }

  if (msg.type === "EXPORT_PROGRESS") {
    exportTotal = msg.total as number;
    const pct = Math.round(((msg.current as number) / exportTotal) * 50); // first 50% = export phase
    exportProgressBar.style.width = `${pct}%`;
    showExportStatus(`Exporting… ${msg.current}/${exportTotal}: ${msg.frameName}`, "loading");

    // Pre-populate export list with "waiting" entries on first progress message
    if ((msg.current as number) === 1) {
      exportFrames = [];
    }
    // Add this frame to the list if not already present
    if (!exportFrames.find((f) => f.frameName === msg.frameName)) {
      exportFrames.push({ frameName: msg.frameName as string, status: "waiting" });
      renderExportList();
    }
  }

  if (msg.type === "FRAME_EXPORTED") {
    // Upload the frame
    await uploadFrame(msg.frameName as string, msg.base64 as string);
    exportDoneCount++;
    const uploadPct = 50 + Math.round((exportDoneCount / exportTotal) * 50);
    exportProgressBar.style.width = `${uploadPct}%`;
  }

  if (msg.type === "FRAME_EXPORT_ERROR") {
    const idx = exportFrames.findIndex((f) => f.frameName === msg.frameName);
    if (idx >= 0) {
      exportFrames[idx].status = "failed";
      exportFrames[idx].error = msg.error as string;
    }
    exportDoneCount++;
    renderExportList();
  }

  if (msg.type === "EXPORT_DONE") {
    exportProgressBar.style.width = "100%";
    const done    = exportFrames.filter((f) => f.status === "done").length;
    const failed  = exportFrames.filter((f) => f.status === "failed").length;
    const skipped = exportFrames.filter((f) => f.status === "skipped").length;

    const parts: string[] = [];
    if (done    > 0) parts.push(`✅ ${done} exported`);
    if (skipped > 0) parts.push(`⏭ ${skipped} skipped`);
    if (failed  > 0) parts.push(`⚠ ${failed} failed`);

    showExportStatus(
      parts.join(" · ") || "Export complete",
      failed > 0 ? "error" : "success"
    );
    btnExport.disabled = false;
    btnFetch.disabled = false;
    btnApply.disabled = false;
    updateExportButton();
  }

  if (msg.type === "EXPORT_ERROR") {
    showExportStatus(`Export error: ${msg.message}`, "error");
    btnExport.disabled = false;
    btnFetch.disabled = false;
    btnApply.disabled = false;
    updateExportButton();
  }
};
