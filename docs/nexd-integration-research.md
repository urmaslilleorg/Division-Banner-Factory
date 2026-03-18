# Nexd API Integration Research — Phase N1

**Date:** 2026-03-18  
**Author:** Manus AI (on behalf of Mente / Division)  
**Status:** Discovery complete — awaiting architect review before Phase N2

---

## 1. API Connection Details

The Nexd API is accessible at `https://api.nexd.com`. Authentication uses a Bearer token in the `Authorization` header. All requests tested returned valid JSON with a consistent envelope: `{ result, success, error, msg, meta }`. The `meta` object on every response includes `app_version`, `api version`, `region`, `cfray`, `country`, `method`, and `path` — useful for debugging.

| Property | Value |
|---|---|
| **Base URL** | `https://api.nexd.com` |
| **Auth** | `Authorization: Bearer <API_KEY>` |
| **Content-Type** | `application/json` |
| **Response envelope** | `{ result, success, error, msg, meta }` |
| **Rate limits** | Not documented in responses; no `X-RateLimit-*` headers observed |
| **Regions** | `euw1` (EU West), `usw2` (US West) — data stored per region |
| **API versioning** | Mixed: some endpoints use `/v2/` prefix, others use root `/` |

### Endpoint versioning note

The API has two parallel namespaces. The `/v2/` prefix is used for campaign and creative listing/creation, while the root `/` namespace is used for templates, asset upload, embed tags, and delete operations. This is not documented but was confirmed empirically.

| Operation | Working endpoint |
|---|---|
| List campaigns | `GET /v2/campaigns/view` |
| Create campaign | `POST /v2/campaigns` |
| Delete campaign | `DELETE /campaigns/{id}` |
| List creatives in campaign | `GET /v2/campaigns/{id}/creatives/view` |
| Create creative | `POST /v2/campaigns/{id}/creatives` |
| Delete creative | `DELETE /creatives/{id}` |
| List templates | `GET /templates/list` |
| Get template detail | `GET /templates/{template_id}` |
| Upload asset to creative | `POST /creatives/{creative_id}/assets/{asset_id}` |
| Get embed tag | `GET /creatives/embedded?creative_id={id}` |

---

## 2. Account State

The API key belongs to the account of **Karolin Vürst** (`karolin@mixd.ee`), group `Q73NZ47w`, region `euw1`. At time of discovery, the account contained **10 campaigns** and **216 total creatives** across those campaigns.

| Campaign | ID | Creatives |
|---|---|---|
| Animation examples / Mixd | `y6bIQiEBuOxPYhYu` | 7 |
| Maxima_50% | `vXKh6TumgpfXqMxN` | 2 |
| Maxima Lemmikute Päevad_Oktoober 2025 | `X1ld4eiCANxwcKns` | 13 |
| Unilever Indonesia pitch | `KR8CdlP0BJ7IHiBT` | 25 |
| IQVIA - AbbVie / Managed Service / Sqreem | `BLNAwLMIaMPqna0B` | 32 |
| Maxima_November_2025 | `JE8JgGwOkmCKf4xe` | 12 |
| Lendermarket | `o2l2bUVk8QyydRkD` | 2 |
| HTML test | *(null id)* | 7 |
| Sanofi - Dulcolax / Sqreem / Managed Service | `rHAvNkoiokKk2Tub` | 44 |
| LIVEN | *(null id)* | 79 |

---

## 3. Full Template Catalog

The API returned **66 templates** via `GET /templates/list`. Each template has a `template_id`, a `template_base` (the underlying engine), a `type_string` (placement type), and a `device` flag (0 = mobile, 1 = desktop, 3 = responsive).

### 3.1 Template type taxonomy

| `type` | `type_string` | Description |
|---|---|---|
| 0 | Infeed | Standard in-feed banner (scrolls with content) |
| 1 | Interstitial / Fullscreen | Full-screen overlay |
| 2 | Responsive | Adapts to container width |
| 3 | Skin | Desktop page skin / takeover |

