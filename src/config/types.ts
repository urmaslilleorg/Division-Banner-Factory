export interface ClientConfig {
  id: string;
  name: string;
  subdomain: string;
  logo: string;
  colors: {
    primary: string;
    secondary?: string;
    accent?: string;
    background?: string;
  };
  languages: string[];
  airtable: {
    baseId: string;
    campaignFilter: string;
  };
  features: {
    download?: boolean;
    comments?: boolean;
    approvals?: boolean;
    copyEditor?: boolean;
    designerView?: boolean;
    campaignBuilder?: boolean;
  };
}
