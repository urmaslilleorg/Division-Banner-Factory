import { ClientConfig } from "../types";

const demoConfig: ClientConfig = {
  id: "demo",
  name: "Demo Client",
  subdomain: "demo",
  logo: "/logos/demo.svg",
  colors: {
    primary: "#1a1a2e",
    secondary: "#16213e",
    accent: "#0f3460",
    background: "#f8f9fa",
  },
  languages: ["ET", "EN"],
  airtable: {
    baseId: "appIqinespXjbIERp",
    campaignFilter: "Demo",
  },
  features: {
    download: true,
    comments: true,
    approvals: true,
  },
};

export default demoConfig;
