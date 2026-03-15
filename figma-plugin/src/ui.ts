/**
 * Division Banner Factory — Figma Plugin UI
 *
 * IMPORT flow:
 *   1. On open → fetch client list from /api/clients/list
 *   2. Populate Client dropdown (auto-select if only 1)
 *   3. User selects client → fetch campaign list from /api/campaigns/list?client=<name>
 *   4. Build Month dropdown from campaigns' month values (most recent first)
 *   5. User selects month → filter Campaign dropdown
 *   6. User selects campaign → Fetch becomes active
 *   7. Click Fetch → GET /api/campaigns/<id>/figma-sync
 *   8. Plugin automatically runs CHECK_COPY_STATUS → shows per-frame status
 *   9. User clicks "Apply all" or "Apply updates only"
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
  figmaFiles?: FigmaFileEntry[];
}

interface FigmaFileEntry {
  key: string;
  name: string;
  owner: string;
  addedAt: string;
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

type FrameStatus = "UP_TO_DATE" | "UPDATED" | "NEW";

interface FrameStatusResult {
  name: string;
  status: FrameStatus;
  changedFields: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Root domain — client list is always fetched from here */
const ROOT_API = "https://sydameapteek.menteproduction.com";

// ── DOM refs ──────────────────────────────────────────────────────────────────

const clientSelect        = document.getElementById("clientSelect")        as HTMLSelectElement;
const monthSelect         = document.getElementById("monthSelect")         as HTMLSelectElement;
const campaignSelect      = document.getElementById("campaignSelect")      as HTMLSelectElement;
const btnFetch            = document.getElementById("btnFetch")            as HTMLButtonElement;
const statusEl            = document.getElementById("status")              as HTMLDivElement;
const progressWrap        = document.getElementById("progressWrap")        as HTMLDivElement;
const progressBar         = document.getElementById("progressBar")         as HTMLDivElement;
const frameListEl         = document.getElementById("frameList")           as HTMLDivElement;

// Copy status UI
const copyStatusListEl    = document.getElementById("copyStatusList")      as HTMLDivElement;
const copyStatusSummaryEl = document.getElementById("copyStatusSummary")   as HTMLDivElement;
const applyBtnRowEl       = document.getElementById("applyBtnRow")         as HTMLDivElement;
const btnApplyAll         = document.getElementById("btnApplyAll")         as HTMLButtonElement;
const btnApplyUpdates     = document.getElementById("btnApplyUpdates")     as HTMLButtonElement;

const btnExport           = document.getElementById("btnExport")           as HTMLButtonElement;
const exportStatusEl      = document.getElementById("exportStatus")        as HTMLDivElement;
const exportProgressWrap  = document.getElementById("exportProgressWrap")  as HTMLDivElement;
const exportProgressBar   = document.getElementById("exportProgressBar")   as HTMLDivElement;
const exportListEl        = document.getElementById("exportList")          as HTMLDivElement;

// ── State ─────────────────────────────────────────────────────────────────────

let clients: ClientItem[] = [];
let campaigns: CampaignItem[] = [];
let currentPayload: SyncPayload | null = null;
let currentStatusResults: FrameStatusResult[] = [];
let selectedFrameCount = 0;

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

// ── Copy status rendering ─────────────────────────────────────────────────────

function renderCopyStatus(results: FrameStatusResult[]) {
  currentStatusResults = results;

  const upToDate = results.filter((r) => r.status === "UP_TO_DATE").length;
  const updated  = results.filter((r) => r.status === "UPDATED").length;
  const isNew    = results.filter((r) => r.status === "NEW").length;

  // Render list
  copyStatusListEl.innerHTML = results
    .map((r) => {
      const icon =
        r.status === "UP_TO_DATE" ? "✅" :
        r.status === "UPDATED"    ? "🔄" : "🆕";
      const label =
        r.status === "UP_TO_DATE" ? "up to date" :
        r.status === "NEW"        ? "new" : "";
      const changedLine =
        r.status === "UPDATED" && r.changedFields.length > 0
          ? `<div class="copy-status-changed">${r.changedFields.join(", ")} updated</div>`
          : "";
      return `
        <div class="copy-status-item">
          <span class="copy-status-icon">${icon}</span>
          <div style="flex:1;min-width:0;">
            <div class="copy-status-name">${r.name}</div>
            ${changedLine}
          </div>
          ${label ? `<span class="copy-status-label">${label}</span>` : ""}
        </div>`;
    })
    .join("");
  copyStatusListEl.style.display = "block";

  // Summary line
  const parts: string[] = [];
  if (updated  > 0) parts.push(`🔄 ${updated} updated`);
  if (isNew    > 0) parts.push(`🆕 ${isNew} new`);
  if (upToDate > 0) parts.push(`✅ ${upToDate} up to date`);
  copyStatusSummaryEl.textContent = parts.join(" · ");
  copyStatusSummaryEl.style.display = "block";

  // Show apply buttons
  applyBtnRowEl.style.display = "flex";
  btnApplyAll.disabled = false;
  // "Apply updates only" is only useful if there are UPDATED or NEW frames
  btnApplyUpdates.disabled = (updated + isNew) === 0;
  if ((updated + isNew) === 0) {
    btnApplyUpdates.textContent = "Apply updates only";
  } else {
    btnApplyUpdates.textContent = `Apply updates only (${updated + isNew})`;
  }
}

