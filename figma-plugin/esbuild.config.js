const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const isWatch = process.argv.includes("--watch");

async function build() {
  fs.mkdirSync("dist", { recursive: true });

  if (isWatch) {
    // Watch mode — use esbuild context API (esbuild >= 0.17)
    const ctx = await esbuild.context({
      entryPoints: ["src/code.ts"],
      bundle: true,
      outfile: "dist/code.js",
      platform: "browser",
      target: "es2017",
    });
    await ctx.watch();
    console.log("Watching for changes…");
    return; // keep process alive
  }

  // One-shot build
  await esbuild.build({
    entryPoints: ["src/code.ts"],
    bundle: true,
    outfile: "dist/code.js",
    platform: "browser",
    target: "es2017",
  });

  // Bundle UI HTML + JS into a single file
  const uiJs = await esbuild.build({
    entryPoints: ["src/ui.ts"],
    bundle: true,
    write: false,
    platform: "browser",
    target: "es2017",
  });

  const uiJsText = uiJs.outputFiles[0].text;
  const htmlTemplate = fs.readFileSync(path.join(__dirname, "src/ui.html"), "utf8");
  const finalHtml = htmlTemplate.replace("</body>", `<script>${uiJsText}</script></body>`);
  fs.writeFileSync("dist/ui.html", finalHtml);

  console.log("✓ Plugin built");
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