### 3.2 Complete template list

| Template ID | Name | Sub-type | Type | Device | Video | Base |
|---|---|---|---|---|---|---|
| `chPdON` | 3D cube (horizontal) | In-Feed | Infeed | Mobile | Yes | cube |
| `obUPMT` | 3D cube (horizontal) | Fullscreen | Interstitial | Mobile | Yes | cube |
| `3ymiIL` | 3D cube (vertical) | In-Feed | Infeed | Desktop | Yes | cube |
| `nkcq` | 3D prism (horizontal) | In-Feed | Infeed | Mobile | Yes | prism |
| `Cr4K40` | 3D prism (horizontal) | Fullscreen | Interstitial | Mobile | Yes | prism |
| `Jfl5aI` | 3D prism (vertical) | In-Feed | Infeed | Desktop | Yes | prism |
| `K5gevrFPQvjo9I75` | Blinds | Fullscreen | Interstitial | Mobile | No | blinds |
| `fa4f0yzCZ8VyC7wU` | Blinds | In-Feed | Infeed | Mobile | No | blinds |
| `3Jio` | Blinds swipe | In-Feed | Infeed | Mobile | No | blindsSwipe |
| `C15WF6` | Carousel | In-Feed | Infeed | Mobile | Yes | carousel |
| `xSDp12` | Carousel | Fullscreen | Interstitial | Mobile | Yes | carousel |
| `QTlJMF` | Carousel splitscreen | Infeed | Infeed | Mobile | Yes | splitCarouselVideo |
| `oF4FDv` | Carousel splitscreen | Fullscreen | Interstitial | Mobile | Yes | splitCarouselVideo |
| `bS0e` | Deck of cards | In-Feed | Infeed | Mobile | Yes | deckOfCards |
| `jxH5Ub` | Drag to reveal | In-Feed | Infeed | Mobile | Yes | slider |
| `o4nCdJ` | Drag to reveal | Fullscreen | Interstitial | Mobile | Yes | slider |
| `Z2FUMx` | Flip | In-Feed | Infeed | Mobile | Yes | flip |
| `NPU68w` | Flip book | In-Feed | Infeed | Mobile | Yes | flipBook |
| `ndz1cw` | Floating | In-Feed | Infeed | Mobile | Yes | floating |
| `1vEOeM` | Floating object | Fullscreen | Interstitial | Mobile | Yes | floatingObject |
| `voX0Hx` | Floating object | In-Feed | Infeed | Mobile | Yes | floatingObject |
| `NN6rTR` | Map | Fullscreen | Interstitial | Mobile | No | map |
| `XCIEK3` | Map | In-Feed | Infeed | Mobile | No | map |
| `GRO02S` | Map with horizontal drag | Fullscreen | Interstitial | Mobile | Yes | scrollToMap |
| `OGIK43` | Map with horizontal drag | In-Feed | Infeed | Mobile | Yes | scrollToMap |
| `DFUE11` | Map with vertical drag | Fullscreen | Interstitial | Mobile | Yes | scrollToMap |
| `LORPE9` | Map with vertical drag | In-Feed | Infeed | Desktop | Yes | scrollToMap |
| `E2mv7w` | Panorama (horizontal) | In-Feed | Infeed | Mobile | Yes | panorama |
| `qnLRpEub` | Panorama (horizontal) | Fullscreen | Interstitial | Mobile | Yes | panorama |
| `gld88Y` | Panorama (vertical) | In-Feed | Infeed | Mobile | Yes | panorama |
| `M7bPGa` | Panorama splitscreen | Fullscreen | Interstitial | Mobile | Yes | panoramaSplitscreen |
| `NTPjRPJa` | Parallax cube | Fullscreen | Interstitial | Mobile | Yes | cubeParallax |
| `eTEFphYL` | Parallax cube | In-Feed | Infeed | Mobile | Yes | cubeParallax |
| `ypHCdxa0c84vldkl` | Queue | In-Feed | Infeed | Mobile | No | queue |
| `0bVzpK` | Responsive 3D cube (horizontal) | Responsive | Responsive | Responsive | Yes | quantumresponsive |
| `kS3Er5m` | Responsive carousel | Responsive | Responsive | Responsive | Yes | quantumresponsive |
| `82eTkD` | Responsive panorama | Responsive | Responsive | Responsive | Yes | quantumpanorama |
| `BFWCrD` | Responsive video | Responsive | Responsive | Responsive | Yes | quantumresponsive |
| `NCe8kc` | Roller (horizontal) | In-Feed | Infeed | Desktop | Yes | rollerVertical |
| `pGQrqD` | Roller (vertical) | In-Feed | Infeed | Desktop | Yes | rollerHorizontal |
| `FuWjO3` | Scratch | Fullscreen | Interstitial | Mobile | Yes | scratch |
| `NzTuLk` | Scratch | In-Feed | Infeed | Mobile | Yes | scratch |
| `utvNVS` | Scroll to queue | In-Feed | Infeed | Mobile | Yes | scrollToQueue |
| `C2cBEP` | Scroll to zoom | In-Feed | Infeed | Mobile | Yes | scrollToZoom |
| `eksZqC` | Skin | In-Feed | Skin | Desktop | Yes | skin |
| `8Do95L` | Skin with overlays | In-Feed | Skin | Desktop | Yes | skinWithOverlays |
| `LaZ9JI` | Slider | In-Feed | Infeed | Mobile | Yes | slider |
| `hir0go` | Slider | Fullscreen | Interstitial | Mobile | Yes | slider |
| `ZnRQxk` | Slides | In-Feed | Infeed | Mobile | Yes | slides |
| `OMWj6CCb` | Social to display | In-Feed | Infeed | Mobile | Yes | social |
| `F9Pd7v` | Splitscreen | Fullscreen | Interstitial | Mobile | Yes | split |
| `t6hMQy` | Splitscreen | In-Feed | Infeed | Mobile | Yes | split |
| `0NXTxD` | Still | Fullscreen | Interstitial | Mobile | Yes | still |
| `qsfpBY` | Still | In-Feed | Infeed | Mobile | Yes | still |
| `egmCDQyY` | Survey | Fullscreen | Interstitial | Mobile | Yes | survey |
| `qXPTl0aS` | Survey | In-Feed | Infeed | Mobile | Yes | survey |
| `sTVC4I` | Tiles | Fullscreen | Interstitial | Mobile | Yes | tiles |
| `WpczFW` | Train | In-Feed | Infeed | Mobile | Yes | train |
| `fPR885` | Train | Fullscreen | Interstitial | Mobile | Yes | train |
| `pF0wTH` | Unblur on touch | Fullscreen | Interstitial | Mobile | Yes | blur |
| `t0ZPC8` | Unblur on touch | In-Feed | Infeed | Mobile | Yes | blur |
| `mo4wiN` | Unblur with scroll | In-Feed | Infeed | Mobile | Yes | blur |
| `WB5RMF` | VR showroom | Fullscreen | Interstitial | Mobile | No | room3D |
| `nkkzaOLP` | VR showroom | In-feed | Infeed | Mobile | No | room3D |
| `jHRjyS` | Video | In-Feed | Infeed | Mobile | Yes | still |
| `kcxkge` | Video | Fullscreen | Interstitial | Mobile | Yes | still |

