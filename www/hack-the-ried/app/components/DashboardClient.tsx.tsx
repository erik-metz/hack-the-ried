"use client";

import { Check, RefreshCw, Share2, Zap } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CATEGORIES, CATEGORY_IDS, DEFAULT_MAP_CATEGORIES, parseStoredCategories, visibleNodes, categoriesForMode, hasCoordinates, type Category, type MapMode, type StationNode, type SensorNode } from "@/lib/mapData";
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_LAYERS,
  DEFAULT_MAP_ZOOM,
  type MapLayerId,
  parseMapSessionState,
  serializeMapSessionState,
  updateUrlDebounced,
} from "@/lib/urlState";
import TelemetryCharts from "./TelemetryCharts";
import MapDarstellungBar from "./MapDarstellungBar";

const MapComponent = dynamic(() => import("./MapComponent"), {
  ssr: false,
  loading: () => <div className="h-[480px] sm:h-[560px] rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400"><RefreshCw className="size-5 animate-spin mr-2" /> Karte wird geladen…</div>,
});
const STORAGE_KEY = "ried-map-categories-v2";
const DEFAULT_SELECTION = JSON.stringify(DEFAULT_MAP_CATEGORIES);
let fallback = DEFAULT_SELECTION;
function preferences() { try { return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_SELECTION; } catch { return fallback; } }
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("ried-map-filter", listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener("ried-map-filter", listener); };
}
function saveCategories(categories: Category[]) {
  fallback = JSON.stringify(categories);
  try { localStorage.setItem(STORAGE_KEY, fallback); } catch { /* Session filters still work when storage is blocked. */ }
  window.dispatchEvent(new Event("ried-map-filter"));
}

