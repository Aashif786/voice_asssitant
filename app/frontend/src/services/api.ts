import { Platform } from "react-native";

/**
 * The optional companion backend. The app is on-device first: with no backend URL
 * configured, every request short-circuits immediately (no network, no timeout waits),
 * and the app relies entirely on on-device inference. Set EXPO_PUBLIC_BACKEND_URL to a
 * reachable FastAPI server (e.g. a desktop on the LAN) to enable it.
 */
export function getBackendUrl(): string | null {
  const explicit = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (explicit && explicit.trim()) return explicit.trim();
  // In web/dev, a localhost backend is reachable; on a real device it is not.
  if (Platform.OS === "web") return "http://localhost:8000";
  return null;
}

export function isBackendConfigured(): boolean {
  return getBackendUrl() !== null;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  const baseUrl = getBackendUrl();
  if (!baseUrl) {
    return { data: null, error: "backend_not_configured" };
  }
  const url = `${baseUrl.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(options.headers || {}) },
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      return { data: null, error: `HTTP ${res.status}: ${errText}` };
    }
    const json = await res.json();
    return { data: json as T, error: null };
  } catch (err: any) {
    clearTimeout(timeoutId);
    return { data: null, error: err?.message || "Network request failed" };
  }
}
