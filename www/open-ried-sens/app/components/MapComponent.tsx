"use client";

import L from "leaflet";
import { corridorLabel, trafficFeatureVisible } from "@/lib/trafficPresentation";
import { updateMarkerDialogs } from "@/lib/mapDialogs";
import MapContextLayer from "./MapContextLayer";
import MapSupplementaryLayer from "./MapSupplementaryLayer";
import MapRestAreaLayer from "./MapRestAreaLayer";
import MapFuelLayer from "./MapFuelLayer";
import MapEarthObservationLayer from "./MapEarthObservationLayer";
import MapSatelliteLayer from "./MapSatelliteLayer";
import { metricLabel } from "@/lib/telemetryData";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { createMarkerContent, createTempPinContent, createLevelCrossingMarkerContent } from "@/lib/mapMarker";
import "./map.css";
import { motionPoint, nextMotion, MOVEMENT_POLL_MS, type MarkerMotion } from "@/lib/mapMotion";
import { detailCard, featureCard, featureKind, mapSymbol, placeMarker } from "@/lib/mapPresentation";
import { aircraftMarker, aircraftStyle } from "@/lib/aircraftPresentation";
import AircraftLegend from "./AircraftLegend";
import { useEffect, useRef, useState } from "react";
import type { GeoJsonObject } from "geojson";
import { CATEGORIES, markerCategory, readingFreshness, primaryReading, valueLabel, observationLabel, temperatureColor, type Category, type MapMode, type SensorNode, type StationNode } from "@/lib/mapData";
import { TemperatureHeatmapLayer } from "@/lib/temperatureHeatmap";
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, DEFAULT_MAP_LAYERS, type MapLayerId } from "@/lib/urlState";
import { LAYER_MIN_ZOOM, isLayerZoomRestricted } from "@/lib/mapPresets";

import { updateAircraftTrail, type TrailPoint } from "@/lib/aircraftTrail";
import { crossingSites, crossingLabel, mobilityNodes, type Position, type Crossing } from "@/lib/mobilityData";

export type { SensorNode } from "@/lib/mapData";
interface MapProps {
  legend?: import("react").ReactNode;
  nodes: SensorNode[];
  selectedNodeId: string | undefined;
  onSelectNode: (id: string) => void;
  onSelectFuel?: (id: string, fuel: import("@/lib/fuelData").Fuel) => void;
  onMobilityNodesChange?: (nodes: StationNode[]) => void;
  categories: Category[];
  mode: MapMode;
  now: number;
  initialCenter?: [number, number];
  initialZoom?: number;
  layers?: Record<MapLayerId, boolean>;
  onViewportChange?: (center: [number, number], zoom: number) => void;
  onLayerToggle?: (layerId: MapLayerId, enabled: boolean) => void;
  onOpenLayersDrawer?: () => void;
  onActiveClosuresCountChange?: (count: number) => void;
  satelliteMode?: "none" | "rgb" | "ndvi" | "ecostress" | "firms";
  satelliteSceneId?: string;
}
interface LayerPublication {
  layers: Partial<Record<MapLayerId, GeoJsonObject>>;
  unavailable: string[];
}

function textPopup(lines: string[]) {
  return detailCard(lines[0] ?? "Details", lines[1] ?? "", lines.slice(2));
}

