# Division Banner Factory — Figma Plugin

A Figma plugin that pulls copy from the Division Banner Factory platform and applies it to text layers in Figma frames.

## Architecture

```
figma-plugin/
├── manifest.json          # Figma plugin manifest
├── package.json           # Node dev dependencies
├── tsconfig.json          # TypeScript config
├── esbuild.config.js      # Build script
├── src/
│   ├── code.ts            # Plugin main thread (runs in Figma sandbox)
│   ├── ui.ts              # Plugin UI logic (runs in iframe)
│   └── ui.html            # Plugin UI HTML template
└── dist/                  # Built output (gitignored)
    ├── code.js
    └── ui.html
```

## How it works

1. **Platform API** (`POST /api/campaigns/[id]/figma-sync`) returns a JSON payload:
   ```json
   {
     "fileKey": "Eo5ilHad8HVaEVo87KUAWi",
     "campaignName": "Avene_Sprin2026",
     "frames": [
       {
         "figmaFrame": "_MASTER_Google_Display_Horizontal_1200x628",
         "type": "Standard",
         "copy": { "H1": "Discover your skin", "CTA": "Shop now" },
         "activeVariables": ["H1", "CTA"]
       },
       {
         "figmaFrame": "_MASTER_Google_Display_Vertical_960x1200",
         "type": "Carousel",
         "slides": [
           { "index": 1, "copy": { "H1": "Slide 1 text" }, "activeVariables": ["H1"] }
         ]
       }
     ]
   }
   ```

2. **Plugin UI** (`ui.ts`) fetches this payload from the platform and sends it to the plugin main thread.

3. **Plugin main thread** (`code.ts`) finds each frame by `figmaFrame` name on the current Figma page, then sets text layer content by matching layer names to variable slot names (e.g. a layer named `H1` gets the value of `copy["H1"]`).

## Text layer naming convention

For copy to be applied, text layers inside each frame must be named exactly after the variable slot:

| Variable slot | Layer name |
|---|---|
| `H1` | `H1` |
| `H2` | `H2` |
| `H3` | `H3` |
| `CTA` | `CTA` |
| `Price_Tag` | `Price_Tag` |
| `Illustration` | `Illustration` |

Names are matched case-insensitively and spaces are normalised to underscores.

## Development

```bash
cd figma-plugin
npm install
npm run build    # one-time build
npm run watch    # watch mode
```

Then in Figma: **Plugins → Development → Import plugin from manifest** → select `figma-plugin/manifest.json`.

## Deployment

The `dist/` directory is gitignored. Build locally before loading into Figma. Future: add a GitHub Actions step to build and attach `dist/` as a release artifact.
