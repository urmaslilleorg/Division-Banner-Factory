import { ClientConfig } from "../types";
import demoConfig from "./demo";
import aveneConfig from "./avene";

const clientConfigs: Record<string, ClientConfig> = {
  demo: demoConfig,
  avene: aveneConfig,
};

export function getClientConfig(subdomain: string): ClientConfig | undefined {
  return clientConfigs[subdomain];
}

export function getAllClientConfigs(): ClientConfig[] {
  return Object.values(clientConfigs);
}

export default clientConfigs;