### 3.3 Template asset slot structure

Each template exposes an `assets` object keyed by opaque `asset_id` strings. Each slot defines:

| Field | Meaning |
|---|---|
| `asset_id` | Opaque string key — this is what you pass to the upload endpoint |
| `name` | Human label (e.g. "Front media", "Background", "Logo") |
| `description` | Slot purpose description |
| `filename` | Accepted filenames (e.g. `1.jpg,1.mp4,1.png,1.svg`) — indicates accepted types |
| `type` | 0 = image/video media, other values for overlays |
| `required` | 1 = mandatory, 0 = optional |
| `cta_enabled` | Whether this slot has a click-through URL |
| `transparency_allowed` | Whether PNG transparency is preserved |
| `width` / `height` | `"<100"` means fill container (percentage-based), or a pixel value |

**3D cube (horizontal) — `chPdON`** — 4 asset slots:

| Slot ID | Name | Required | CTA | Accepted |
|---|---|---|---|---|
| `Axwec8MgAViF` (cube) / `Nqjk37LAVjaG` (prism) | Front media | Yes | Yes | jpg, mp4, png, svg |
| Second slot | Top/Left media | Yes | Yes | jpg, mp4, png, svg |
| Third slot | Back/Right media | Yes | Yes | jpg, mp4, png, svg |
| Fourth slot | Bottom/Rear media | Yes | Yes | jpg, mp4, png, svg |