function hideCopyStatus() {
  copyStatusListEl.style.display = "none";
  copyStatusSummaryEl.style.display = "none";
  applyBtnRowEl.style.display = "none";
  btnApplyAll.disabled = true;
  btnApplyUpdates.disabled = true;
  currentStatusResults = [];
}

// ── Month helpers ─────────────────────────────────────────────────────────────

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

function buildMonthDropdown() {
  const monthSet = new Set<string>();
  for (const c of campaigns) {
    if (c.month && c.month.trim()) monthSet.add(c.month.trim());
  }

  const sortedMonths = Array.from(monthSet).sort(
    (a, b) => monthSortKey(b) - monthSortKey(a)
  );

  monthSelect.innerHTML = "";

  const allOpt = document.createElement("option");
  allOpt.value = "__all__";
  allOpt.textContent = "All months";
  monthSelect.appendChild(allOpt);

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

  if (savedMonth && (savedMonth === "__all__" || monthSet.has(savedMonth))) {
    monthSelect.value = savedMonth;
  } else {
    monthSelect.value = "__all__";
  }

  populateCampaignDropdown(monthSelect.value);
}

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
  hideCopyStatus();
  hideStatus();
  updateExportButton();

  // Show registered Figma files (Task 7)
  renderFigmaFilesInfo(client);

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

// ── Task 7: Show registered Figma files info ──────────────────────────────────

function renderFigmaFilesInfo(client: ClientItem) {
  // Remove any existing info element
  const existing = document.getElementById("figmaFilesInfo");
  if (existing) existing.remove();

  if (!client.figmaFiles || client.figmaFiles.length === 0) return;

  const names = client.figmaFiles.map((f) => f.name || f.key).join(", ");
  const infoEl = document.createElement("div");
  infoEl.id = "figmaFilesInfo";
  infoEl.style.cssText = "margin-top:6px; font-size:10px; color:#888; padding:0 2px;";
  infoEl.textContent = `Registered files: ${names}`;

  // Insert after clientSelect's parent .field div
  const clientField = clientSelect.closest(".field");
  if (clientField && clientField.parentNode) {
    clientField.parentNode.insertBefore(infoEl, clientField.nextSibling);
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
    const existing = document.getElementById("figmaFilesInfo");
    if (existing) existing.remove();
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
  hideCopyStatus();
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
  hideCopyStatus();
  hideStatus();
  updateExportButton();
});

// ── Step 3: Fetch frames ──────────────────────────────────────────────────────

btnFetch.addEventListener("click", async () => {
  const campaignId = campaignSelect.value;
  if (!campaignId) return;

  btnFetch.disabled = true;
  hideCopyStatus();
  frameListEl.style.display = "none";
  currentPayload = null;
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
      `✓ ${data.frameCount} frame${data.frameCount !== 1 ? "s" : ""} fetched for "${data.campaignName}" — checking status…`,
      "info"
    );
    updateExportButton();

    // Automatically trigger copy status check
    parent.postMessage(
      {
        pluginMessage: {
          type: "CHECK_COPY_STATUS",
          campaignName: data.campaignName,
          frames: data.frames,
        },
      },
      "*"
    );
  } catch (err) {
    showStatus(`Fetch failed: ${String(err)}`, "error");
    btnFetch.disabled = false;
  }
  // Note: btnFetch re-enabled after COPY_STATUS arrives (or on error above)
});

// ── Step 4: Apply copy ────────────────────────────────────────────────────────

function triggerApply(updatesOnly: boolean) {
  if (!currentPayload) return;

  let framesToApply = currentPayload.frames;

  if (updatesOnly && currentStatusResults.length > 0) {
    // Filter to only frames/slides that are UPDATED or NEW
    const needsUpdate = new Set(
      currentStatusResults
        .filter((r) => r.status === "UPDATED" || r.status === "NEW")
        .map((r) => r.name)
    );

    framesToApply = currentPayload.frames
      .map((f) => {
        if (f.type === "Carousel" && f.slides) {
          // Filter slides
          const filteredSlides = f.slides.filter((s) => {
            const slideName = `${f.figmaFrame}_Slide_${s.index}`;
            return needsUpdate.has(slideName);
          });
          if (filteredSlides.length === 0) return null;
          return { ...f, slides: filteredSlides };
        } else {
          // Standard frame
          return needsUpdate.has(f.figmaFrame) ? f : null;
        }
      })
      .filter((f): f is FramePayload => f !== null);
  }

  if (framesToApply.length === 0) {
    showStatus("Nothing to apply — all frames are up to date.", "success");
    return;
  }

  btnApplyAll.disabled = true;
  btnApplyUpdates.disabled = true;
  btnFetch.disabled = true;
  progressWrap.style.display = "block";
  progressBar.style.width = "0%";
  showStatus(
    updatesOnly
      ? `Applying ${framesToApply.length} updated/new frame(s)…`
      : "Applying copy to all Figma frames…",
    "loading"
  );

  parent.postMessage(
    {
      pluginMessage: {
        type: "APPLY_COPY",
        campaignName: currentPayload.campaignName,
        frames: framesToApply,
      },
    },
    "*"
  );
}

