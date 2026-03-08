#!/usr/bin/env tsx
/**
 * new-client.ts — Division Banner Factory client config generator
 *
 * Usage:
 *   pnpm tsx scripts/new-client.ts
 *
 * This script generates a new client config file at
 * src/config/clients/{slug}.ts and prints the registry
 * entry to add to src/config/clients/index.ts.
 *
 * It does NOT write to index.ts automatically — review
 * the output and add the entry manually.
 */

import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äÄ]/g, "a")
    .replace(/[öÖ]/g, "o")
    .replace(/[üÜ]/g, "u")
    .replace(/[õÕ]/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  console.log("\n── Division Banner Factory — New Client Setup ──\n");

  const name = await ask("Client display name (e.g. Avene): ");
  const slug = slugify(name);
  console.log(`  → slug: ${slug}`);

  const subdomain = await ask(`Subdomain (default: ${slug}): `) || slug;
  const primaryColor = await ask("Primary brand color (hex, e.g. #1a1a2e): ") || "#1a1a2e";
  const accentColor = await ask("Accent brand color (hex, e.g. #e8c4a0): ") || "#e8c4a0";
  const airtableBaseId = await ask("Airtable Base ID (e.g. appXXXXXXXXXXXXXX): ");
  const campaignFilter = await ask(`Campaign filter value (default: ${name}): `) || name;
  const languagesRaw = await ask("Languages, comma-separated (default: ET): ") || "ET";
  const languages = languagesRaw.split(",").map((l) => l.trim().toUpperCase());

  rl.close();

  const configContent = `import { ClientConfig } from "@/config/types";

const ${slug}Config: ClientConfig = {
  id: "${slug}",
  name: "${name}",
  subdomain: "${subdomain}",
  logo: "/logos/${slug}.svg",
  colors: {
    primary: "${primaryColor}",
    accent: "${accentColor}",
  },
  languages: [${languages.map((l) => `"${l}"`).join(", ")}],
  airtable: {
    baseId: "${airtableBaseId}",
    campaignFilter: "${campaignFilter}",
  },
  features: {
    copyEditor: true,
    designerView: false,
    campaignBuilder: false,
  },
};

export default ${slug}Config;
`;

  const outPath = path.join(
    process.cwd(),
    "src",
    "config",
    "clients",
    `${slug}.ts`
  );

  if (fs.existsSync(outPath)) {
    console.log(`\n⚠  File already exists: ${outPath}`);
    console.log("   Skipping write. Delete the file first if you want to regenerate.\n");
  } else {
    fs.writeFileSync(outPath, configContent, "utf8");
    console.log(`\n✓ Created: ${outPath}`);
  }

  console.log("\n── Add this entry to src/config/clients/index.ts ──\n");
  console.log(`import ${slug}Config from "./${slug}";`);
  console.log(`\n// In the registry map:`);
  console.log(`  "${subdomain}": ${slug}Config,`);
  console.log("\n────────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