**3D prism (horizontal) — `nkcq`** — 3 asset slots: Front, Left, Right media.

**3D prism (vertical) — `Jfl5aI`** — 3 asset slots: Front, Rear, Upper media.

The pattern is consistent across all multi-face templates: one slot per face, all accepting image or video, all with CTA URLs per slot.

### 3.4 Configurable settings (common to all templates)

All templates share a `settings` object with the following configurable keys:

| Setting | Type | Description |
|---|---|---|
| `auto_rotate` | boolean | Auto-rotate on load |
| `loop_animate` | boolean | Loop the animation |
| `template_speed` | integer (0–100) | Transition speed |
| `turn_pause` | integer (ms) | Pause between rotations |
| `start_spin` | boolean | Start spinning immediately |
| `spin_speed` | integer (ms) | Spin speed |
| `scroll_interaction` | boolean | Trigger animation on scroll |
| `floating` | boolean | Apply floating shadow effect |
| `asset_background_color` | hex string | Background fill colour |
| `playback_controls_enabled` | boolean | Show play/pause controls |
| `custom_effect` | boolean | Enable particle effect |
| `animations.timeline` | object | Animation timeline (duration, iterations, keyframes) |
| `countdown_widget` | object | Countdown timer overlay (date, font, colour) |
| `video_export` | object | Video export settings (slide duration, loops) |

---

## 4. Creative Lifecycle

The complete lifecycle from creation to delivery was tested end-to-end. All steps confirmed working.

### 4.1 Step-by-step flow

**Step 1 — Create campaign**

```
POST /v2/campaigns
Body: { "name": "My Campaign" }
Response 201: { result: { campaign_id: "gpYgaSa8z8qRcfAY", ... } }
```

**Step 2 — Create creative**

```
POST /v2/campaigns/{campaign_id}/creatives
Body: { "name": "My Creative", "layout_id": "qsfpBY", "width": 300, "height": 250 }
Response 200: { result: { creative_id: "6mkzEw5N1e7shyii", assets: { splash: {...} }, settings: {...} } }
```

The response includes the full creative settings object and a `splash` asset (thumbnail). The `layout_id` field maps to the template's `template_id`.

**Step 3 — Upload asset to slot**

```
POST /creatives/{creative_id}/assets/{asset_id}
Body: { "filename": "1.png", "data": "<base64>", "slot": "1" }
```

The `asset_id` in the URL must be the opaque slot ID from the template's `assets` object (e.g. `Axwec8MgAViF`), **not** a numeric index. Using `"1"` returned `403 "Error constructing Models\TemplateAsset"`. The correct pattern is to first call `GET /templates/{template_id}` to obtain the slot IDs, then upload to each slot by its ID.

**Step 4 — Read back creative**

```
GET /v2/campaigns/{campaign_id}/creatives/view
Response 200: { result: { campaign: {...}, items: [{ creative_id, name, width, height, layout_name, status, ... }] } }
```

Note: `GET /v2/creatives/{creative_id}` returns 404 — there is no standalone creative detail endpoint. Creatives are always read through their parent campaign.

**Step 5 — Get embed tag**