export default function MapComponent(props: MapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const crossingGroup = useRef<L.LayerGroup | null>(null);
  const crossingStates = useRef(new WeakMap<L.Marker, Crossing["status"]>());
  const crossingClustered = useRef(false);
  const crossingMarkers = useRef(new Map<string, L.Marker>());
  const vehicleGroups = useRef(new Map<Position["kind"], L.LayerGroup>());
  const vehicleMotions = useRef(new Map<string, MarkerMotion>());
  const vehicleIcons = useRef(new Map<string, string>());
  const vehicleMarkers = useRef(new Map<string, L.Marker>());
  const callbacks = useRef(props);
  useEffect(() => { callbacks.current = props; });
  const [zoom, setZoom] = useState(props.initialZoom ?? DEFAULT_MAP_ZOOM);
  const [ready, setReady] = useState(false);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [clusteringReady, setClusteringReady] = useState(false);
  const clusterVehicles = clusteringReady && zoom < 16;
  const freshnessMinute = Math.floor(props.now / 60000);
  const hasFreshTemperature = props.nodes.some(node => readingFreshness(primaryReading(node, markerCategory(node, props.categories), "temperature"), freshnessMinute * 60000) === "fresh");
  useEffect(() => {
    let active = true;
    (window as typeof window & { L: typeof L }).L = L;
    void import("leaflet.markercluster").then(() => { if (active) setClusteringReady(true); });
    return () => { active = false; };
  }, []);
  const [crossings, setCrossings] = useState<Crossing[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [publication, setPublication] = useState<LayerPublication>({ layers: {}, unavailable: [] });
  const [movementFailed, setMovementFailed] = useState(false);
  const [aircraftSource, setAircraftSource] = useState<{ status: string; last_contact?: string } | null>(null);
  const [ognSource, setOgnSource] = useState<{ status: string; last_contact?: string } | null>(null);
  const aircraftTrails = useRef(new Map<string, TrailPoint[]>());
  const aircraftTrailLayers = useRef(new Map<string, L.Polyline>());
  const [shipSource, setShipSource] = useState<{ status: string; last_contact?: string } | null>(null);
  const [layersFailed, setLayersFailed] = useState(false);
  const [tilesMissing, setTilesMissing] = useState(false);
  const [loraTilesFailed, setLoraTilesFailed] = useState(false);
  const layers = props.layers ?? DEFAULT_MAP_LAYERS;

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, {
      center: callbacks.current.initialCenter ?? DEFAULT_MAP_CENTER,
      zoom: callbacks.current.initialZoom ?? DEFAULT_MAP_ZOOM,
      minZoom: 8,
      maxBounds: [[49.45, 8.15], [49.90, 8.80]],
      maxBoundsViscosity: 0.8,
    });
    map.current = instance;
    setMapInstance(instance);
    const resize = new ResizeObserver(() => instance.invalidateSize({ pan: false }));
    resize.observe(container.current);
    const base = L.tileLayer("/api/map-tiles/base/{z}/{x}/{y}.png", {
      maxZoom: 19, maxNativeZoom: 14, minZoom: 8, bounds: [[49.55, 8.30], [49.80, 8.65]],
      attribution: '© <a href="https://www.bkg.bund.de">BKG</a> · <a href="https://www.govdata.de/dl-de/by-2-0">dl-de/by-2-0</a> · <a href="https://sgx.geodatenzentrum.de/web_public/Datenquellen_TopPlus_Open.pdf">Datenquellen</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a>',
    }).addTo(instance);
    base.on("tileerror", () => setTilesMissing(true));
    instance.on("moveend", () => {
      const center = instance.getCenter();
      callbacks.current.onViewportChange?.([center.lat, center.lng], instance.getZoom());
    });
    instance.on("zoomend", () => setZoom(instance.getZoom()));
    setReady(true);
    return () => { resize.disconnect(); instance.remove(); map.current = null; };
  }, []);

  // One batch for all vehicles, no browser simulator and no per-vehicle requests.
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let streaming = false;
    let lastEvent = 0;
    const stream = new EventSource("/api/mobility/stream");
    const accept = (body: { positions: Position[]; crossings?: Crossing[]; ship_source?: { status: string; last_contact?: string }; aircraft_source?: { status: string; last_contact?: string }; ogn_source?: { status: string; last_contact?: string } }) => {
      if (!Array.isArray(body.positions)) throw new Error("Invalid response");
      setPositions(body.positions); setCrossings(body.crossings ?? []); setShipSource(body.ship_source ?? null); setAircraftSource(body.aircraft_source ?? null); setMovementFailed(false);
      setOgnSource(body.ogn_source ?? null);
    };
    stream.onmessage = event => {
      try { accept(JSON.parse(event.data)); streaming = true; lastEvent = Date.now(); } catch { streaming = false; }
    };
    stream.onerror = () => { streaming = false; };
    async function poll() {
      if (!document.hidden && (!streaming || Date.now() - lastEvent > 25000)) {
        try {
          const response = await fetch("/api/mobility", { signal: controller.signal });
          if (!response.ok) throw new Error("Unavailable");
          const body = await response.json();
          if (!Array.isArray(body.positions)) throw new Error("Invalid response");
          if (!controller.signal.aborted) accept(body);
        } catch {
          if (!controller.signal.aborted) { setPositions([]); setCrossings([]); setShipSource(null); setAircraftSource(null); setMovementFailed(true); }
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, MOVEMENT_POLL_MS);
    }
    void poll();
    return () => { stream.close(); controller.abort(); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (!document.hidden) {
        try {
          const response = await fetch("/api/map-layers", { signal: controller.signal });
          if (!response.ok) throw new Error("Unavailable");
          const body = await response.json();
          if (!body.layers || !Array.isArray(body.unavailable)) throw new Error("Invalid response");
          if (!controller.signal.aborted) { setPublication(body); setLayersFailed(false); }
        } catch {
          if (!controller.signal.aborted) { setPublication({ layers: {}, unavailable: [] }); setLayersFailed(true); }
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 60000);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    const group = L.layerGroup().addTo(instance);
    // Keep rare categories visible instead of swallowing them in large soil clusters.
    const categoryGroups = new Map<Category, L.LayerGroup>();
    function groupFor(category: Category) {
      let target = categoryGroups.get(category);
      if (!target) {
        target = clusteringReady && props.mode !== "temperature" ? L.markerClusterGroup({
          maxClusterRadius: 65, disableClusteringAtZoom: 16, showCoverageOnHover: false,
          iconCreateFunction: item => L.divIcon({
            html: createMarkerContent(category, CATEGORIES[category].color, false, `${item.getChildCount()} ${CATEGORIES[category].label}`),
            className: "map-sensor-icon", iconSize: [32, 32],
          }),
        }).addTo(group) : group;
        categoryGroups.set(category, target);
      }
      return target;
    }
    const points: { lat: number; lng: number; temp: number }[] = [];
    for (const node of props.nodes) {
      if (node.id.startsWith("fuel-")) continue;
      const category = markerCategory(node, props.categories);
      if (!category || !props.categories.includes(category)) continue;
      const reading = primaryReading(node, category, props.mode);
      const freshness = readingFreshness(reading, freshnessMinute * 60000);
      const fresh = freshness === "fresh";
      const muted = freshness === "stale" || freshness === "unknown";
      if (props.mode === "temperature") {
        if (!reading) continue;
        if (fresh) points.push({ lat: node.lat, lng: node.lng, temp: reading.value });
      }
      const color = props.mode === "temperature" && reading ? (muted ? "#94a3b8" : temperatureColor(reading.value)) : CATEGORIES[category].color;
      const label = zoom >= (props.mode === "temperature" ? 15 : 16) ? valueLabel(reading, node.readings) : "";
      const marker = L.marker([node.lat, node.lng], {
        title: node.name, alt: node.name, keyboard: true,
        ...{ categoryColor: CATEGORIES[category].color },
        icon: L.divIcon({ html: props.mode === "temperature" ? createTempPinContent(color, muted, label) : createMarkerContent(category, color, muted, label),
          className: `map-sensor-icon${node.id === props.selectedNodeId ? " map-sensor-selected" : ""}`,
          iconSize: props.mode === "temperature" ? [14,14] : [32,32], iconAnchor: props.mode === "temperature" ? [7,7] : [16,16], popupAnchor: [0,-18] }),
      }).addTo(groupFor(category));
      marker.bindTooltip(textPopup([node.name, ...(reading ? [valueLabel(reading, node.readings)] : ["Keine Messwerte"])]));
      marker.bindPopup(detailCard(node.name, node.categories.map(id => CATEGORIES[id].label).join(" · "), [
        ...(node.address ? [node.address] : []),
        ...(node.firmwareVersion ? [`Firmwareversion: ${node.firmwareVersion}`] : []),
        ...node.readings.map(item => `${metricLabel(item)}: ${valueLabel(item, node.readings)} · ${observationLabel(item, freshnessMinute * 60000)}`),
        ...(!node.readings.length ? ["Keine Messwerte verfügbar."] : []),
      ]), { maxHeight: 260, maxWidth: 260, autoPanPadding: L.point(20, 40) });
      marker.on("click", () => callbacks.current.onSelectNode(node.id));
      if (node.id === props.selectedNodeId) marker.openPopup();
    }
    const heatmap = props.mode === "temperature" ? new TemperatureHeatmapLayer().addTo(instance) : null;
    heatmap?.setPoints(points);
    return () => { group.remove(); heatmap?.remove(); };
  }, [ready, clusteringReady, props.nodes, props.categories, props.mode, props.selectedNodeId, freshnessMinute, zoom]);

  useEffect(() => {
    if (!ready || !map.current) return;
    // Overview clusters are separate for each vehicle category. At close zoom,
    // stable layers preserve smooth movement and open dialogs.
    const groups = vehicleGroups.current;
    for (const kind of ["bus", "train", "ship", "aircraft", "waste"] as const) {
      const group = clusterVehicles ? L.markerClusterGroup({
        maxClusterRadius: 65, disableClusteringAtZoom: 16, showCoverageOnHover: false,
        iconCreateFunction: cluster => L.divIcon({
          html: placeMarker(kind, String(cluster.getChildCount())),
          className: "map-vehicle-icon", iconSize: [36, 36], iconAnchor: [18, 18],
        }),
      }) : L.layerGroup();
      group.addTo(map.current);
      groups.set(kind, group);
    }
    const markers = vehicleMarkers.current;
    const motions = vehicleMotions.current;
    const icons = vehicleIcons.current;
    const trailLayers = aircraftTrailLayers.current;
    const trails = aircraftTrails.current;
    return () => {
      for (const group of groups.values()) group.remove();
      groups.clear(); markers.clear(); motions.clear(); icons.clear();
      for (const line of trailLayers.values()) line.remove();
      trailLayers.clear(); trails.clear();
    };
  }, [ready, clusterVehicles]);

  // Retain marker instances and open dialogs across backend snapshots.
  // Animate received coordinates or explicitly labelled backend display estimates.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    const retained = new Set<string>();
    const motions = vehicleMotions.current;
    const icons = vehicleIcons.current;
    const receivedAt = performance.now();
    for (const position of positions) {
      const layerId = position.kind === "bus" ? "buses" : position.kind === "train" ? "trains" : position.kind === "ship" ? "ships" : position.kind === "aircraft" ? "aircraft" : "waste";
      const enabled = layers[layerId];
      if (!enabled || !(Date.parse(position.valid_until) > Date.now()) ||
          !Number.isFinite(Date.parse(position.timestamp)) || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) continue;
      const key = `${position.kind}:${position.id}`;
      retained.add(key);
      const predicted = position.basis === "schedule_prediction";
      const style = position.kind === "aircraft" ? aircraftStyle(position) : mapSymbol(position.kind);
      const title = `${style.label} ${position.name ?? position.registration ?? position.line ?? ""}${position.destination ? ` → ${position.destination}` : ""}`.trim();
      const estimated = position.display_basis === "course_speed_estimate";
      const target = L.latLng(position.display_latitude ?? position.latitude, position.display_longitude ?? position.longitude);
      let marker = vehicleMarkers.current.get(key);
      const iconKey = `${position.kind}:${position.ogn_category ?? position.emitter_category ?? ""}:${position.name ?? position.registration ?? position.line ?? ""}:${predicted}:${position.heading_deg ?? position.course_deg ?? ""}`;
      const label = position.name || position.registration || position.line || style.label;
      const icon = () => L.divIcon({ html: position.kind === "aircraft" ? aircraftMarker(position, label) : placeMarker(position.kind, label, predicted, position.heading_deg ?? position.course_deg),
        className: "map-vehicle-icon", iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -22] });
      if (!marker) {
        marker = L.marker(target, { icon: icon(), alt: title, keyboard: true, zIndexOffset: 500 }).addTo(vehicleGroups.current.get(position.kind) ?? instance);
        marker.on("click", () => callbacks.current.onSelectNode(`movement:${position.id}`));
        marker.on("keypress", (event: L.LeafletKeyboardEvent) => { if (event.originalEvent.key === "Enter") callbacks.current.onSelectNode(`movement:${position.id}`); });
        vehicleMarkers.current.set(key, marker);
      } else {
        if (icons.get(key) !== iconKey) marker.setIcon(icon());
      }
      icons.set(key, iconKey);
      marker.options.alt = title;
      marker.getElement()?.setAttribute("aria-label", title);
      motions.set(key, nextMotion(motions.get(key), target, Date.parse(position.display_timestamp ?? position.timestamp), receivedAt, estimated ? "ship_estimate" : position.kind === "aircraft" ? "aircraft" : position.kind === "ship"));
      if (position.kind === "aircraft") {
        const bounded = updateAircraftTrail(aircraftTrails.current.get(key) ?? [],
          { stamp: Date.parse(position.timestamp), lat: position.latitude, lng: position.longitude }, Date.now());
        aircraftTrails.current.set(key, bounded);
        let line = aircraftTrailLayers.current.get(key);
        if (!line) {
          line = L.polyline([], { color: style.color, weight: 2, opacity: .45, interactive: false }).addTo(instance);
          aircraftTrailLayers.current.set(key, line);
        }
        line.setLatLngs(bounded.map(p => L.latLng(p.lat, p.lng)));
      }
      const popup = detailCard(`${style.symbol} ${title}`, estimated ? "Geschätzte Position aus Kurs und Geschwindigkeit" : predicted ? "Fahrplanprognose · keine GPS-Messung" : "Beobachtete Position", [
        ...(position.kind === "waste" && predicted ? ["Modell aus Abfuhrtagen: Straßenstichprobe, angenommene Reihenfolge und Zeiten (07–17 Uhr). Kein identifiziertes Müllfahrzeug."] : []),
        ...(typeof position.speed_kmh === "number" ? [`${predicted ? "Modellierte Geschwindigkeit" : "Geschwindigkeit"}: ${Math.round(position.speed_kmh)} km/h`] : []),
        ...(position.delay_basis === "next_reported_stop_approximation" ? [`Gemeldete Haltestellenverspätung: ${Math.round((position.delay_seconds ?? 0) / 60)} Min. (auf die Fahrt angenähert)`] : []),
        ...(position.kind === "aircraft" ? [
          `Kategorie: ${style.label}`,
          `ICAO: ${position.icao24 ?? "unbekannt"} · Kennzeichen: ${position.registration ?? "unbekannt"}`,
          `Typ: ${position.aircraft_type ?? "unbekannt"} · Kurs: ${position.course_deg !== undefined ? `${Math.round(position.course_deg)}°` : "unbekannt"}`,
          ...(position.altitude_baro_m !== undefined ? [`Druckhöhe: ${Math.round(position.altitude_baro_m)} m (Standarddruck 1013,25 hPa; keine Höhe über Grund)`] : []),
          ...(position.altitude_geom_m !== undefined ? [`Geometrische Höhe: ${Math.round(position.altitude_geom_m)} m (WGS84; keine Höhe über Grund)`] : []),
          ...(position.vertical_rate_mps !== undefined ? [`Steigrate: ${position.vertical_rate_mps} m/s (barometrisch)`] : []),
          ...(position.altitude_ogn_m !== undefined ? [`Gemeldete Höhe: ${Math.round(position.altitude_ogn_m)} m (OGN; keine Höhe über Grund)`] : []),
          ...(position.vertical_rate_ogn_mps !== undefined ? [`Gemeldete Steigrate: ${position.vertical_rate_ogn_mps} m/s (OGN)`] : []),
          `Quelle: ${position.source_id === "ogn-ried" ? "Open Glider Network" : "adsb.lol"} · ODbL 1.0 · ${position.reception === "mlat" ? "Position durch Multilateration" : "empfangene Flugposition"}`,
          "Empfang kann lückenhaft sein; Segelflugzeuge sind nur teilweise erfasst. Flugspur zeigt empfangene Punkte, keine Flugroute.",
        ] : []),
        ...(position.kind === "ship" ? [
          `MMSI: ${position.mmsi ?? "unbekannt"}`,
          `Kurs: ${position.course_deg !== undefined ? `${position.course_deg}°` : "unbekannt"}`,
          ...(position.length_m && position.beam_m ? [`Abmessungen: ${position.length_m} × ${position.beam_m} m`] : []),
          position.source_id === "rhein-map" ? "Gemeldete AIS-Kartenposition · Empfang kann lückenhaft sein." : "Quelle: AISstream · gemeldete AIS-Position · Empfang kann lückenhaft sein.",
        ] : []),
        estimated ? "Geradlinige Schätzung ab letzter GPS-Meldung; maximal 5 Minuten / 1 km. Rheinbiegungen und Manöver werden nicht vorhergesagt." : "Darstellung geglättet zwischen empfangenen Positionen (leicht zeitversetzt).",
        `Stand: ${new Date(position.timestamp).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}`,
        ...(position.geometry_basis === "stop_to_stop" ? ["Geradlinige Näherung zwischen Haltestellen; keine Streckengeometrie verfügbar."] : []),
      ]);
      const tooltip = detailCard(title, estimated ? "Geschätzt · Kurs/Geschwindigkeit" : predicted ? "Prognose" : "Beobachtet", []);
      updateMarkerDialogs(marker, popup, tooltip, { maxHeight: 260, maxWidth: 260, autoPanPadding: L.point(20, 40) });
    }
    for (const [key, marker] of vehicleMarkers.current) {
      if (!retained.has(key)) { vehicleGroups.current.get(key.split(":")[0] as Position["kind"])?.removeLayer(marker); vehicleMarkers.current.delete(key); motions.delete(key); icons.delete(key); }
    }
    for (const [key, line] of aircraftTrailLayers.current) {
      if (!retained.has(key)) { line.remove(); aircraftTrailLayers.current.delete(key); aircraftTrails.current.delete(key); }
    }
    let frame = 0;
    let lastFrame = -Infinity;
    let lastClusterFrame = -Infinity;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    function animate(time: number) {
      if (document.hidden) return;
      if (time - lastFrame < 1000 / 30) { frame = requestAnimationFrame(animate); return; }
      lastFrame = time;
      let moving = false;
      const refreshClusters = time - lastClusterFrame >= 1000;
      const bounds = instance!.getBounds().pad(.1);
      for (const [key, motion] of motions) {
        const marker = vehicleMarkers.current.get(key);
        if (!marker) continue;
        const complete = reducedMotion.matches || time >= motion.startedAt + motion.duration;
        moving ||= !complete;
        // Clustered/offscreen markers need only coarse updates; visible vehicles get 30 fps.
        if (!complete && !refreshClusters && (clusterVehicles || !marker.getElement() || !bounds.contains(marker.getLatLng()))) continue;
        const point = complete ? motion.to : motionPoint(motion, time);
        if (!marker.getLatLng().equals(point)) marker.setLatLng(point);
      }
      if (refreshClusters) lastClusterFrame = time;
      if (moving) frame = requestAnimationFrame(animate);
    }
    function resume() { cancelAnimationFrame(frame); if (!document.hidden) frame = requestAnimationFrame(animate); }
    resume();
    document.addEventListener("visibilitychange", resume);
    reducedMotion.addEventListener("change", resume);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", resume);
      reducedMotion.removeEventListener("change", resume);
    };
  }, [ready, clusteringReady, clusterVehicles, positions, layers, zoom]);

  useEffect(() => {
    for (const position of positions) {
      if (!(Date.parse(position.valid_until) > props.now)) {
        const key = `${position.kind}:${position.id}`;
        const marker = vehicleMarkers.current.get(key);
        if (marker) vehicleGroups.current.get(position.kind)?.removeLayer(marker);
        vehicleMarkers.current.delete(key);
        vehicleMotions.current.delete(key);
        vehicleIcons.current.delete(key);
        aircraftTrailLayers.current.get(key)?.remove();
        aircraftTrailLayers.current.delete(key);
        aircraftTrails.current.delete(key);
      }
    }
  }, [positions, props.now]);

  const mobilityTick = Math.floor(props.now / 10000);
  useEffect(() => {
    const now = Date.now();
    const sites = crossingSites(publication.layers.crossings, crossings, now);
    callbacks.current.onMobilityNodesChange?.(mobilityNodes(positions, sites, now));
    const instance = map.current;
    if (!instance || !ready) return;
    if (crossingGroup.current && crossingClustered.current !== clusteringReady) {
      instance.removeLayer(crossingGroup.current); crossingGroup.current = null; crossingMarkers.current.clear();
    }
    if (!crossingGroup.current) {
      crossingClustered.current = clusteringReady;
      crossingGroup.current = clusteringReady ? L.markerClusterGroup({ maxClusterRadius: 65, disableClusteringAtZoom: 18, showCoverageOnHover: false,
        iconCreateFunction: cluster => {
          const states = cluster.getAllChildMarkers().map(marker => crossingStates.current.get(marker) ?? "unknown");
          const status = states.includes("closed") ? "closed" : states.includes("closing_soon") ? "closing_soon" : states.every(s => s === "open") ? "open" : "unknown";
          const content = createLevelCrossingMarkerContent({ name: `${states.length} Schranken`, street: "", status });
          const badge = content.querySelector(".crossing-marker-badge");
          if (badge) badge.textContent = `${states.length} Schranken · ${states.filter(s => s === status).length} ${crossingLabel(status).toLowerCase()}`;
          return L.divIcon({ html: content, className: "map-place-icon", iconSize: [34, 34] });
        },
      }).addTo(instance) : L.layerGroup().addTo(instance);
    }
    const retained = new Set<string>();
    if (layers.crossings) for (const site of sites) {
      retained.add(site.id);
      const title = `${site.name} · ${crossingLabel(site.status)} · Prognose`;
      const icon = L.divIcon({ html: createLevelCrossingMarkerContent({ name: site.name, street: "", status: site.status }),
        className: "map-place-icon", iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -20] });
      let marker = crossingMarkers.current.get(site.id);
      if (!marker) {
        marker = L.marker([site.latitude, site.longitude], { icon, title, alt: title, keyboard: true }).addTo(crossingGroup.current);
        marker.on("click", () => callbacks.current.onSelectNode(site.entity_id));
        marker.on("keypress", (event: L.LeafletKeyboardEvent) => { if (event.originalEvent.key === "Enter") callbacks.current.onSelectNode(site.entity_id); });
        crossingMarkers.current.set(site.id, marker);
      } else {
        if (crossingStates.current.get(marker) !== site.status || marker.options.title !== title) {
          const focused = marker.getElement() === document.activeElement;
          marker.options.title = title; marker.options.alt = title; marker.setIcon(icon);
          if (focused) marker.getElement()?.focus();
        }
        marker.setLatLng([site.latitude, site.longitude]);
      }
      crossingStates.current.set(marker, site.status);
      const popup = detailCard(site.name, `${crossingLabel(site.status)} · berechneter Zustand`, [
        "Fahrplanprognose aus Zugpositionen; keine gemessene Schrankenstellung.",
        ...(site.timestamp ? [`Stand: ${new Date(site.timestamp).toLocaleString("de-DE")}`] : []),
        "Anklicken zeigt den gespeicherten Zeitverlauf unter der Karte.",
      ]);
      if (marker.getPopup()) marker.setPopupContent(popup); else marker.bindPopup(popup);
    }
    for (const [id, marker] of crossingMarkers.current) if (!retained.has(id)) {
      crossingGroup.current.removeLayer(marker); crossingMarkers.current.delete(id);
    }
    if (clusteringReady && crossingGroup.current instanceof L.MarkerClusterGroup) crossingGroup.current.refreshClusters();
  }, [positions, crossings, publication, mobilityTick, layers.crossings, ready, clusteringReady]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    const group = L.layerGroup().addTo(instance);
    let closures = 0;
    const requests = new Set<AbortController>();
    for (const [id, geometry] of Object.entries(publication.layers)) {
      const layerId = id as MapLayerId;
      if (!layers[layerId] || id === "crossings" || id === "nature" || id === "charging") continue;
      const overview = zoom < LAYER_MIN_ZOOM[layerId];
      const pointGroups = new Map<string, L.LayerGroup>();
      function pointGroupFor(kind: string) {
        let target = pointGroups.get(kind);
        if (!target) {
          target = clusteringReady ? L.markerClusterGroup({ maxClusterRadius: 65, disableClusteringAtZoom: 16, showCoverageOnHover: false,
            iconCreateFunction: cluster => L.divIcon({ html: placeMarker(kind, String(cluster.getChildCount())), className: "map-place-icon", iconSize: [36, 36] }),
          }).addTo(group) : group;
          pointGroups.set(kind, target);
        }
        return target;
      }
      const vectorLayer = L.geoJSON(geometry as GeoJsonObject, {
        filter: feature => !["traffic", "closures"].includes(id) || trafficFeatureVisible(feature.properties ?? {}, "all"),
        style: (feature) => {
          if (id === "traffic") {
            const status = feature?.properties?.status;
            if (status === "congestion") return { color: "#ef4444", weight: 5, opacity: 0.9, dashArray: "8, 8" };
            if (status === "closure") return { color: "#b91c1c", weight: 5, opacity: 0.9, dashArray: "4, 6" };
            if (status === "sluggish") return { color: "#f59e0b", weight: 4.5, opacity: 0.85 };
            if (status === "unknown") return { color: "#94a3b8", weight: 3.5, opacity: 0.75 };
            if (status === "clear") return { color: "#10b981", weight: 3.5, opacity: 0.75 };
          }
          if (id === "closures") {
            const closureType = feature?.properties?.closure_type;
            const causeType = feature?.properties?.cause_type;
            if (closureType === "full" || (causeType === "closure" && feature?.properties?.closure_kind === "full")) return { color: "#ef4444", weight: 5, opacity: 0.9 };
            return { color: "#f59e0b", weight: 4.5, opacity: 0.85 };
          }
          return { color: mapSymbol(id).color, weight: 3, fillOpacity: .15 };
        },
        pointToLayer: (feature, latlng) => {
          const props = feature.properties ?? {};
          const markerTitle = id === "energy" && (!props.name || props.name === "Energieanlage" || props.name === "Ökostrom / Solaranlage")
            ? (props.facility_type ? `Solaranlage (${props.facility_type})` : "Private Solaranlage / Photovoltaik")
            : String(props.name ?? mapSymbol(id).label);
          return L.marker(latlng, {
            title: markerTitle,
            keyboard: true,
            icon: L.divIcon({ html: placeMarker(featureKind(id, props)), className: "map-place-icon", iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -20] }),
          });
        },
        onEachFeature: (feature, layer) => {
          if (overview && layer instanceof L.Polyline) layer.options.smoothFactor = 3;
          const values = feature.properties ?? {};
          if (id === "stops" && typeof values.stop_id === "string" && typeof values.source_id === "string") {
            layer.bindPopup(textPopup([String(values.name ?? "Haltestelle"), "Abfahrten werden geladen …"]));
            let pending: AbortController | undefined;
            layer.on("popupopen", async () => {
              pending?.abort();
              const controller = new AbortController();
              pending = controller;
              requests.add(controller);
              try {
                const response = await fetch(`/api/buses/stops/${encodeURIComponent(values.stop_id)}/departures?source=${encodeURIComponent(values.source_id)}`, { signal: controller.signal });
                if (!response.ok) throw new Error("Unavailable");
                const body = await response.json();
                if (!Array.isArray(body.departures)) throw new Error("Invalid departures");
                if (!controller.signal.aborted) layer.setPopupContent(textPopup([
                  String(values.name ?? "Haltestelle"), "Gespeicherter Fahrplan / gemeldete Verspätungen",
                  ...body.departures.map((departure: { line: string; destination: string; expected_at: string; delay_basis: string }) =>
                    `${new Date(departure.expected_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })} · ${departure.line} → ${departure.destination}${departure.delay_basis === "schedule_only" ? " (Fahrplan)" : " (Prognose)"}`),
                  ...(body.departures.length ? [] : ["Keine bevorstehenden Abfahrten im gespeicherten Fahrplan."]),
                ]));
              } catch {
                if (!controller.signal.aborted) layer.setPopupContent(textPopup([String(values.name ?? "Haltestelle"), "Abfahrten nicht verfügbar."]));
              } finally { requests.delete(controller); }
            });
            layer.on("popupclose", () => pending?.abort());
            return;
          }
          const displayName = id === "energy" && (!values.name || values.name === "Energieanlage" || values.name === "Ökostrom / Solaranlage")
            ? (typeof values.facility_type === "string"
                ? `Solaranlage (${values.facility_type})`
                : "Private Solaranlage / Photovoltaik")
            : String(values.name ?? values.title ?? mapSymbol(id).label);
          const displaySubtitle = id === "energy"
            ? "Kartierte Solaranlage · keine Live-Messung"
            : mapSymbol(id).label;
          layer.bindPopup(featureCard(id, values), { maxHeight: 260, maxWidth: 260, autoPanPadding: L.point(20, 40) });
          layer.bindTooltip(detailCard(displayName, displaySubtitle, []));
          if (id === "closures") {
            if (values.event_status !== "planned" && values.is_stale !== true) closures++;
            if (feature.geometry?.type === "LineString" && Array.isArray((feature.geometry as unknown as { coordinates?: unknown }).coordinates)) {
              const coords = (feature.geometry as unknown as { coordinates: [number, number][] }).coordinates;
              if (coords.length > 0) {
                const mid = coords[Math.floor(coords.length / 2)];
                const midMarker = L.marker([mid[1], mid[0]], {
                  title: String(values.name ?? mapSymbol(id).label),
                  icon: L.divIcon({
                    html: placeMarker(featureKind(id, values)),
                    className: "map-place-icon",
                    iconSize: [36, 36],
                    iconAnchor: [18, 18],
                    popupAnchor: [0, -20],
                  }),
                });
                midMarker.bindPopup(featureCard(id, values), { maxHeight: 260, maxWidth: 260, autoPanPadding: L.point(20, 40) });
                midMarker.bindTooltip(detailCard(String(values.name ?? values.title ?? mapSymbol(id).label), mapSymbol(id).label, []));
                pointGroupFor(featureKind(id, values)).addLayer(midMarker);
              }
            }
          }
        },
      });
      if (overview) vectorLayer.setStyle({ weight: 1.5, opacity: .65, fillOpacity: .06 });
      // Cluster points by their displayed category; retain lines and polygons.
      function addPublishedLayer(layer: L.Layer, inheritedKind = id) {
        const feature = (layer as L.Layer & { feature?: { properties?: Record<string, unknown> } }).feature;
        const kind = feature ? featureKind(id, feature.properties ?? {}) : inheritedKind;
        if (layer instanceof L.Marker) {
          pointGroupFor(kind).addLayer(layer);
        } else if (layer instanceof L.LayerGroup) layer.eachLayer(child => addPublishedLayer(child, kind));
        else group.addLayer(layer);
      }
      vectorLayer.eachLayer(layer => addPublishedLayer(layer));
    }
    const starkregenMinZoom = LAYER_MIN_ZOOM.starkregen ?? 12;
    if (layers.starkregen && zoom >= starkregenMinZoom) L.tileLayer("/api/map-tiles/rain/{z}/{x}/{y}.png", { opacity: .5 }).addTo(group);

    const loraMinZoom = LAYER_MIN_ZOOM.lora ?? 9;
    setLoraTilesFailed(false);
    if (layers.lora && zoom >= loraMinZoom) {
      const coverage = L.tileLayer("/api/map-tiles/lora/{z}/{x}/{y}.png", {
        opacity: 0.6,
        maxNativeZoom: 19,
        maxZoom: 20,
        zIndex: 12,
        attribution: '© <a href="https://ttnmapper.org" target="_blank" rel="noopener">TTN Mapper</a>',
      }).addTo(group);
      coverage.on("tileerror", () => setLoraTilesFailed(true));
    }

    callbacks.current.onActiveClosuresCountChange?.(closures);
    return () => { requests.forEach(controller => controller.abort()); group.remove(); };
  }, [ready, clusteringReady, publication, layers, zoom, props.satelliteMode, props.satelliteSceneId]);

  const trafficCorridors = (publication.layers.traffic && "features" in (publication.layers.traffic as unknown as { features?: unknown[] })
    ? ((publication.layers.traffic as unknown as { features: { properties?: { id?: string; road_name?: string; name?: string; status?: string; delay_minutes?: number | null; description?: string; kind?: string }; geometry?: { type: string; coordinates: [number, number][] } }[] }).features ?? [])
    : [])
    .filter(f => f.properties?.kind === "corridor" && trafficFeatureVisible(f.properties, "all"))
    .map(f => f.properties as { id: string; road_name: string; name: string; status: string; delay_minutes: number | null; description: string });

  const missing = publication.unavailable.filter(id => id !== "nature" && id !== "charging" && layers[id as MapLayerId]);
  return <div className="w-full space-y-3">
    <div ref={container} className="sensor-map h-[500px] w-full" aria-label="Karte mit aktuellen Quelldaten" />
    {layers.traffic && trafficCorridors.length > 0 && (
      <div className="flex flex-wrap items-center gap-2" aria-label="Verkehrsauslastung">
        <div className="commuter-corridor-bar">
          <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5 mr-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Auslastung:
          </span>
          {trafficCorridors.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`corridor-pill corridor-pill-${c.status}`}
              title={`${c.name}: ${c.description} – Klick zum Fokussieren`}
              onClick={() => {
                const feature = (publication.layers.traffic as { features?: { properties?: { id?: string }; geometry?: { type: string; coordinates: [number, number][] } }[] })?.features?.find((f) => f.properties?.id === c.id);
                if (feature?.geometry?.type === "LineString") {
                  const pts = feature.geometry.coordinates.map((p) => [p[1], p[0]] as [number, number]);
                  map.current?.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 14 });
                }
              }}
            >
              <span className="font-bold">{c.road_name}</span>
              <span>
                {corridorLabel(c.status, c.delay_minutes)}
              </span>
            </button>
          ))}
        </div>
      </div>
    )}
    <div className="space-y-2 text-xs text-slate-400" aria-label="Kartenlegende und Hinweise">
      {props.legend}
      {ready && mapInstance ? <>
        {props.categories.includes("parking") ? <MapRestAreaLayer map={mapInstance} nodes={props.nodes} /> : null}
        {layers.nature ? <MapSupplementaryLayer map={mapInstance} id="protected" /> : null}
        {layers.monitoring ? <MapSupplementaryLayer map={mapInstance} id="monitoring" /> : null}
        {layers.warnings ? <MapSupplementaryLayer map={mapInstance} id="warnings" /> : null}
        {layers.charging ? <MapSupplementaryLayer map={mapInstance} id="chargers" primary={publication.layers.charging} /> : null}
        {layers.landcover ? <MapContextLayer map={mapInstance} id="landcover" /> : null}
        {layers.floodrisk ? <MapContextLayer map={mapInstance} id="floodrisk" /> : null}
        {layers.census ? <MapContextLayer map={mapInstance} id="census" /> : null}
      </> : null}
      {ready && mapInstance && props.satelliteMode && props.satelliteMode !== "none" ? <MapEarthObservationLayer map={mapInstance} mode={props.satelliteMode} /> : null}
      {ready && layers.fuel && mapInstance ? <MapFuelLayer map={mapInstance} clustered={clusteringReady} onSelectStation={(id, fuel) => { callbacks.current.onSelectFuel?.(id, fuel); }} /> : null}
      {ready && layers.satellites && mapInstance ? <MapSatelliteLayer map={mapInstance} clustered={clusterVehicles} /> : null}
      <details><summary className="cursor-pointer font-semibold">Symbole & Hinweise</summary>
      <p className="mt-1">🚌 Bus · 🚆 Zug · 🚛 Abfallsammlung · 🚢 Schiff · ✈ Flugverkehr · 🛰 Satelliten</p>
      <p>Ⓗ Haltestelle · ⚡ Ladestation</p>
      <p>⛔ Sperrung · 🚧 Baustelle · 🚗 Verkehrsachse</p>
      <p className="mt-1">Symbol anklicken für Details und Abfahrten.</p>
      <p className="mt-1 text-slate-400">Gestrichelter Rand: Prognose · Durchgehend: beobachtet (Fahrzeuge)</p>
      </details>
      {(layers.aircraft || layers.ships) && <details><summary className="cursor-pointer font-semibold">Empfang &amp; Datenquellen</summary>
      <div className="mt-2 space-y-1">
      {layers.aircraft && <AircraftLegend />}
      {layers.aircraft && <p role="status">{aircraftSource?.status === "connected" && aircraftSource.last_contact && Date.parse(aircraftSource.last_contact) + 60000 > props.now
        ? "Empfangener Flugverkehr · adsb.lol · keine vollständige Erfassung."
        : "Flugverkehrsdaten derzeit nicht verfügbar; Positionen verfallen nach 60 Sekunden."} <a href="https://www.adsb.lol/" target="_blank" rel="noreferrer">adsb.lol</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL 1.0</a></p>}
      {layers.aircraft && <p role="status">{ognSource?.status === "connected" && ognSource.last_contact && Date.parse(ognSource.last_contact) + 60000 > props.now
        ? "OGN-Empfang verfügbar · auch Segelflug · nur freigegebene Geräte."
        : "OGN-Empfang derzeit nicht verfügbar."} <a href="https://www.glidernet.org/" target="_blank" rel="noreferrer">Open Glider Network</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL 1.0</a></p>}
      {layers.ships && <p role="status">{shipSource?.status === "connected" && shipSource.last_contact && Date.parse(shipSource.last_contact) + 120000 > props.now
        ? "Schiffsempfang verfügbar · Empfang kann lückenhaft sein."
        : "AIS-Empfang derzeit nicht verfügbar; letzte Positionen verfallen nach 10 Minuten."}</p>}
      </div></details>}
      {props.mode === "temperature" && !hasFreshTemperature && <p role="status">{props.nodes.length
        ? "Keine aktuellen Temperaturwerte für die Farbfläche verfügbar. Ältere Messwerte bleiben als blasse Stationspunkte sichtbar."
        : "Keine Temperaturstationen im gewählten Themenfilter und Kartenbereich. Wähle Wetter & Klima, Boden & Bewässerung oder Alle."}</p>}
      {movementFailed && <p role="status">Bewegungsdaten nicht verfügbar.</p>}
      {(layersFailed || missing.length > 0) && <p role="status">Ohne aktuelle Quelldaten: {missing.length ? missing.map(id => mapSymbol(id).label).join(", ") : "einige Kartenebenen"}.</p>}
      {tilesMissing && <p role="status">Hintergrundkarten sind noch nicht verfügbar.</p>}
      {layers.starkregen && isLayerZoomRestricted("starkregen", zoom) && <p role="status">Starkregen: Details beim Hineinzoomen (ab Zoom {LAYER_MIN_ZOOM.starkregen}).</p>}
      {layers.lora && isLayerZoomRestricted("lora", zoom) && <p role="status">LoRaWAN-Heatmap: Details beim Hineinzoomen (ab Zoom {LAYER_MIN_ZOOM.lora}).</p>}
      {layers.lora && missing.includes("lora") && <p role="status">Keine gespeicherten LoRaWAN-Gateways verfügbar.</p>}
      {layers.lora && loraTilesFailed && <p role="status">TTN-Mapper-Heatmap konnte nicht geladen werden. Gateway-Standorte bleiben sichtbar.</p>}
      <button className="mt-2 mr-3 underline" onClick={() => {
        if (props.nodes.length) map.current?.fitBounds(L.latLngBounds(props.nodes.map(node => L.latLng(node.lat, node.lng))), { padding: [40, 40], maxZoom: 16 });
      }}>Sensoren im Überblick</button>
    </div>
  </div>;
}
