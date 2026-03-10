import { ClientConfig } from "../types";

const maximaConfig: ClientConfig = {
  id: "maxima",
  name: "Maxima",
  subdomain: "maxima",
  logo: "/logos/maxima.svg",
  colors: {
    primary: "#1A1A2E",
    secondary: "#16213E",
    accent: "#0F3460",
    background: "#FFFFFF",
  },
  languages: ["ET"],
  airtable: {
    baseId: "appIqinespXjbIERp",
    campaignFilter: "Maxima",
  },
  features: {
    download: true,
    comments: true,
    approvals: true,
    copyEditor: true,
    designerView: true,
    campaignBuilder: true,
  },
};

export default maximaConfig;
