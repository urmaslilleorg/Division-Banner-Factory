# Division Banner Factory — Figma Plugin

A Figma plugin that auto-creates campaign pages and banner frames from the
Division Banner Factory platform, then keeps copy in sync as campaigns evolve.

---

## Build

```bash
cd figma-plugin
npm install
npm run build
```

The build step compiles `src/code.ts` and `src/ui.ts` into `dist/code.js` and
inlines the HTML into `dist/ui.html` using esbuild.

For continuous development:

```bash
npm run watch
```

---

## Load in Figma

1. Open Figma and open the file **SA_bännerid** (or any target file).
2. Go to **Plugins → Development → Import plugin from manifest**.
3. Select `figma-plugin/manifest.json` from this repository.
4. Run the plugin: **Plugins → Development → Mente Banner Factory**.

> **Note:** You do not need to create a page manually — the plugin creates a
> dedicated page per campaign automatically when you click **Apply**.

---

## Usage

### Step 1 — Fetch frames

1. Enter **Platform URL**: `https://sydameapteek.menteproduction.com`
2. Enter **Campaign ID**: e.g. `recXeEZWcSvQZekf0`
3. Click **Fetch frames** → the plugin shows `"5 frames found for 'Avene_Spring2026'"`.

The plugin remembers the last-used URL and Campaign ID in `localStorage`.

### Step 2 — Apply

4. Click **Apply copy**.

The plugin executes the following steps:

| Step | What happens |
|------|--------------|
| 0 | Creates a new Figma page named after the campaign (e.g. `Avene_Spring2026`). If the page already exists, it switches to it instead of creating a duplicate. |
| 1 | For each frame in the payload, checks whether a frame with that name already exists on the page. |
| 2 | **If not found** — creates a new `FrameNode` with the correct dimensions, white background, and text layers (`H1`, `H2`, `H3`, `CTA`, `Price_Tag`, `Illustration`) pre-filled with copy. |
| 3 | **If found** — updates only the text layers with new copy values. All designer-added visuals, positions, and styling are preserved. |
| 4 | Lays out newly created frames in a grid (100 px gaps, wraps at ~4000 px wide). |

5. Frames appear on the campaign page with copy pre-filled — the designer can
   start adding visuals immediately.

### Carousel frames

For frames of type **Carousel**, the plugin creates a parent frame containing
one sub-frame per slide (`_Slide_1`, `_Slide_2`, …), each with its own text
layers. Slides are positioned side by side horizontally inside the parent.

---

## Text layer naming convention

Text layers are matched by name (case-insensitive, spaces normalised to `_`).
Newly created layers use these defaults:

| Layer name | Font | Size | Style |
|------------|------|------|-------|
| `H1` | Inter | 32 | Bold |
| `H2` | Inter | 24 | Regular |
| `H3` | Inter | 18 | Regular |
| `CTA` | Inter | 20 | Bold |
| `Price_Tag` | Inter | 24 | Bold |
| `Illustration` | Inter | 16 | Italic |

If **Inter** is not available in the Figma file, the plugin falls back to
**Roboto**, then **Arial**.

---

## API payload structure

The platform endpoint `GET /api/campaigns/[id]/figma-sync` returns:

```json
{
  "fileKey": "Eo5ilHad8HVaEVo87KUAWi",
  "campaignId": "recXeEZWcSvQZekf0",
  "campaignName": "Avene_Spring2026",
  "syncedAt": "2026-03-14T10:00:00.000Z",
  "frameCount": 5,
  "frames": [
    {
      "recordId": "recABC",
      "name": "Google Display 1200×628",
      "figmaFrame": "_MASTER_Google_Display_Horizontal_1200x628",
      "width": 1200,
      "height": 628,
      "type": "Standard",
      "copy": { "H1": "Discover your skin", "CTA": "Shop now" },
      "activeVariables": ["H1", "CTA"]
    },
    {
      "recordId": "recDEF",
      "name": "Stories Carousel 1080×1920",
      "figmaFrame": "_MASTER_Stories_Carousel_1080x1920",
      "width": 1080,
      "height": 1920,
      "type": "Carousel",
      "copy": {},
      "activeVariables": [],
      "slides": [
        { "index": 1, "copy": { "H1": "Slide 1 headline" }, "activeVariables": ["H1"] },
        { "index": 2, "copy": { "H1": "Slide 2 headline" }, "activeVariables": ["H1"] }
      ]
    }
  ]
}
```

---

## Verification checklist

- [ ] Open Figma → any file
- [ ] Run plugin → Fetch → `"5 frames found for 'Avene_Spring2026'"`
- [ ] Click Apply → new page `Avene_Spring2026` created automatically
- [ ] 5 frames created on the new page with correct names + dimensions
- [ ] Each frame: text layers named after variable slots, pre-filled with copy
- [ ] Carousel: parent frame + slide sub-frames (`_Slide_1`, `_Slide_2`, …)
- [ ] Run Apply again → text updated, no duplicate frames created
- [ ] After designer adds visuals → run Apply → only text layers updated, visuals preserved

---

## Project structure

```
figma-plugin/
├── manifest.json        Figma plugin manifest
├── esbuild.config.js    Build script
├── package.json
├── tsconfig.json
├── src/
│   ├── code.ts          Main thread (runs in Figma sandbox)
│   ├── ui.ts            UI thread (runs in iframe)
│   └── ui.html          UI template
└── dist/                Build output (gitignored)
    ├── code.js
    └── ui.html
```
