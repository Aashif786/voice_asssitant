import * as Network from "expo-network";

export interface NetworkInfo {
  connected: boolean | null;
  type: string;
}

export const NetworkService = {
  async get(): Promise<NetworkInfo> {
    try {
      const s = await Network.getNetworkStateAsync();
      return { connected: s.isInternetReachable ?? s.isConnected ?? null, type: String(s.type ?? "unknown") };
    } catch {
      return { connected: null, type: "unknown" };
    }
  },
};