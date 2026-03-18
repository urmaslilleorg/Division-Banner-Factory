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
  const result = await nexdRequest<{
    assets: Record<
      string,
      {
        name: string;
        required: number;
        type: number;
        cta_enabled?: boolean;
        filename: string;
      }
    >;
  }>("GET", `/templates/${templateId}`);

  const assets = result.assets ?? {};
  return Object.entries(assets).map(([slotId, slot]) => ({
    slotId,
    name: slot.name,
    required: slot.required,
    type: slot.type,
    ctaEnabled: slot.cta_enabled ?? false,
    acceptedFilenames: slot.filename,
  }));
}

/**
 * Returns the primary media slot for a template.
 * Primary = type 0 (media), required 1 (mandatory).
 */
export async function getPrimarySlot(templateId: string): Promise<NexdTemplateSlot> {
  const slots = await getTemplateSlots(templateId);
  const primary = slots.find((s) => s.type === 0 && s.required === 1);
  if (!primary) {
    throw new Error(`No primary media slot found for template ${templateId}`);
  }
  return primary;
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
 * Fallback for when the image URL lacks a file extension.
 */
export async function uploadAssetBase64(
  creativeId: string,
  slotId: string,
  filename: string,
  base64Data: string
): Promise<NexdAsset> {
  const result = await nexdRequest<NexdAsset>(
    "POST",
    `/creatives/${creativeId}/assets/${slotId}`,
    { filename, data: base64Data }
  );

  return result;
}

/**
 * Smart upload: tries URL upload first, falls back to downloading and
 * re-uploading as base64 if the URL lacks a file extension.
 */
export async function smartUploadAsset(
  creativeId: string,
  slotId: string,
  imageUrl: string
): Promise<NexdAsset> {
  // Extract filename from URL
  const urlPath = new URL(imageUrl).pathname;
  const rawFilename = urlPath.split("/").pop() ?? "bg.jpg";
  const ext = rawFilename.split(".").pop()?.toLowerCase();
  const supportedExts = ["jpg", "jpeg", "png", "gif", "mp4", "svg", "webp"];

  if (ext && supportedExts.includes(ext)) {
    // URL has a valid extension — use URL upload
    return uploadAssetToSlot(creativeId, slotId, rawFilename, imageUrl);
  }

  // No extension — download and re-upload as base64
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to download image from ${imageUrl}: HTTP ${imgRes.status}`);
  }
  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  const extFromMime = contentType.includes("png") ? "png" : "jpg";
  const filename = `bg.${extFromMime}`;
  const buffer = await imgRes.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  return uploadAssetBase64(creativeId, slotId, filename, base64);
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
  const result = await nexdRequest<
    Array<{
      layout_id: string;
      name: string;
      placement_type: string;
      engine: string;
      device?: number;
      is_video?: boolean;
      preview_url?: string;
    }>
  >("GET", "/templates/list");

  if (!Array.isArray(result)) return [];

  return result.map((t) => ({
    id: t.layout_id,
    name: t.name,
    placementType: t.placement_type,
    engine: t.engine,
    device: t.device ?? 0,
    isVideo: t.is_video ?? false,
    previewUrl: t.preview_url,
  }));
}
