import { CATEGORY_IDS, type Category, type MapMode } from "./mapData";

export const MAP_LAYER_IDS = [
  "monitoring",
  "warnings",
  "landcover",
  "floodrisk",
  "census",
  "nature",
  "crops",
  "floods",
  "starkregen",
  "charging",
  "fuel",
  "energy",
  "road",
  "wifi",
  "broadband",
  "boris",
  "devplans",
  "elections",
  "companies",
  "closures",
  "traffic",
  "buses",
  "stops",
  "waste",
  "trains",
  "ships",
  "aircraft",
  "satellites",
  "crossings",
  "places",
  "lora",
  "emf",
] as const;

export type MapLayerId = (typeof MAP_LAYER_IDS)[number];

export const DEFAULT_MAP_LAYERS: Record<MapLayerId, boolean> = {
  monitoring: false,
  warnings: false,
  landcover: false,
  floodrisk: false,
  census: false,
  nature: false,
  crops: false,
  floods: true,
  starkregen: false,
  charging: false,
  fuel: false,
  energy: false,
  road: false,
  wifi: false,
  broadband: false,
  boris: false,
  devplans: false,
  elections: false,
  companies: false,
  closures: true,
  traffic: true,
  buses: true,
  stops: false,
  waste: true,
  trains: true,
  ships: true,
  aircraft: true,
  satellites: false,
  crossings: true,
  places: false,
  lora: false,
  emf: false,
};

export const DEFAULT_MAP_CENTER: [number, number] = [49.62, 8.46];
export const DEFAULT_MAP_ZOOM = 12;
export const DEFAULT_MAP_MODE: MapMode = "category";

export interface MapSessionState {
  lat?: number;
  lng?: number;
  z?: number;
  mode?: MapMode;
  cats?: Category[];
  layers?: Record<MapLayerId, boolean>;
  node?: string;
  metric?: string;
}

export function parseMapSessionState(
  search: string | URLSearchParams
): Partial<MapSessionState> {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const result: Partial<MapSessionState> = {};

  // Center & Zoom
  const latStr = params.get("lat");
  const lngStr = params.get("lng");
  if (latStr !== null && lngStr !== null) {
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (!Number.isNaN(lat) && !Number.isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      result.lat = Math.round(lat * 100000) / 100000;
      result.lng = Math.round(lng * 100000) / 100000;
    }
  }

  const zStr = params.get("z") ?? params.get("zoom");
  if (zStr !== null) {
    const z = parseInt(zStr, 10);
    if (!Number.isNaN(z) && z >= 1 && z <= 19) {
      result.z = z;
    }
  }

  // Mode
  const modeStr = params.get("mode") ?? params.get("darstellung");
  if (modeStr === "category" || modeStr === "temperature") {
    result.mode = modeStr;
  }

  // Categories
  const catsStr = params.get("cats") ?? params.get("categories");
  if (catsStr !== null) {
    if (catsStr === "all") {
      result.cats = [...CATEGORY_IDS];
    } else {
      const parsed = catsStr
        .split(",")
        .map((c) => c.trim() as Category)
        .filter((c) => CATEGORY_IDS.includes(c));
      result.cats = parsed;
    }
  }

  // Layers
  const layersStr = params.get("layers");
  if (layersStr !== null) {
    const layers: Record<MapLayerId, boolean> = { ...DEFAULT_MAP_LAYERS };
    const isDelta =
      layersStr.startsWith("+") ||
      layersStr.startsWith("-") ||
      layersStr.startsWith(" ") ||
      layersStr.includes(",+") ||
      layersStr.includes(",-") ||
      layersStr.includes(", ");
    if (isDelta) {
      // Delta mode: e.g. +broadband,-buses (note: '+' is decoded as ' ' in query strings)
      const parts = layersStr.split(",");
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const sign = trimmed[0] === "-" ? "-" : "+";
        const id = (trimmed.startsWith("+") || trimmed.startsWith("-")
          ? trimmed.slice(1)
          : trimmed
        ).trim() as MapLayerId;
        if (MAP_LAYER_IDS.includes(id)) {
          layers[id] = sign === "+";
        }
      }
    } else {
      // Explicit active layers list
      const activeIds = new Set(
        layersStr
          .split(",")
          .map((l) => l.trim() as MapLayerId)
          .filter((l) => MAP_LAYER_IDS.includes(l))
      );
      for (const id of MAP_LAYER_IDS) {
        layers[id] = activeIds.has(id);
      }
    }
    result.layers = layers;
  }

  // Selected node
  const nodeStr = params.get("node") ?? params.get("sensor") ?? params.get("station");
  if (nodeStr) {
    result.node = nodeStr.trim();
  }

  // Metric
  const metricStr = params.get("metric");
  if (metricStr) {
    result.metric = metricStr.trim();
  }

  return result;
}

