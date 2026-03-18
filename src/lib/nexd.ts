/**
 * Nexd API client — server-side only.
 * Never import this file in browser/client components.
 *
 * Key findings from Phase N1/N2 research:
 * - Base URL: https://api.nexd.com
 * - Create endpoints: /v2/ namespace
 * - Upload/embed/delete: root / namespace
 * - Auth: Bearer token (NEXD_API_KEY env var)
 * - Asset upload: POST /creatives/{id}/assets/{slotId} with { filename, url }
 *   The URL must contain a recognizable file extension (.jpg, .png, etc.)
 *   Nexd fetches the image from the URL server-side.
 * - Still/In-Feed template ID: qsfpBY
 * - Primary media slot ID: YGvTp3Q4hpNx ("Main media", type=0, required=1)
 */

const NEXD_BASE = "https://api.nexd.com";

function getApiKey(): string {
  const key = process.env.NEXD_API_KEY;
  if (!key) throw new Error("NEXD_API_KEY environment variable is not set");
  return key;
}

// ─── Base request helper ──────────────────────────────────────────────────────

export async function nexdRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const apiKey = getApiKey();
  const url = `${NEXD_BASE}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  let data: { result?: T; error?: boolean; msg?: string } & Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Nexd API returned non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok || data.error) {
    throw new Error(`Nexd API error (${res.status}): ${data.msg ?? JSON.stringify(data).slice(0, 200)}`);
  }

  // Some endpoints return the payload directly (not wrapped in result)
  return (data.result ?? data) as T;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NexdCampaign {
  campaignId: string;
  previewUrl: string;
}

export interface NexdCreative {
  creativeId: string;
  assets: Record<string, NexdAsset>;
  settings: Record<string, unknown>;
}

export interface NexdAsset {
  asset_id: string;
  uri: string;
  width: number | null;
  height: number | null;
  filename: string;
}

export interface NexdTemplateSlot {
  slotId: string;
  name: string;
  required: number; // 1 = required, 2 = optional overlay, 0 = optional
  type: number;     // 0 = media, 2 = overlay, 9 = splash
  ctaEnabled: boolean;
  acceptedFilenames: string;
}

export interface NexdEmbedResult {
  tag: string | null;
  liveTag: string | null;
  splashes: Record<string, string>;
  packIsReady: boolean;
}

// ─── Campaign ─────────────────────────────────────────────────────────────────

export async function createNexdCampaign(name: string): Promise<NexdCampaign> {
  const result = await nexdRequest<{
    campaign_id: string;
    preview_url: string;
  }>("POST", "/v2/campaigns", { name });

  return {
    campaignId: result.campaign_id,
    previewUrl: result.preview_url,
  };
}

export async function deleteNexdCampaign(campaignId: string): Promise<void> {
  await nexdRequest("DELETE", `/campaigns/${campaignId}`);
}

// ─── Creative ─────────────────────────────────────────────────────────────────

export async function createNexdCreative(
  campaignId: string,
  name: string,
  templateId: string,
  width: number,
  height: number
): Promise<NexdCreative> {
  const result = await nexdRequest<{
    creative_id: string;
    assets: Record<string, NexdAsset>;
    settings: Record<string, unknown>;
  }>("POST", `/v2/campaigns/${campaignId}/creatives`, {
    name,
    layout_id: templateId,
    width,
    height,
  });

  return {
    creativeId: result.creative_id,
    assets: result.assets ?? {},
    settings: result.settings ?? {},
  };
}

export async function deleteNexdCreative(creativeId: string): Promise<void> {
  await nexdRequest("DELETE", `/creatives/${creativeId}`);
}

export async function publishCreative(creativeId: string): Promise<unknown> {
  return nexdRequest("POST", `/creatives/${creativeId}/publish`);
}

// ─── Template slots ───────────────────────────────────────────────────────────

export async function getTemplateSlots(templateId: string): Promise<NexdTemplateSlot[]> {
  // The API may return { assets: {...} } directly or wrapped in result
  const result = await nexdRequest<Record<string, unknown>>("GET", `/templates/${templateId}`);

  // Handle both: { assets: {...} } and the raw assets object keyed by slotId
  type SlotShape = { name: string; required: number; type: number; cta_enabled?: boolean; filename: string };
  let assetsObj: Record<string, SlotShape>;

  if (result && typeof result === "object" && "assets" in result && result.assets && typeof result.assets === "object") {
    assetsObj = result.assets as Record<string, SlotShape>;
  } else {
    // Treat the result itself as the assets map
    assetsObj = result as Record<string, SlotShape>;
  }

  return Object.entries(assetsObj).map(([slotId, slot]) => ({
    slotId,
    name: slot.name ?? slotId,
    required: slot.required ?? 0,
    type: slot.type ?? 0,
    ctaEnabled: slot.cta_enabled ?? false,
    acceptedFilenames: slot.filename ?? "",
  }));
}

/**
 * Returns the primary media slot for a template.
 * Priority: type=0 & required=1 → type=0 → first slot.
 */
export async function getPrimarySlot(templateId: string): Promise<NexdTemplateSlot> {
  const slots = await getTemplateSlots(templateId);
  if (slots.length === 0) {
    throw new Error(`No asset slots found for template ${templateId}`);
  }
  // 1. Ideal: main media slot (type=0, required=1)
  const primary = slots.find((s) => s.type === 0 && s.required === 1);
  if (primary) return primary;
  // 2. Any media slot (type=0)
  const anyMedia = slots.find((s) => s.type === 0);
  if (anyMedia) return anyMedia;
  // 3. First slot regardless of type
  return slots[0];
}

// ─── Asset upload ─────────────────────────────────────────────────────────────

/**
 * Upload an asset to a creative slot using a public URL.
 *
 * IMPORTANT: The URL must contain a recognizable file extension in the path
 * (.jpg, .png, .mp4, etc.). Nexd fetches the image server-side.
 * If the URL lacks an extension, use uploadAssetBase64 instead.
 */
export async function uploadAssetToSlot(
  creativeId: string,
  slotId: string,
  filename: string,
  imageUrl: string
): Promise<NexdAsset> {
  // Ensure filename has extension — Nexd uses it for MIME detection
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext || !["jpg", "jpeg", "png", "gif", "mp4", "svg", "webp"].includes(ext)) {
    throw new Error(`Unsupported file extension: ${filename}. Use jpg, png, gif, mp4, svg, or webp.`);
  }

  const result = await nexdRequest<NexdAsset>(
    "POST",
    `/creatives/${creativeId}/assets/${slotId}`,
    { filename, url: imageUrl }
  );

  return result;
}

/**
 * Upload an asset to a creative slot using base64-encoded data.
 * Nexd requires the full data URL format: "data:image/png;base64,XXXXX"
 */
export async function uploadAssetBase64(
  creativeId: string,
  slotId: string,
  filename: string,
  base64Data: string,
  mimeType = "image/jpeg"
): Promise<NexdAsset> {
  // Ensure the data URL prefix is present — Nexd requires "data:<mime>;base64,<data>"
  const dataUrl = base64Data.startsWith("data:")
    ? base64Data
    : `data:${mimeType};base64,${base64Data}`;

  const result = await nexdRequest<NexdAsset>(
    "POST",
    `/creatives/${creativeId}/assets/${slotId}`,
    { filename, data: dataUrl }
  );

  return result;
}

/**
 * Smart upload: downloads the image and uploads as base64 data URL.
 * Always uses the base64 path because Airtable attachment URLs lack
 * file extensions and Nexd requires the data URL format anyway.
 */
export async function smartUploadAsset(
  creativeId: string,
  slotId: string,
  imageUrl: string
): Promise<NexdAsset> {
  const { asset } = await smartUploadAssetDebug(creativeId, slotId, imageUrl);
  return asset;
}

export interface UploadDebugInfo {
  uploadUrl: string;
  uploadStatus: number;
  uploadResponseRaw: string;
  uploadResponseParsed: unknown;
  slotId: string;
  creativeId: string;
  filename: string;
  dataUrlPrefix: string; // first 80 chars of the data URL sent
}

/**
 * Debug variant of smartUploadAsset — returns the full upload debug info
 * so the sync route can include it in the response JSON.
 */
export async function smartUploadAssetDebug(
  creativeId: string,
  slotId: string,
  imageUrl: string
): Promise<{ asset: NexdAsset; debug: UploadDebugInfo }> {
  // Download the image
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to download image from ${imageUrl}: HTTP ${imgRes.status}`);
  }

  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  let ext = "jpg";
  if (contentType.includes("png")) ext = "png";
  else if (contentType.includes("gif")) ext = "gif";
  else if (contentType.includes("webp")) ext = "webp";
  else if (contentType.includes("svg")) ext = "svg";

  const filename = `creative_asset.${ext}`;
  const buffer = await imgRes.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const mimeType = contentType.split(";")[0];
  const dataUrl = `data:${mimeType};base64,${base64}`;

  // Build the exact URL that will be called
  const uploadPath = `/creatives/${creativeId}/assets/${slotId}`;
  const uploadUrl = `${NEXD_BASE}${uploadPath}`;

  // Make the raw fetch so we can capture status + full response
  const apiKey = getApiKey();
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filename, data: dataUrl }),
  });

  const rawText = await uploadRes.text();
  let parsed: unknown;
  try { parsed = JSON.parse(rawText); } catch { parsed = rawText; }

  const debugInfo: UploadDebugInfo = {
    uploadUrl,
    uploadStatus: uploadRes.status,
    uploadResponseRaw: rawText.slice(0, 1000),
    uploadResponseParsed: parsed,
    slotId,
    creativeId,
    filename,
    dataUrlPrefix: dataUrl.slice(0, 80),
  };

  if (!uploadRes.ok) {
    const errData = parsed as Record<string, unknown>;
    throw Object.assign(
      new Error(`Nexd upload error (${uploadRes.status}): ${(errData as {msg?: string}).msg ?? rawText.slice(0, 200)}`),
      { uploadDebug: debugInfo }
    );
  }

  const data = parsed as { result?: NexdAsset; error?: boolean } & Record<string, unknown>;
  if (data.error) {
    throw Object.assign(
      new Error(`Nexd upload error: ${(data as {msg?: string}).msg ?? rawText.slice(0, 200)}`),
      { uploadDebug: debugInfo }
    );
  }

  const asset = (data.result ?? data) as NexdAsset;
  return { asset, debug: debugInfo };
}