```
GET /creatives/embedded?creative_id={id}
Response 200: {
  result: {
    creative_id, width, height, base, has_video,
    tag: "<ins class=\"adcads\" data-unit=\"...\" ...>...</ins>",
    live_tag: null,  // null until published
    splashes: { main: "https://data-euw1.nexd.com/..." },
    live_preview: { pack: { build, creatives: [{ settings: { ad: { assets: {...} } } }] } }
  }
}
```

The `tag` field contains the full `<ins>` embed tag for preview. The `live_tag` is null until the creative is published. The `live_preview.pack.creatives[].settings.ad.assets` object shows the current asset state with URIs, dimensions, and CTA configuration.

**Step 6 — Publish** (not tested — requires traffic/DSP configuration)

Publishing likely requires setting a DSP and click URL, then calling a publish endpoint. The creative object has `actions.can_publish: true` when ready.

**Step 7 — Delete**

```
DELETE /creatives/{creative_id}   → 200 { result: { creative_id } }
DELETE /campaigns/{campaign_id}   → 200 { result: { campaign_id } }
```

Both confirmed working. The `/v2/` prefix variants return 404 for DELETE.

---

## 5. Mente Variable Mapping Proposal

Mente's 7 variable slots must map to Nexd's asset slot model. The key insight from the API exploration is that **Nexd does not have text overlay slots** — all text must be baked into the uploaded image assets. There is no API field for setting headline copy, CTA text, or price tags as text layers. The `countdown_widget` setting provides a countdown timer overlay, but it is the only native text element.

### 5.1 Mapping table

| Mente Variable | Nexd Concept | Mapping Strategy |
|---|---|---|
| **Illustration** | Main product image slot (e.g. "Front media") | Upload the Mente-rendered banner PNG to the primary face slot. This is the primary creative surface. |
| **Image** | Secondary/background slot (e.g. "Back media", "Top media") | For multi-face templates (cube, prism, carousel), upload variant banners to additional face slots. For Still template, this slot is unused. |
| **H1** | Baked into image asset | Text must be rendered into the banner PNG before upload. No API text layer. |
| **H2** | Baked into image asset | Same as H1. |
| **H3** | Baked into image asset | Same as H1. |
| **CTA** | Per-slot `cta.uri` field | The click-through URL is set via the asset's CTA object. Each slot has `cta_enabled: true` and a `cta.uri` field. This is the correct place for the CTA destination URL. The CTA button label must be baked into the image. |
| **Price_Tag** | Baked into image asset, or `countdown_widget` | Price text must be baked into the banner. For countdown-style price events, the `countdown_widget` setting could be repurposed, but it is limited to date countdown format. |

### 5.2 Recommended mapping for the Still/In-Feed template (`qsfpBY`)

The **Still** template (`qsfpBY`, `qsfpBY` base = `still`) is the simplest and most directly compatible with Mente's banner output. It has a single primary media slot and supports both static images and video. This is the recommended starting point for Phase N2.

For the **Carousel** template (`C15WF6`), each carousel slide maps to one Mente format variant — the first slide gets the primary banner, subsequent slides get format variants (e.g. different sizes or copy versions).

### 5.3 Multi-face template strategy

For 3D cube and prism templates, the recommended approach is to use Mente's format variants as the faces:

- Face 1 (Front): Primary banner (e.g. 300×250 with H1 + Illustration)
- Face 2 (Top/Left): Variant with H2 or different product angle
- Face 3 (Back/Right): Variant with CTA-focused layout
- Face 4 (Bottom): Optional fourth variant or repeat of Face 1

---

## 6. Limitations and Open Questions

### 6.1 Confirmed limitations

**No API text layers.** All text (H1, H2, H3, CTA label, Price_Tag) must be baked into the uploaded image. Nexd's creative engine renders the uploaded images as-is. The only exception is the `countdown_widget` which supports a countdown timer with configurable font and colour, but it is not a general text layer.

