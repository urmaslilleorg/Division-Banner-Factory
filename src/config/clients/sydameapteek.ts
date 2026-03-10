import { ClientConfig } from "../types";

const sydameapteekConfig: ClientConfig = {
  id: "sydameapteek",
  name: "Südameapteek",
  subdomain: "sydameapteek",
  logo: "/clients/sydameapteek/logo.png",
  colors: {
    primary: "#E30613",
    secondary: "#1A1A1A",
    accent: "#E30613",
    background: "#FFFFFF",
  },
  languages: ["ET"],
  airtable: {
    baseId: "appIqinespXjbIERp",
    campaignFilter: "Südameapteek",
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

export default sydameapteekConfig;