type Props = { nodes: StationNode[]; loadFailed?: boolean; readingsAvailable?: boolean; showIntro?: boolean };
export default function DashboardClient({ nodes: initialNodes, loadFailed = false, readingsAvailable = true, showIntro = true }: Props) {
  const [data, setData] = useState({ nodes: initialNodes, readingsAvailable });
  const [updateFailed, setUpdateFailed] = useState(loadFailed);
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState<MapMode>("category");
  const [mobility, setMobility] = useState<StationNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [layers, setLayers] = useState<Record<MapLayerId, boolean>>(DEFAULT_MAP_LAYERS);
  const [viewport, setViewport] = useState<{ lat: number; lng: number; z: number }>({
    lat: DEFAULT_MAP_CENTER[0],
    lng: DEFAULT_MAP_CENTER[1],
    z: DEFAULT_MAP_ZOOM,
  });
  const [selectedMetric, setSelectedMetric] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isLayersDrawerOpen, setIsLayersDrawerOpen] = useState(false);
  const [activeClosuresCount, setActiveClosuresCount] = useState(0);
  const [satelliteMode, setSatelliteMode] = useState<"none" | "rgb" | "ndvi" | "ecostress" | "firms">("none");

  const stored = useSyncExternalStore(subscribe, preferences, () => DEFAULT_SELECTION);
  const categories = useMemo(() => parseStoredCategories(stored), [stored]);
  const nodes = data.nodes;
  const filtered = useMemo(() => visibleNodes(nodes, categories, mode), [nodes, categories, mode]);
  const mapNodes = useMemo(
    () =>
      filtered.filter(
        (n): n is SensorNode =>
          hasCoordinates(n) &&
          n.lat >= 49.55 &&
          n.lat <= 49.80 &&
          n.lng >= 8.30 &&
          n.lng <= 8.65
      ),
    [filtered]
  );
  const chartNodes = [...nodes, ...mobility];
  const selected = chartNodes.find(n => n.id === selectedNodeId);
  const chartNode = selected ?? filtered[0] ?? nodes[0];
  const counts = useMemo(() => Object.fromEntries(CATEGORY_IDS.map(c => [c, nodes.filter(n => n.categories.includes(c)).length])) as Record<Category, number>, [nodes]);

  // Initial read from URL query parameters
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlState = parseMapSessionState(window.location.search);
    if (urlState.mode) setMode(urlState.mode);
    if (urlState.cats) saveCategories(urlState.cats);
    if (urlState.node) setSelectedNodeId(urlState.node);
    if (urlState.layers) setLayers(urlState.layers);
    if (urlState.lat !== undefined && urlState.lng !== undefined) {
      setViewport({
        lat: urlState.lat,
        lng: urlState.lng,
        z: urlState.z ?? DEFAULT_MAP_ZOOM,
      });
    } else if (urlState.z !== undefined) {
      setViewport((prev) => ({ ...prev, z: urlState.z! }));
    }
    if (urlState.metric) setSelectedMetric(urlState.metric);
    setMounted(true);
  }, []);

  // Listen to browser forward/backward navigation
  useEffect(() => {
    const onPopState = () => {
      const urlState = parseMapSessionState(window.location.search);
      if (urlState.mode) setMode(urlState.mode);
      if (urlState.cats) saveCategories(urlState.cats);
      setSelectedNodeId(urlState.node);
      if (urlState.layers) setLayers(urlState.layers);
      if (urlState.lat !== undefined && urlState.lng !== undefined) {
        setViewport({
          lat: urlState.lat,
          lng: urlState.lng,
          z: urlState.z ?? DEFAULT_MAP_ZOOM,
        });
      }
      if (urlState.metric !== undefined) setSelectedMetric(urlState.metric);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Sync state to URL (debounced)
  useEffect(() => {
    if (!mounted) return;
    const query = serializeMapSessionState({
      lat: viewport.lat,
      lng: viewport.lng,
      z: viewport.z,
      mode,
      cats: categories,
      layers,
      node: selectedNodeId,
      metric: selectedMetric,
    });
    updateUrlDebounced(query);
  }, [mounted, viewport, mode, categories, layers, selectedNodeId, selectedMetric]);

  const handleShare = () => {
    if (typeof window === "undefined") return;
    const query = serializeMapSessionState(
      {
        lat: viewport.lat,
        lng: viewport.lng,
        z: viewport.z,
        mode,
        cats: categories,
        layers,
        node: selectedNodeId,
        metric: selectedMetric,
      },
      { includeDefaults: false }
    );
    const url = `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ""}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch("/api/map-sensors", { signal: controller.signal });
        if (!response.ok) throw new Error("Map unavailable");
        const updated: { nodes: StationNode[]; readingsAvailable: boolean } = await response.json();
        if (!controller.signal.aborted) { setData(updated); setUpdateFailed(false); }
      } catch { if (!controller.signal.aborted) setUpdateFailed(true); }
      finally {
        if (!controller.signal.aborted) { setNow(Date.now()); timer = setTimeout(refresh, 60_000); }
      }
    }
    timer = setTimeout(refresh, loadFailed ? 0 : 60_000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [loadFailed]);

  const reset = () => {
    saveCategories(DEFAULT_MAP_CATEGORIES);
    setMode("category");
    setSelectedNodeId(undefined);
    setLayers(DEFAULT_MAP_LAYERS);
    setViewport({ lat: DEFAULT_MAP_CENTER[0], lng: DEFAULT_MAP_CENTER[1], z: DEFAULT_MAP_ZOOM });
    setSelectedMetric(undefined);
  };

  return <>
    {showIntro && <div className="border-b border-slate-800 pb-4">
      <div className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-1"><Zap className="size-4" /> Regional-Dashboard</div>
      <h2 className="text-2xl sm:text-3xl font-bold">Interaktive Karte &amp; Messdaten aus dem Hessischen Ried</h2>
      <p className="mt-2 text-sm text-slate-400">Entdecke die Region nach Themen: Filtere Sensorstationen, aktiviere Kartenebenen für ÖPNV-Busse, Straßensperrungen, Bahnübergänge, ZAKB-Touren oder Unternehmen und teile individuelle Ansichten per Link.</p>
    </div>}
    {updateFailed ? <p role="alert" className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-3 text-sm text-amber-200">Die Kartendaten konnten nicht aktualisiert werden. {nodes.length ? "Zuletzt geladene Standorte bleiben sichtbar." : "Bitte versuche es später erneut."}</p> : null}
    {!data.readingsAvailable ? <p role="status" className="text-sm text-amber-200">Messwerte sind derzeit nicht verfügbar. Du kannst die Standorte auf der Karte erkunden.</p> : null}
    <div className="space-y-4">
      <MapDarstellungBar
        actions={<div className="flex justify-end">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300 hover:border-emerald-500 hover:text-emerald-300 transition-colors"
              title="Aktuelle Kartenansicht, Filter und Ebenen als teilbaren Link kopieren"
            >
              {copied ? (
                <>
                  <Check className="size-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">Link kopiert!</span>
                </>
              ) : (
                <>
                  <Share2 className="size-3.5 text-slate-400" />
                  <span>Ansicht teilen</span>
                </>
              )}
            </button>
            <button type="button" onClick={reset} className="text-xs text-slate-400 underline underline-offset-4 hover:text-white">Zurücksetzen</button>
          </div>
        </div>

      </div>}
        sensorCategories={categories}
        onSensorCategoriesChange={saveCategories}
        sensorCounts={counts}
        mode={mode}
        onModeChange={nextMode => {
          const nextCategories = categoriesForMode(nodes.filter(n => hasCoordinates(n) && n.lat >= 49.55 && n.lat <= 49.80 && n.lng >= 8.30 && n.lng <= 8.65), categories, nextMode);
          if (nextCategories !== categories) saveCategories(nextCategories);
          setMode(nextMode);
        }}
        satelliteMode={satelliteMode}
        onSatelliteModeChange={setSatelliteMode}
        layers={layers}
        onLayerToggle={(layerId, enabled) =>
          setLayers((prev) => ({ ...prev, [layerId]: enabled }))
        }
        onSetLayers={setLayers}
        readingsAvailable={data.readingsAvailable}
        activeClosuresCount={activeClosuresCount}
        isOpen={isLayersDrawerOpen}
        onToggleOpen={() => setIsLayersDrawerOpen((prev) => !prev)}
        filteredCount={filtered.length}
        totalCount={nodes.length}
        zoom={viewport.z}
      />

      <div id="ried-map">
      <MapComponent
        legend={<>
      {filtered.length > mapNodes.length && <p className="text-xs text-slate-400">{filtered.length - mapNodes.length} Stationen außerhalb des Ried-Kartenbereichs oder ohne Position sind unter „Messwerte & Zeitverlauf“ auswählbar.</p>}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400" aria-label="Kartenlegende">
        {mode === "temperature" ? <>
          <div className="flex items-center gap-2">
            <span>&lt; 0 °C</span>
            <span className="h-2.5 w-28 sm:w-36 rounded-full border border-slate-700 shadow-inner inline-block" style={{ background: "linear-gradient(to right, #818cf8, #38bdf8, #2dd4bf, #fbbf24, #fb7185)" }} />
            <span>≥ 30 °C</span>
          </div>
          <span>Flächige Temperatur-Interpolation</span>
          <span>Punkte = Stationen (Klick / Hover für Details)</span>
        </> : <>
          <span>Symbol & Farbe = Thema · Gruppen zeigen dasselbe Sensorthema</span>
          <span>Zahl am Symbol = Standorte</span>
        </>}
        <span>Blasse Stationspunkte = älterer Messwert oder keine Daten</span>
      </div>

      <p className="text-xs text-slate-500">Messwerte erscheinen beim Hineinzoomen. Parkplatzwerte zeigen den zuletzt gemeldeten Zustand, keinen Online-Status.</p>
        </>}
        nodes={mapNodes}
        categories={categories}
        mode={mode}
        now={now}
        selectedNodeId={selected?.id}
        onSelectNode={setSelectedNodeId}
        onSelectFuel={(id, fuel) => { setSelectedNodeId(id); setSelectedMetric(JSON.stringify([`fuel_${fuel}`, "€/l"])); }}
        onMobilityNodesChange={incoming => setMobility(previous => {
          const selected = previous.find(n => n.id === selectedNodeId);
          return selected && !incoming.some(n => n.id === selected.id) ? [...incoming, { ...selected, readings: [] }] : incoming;
        })}
        initialCenter={[viewport.lat, viewport.lng]}
        initialZoom={viewport.z}
        layers={layers}
        satelliteMode={satelliteMode}
        onViewportChange={(center, zoom) =>
          setViewport({ lat: center[0], lng: center[1], z: zoom })
        }
        onLayerToggle={(layerId, enabled) =>
          setLayers((prev) => ({ ...prev, [layerId]: enabled }))
        }
        onOpenLayersDrawer={() => {
          setIsLayersDrawerOpen(true);
          document.getElementById("darstellung-control-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }}
        onActiveClosuresCountChange={setActiveClosuresCount}
      />
      </div>

    </div>
    {chartNode ? (
      <TelemetryCharts
        key={chartNode.id}
        node={chartNode}
        nodes={chartNodes}
        onSelectNode={setSelectedNodeId}
        selectedMetric={selectedMetric}
        onSelectMetric={setSelectedMetric}
      />
    ) : (
      <p className="text-sm text-slate-400">Keine Station in dieser Auswahl. Wähle weitere Themen oder setze die Filter zurück.</p>
    )}
  </>;
}