export function areLayersEqual(
  a: Record<MapLayerId, boolean>,
  b: Record<MapLayerId, boolean>
): boolean {
  for (const id of MAP_LAYER_IDS) {
    if (!!a[id] !== !!b[id]) return false;
  }
  return true;
}

export function serializeMapSessionState(
  state: MapSessionState,
  options: { includeDefaults?: boolean } = {}
): string {
  const params = new URLSearchParams();
  const includeDefaults = options.includeDefaults ?? false;

  // Center
  if (state.lat !== undefined && state.lng !== undefined) {
    const isDefaultCenter =
      Math.abs(state.lat - DEFAULT_MAP_CENTER[0]) < 0.0001 &&
      Math.abs(state.lng - DEFAULT_MAP_CENTER[1]) < 0.0001;
    if (includeDefaults || !isDefaultCenter) {
      params.set("lat", (Math.round(state.lat * 10000) / 10000).toFixed(4));
      params.set("lng", (Math.round(state.lng * 10000) / 10000).toFixed(4));
    }
  }

  // Zoom
  if (state.z !== undefined) {
    if (includeDefaults || state.z !== DEFAULT_MAP_ZOOM) {
      params.set("z", state.z.toString());
    }
  }

  // Mode
  if (state.mode && (includeDefaults || state.mode !== DEFAULT_MAP_MODE)) {
    params.set("mode", state.mode);
  }

  // Categories
  if (state.cats) {
    const isAll =
      state.cats.length === CATEGORY_IDS.length &&
      CATEGORY_IDS.every((c) => state.cats!.includes(c));
    if (includeDefaults || !isAll) {
      params.set("cats", isAll ? "all" : state.cats.join(","));
    }
  }

  // Layers
  if (state.layers) {
    if (!includeDefaults && areLayersEqual(state.layers, DEFAULT_MAP_LAYERS)) {
      // omit layers if matches default
    } else {
      const active = MAP_LAYER_IDS.filter((id) => state.layers![id]);
      params.set("layers", active.join(","));
    }
  }

  // Node
  if (state.node) {
    params.set("node", state.node);
  }

  // Metric
  if (state.metric) {
    params.set("metric", state.metric);
  }

  return params.toString();
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function updateUrlDebounced(
  queryString: string,
  pushHistory = false,
  delayMs = 300
) {
  if (typeof window === "undefined") return;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  const apply = () => {
    const newRelativePathQuery =
      window.location.pathname + (queryString ? `?${queryString}` : "");
    if (window.location.search === (queryString ? `?${queryString}` : "")) {
      return;
    }
    if (pushHistory) {
      window.history.pushState(null, "", newRelativePathQuery);
    } else {
      window.history.replaceState(null, "", newRelativePathQuery);
    }
  };

  if (delayMs <= 0) {
    apply();
  } else {
    debounceTimer = setTimeout(apply, delayMs);
  }
}

export function parseSubpageParams(
  search: string | URLSearchParams,
  defaults: Record<string, string>
): Record<string, string> {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const result: Record<string, string> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const val = params.get(key);
    if (val !== null && val.trim() !== "") {
      result[key] = val.trim();
    }
  }
  return result;
}

export function serializeSubpageParams(
  params: Record<string, string | number | undefined>,
  defaults: Record<string, string | number | undefined> = {}
): string {
  const sp = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val === undefined || val === null || val === "") continue;
    const strVal = String(val);
    const defaultVal = defaults[key] !== undefined ? String(defaults[key]) : undefined;
    if (defaultVal === undefined || strVal !== defaultVal) {
      sp.set(key, strVal);
    }
  }
  return sp.toString();
}
