import { ClientConfig } from "../types";

const aveneConfig: ClientConfig = {
  id: "avene",
  name: "Avene",
  subdomain: "avene",
  logo: "/logos/avene.svg",
  colors: {
    // Placeholder — Urmas will update in Cursor
    primary: "#0066cc",
    secondary: "#004999",
    accent: "#ff6600",
    background: "#ffffff",
  },
  languages: ["ET"],
  airtable: {
    baseId: "appIqinespXjbIERp",
    campaignFilter: "Avene",
  },
  features: {
    download: true,
    comments: true,
    approvals: true,
  },
};

export default aveneConfig;