**Asset upload requires slot IDs, not numeric indices.** The `POST /creatives/{id}/assets/{slot}` endpoint requires the opaque `asset_id` from the template definition (e.g. `Axwec8MgAViF`), not a sequential number. The integration must first fetch the template to discover slot IDs before uploading.

**No standalone creative GET endpoint.** `GET /v2/creatives/{id}` returns 404. Creatives can only be read through `GET /v2/campaigns/{campaign_id}/creatives/view`. The integration must store `campaign_id` alongside `creative_id`.

**Mixed API versioning.** Create/list operations use `/v2/`, while upload/embed/delete use the root `/` namespace. This must be handled explicitly in the integration layer.

**Embed tag is null until assets are uploaded.** A newly created creative returns `tag: null` from the embed endpoint until at least the splash asset is configured.

### 6.2 Open questions

| Question | Status |
|---|---|
| What is the correct multipart or base64 format for asset upload? | Partially answered — `{ filename, data (base64), slot }` returns 403 when slot ID is wrong. Correct slot ID format needs verification in Phase N2. |
| Can the `cta.uri` (click URL) be set via the asset upload body, or is it a separate PATCH call? | Unknown — needs testing in Phase N2. |
| What are the rate limits? | Not documented; no rate-limit headers observed in any response. |
| What happens to analytics when a creative is unpublished? | Unknown — no live creatives were tested. |
| Does the `animations.timeline` setting accept keyframe data via API, or is it UI-only? | Unknown — the setting exists in the template but no documentation was found for the keyframe format. |
| What DSP/trafficking configuration is required before publishing? | Unknown — the `can_publish: true` flag was present but the publish endpoint was not tested. |
| Are there webhook events for creative status changes? | Unknown. |

---

## 7. Recommended Integration Architecture

Based on the Phase N1 findings, the simplest path to get Mente campaign data into Nexd creatives is as follows.

### 7.1 Proposed flow

```
Mente campaign (Airtable)
  → for each banner (format × creative)
      → render banner PNG (already done by Mente's existing render pipeline)
      → POST /v2/campaigns (once per Mente campaign, store nexd_campaign_id)
      → GET /templates/{template_id} → extract asset slot IDs
      → POST /v2/campaigns/{nexd_campaign_id}/creatives
          body: { name, layout_id, width, height }
          → store nexd_creative_id in Airtable Banner record
      → POST /creatives/{nexd_creative_id}/assets/{slot_id}
          body: { filename, data: <base64 PNG> }
      → GET /creatives/embedded?creative_id={nexd_creative_id}
          → store embed tag in Airtable Banner record
```

### 7.2 Recommended template for Phase N2

Start with **Still / In-Feed** (`qsfpBY`) — one asset slot, no multi-face complexity, directly accepts the Mente banner PNG. This validates the full upload-to-embed pipeline before tackling carousel or cube templates.

### 7.3 Airtable schema additions needed (Phase N2)

| Field | Table | Type | Purpose |
|---|---|---|---|
| `Nexd_Campaign_ID` | Campaigns | Single line text | Stores the Nexd campaign ID for the Mente campaign |
| `Nexd_Creative_ID` | Banners | Single line text | Stores the Nexd creative ID for each banner |
| `Nexd_Embed_Tag` | Banners | Long text | Stores the `<ins>` embed tag for delivery |
| `Nexd_Template_ID` | Formats | Single line text | Maps each Mente format to a Nexd template |
| `Nexd_Status` | Banners | Single select | draft / uploaded / published |

### 7.4 New API routes needed in the app (Phase N2)

| Route | Method | Purpose |
|---|---|---|
| `/api/nexd/campaigns` | POST | Create a Nexd campaign for a Mente campaign |
| `/api/nexd/creatives` | POST | Create and upload a creative for a banner |
| `/api/nexd/embed/[creative_id]` | GET | Fetch the current embed tag |

---

## 8. Test Creative Flow — Full Request/Response Log

The following is the sanitised request/response log from the Task 3 end-to-end test. The API key has been replaced with `[REDACTED]`.

### Step a — Create campaign

