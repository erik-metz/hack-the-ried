// Only successful map loads write this versioned cache. No network requests.
const STORAGE_KEY = "hack-the-ried:sensor-count:v1";
let memoryCount: number | undefined;
const listeners = new Set<() => void>();

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function readSensorCount(): number | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const value: unknown = JSON.parse(raw);
      if (validCount(value)) return value;
    }
  } catch {
    // Storage may be disabled; keep the last value for this session.
  }
  return memoryCount;
}

export function saveSensorCount(count: number): void {
  if (!validCount(count)) return;
  memoryCount = count;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(count));
  } catch {
    // The in-memory cache also survives client-side navigation.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeSensorCount(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
