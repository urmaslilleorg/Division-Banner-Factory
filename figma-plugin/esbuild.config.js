const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const isWatch = process.argv.includes("--watch");

async function build() {
  // Build plugin code (runs in Figma sandbox)
  await esbuild.build({
    entryPoints: ["src/code.ts"],
    bundle: true,
    outfile: "dist/code.js",
    platform: "browser",
    target: "es2017",
    watch: isWatch ? { onRebuild: (err) => err && console.error(err) } : false,
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
  fs.mkdirSync("dist", { recursive: true });
  fs.writeFileSync("dist/ui.html", finalHtml);

  console.log("✓ Plugin built");
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