btnApplyAll.addEventListener("click", () => triggerApply(false));
btnApplyUpdates.addEventListener("click", () => triggerApply(true));

// ── Step 5: Export to Mente ───────────────────────────────────────────────────

btnExport.addEventListener("click", () => {
  if (!currentPayload) return;

  exportFrames = [];
  exportDoneCount = 0;
  exportListEl.style.display = "none";
  exportListEl.innerHTML = "";
  exportProgressWrap.style.display = "block";
  exportProgressBar.style.width = "0%";
  showExportStatus("Exporting frames…", "loading");

  btnExport.disabled = true;
  btnFetch.disabled = true;
  btnApplyAll.disabled = true;
  btnApplyUpdates.disabled = true;

  parent.postMessage({ pluginMessage: { type: "EXPORT_TO_MENTE" } }, "*");
});

// ── Upload helper ─────────────────────────────────────────────────────────────

function findRecordId(frameName: string): string | null {
  if (!currentPayload) return null;

  const standard = currentPayload.frames.find((f) => f.figmaFrame === frameName);
  if (standard) return standard.recordId;

  const slideMatch = frameName.match(/^(.+)_Slide_(\d+)$/);
  if (slideMatch) {
    const parentName = slideMatch[1];
    const slideIndex = parseInt(slideMatch[2], 10);
    const parentFrame = currentPayload.frames.find(
      (f) => f.type === "Carousel" && f.figmaFrame === parentName
    );
    if (parentFrame && parentFrame.slides) {
      const slide = parentFrame.slides.find((s) => s.index === slideIndex);
      if (slide && slide.recordId) return slide.recordId;
      const byPosition = parentFrame.slides[slideIndex - 1];
      if (byPosition && byPosition.recordId) return byPosition.recordId;
    }
  }

  return null;
}

function getClientSubdomain(): string {
  const clientId = clientSelect.value;
  const client = clients.find((c) => c.id === clientId);
  return client?.subdomain ?? "sydameapteek";
}

async function uploadFrame(frameName: string, base64: string): Promise<void> {
  const idx = exportFrames.findIndex((f) => f.frameName === frameName);

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
    const uploadRes = await fetch(`${clientUrl}/api/banners/${recordId}/upload-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageData, fileName: `${frameName}.png` }),
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({ error: uploadRes.statusText }));
      throw new Error(err.error || `HTTP ${uploadRes.status}`);
    }

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

  if (msg.type === "COPY_STATUS") {
    const results = msg.frames as FrameStatusResult[];
    renderCopyStatus(results);
    hideStatus(); // clear the "checking status…" message
    btnFetch.disabled = false;
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
    btnApplyAll.disabled = false;
    btnApplyUpdates.disabled = (currentStatusResults.filter((r) => r.status !== "UP_TO_DATE").length) === 0;
    btnFetch.disabled = false;
  }

  if (msg.type === "ERROR") {
    showStatus(`Error: ${msg.message}`, "error");
    btnApplyAll.disabled = false;
    btnApplyUpdates.disabled = false;
    btnFetch.disabled = false;
  }

  // ── EXPORT messages ──────────────────────────────────────────────────────

  if (msg.type === "SELECTION_CHANGED") {
    selectedFrameCount = msg.count as number;
    updateExportButton();
  }

  if (msg.type === "EXPORT_PROGRESS") {
    exportTotal = msg.total as number;
    const pct = Math.round(((msg.current as number) / exportTotal) * 50);
    exportProgressBar.style.width = `${pct}%`;
    showExportStatus(`Exporting… ${msg.current}/${exportTotal}: ${msg.frameName}`, "loading");

    if ((msg.current as number) === 1) {
      exportFrames = [];
    }
    if (!exportFrames.find((f) => f.frameName === msg.frameName)) {
      exportFrames.push({ frameName: msg.frameName as string, status: "waiting" });
      renderExportList();
    }
  }

  if (msg.type === "FRAME_EXPORTED") {
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
    btnApplyAll.disabled = false;
    btnApplyUpdates.disabled = false;
    updateExportButton();
  }

  if (msg.type === "EXPORT_ERROR") {
    showExportStatus(`Export error: ${msg.message}`, "error");
    btnExport.disabled = false;
    btnFetch.disabled = false;
    btnApplyAll.disabled = false;
    btnApplyUpdates.disabled = false;
    updateExportButton();
  }
};
