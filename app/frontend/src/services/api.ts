import { Platform } from "react-native";

/**
 * Intelligent Multi-Candidate Backend URL Resolver.
 * Automatically probes:
 * 1. http://127.0.0.1:8000 (ADB reverse tunnel over USB - zero latency, bypasses firewall)
 * 2. EXPO_PUBLIC_BACKEND_URL (LAN IP e.g. http://192.168.1.99:8000)
 * 3. http://10.0.2.2:8000 (Android Emulator)
 * 4. http://localhost:8000 (Web / Local)
 *
 * Caches the active working endpoint and seamlessly fails over if connectivity changes.
 */

let cachedActiveUrl: string | null = null;
let lastCheckTimestamp = 0;
const CACHE_TTL_MS = 25000;

export function getBackendCandidates(): string[] {
  const candidates: string[] = [];

  const explicit = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();

  if (Platform.OS === "web" && typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      candidates.push(`http://${host}:8000`);
    }
    candidates.push("http://localhost:8000");
    candidates.push("http://127.0.0.1:8000");
    if (explicit && !candidates.includes(explicit)) {
      candidates.push(explicit);
    }
    return candidates;
  }

  // Android / iOS native
  // 1. ADB reverse tunnel (highest priority when USB is connected)
  candidates.push("http://127.0.0.1:8000");
  candidates.push("http://localhost:8000");

  // 2. Explicit LAN URL (e.g. 192.168.1.99:8000)
  if (explicit && !candidates.includes(explicit)) {
    candidates.push(explicit);
  }

  // 3. Android emulator host loopback
  if (Platform.OS === "android") {
    candidates.push("http://10.0.2.2:8000");
  }

  return candidates;
}

async function probeCandidate(url: string, timeoutMs = 1200): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const clean = url.replace(/\/$/, "");
    const res = await fetch(`${clean}/api/health`, {
      method: "GET",
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Probes candidates and returns the first healthy backend URL.
 */
export async function getActiveBackendUrl(forceProbe = false): Promise<string | null> {
  const now = Date.now();
  if (!forceProbe && cachedActiveUrl && now - lastCheckTimestamp < CACHE_TTL_MS) {
    return cachedActiveUrl;
  }

  // Probe candidates concurrently
  const candidates = getBackendCandidates();

  // If we already have a cached one, check it first quickly
  if (cachedActiveUrl && (await probeCandidate(cachedActiveUrl, 1000))) {
    lastCheckTimestamp = now;
    return cachedActiveUrl;
  }

  // Probe all candidates in parallel
  const probePromises = candidates.map(async (url) => {
    const ok = await probeCandidate(url, 1500);
    return { url, ok };
  });

  const results = await Promise.all(probePromises);
  const working = results.find((r) => r.ok);

  if (working) {
    cachedActiveUrl = working.url;
    lastCheckTimestamp = now;
    isBackendOnline = true;
    return working.url;
  }

  // If none responded to /api/health, mark backend as offline
  isBackendOnline = false;
  cachedActiveUrl = null;
  lastCheckTimestamp = now;
  return null;
}

let isBackendOnline = false;

/** Synchronous getter for current active backend URL (null if offline) */
export function getBackendUrl(): string | null {
  return cachedActiveUrl;
}

/** Returns true ONLY if an external/local backend server is actively running and responding */
export function isBackendConfigured(): boolean {
  return isBackendOnline;
}

export async function testBackendConnection(): Promise<boolean> {
  const url = await getActiveBackendUrl(true);
  return url !== null;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  // If backend is not online, do not block or hang the UI
  const baseUrl = await getActiveBackendUrl(false);
  if (!baseUrl) {
    return { data: null, error: "backend_offline" };
  }

  const cleanEndpoint = endpoint.replace(/^\//, "");
  const makeUrl = (base: string) => `${base.replace(/\/$/, "")}/${cleanEndpoint}`;

  // Attempt with current active URL
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(makeUrl(baseUrl), {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
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

    // Failover: Try alternative candidate immediately before giving up
    const altCandidates = getBackendCandidates().filter((c) => c !== baseUrl);
    for (const alt of altCandidates) {
      try {
        const altCtrl = new AbortController();
        const altTimer = setTimeout(() => altCtrl.abort(), 3000);
        const altRes = await fetch(makeUrl(alt), {
          ...options,
          signal: altCtrl.signal,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(options.headers || {}),
          },
        });
        clearTimeout(altTimer);

        if (altRes.ok) {
          cachedActiveUrl = alt;
          lastCheckTimestamp = Date.now();
          const json = await altRes.json();
          return { data: json as T, error: null };
        }
      } catch {
        /* try next candidate */
      }
    }

    return { data: null, error: err?.message || "Network request failed" };
  }
}
