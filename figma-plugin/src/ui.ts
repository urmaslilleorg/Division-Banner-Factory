/**
 * Division Banner Factory — Figma Plugin UI
 *
 * Flow:
 *   1. On open → fetch client list from /api/clients/list
 *   2. Populate Client dropdown (auto-select if only 1)
 *   3. User selects client → fetch campaign list from /api/campaigns/list?client=<name>
 *   4. Populate Campaign dropdown (auto-select if only 1)
 *      Show: "Campaign Name (N formats · Month)"
 *   5. User selects campaign → Fetch frames becomes active
 *   6. Click Fetch → GET /api/campaigns/<id>/figma-sync
 *   7. Click Apply → sends APPLY_COPY to plugin main thread
 *
 * Last selections are saved to localStorage and restored on next open.
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

const clientSelect   = document.getElementById("clientSelect")   as HTMLSelectElement;
const campaignSelect = document.getElementById("campaignSelect") as HTMLSelectElement;
const btnFetch       = document.getElementById("btnFetch")       as HTMLButtonElement;
const btnApply       = document.getElementById("btnApply")       as HTMLButtonElement;
const statusEl       = document.getElementById("status")         as HTMLDivElement;
const progressWrap   = document.getElementById("progressWrap")   as HTMLDivElement;
const progressBar    = document.getElementById("progressBar")    as HTMLDivElement;
const frameListEl    = document.getElementById("frameList")      as HTMLDivElement;

// ── State ─────────────────────────────────────────────────────────────────────

let clients: ClientItem[] = [];
let campaigns: CampaignItem[] = [];
let currentPayload: SyncPayload | null = null;

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

function campaignLabel(c: CampaignItem): string {
  const parts: string[] = [];
  if (c.formatCount > 0) parts.push(`${c.formatCount} formats`);
  if (c.month) parts.push(c.month);
  return parts.length > 0 ? `${c.name}  (${parts.join(" · ")})` : c.name;
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
    const savedClientId = localStorage.getItem("dbf_clientId");
    if (savedClientId && clients.find((c) => c.id === savedClientId)) {
      clientSelect.value = savedClientId;
      await loadCampaigns(savedClientId);
    } else if (clients.length === 1) {
      // Auto-select single client
      clientSelect.value = clients[0].id;
      await loadCampaigns(clients[0].id);
    }
  } catch (err) {
    clientSelect.innerHTML = `<option value="">Error loading clients</option>`;
    showStatus(`Failed to load clients: ${String(err)}`, "error");
  }
}

// ── Step 2: Load campaigns for selected client ────────────────────────────────

async function loadCampaigns(clientId: string) {
  const client = clients.find((c) => c.id === clientId);
  if (!client) return;

  campaignSelect.disabled = true;
  campaignSelect.innerHTML = '<option value="">Loading campaigns…</option>';
  btnFetch.disabled = true;
  currentPayload = null;
  frameListEl.style.display = "none";
  hideStatus();

  try {
    const url = `${ROOT_API}/api/campaigns/list?client=${encodeURIComponent(client.name)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    campaigns = await res.json();

    if (campaigns.length === 0) {
      campaignSelect.innerHTML = '<option value="">No active campaigns</option>';
      return;
    }

    campaignSelect.innerHTML = '<option value="">Select campaign…</option>';
    for (const c of campaigns) {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = campaignLabel(c);
      campaignSelect.appendChild(opt);
    }
    campaignSelect.disabled = false;

    // Restore saved campaign selection (only if it belongs to this client)
    const savedCampaignId = localStorage.getItem("dbf_campaignId");
    if (savedCampaignId && campaigns.find((c) => c.id === savedCampaignId)) {
      campaignSelect.value = savedCampaignId;
      btnFetch.disabled = false;
    } else if (campaigns.length === 1) {
      // Auto-select single campaign
      campaignSelect.value = campaigns[0].id;
      btnFetch.disabled = false;
    }
  } catch (err) {
    campaignSelect.innerHTML = `<option value="">Error loading campaigns</option>`;
    showStatus(`Failed to load campaigns: ${String(err)}`, "error");
  }
}

// ── Event: client selection changes ──────────────────────────────────────────

clientSelect.addEventListener("change", async () => {
  const clientId = clientSelect.value;
  if (!clientId) {
    campaignSelect.innerHTML = '<option value="">Select a client first</option>';
    campaignSelect.disabled = true;
    btnFetch.disabled = true;
    return;
  }
  localStorage.setItem("dbf_clientId", clientId);
  localStorage.removeItem("dbf_campaignId"); // reset campaign when client changes
  await loadCampaigns(clientId);
});

// ── Event: campaign selection changes ────────────────────────────────────────

campaignSelect.addEventListener("change", () => {
  const campaignId = campaignSelect.value;
  if (campaignId) {
    localStorage.setItem("dbf_campaignId", campaignId);
    btnFetch.disabled = false;
  } else {
    btnFetch.disabled = true;
  }
  // Reset payload when campaign changes
  currentPayload = null;
  btnApply.disabled = true;
  frameListEl.style.display = "none";
  hideStatus();
});

// ── Step 3: Fetch frames ──────────────────────────────────────────────────────

btnFetch.addEventListener("click", async () => {
  const campaignId = campaignSelect.value;
  if (!campaignId) return;

  btnFetch.disabled = true;
  btnApply.disabled = true;
  currentPayload = null;
  frameListEl.style.display = "none";

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

// ── Messages from plugin main thread ─────────────────────────────────────────

window.onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  if (msg.type === "READY") {
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
};
