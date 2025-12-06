let cachedId: string | null = null;
const STORAGE_KEY = "refast_client_id";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: simple pseudo-random string
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getClientId(): string {
  if (cachedId) return cachedId;

  try {
    if (typeof localStorage !== "undefined") {
      const existing = localStorage.getItem(STORAGE_KEY);
      if (existing) {
        cachedId = existing;
        return existing;
      }
      const id = generateId();
      localStorage.setItem(STORAGE_KEY, id);
      cachedId = id;
      return id;
    }
  } catch {
    // Swallow and fall back to in-memory ID
  }

  cachedId = generateId();
  return cachedId;
}

