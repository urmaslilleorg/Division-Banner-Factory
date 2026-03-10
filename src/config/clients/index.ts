import { ClientConfig } from "../types";
import demoConfig from "./demo";
import aveneConfig from "./avene";
import krautaConfig from "./k-rauta";
import sydameapteekConfig from "./sydameapteek";
import maximaConfig from "./maxima";

const clientConfigs: Record<string, ClientConfig> = {
  demo: demoConfig,
  avene: aveneConfig,
  "k-rauta": krautaConfig,
  sydameapteek: sydameapteekConfig,
  maxima: maximaConfig,
};

export function getClientConfig(subdomain: string): ClientConfig | undefined {
  return clientConfigs[subdomain];
}

export function getAllClientConfigs(): ClientConfig[] {
  return Object.values(clientConfigs);
}

export default clientConfigs;
