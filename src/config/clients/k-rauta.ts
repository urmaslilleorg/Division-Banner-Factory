import { ClientConfig } from "../types";

const krautaConfig: ClientConfig = {
  id: "k-rauta",
  name: "K-Rauta",
  subdomain: "k-rauta",
  logo: "/clients/k-rauta/logo.png",
  colors: {
    primary: "#E3000F",
    secondary: "#1A1A1A",
    accent: "#E3000F",
    background: "#FFFFFF",
  },
  languages: ["ET"],
  airtable: {
    baseId: "appIqinespXjbIERp",
    campaignFilter: "K-Rauta",
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

export default krautaConfig;