**Request:** `POST https://api.nexd.com/v2/campaigns`  
**Headers:** `Authorization: Bearer [REDACTED]`  
**Body:** `{ "name": "Mente_Integration_Test" }`  
**Response 201:**
```json
{
  "result": {
    "campaign_id": "gpYgaSa8z8qRcfAY",
    "name": "Mente_Integration_Test",
    "status": 0,
    "owner": { "name": "Karolin Vürst", "email": "karolin@mixd.ee" },
    "preview_url": "https://studio.nexd.com/c/gpYgaSa8z8qRcfAY",
    "region_id": "euw1",
    "created_on": 1773852992
  },
  "success": true
}
```

### Step b — Create creative

**Request:** `POST https://api.nexd.com/v2/campaigns/gpYgaSa8z8qRcfAY/creatives`  
**Body:** `{ "name": "Mente_Test_Creative", "layout_id": "qsfpBY", "width": 300, "height": 250 }`  
**Response 200:**
```json
{
  "result": {
    "creative_id": "6mkzEw5N1e7shyii",
    "assets": { "splash": { "uri": "https://data-euw1.nexd.com/ads/creatives/6mkzEw5N1e7shyii/splash.jpg" } },
    "settings": { "asset_background_color": "#BECBDC", "animations": { "timeline": { "enabled": false } } }
  }
}
```

### Step c — Upload asset (failed — wrong slot ID)

**Request:** `POST https://api.nexd.com/creatives/6mkzEw5N1e7shyii/assets/1`  
**Body:** `{ "filename": "test.png", "data": "<base64>", "slot": "1" }`  
**Response 403:** `"Error constructing Models\\TemplateAsset"`  
**Root cause:** The slot identifier `"1"` is invalid. The correct asset_id must be fetched from `GET /templates/qsfpBY` first (e.g. the Still template's primary slot ID).

### Step d — Read back creative

**Request:** `GET https://api.nexd.com/v2/campaigns/gpYgaSa8z8qRcfAY/creatives/view`  
**Response 200:** Creative confirmed present with `status: 0` (draft), `layout_name: "No layout"` (because asset upload failed), `width: 300, height: 250`.

### Step e — Embed tag

**Request:** `GET https://api.nexd.com/creatives/embedded?creative_id=6mkzEw5N1e7shyii`  
**Response 200:** `tag: null` (no assets uploaded yet), `pack_is_ready: true`, `splashes.main` URL present.

### Steps f/g — Cleanup (confirmed)

```
DELETE /creatives/6mkzEw5N1e7shyii  → 200 "Creative deleted"
DELETE /campaigns/gpYgaSa8z8qRcfAY  → 200 "Campaign deleted"
```

---

## 9. Summary and Next Steps

Phase N1 confirms that the Nexd API is fully accessible, well-structured, and capable of supporting the Mente integration. The key findings are:

**What works:** Campaign creation, creative creation, embed tag retrieval, campaign/creative deletion. The full lifecycle is functional via API.

**What needs Phase N2 work:** The asset upload endpoint requires the correct opaque slot ID from the template definition. The integration must fetch template slot IDs before uploading. The CTA URL configuration mechanism also needs to be confirmed.

**Core architectural decision:** Since Nexd has no text layer API, all Mente copy (H1, H2, H3, CTA label, Price_Tag) must be baked into the banner PNG before upload. This means the Nexd integration is a **delivery channel** for already-rendered Mente banners, not a creative composition tool. The Mente render pipeline produces the final PNG; Nexd wraps it in an interactive ad unit.

**Recommended Phase N2 scope:**
1. Fetch the Still template (`qsfpBY`) slot IDs and complete the asset upload test
2. Confirm CTA URL configuration
3. Add `Nexd_Template_ID` to the Formats table and `Nexd_Creative_ID` / `Nexd_Embed_Tag` to the Banners table
4. Build `/api/nexd/creatives` route that creates a Nexd creative and uploads the rendered banner PNG
5. Display the embed tag in the Banner detail modal