// ─── Embed tag ────────────────────────────────────────────────────────────────

export async function getEmbedTag(creativeId: string): Promise<NexdEmbedResult> {
  const result = await nexdRequest<{
    tag: string | null;
    live_tag: string | null;
    splashes: Record<string, string>;
    pack_is_ready: boolean;
  }>("GET", `/creatives/embedded?creative_id=${creativeId}`);

  return {
    tag: result.tag,
    liveTag: result.live_tag,
    splashes: result.splashes ?? {},
    packIsReady: result.pack_is_ready,
  };
}

// ─── Template list ────────────────────────────────────────────────────────────

export interface NexdTemplate {
  id: string;
  name: string;
  placementType: string; // "Infeed" | "Interstitial" | "Responsive" | "Skin"
  engine: string;        // base engine name e.g. "still", "cube", "carousel"
  device: number;        // 0=all, 1=mobile, 2=desktop, 3=responsive
  isVideo: boolean;
  previewUrl?: string;
}

export async function listNexdTemplates(): Promise<NexdTemplate[]> {
  // Nexd /templates/list response: { result: { items: [...] }, success, meta }
  // Each item has: layout_id, name, type_string (placement), template_base (engine),
  // device, is_video, demo_creatives[0].preview_url
  const data = await nexdRequest<{
    items?: Array<{
      layout_id: string;
      name: string;
      type_string?: string;      // "Infeed", "Interstitial", "Responsive", "Skin"
      template_base?: string;    // "still", "cube", "carousel", etc.
      device?: number;           // 0=all, 1=mobile, 2=desktop
      is_video?: boolean;
      demo_creatives?: Array<{ preview_url?: string }>;
    }>;
  }>("GET", "/templates/list");

  const items = Array.isArray(data) ? data : (data?.items ?? []);
  if (items.length === 0) return [];

  return items.map((t) => ({
    id: t.layout_id,
    name: t.name,
    placementType: t.type_string ?? "Other",
    engine: t.template_base ?? "unknown",
    device: t.device ?? 0,
    isVideo: t.is_video ?? false,
    previewUrl: t.demo_creatives?.[0]?.preview_url,
  }));
}
