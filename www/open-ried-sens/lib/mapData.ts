export const CATEGORIES = {
  weather: { label: "Wetter & Klima", color: "#f59e0b", path: "M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z M12 9v8" },
  soil: { label: "Boden & Bewässerung", color: "#84cc16", path: "M20 4C9 3 3 7 5 14c2 7 14 6 15-10Z M4 21l11-11" },
  water: { label: "Wasserstände", color: "#38bdf8", path: "M2 7q3-4 6 0t6 0t6 0 M2 12q3-4 6 0t6 0t6 0 M2 17q3-4 6 0t6 0t6 0" },
  air: { label: "Luftqualität", color: "#2dd4bf", path: "M3 8h12a3 3 0 1 0-3-3 M2 12h17a3 3 0 1 1-3 3 M4 16h5a3 3 0 1 1-3 3" },
  parking: { label: "Parken", color: "#a78bfa", path: "M8 20V4h5a5 5 0 0 1 0 10H8" },
  bikes: { label: "Leihräder", color: "#0284c7", path: "M5.5 17.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M18.5 17.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M12 17.5V14l-3-3 4-3 2 3h2" },
  traffic: { label: "Verkehr", color: "#fb923c", path: "M5 17H3V9l2-5h14l2 5v8h-2 M3 10h18 M7 17h10 M6 13h2 M16 13h2 M5 17v3 M19 17v3" },
  seismic: { label: "Erschütterungen", color: "#f472b6", path: "M2 12h4l3-8 5 16 3-8h5" },
  education: { label: "Schulen & Kitas", color: "#38bdf8", path: "M22 10v6M2 10l10-5 10 5-10 5z M6 12v5c3 3 9 3 12 0v-5" },
  healthcare: { label: "Gesundheit & Notdienst", color: "#10b981", path: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z M12 6v6 M9 9h6" },
  culture: { label: "Kultur & Sport", color: "#ec4899", path: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" },
  tourism: { label: "Freizeit & Tourismus", color: "#eab308", path: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zm0 7v-7" },
  other: { label: "Weitere Sensoren", color: "#94a3b8", path: "M12 3v3 M12 18v3 M3 12h3 M18 12h3 M8 8h8v8H8Z" },
} as const;
export type Category = keyof typeof CATEGORIES;
export const CATEGORY_IDS = Object.keys(CATEGORIES) as Category[];
export const DEFAULT_MAP_CATEGORIES: Category[] = ["water", "air", "parking", "bikes", "seismic"];

export const SENSOR_CATEGORY_MIN_ZOOM: Record<Category, number> = {
  weather: 8,
  water: 8,
  air: 8,
  seismic: 8,
  traffic: 11,
  soil: 12,
  parking: 12,
  bikes: 13,
  education: 13,
  healthcare: 13,
  culture: 13,
  tourism: 13,
  other: 13,
};
export type Reading = { metric: string; value: number; unit: string; timestamp: string };
export type MapMode = "category" | "temperature";
export type Freshness = "fresh" | "stale" | "unknown" | "state";
export type ApiMapSensor = {
  id: string; friendly_name: string; latitude: number | null; longitude: number | null;
  description?: string | null; is_hidden?: boolean; entity_type?: string | null;
  source_entity_id?: string | null; readings?: Reading[];
};
export interface StationNode {
  id: string; name: string; locationName: string; address: string; lat: number | null; lng: number | null;
  categories: Category[]; readings: Reading[];
  isAggregate?: boolean;
}

export interface SensorNode extends StationNode { lat: number; lng: number }
export function hasCoordinates(node: StationNode): node is SensorNode {
  return node.lat != null && node.lng != null && Number.isFinite(node.lat) && Number.isFinite(node.lng) && Math.abs(node.lat) <= 90 && Math.abs(node.lng) <= 180;
}

export function categoriesFor(sensor: ApiMapSensor): Category[] {
  const categories = new Set<Category>();
  const type = sensor.entity_type ?? sensor.description?.match(/urn:ngsi-ld:([A-Za-z]+):/)?.[1];
  const soil = ["GreenspaceRecord", "SoilMeasurement", "SoilTension"].includes(type ?? "") || /bodentemperatur/i.test(sensor.friendly_name);
  for (const r of sensor.readings ?? []) {
    if (["temperature", "soil_temperature", "humidity", "relative_humidity", "precipitation"].includes(r.metric))
      categories.add(r.metric === "soil_temperature" || soil ? "soil" : "weather");
    if (r.metric.startsWith("soil_") || r.metric === "water_surface_distance") categories.add("soil");
    if (["water_level_delta", "water_level"].includes(r.metric) || r.metric.startsWith("groundwater_") || r.metric.startsWith("river_")) categories.add("water");
    if (["air_quality_index", "NO2", "PM10", "PM25", "PM2.5", "pm10", "pm25", "O3"].includes(r.metric)) categories.add("air");
    if (r.metric.startsWith("traffic_") || r.metric.startsWith("crossing_") || r.metric === "closure_duration") categories.add("traffic");
    if (r.metric.startsWith("parking_")) categories.add("parking");
    if (r.metric.startsWith("bike_")) categories.add("bikes");
    if (["pgv", "rms", "waveform"].includes(r.metric)) categories.add("seismic");
    if (r.metric === "value" && ["°C", "celsius", "CEL"].includes(r.unit)) categories.add(soil ? "soil" : "weather");
  }
  if (!categories.size) {
    if (sensor.id.startsWith("shake-")) categories.add("seismic");
    else if (sensor.id.startsWith("gw-") || sensor.id.startsWith("pegel-")) categories.add("water");
    else if (sensor.id.startsWith("bu-")) categories.add("traffic");
    else if (sensor.id.startsWith("nextbike-")) categories.add("bikes");
    else if (sensor.id.startsWith("rast-")) categories.add("parking");
    else if (sensor.id.startsWith("uba-")) categories.add("air");
    else if (sensor.id.startsWith("osem-") || sensor.id.startsWith("sensebox-")) categories.add("weather");
    else if (sensor.id.startsWith("fac-apo-") || sensor.id.startsWith("fac-doc-")) categories.add("healthcare");
    else if (sensor.id.startsWith("fac-kamue-") || sensor.id.startsWith("fac-bst-sport") || sensor.id.startsWith("fac-la-alt") || sensor.id.startsWith("fac-la-kanu") || sensor.id.startsWith("fac-bst-buerger") || sensor.id.startsWith("fac-bst-vfr")) categories.add("culture");
    else if (sensor.id.startsWith("fac-tour-")) categories.add("tourism");
    else if (sensor.id.startsWith("ttn-gw-") || sensor.id.startsWith("bnetza:emf:")) categories.add("other");
    else if (type === "radio_tower") categories.add("other");
    else if (type === "WeatherObserved" || type === "environmental_sensor") categories.add(soil ? "soil" : "weather");
    else if (["GreenspaceRecord", "SoilMeasurement", "SoilTension"].includes(type ?? "")) categories.add("soil");
    else if (type === "FloodMonitoring") categories.add("water");
    else if (type === "AirQualityObserved") categories.add("air");
    else if (type?.startsWith("TrafficFlow")) categories.add("traffic");
    else if (type?.startsWith("Parking") || type === "truck_parking") categories.add("parking");
    else categories.add("other");
  }
  return CATEGORY_IDS.filter(id => categories.has(id));
}

export function normalizeParkingName(name: string): string {
  let s = name.trim();
  s = s.replace(/^Bodentemperatur\s+/i, "");
  s = s.replace(/\s+Nr\.?\s*\d+.*$/i, "");
  s = s.replace(/\s+No\.?\s*\d+.*$/i, "");
  s = s.replace(/\s+#\s*\d+.*$/i, "");
  s = s.replace(/\s+(Links|Rechts)$/i, "");
  s = s.replace(/\s+\d+\s*[LR]$/i, "");
  s = s.replace(/\s+[LR]$/i, "");
  s = s.replace(/-\d+$/, "");
  return s.trim();
}

export function isParkingPuckTemperature(sensor: ApiMapSensor): boolean {
  const name = sensor.friendly_name.toLowerCase();
  const desc = (sensor.description ?? "").toLowerCase();
  const src = (sensor.source_entity_id ?? "").toLowerCase();
  const id = sensor.id.toLowerCase();
  // Source descriptions may contain generic notes about *other* sensor types.
  // Prefer the actual entity identity, never boilerplate, when it is available.
  const identity = src || desc.match(/urn:ngsi-ld:[^;\s]+/)?.[0] || id;
  const isPuck = /nwave|parking/.test(identity) ||
    (!src && !sensor.entity_type && !desc.includes("urn:ngsi-ld:") && /nwave|parking/.test(desc));
  const isTemp = name.includes("bodentemperatur") || name.includes("temperatur") ||
    sensor.entity_type === "WeatherObserved" ||
    (sensor.readings ?? []).some(r => ["temperature", "soil_temperature"].includes(r.metric));
  const isParkingReading = (sensor.readings ?? []).some(r => r.metric.startsWith("parking_")) ||
    sensor.entity_type === "ParkingSpotSum" ||
    sensor.entity_type?.startsWith("Parking");
  return isPuck && isTemp && !isParkingReading;
}

export function toStationNodes(sensors: ApiMapSensor[]): StationNode[] {
  const visible = sensors.filter(s => !s.is_hidden);
  const parkingSensors: ApiMapSensor[] = [];
  const puckTempSensors: ApiMapSensor[] = [];
  const result: StationNode[] = [];

  for (const s of visible) {
    const categories = categoriesFor(s);
    if (isParkingPuckTemperature(s)) {
      puckTempSensors.push(s);
    } else if (categories.length === 1 && categories[0] === "parking") {
      parkingSensors.push(s);
    } else {
      result.push({
        id: s.id, name: s.friendly_name, locationName: s.friendly_name, address: s.description ?? "",
        lat: s.latitude, lng: s.longitude, categories,
        readings: (s.readings ?? []).filter(r => Number.isFinite(r.value) && Number.isFinite(Date.parse(r.timestamp))),
      });
    }
  }

  // Group parking sensors that share the same normalized station name and proximity
  const parkingGroups: ApiMapSensor[][] = [];
  for (const sensor of parkingSensors) {
    const normName = normalizeParkingName(sensor.friendly_name).toLowerCase();
    const existing = parkingGroups.find(group => {
      const lead = group[0];
      const leadNorm = normalizeParkingName(lead.friendly_name).toLowerCase();
      if (leadNorm !== normName) return false;
      if (lead.latitude == null || lead.longitude == null || sensor.latitude == null || sensor.longitude == null) {
        return lead.latitude == null && sensor.latitude == null && lead.longitude == null && sensor.longitude == null;
      }
      return Math.hypot(lead.latitude - sensor.latitude, lead.longitude - sensor.longitude) <= 0.003;
    });
    if (existing) existing.push(sensor);
    else parkingGroups.push([sensor]);
  }

  const matchedPuckIds = new Set<string>();

  for (const group of parkingGroups) {
    const isSingle = group.length === 1;
    const primary = group[0];
    const groupNorm = normalizeParkingName(primary.friendly_name).toLowerCase();
    const stationName = isSingle ? primary.friendly_name : (normalizeParkingName(primary.friendly_name) || primary.friendly_name);

    // Compute centroid coordinates
    const withCoords = group.filter(s => s.latitude != null && s.longitude != null);
    const lat = withCoords.length ? withCoords.reduce((sum, s) => sum + s.latitude!, 0) / withCoords.length : primary.latitude;
    const lng = withCoords.length ? withCoords.reduce((sum, s) => sum + s.longitude!, 0) / withCoords.length : primary.longitude;

    let totalFree = 0;
    let hasFree = false;
    let totalOccupied = 0;
    let hasOccupied = false;
    let totalCapacity = 0;
    let hasCapacity = false;
    let latestTimestamp = "";

    for (const s of group) {
      const valid = (s.readings ?? []).filter(r => Number.isFinite(r.value) && Number.isFinite(Date.parse(r.timestamp)));
      const free = valid.find(r => r.metric === "parking_free");
      const occupied = valid.find(r => r.metric === "parking_occupied");
      const capacity = valid.find(r => r.metric === "parking_capacity");

      if (free) {
        totalFree += free.value;
        hasFree = true;
        if (!latestTimestamp || Date.parse(free.timestamp) > Date.parse(latestTimestamp)) latestTimestamp = free.timestamp;
      }
      if (occupied) {
        totalOccupied += occupied.value;
        hasOccupied = true;
        if (!latestTimestamp || Date.parse(occupied.timestamp) > Date.parse(latestTimestamp)) latestTimestamp = occupied.timestamp;
      }
      if (capacity) {
        totalCapacity += capacity.value;
        hasCapacity = true;
        if (!latestTimestamp || Date.parse(capacity.timestamp) > Date.parse(latestTimestamp)) latestTimestamp = capacity.timestamp;
      }
    }

    if (!hasCapacity) {
      if (hasFree && hasOccupied) {
        totalCapacity = totalFree + totalOccupied;
        hasCapacity = true;
      } else {
        totalCapacity = group.length;
        hasCapacity = true;
      }
    }
    if (!hasOccupied && hasCapacity && hasFree) {
      totalOccupied = Math.max(0, totalCapacity - totalFree);
      hasOccupied = true;
    }
    if (!hasFree && hasCapacity && hasOccupied) {
      totalFree = Math.max(0, totalCapacity - totalOccupied);
      hasFree = true;
    }

    const timestamp = latestTimestamp || new Date().toISOString();
    const readings: Reading[] = [];
    if (hasFree) readings.push({ metric: "parking_free", value: totalFree, unit: "count", timestamp });
    if (hasOccupied) readings.push({ metric: "parking_occupied", value: totalOccupied, unit: "count", timestamp });
    if (hasCapacity) readings.push({ metric: "parking_capacity", value: totalCapacity, unit: "count", timestamp });

    // Integrate companion puck temperature sensors for this parking group
    const matchingPucks = puckTempSensors.filter(p => {
      const pNorm = normalizeParkingName(p.friendly_name).toLowerCase();
      if (pNorm !== groupNorm) return false;
      if (lat == null || lng == null || p.latitude == null || p.longitude == null) return true;
      return Math.hypot(lat - p.latitude, lng - p.longitude) <= 0.003;
    });

    const categories: Category[] = ["parking"];
    const tempVals: number[] = [];
    let latestTempTime = "";
    for (const p of matchingPucks) {
      matchedPuckIds.add(p.id);
      const valid = (p.readings ?? []).filter(r => Number.isFinite(r.value) && ["temperature", "soil_temperature", "value"].includes(r.metric));
      for (const tr of valid) {
        tempVals.push(tr.value);
        if (!latestTempTime || Date.parse(tr.timestamp) > Date.parse(latestTempTime)) latestTempTime = tr.timestamp;
      }
    }

    if (tempVals.length > 0) {
      const avgTemp = Math.round((tempVals.reduce((a, b) => a + b, 0) / tempVals.length) * 10) / 10;
      readings.push({ metric: "soil_temperature", value: avgTemp, unit: "°C", timestamp: latestTempTime || timestamp });
      if (!categories.includes("soil")) categories.push("soil");
    }

    result.push({
      id: primary.id,
      name: stationName,
      locationName: stationName,
      address: primary.description ?? "",
      lat,
      lng,
      categories,
      readings,
      isAggregate: !isSingle || tempVals.length > 0,
    });
  }

  // Any unmatched puck temperature sensors are emitted as standalone soil sensors to preserve data
  for (const puck of puckTempSensors) {
    if (matchedPuckIds.has(puck.id)) continue;
    result.push({
      id: puck.id,
      name: puck.friendly_name,
      locationName: puck.friendly_name,
      address: puck.description ?? "",
      lat: puck.latitude,
      lng: puck.longitude,
      categories: ["soil"],
      readings: (puck.readings ?? []).filter(r => Number.isFinite(r.value) && Number.isFinite(Date.parse(r.timestamp))),
    });
  }

  offsetTrafficCoordinates(result);
  return result;
}

export const DEFAULT_CROSSING_NODES: StationNode[] = [
  {
    id: "bu-buerstadt-mainstr",
    name: "BÜ Mainstraße (Bürstadt)",
    locationName: "BÜ Mainstraße (Bürstadt)",
    address: "Nibelungenbahn km 9.8 · RBÜT Halbschrankenanlage",
    lat: 49.64600,
    lng: 8.45398,
    categories: ["traffic"],
    readings: [{ metric: "crossing_state", value: 0, unit: "state", timestamp: new Date().toISOString() }],
  },
  {
    id: "bu-buerstadt-waldgarten",
    name: "BÜ Waldgartenstraße (Bürstadt)",
    locationName: "BÜ Waldgartenstraße (Bürstadt)",
    address: "Nibelungenbahn km 10.18 · Vollbeschrankter Fußgängerüberweg",
    lat: 49.64574,
    lng: 8.45819,
    categories: ["traffic"],
    readings: [{ metric: "crossing_state", value: 0, unit: "state", timestamp: new Date().toISOString() }],
  },
  {
    id: "bu-biblis-kirchstr",
    name: "BÜ Kirchstraße (Biblis)",
    locationName: "BÜ Kirchstraße (Biblis)",
    address: "Riedbahn km 27.20 · Modernisierte Schrankenanlage Gemeindesee",
    lat: 49.68207,
    lng: 8.44415,
    categories: ["traffic"],
    readings: [{ metric: "crossing_state", value: 0, unit: "state", timestamp: new Date().toISOString() }],
  },
  {
    id: "bu-hofheim-bibliser-weg",
    name: "BÜ Bibliser Weg (Hofheim)",
    locationName: "BÜ Bibliser Weg (Hofheim)",
    address: "Worms–Biblis km 6.09 · RBÜT Halbschranken L3411",
    lat: 49.66258,
    lng: 8.41341,
    categories: ["traffic"],
    readings: [{ metric: "crossing_state", value: 0, unit: "state", timestamp: new Date().toISOString() }],
  },
];

export function mergeDefaultCrossings(nodes: StationNode[]): StationNode[] {
  const existingIds = new Set(nodes.map(s => s.id));
  const missing = DEFAULT_CROSSING_NODES.filter(c => !existingIds.has(c.id));
  return missing.length > 0 ? [...nodes, ...missing] : nodes;
}

export const DEFAULT_EDUCATIONAL_NODES: StationNode[] = [
  {
    id: "sch-bst-eks",
    name: "Erich-Kästner-Schule (IGS Bürstadt)",
    locationName: "Erich-Kästner-Schule (Integrierte Gesamtschule)",
    address: "Wolfstraße 23, 68642 Bürstadt · Träger: Kreis Bergstraße",
    lat: 49.6483,
    lng: 8.4615,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 980, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 940, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 96, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
  {
    id: "sch-bst-schillerschule",
    name: "Schillerschule Bürstadt (Grundschule)",
    locationName: "Schillerschule Grundschule Bürstadt",
    address: "Boxheimerhofstraße 22, 68642 Bürstadt · Träger: Kreis Bergstraße",
    lat: 49.6496,
    lng: 8.4618,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 380, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 365, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 96, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
  {
    id: "sch-bst-astrid-lindgren",
    name: "Astrid-Lindgren-Schule Bobstadt",
    locationName: "Astrid-Lindgren-Schule Grundschule",
    address: "Wolfsfahrtweg 2, 68642 Bürstadt-Bobstadt",
    lat: 49.6642,
    lng: 8.4478,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 140, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 128, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 91, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
  {
    id: "kita-bst-wichtelburg",
    name: "Kita Wichtelburg Bürstadt",
    locationName: "Städtische Kindertagesstätte Wichtelburg",
    address: "Rathausstraße 2, 68642 Bürstadt · Träger: Stadt Bürstadt (U3/Ü3)",
    lat: 49.6420,
    lng: 8.4558,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 110, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 105, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 95, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
  {
    id: "kita-bst-sonnenschein",
    name: "Kita Sonnenschein Bürstadt",
    locationName: "Städtische Kindertagesstätte Sonnenschein",
    address: "Gartenstraße 14, 68642 Bürstadt · Träger: Stadt Bürstadt",
    lat: 49.6448,
    lng: 8.4632,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 125, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 120, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 96, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
  {
    id: "kita-bst-st-peter",
    name: "Katholische Kita St. Peter",
    locationName: "Kath. Kindertagesstätte St. Peter Bürstadt",
    address: "Wolfstraße 2, 68642 Bürstadt · Träger: Pfarrgemeinde St. Michael",
    lat: 49.6438,
    lng: 8.4525,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 95, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 92, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 97, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
  {
    id: "kita-bst-regenbogen",
    name: "Kita Regenbogen Bobstadt",
    locationName: "Städtische Kindertagesstätte Regenbogen",
    address: "Sankt-Josef-Straße 10, 68642 Bürstadt-Bobstadt",
    lat: 49.6628,
    lng: 8.4468,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 85, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 82, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 96, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
  {
    id: "kita-bst-riedrode",
    name: "Waldkindergarten Riedrode",
    locationName: "Kita & Waldkindergarten Riedrode",
    address: "Bahnhofstraße 34, 68642 Bürstadt-Riedrode",
    lat: 49.6472,
    lng: 8.4905,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 65, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 60, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 92, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
  {
    id: "sch-la-lessing-gymnasium",
    name: "Lessing-Gymnasium Lampertheim",
    locationName: "Lessing-Gymnasium (Gymnasium mit Oberstufe)",
    address: "Biedensandstraße 55, 68623 Lampertheim · Träger: Kreis Bergstraße",
    lat: 49.5989,
    lng: 8.4552,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 1150, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 1110, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 97, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
  {
    id: "sch-la-alfred-delp",
    name: "Alfred-Delp-Schule Lampertheim",
    locationName: "Alfred-Delp-Schule (Haupt- & Realschule)",
    address: "Carl-Lepper-Straße 7, 68623 Lampertheim · Träger: Kreis Bergstraße",
    lat: 49.5992,
    lng: 8.4568,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 720, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 680, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 94, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
  {
    id: "sch-la-pestalozzi",
    name: "Pestalozzischule Lampertheim",
    locationName: "Pestalozzischule Grundschule",
    address: "Wilhelmstraße 61, 68623 Lampertheim",
    lat: 49.5991,
    lng: 8.4631,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 340, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 325, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 96, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
  {
    id: "sch-la-schiller-hofheim",
    name: "Nibelungenschule Hofheim",
    locationName: "Nibelungenschule Grundschule Hofheim (Ried)",
    address: "Schulstraße 4, 68623 Lampertheim-Hofheim · Träger: Stadt Worms",
    lat: 49.6586,
    lng: 8.4121,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 130, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 120, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 92, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
  {
    id: "kita-la-falterweg",
    name: "Städtische Kita Falterweg Lampertheim",
    locationName: "Kita Falterweg (Kinderbetreuung & Ganztag)",
    address: "Falterweg 24, 68623 Lampertheim · Träger: Stadt Lampertheim",
    lat: 49.5971,
    lng: 8.4691,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 130, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 124, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 95, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
  {
    id: "kita-la-neuschloss",
    name: "Kita Neuschloß",
    locationName: "Kindertagesstätte Neuschloß",
    address: "Ahornweg 12, 68623 Lampertheim-Neuschloß",
    lat: 49.6012,
    lng: 8.5165,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 75, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 72, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 96, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
  {
    id: "kita-la-huettenfeld",
    name: "Kita Hüttenfeld",
    locationName: "Kindertagesstätte Hüttenfeld (Bürgerhaus)",
    address: "Alfred-Delp-Straße 50, 68623 Lampertheim-Hüttenfeld",
    lat: 49.5982,
    lng: 8.5829,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 80, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 78, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 98, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
  {
    id: "sch-bib-weschnitzauen",
    name: "Schule in den Weschnitzauen Biblis",
    locationName: "Schule in den Weschnitzauen Grundschule",
    address: "Pfaffenau 4, 68647 Biblis · Träger: Kreis Bergstraße",
    lat: 49.6881,
    lng: 8.4531,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 320, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 305, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 95, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
  {
    id: "kita-bib-sonnenschein",
    name: "Kita Sonnenschein Biblis",
    locationName: "Kommunale Kindertagesstätte Sonnenschein",
    address: "Kirchstraße 28, 68647 Biblis · Träger: Gemeinde Biblis",
    lat: 49.6851,
    lng: 8.4462,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 115, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 110, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 96, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
  {
    id: "kita-bib-pusteblume-wattenheim",
    name: "Kita Pusteblume Wattenheim",
    locationName: "Kindertagesstätte Pusteblume Wattenheim",
    address: "Rheinstraße 15, 68647 Biblis-Wattenheim",
    lat: 49.6854,
    lng: 8.4128,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 65, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 62, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 95, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
  {
    id: "sch-gr-lindenhof",
    name: "Lindenhofschule Groß-Rohrheim",
    locationName: "Lindenhofschule Grundschule",
    address: "Kornstraße 38, 68649 Groß-Rohrheim",
    lat: 49.7182,
    lng: 8.4791,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 150, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 142, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 95, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
  {
    id: "kita-gr-abenteuerland",
    name: "Kita Abenteuerland Groß-Rohrheim",
    locationName: "Kindertagesstätte Abenteuerland",
    address: "Speyerer Straße 12, 68649 Groß-Rohrheim",
    lat: 49.7168,
    lng: 8.4755,
    categories: ["education"],
    readings: [
      { metric: "edu_capacity", value: 95, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_enrollment", value: 90, unit: "count", timestamp: new Date().toISOString() },
      { metric: "edu_utilization", value: 95, unit: "%", timestamp: new Date().toISOString() },
    ],
  },
];

export function mergeDefaultEducation(nodes: StationNode[]): StationNode[] {
  const existingIds = new Set(nodes.map(s => s.id));
  const missing = DEFAULT_EDUCATIONAL_NODES.filter(e => !existingIds.has(e.id));
  return missing.length > 0 ? [...nodes, ...missing] : nodes;
}

export const DEFAULT_FACILITIES_NODES: StationNode[] = [
  // Healthcare: Pharmacies & Doctors
  {
    id: "fac-apo-bst-sonnen",
    name: "Sonnen-Apotheke Bürstadt",
    locationName: "Apotheke · Bürstadt",
    address: "Mainstraße 12, 68642 Bürstadt · Tel. 06206 6358",
    lat: 49.6425,
    lng: 8.4528,
    categories: ["healthcare"],
    readings: [{ metric: "emergency_duty", value: 0, unit: "state", timestamp: new Date().toISOString() }],
  },
  {
    id: "fac-apo-bst-nibelungen",
    name: "Nibelungen-Apotheke Bürstadt (Notdienst)",
    locationName: "Notdienst-Apotheke · Bürstadt",
    address: "Wilhelminenstraße 10, 68642 Bürstadt · Tel. 06206 963131",
    lat: 49.6441,
    lng: 8.4560,
    categories: ["healthcare"],
    readings: [{ metric: "emergency_duty", value: 1, unit: "state", timestamp: new Date().toISOString() }],
  },
  {
    id: "fac-apo-la-andreas",
    name: "Andreas-Apotheke Lampertheim (Notdienst)",
    locationName: "Notdienst-Apotheke · Lampertheim",
    address: "Kaiserstraße 18, 68623 Lampertheim · Tel. 06206 2445",
    lat: 49.5938,
    lng: 8.4682,
    categories: ["healthcare"],
    readings: [{ metric: "emergency_duty", value: 1, unit: "state", timestamp: new Date().toISOString() }],
  },
  {
    id: "fac-doc-bst-hausarzt",
    name: "Hausarztzentrum & Allgemeinmedizin Bürstadt",
    locationName: "Hausarztpraxis · Bürstadt",
    address: "Nibelungenstraße 42, 68642 Bürstadt · Tel. 06206 70010",
    lat: 49.6416,
    lng: 8.4532,
    categories: ["healthcare"],
    readings: [],
  },
  {
    id: "fac-doc-la-mvz",
    name: "Medizinisches Versorgungszentrum (MVZ) Lampertheim",
    locationName: "Facharztzentrum · Lampertheim",
    address: "Neue Schulstraße 28, 68623 Lampertheim · Tel. 06206 9450",
    lat: 49.5962,
    lng: 8.4715,
    categories: ["healthcare"],
    readings: [],
  },
  // Culture & Sports
  {
    id: "fac-kamue-kulturzentrum",
    name: "KAMÜ Kulturzentrum Bürstadt",
    locationName: "Kulturzentrum & Hackathon Hub · Bürstadt",
    address: "Industriestraße 11, 68642 Bürstadt · Kulturinitiative Open Ried Sens",
    lat: 49.6457,
    lng: 8.4582,
    categories: ["culture"],
    readings: [],
  },
  {
    id: "fac-bst-sportpark",
    name: "Sportpark Bürstadt & alla hopp!",
    locationName: "Bürgersportpark · Bürstadt",
    address: "Wasserwerkstraße 4, 68642 Bürstadt",
    lat: 49.6385,
    lng: 8.4595,
    categories: ["culture"],
    readings: [],
  },
  {
    id: "fac-la-altrheinhalle",
    name: "Altrheinhalle & Sportzentrum Lampertheim",
    locationName: "Sport- & Kulturzentrum · Lampertheim",
    address: "Biedensandstraße 57, 68623 Lampertheim · Tel. 06206 9350",
    lat: 49.5982,
    lng: 8.4542,
    categories: ["culture"],
    readings: [],
  },
  {
    id: "fac-la-kanuclub",
    name: "Kanu-Club Lampertheim 1929",
    locationName: "Wassersportzentrum · Lampertheim",
    address: "Römerstraße 108 / Altrhein, 68623 Lampertheim",
    lat: 49.5915,
    lng: 8.4610,
    categories: ["culture"],
    readings: [],
  },
  // Tourism & Attractions
  {
    id: "fac-tour-kloster-lorsch",
    name: "UNESCO Welterbe Kloster Lorsch & Lauresham",
    locationName: "UNESCO Welterbe · Lorsch",
    address: "Im Klosterbezirk 1, 64653 Lorsch · Tel. 06251 869200",
    lat: 49.6538,
    lng: 8.5695,
    categories: ["tourism"],
    readings: [],
  },
  {
    id: "fac-tour-biedensand",
    name: "Naturschutzgebiet Lampertheimer Altrhein (Biedensand)",
    locationName: "Naturschutz & Auenlandschaft · Lampertheim",
    address: "Biedensandstraße, 68623 Lampertheim",
    lat: 49.5960,
    lng: 8.4480,
    categories: ["tourism"],
    readings: [],
  },
  {
    id: "fac-tour-biedensand-baeder",
    name: "Biedensand Bäder Lampertheim (Hallen- & Freibad)",
    locationName: "Erlebnisbad · Lampertheim",
    address: "Weidweg 40, 68623 Lampertheim · Tel. 06206 94460",
    lat: 49.5975,
    lng: 8.4548,
    categories: ["tourism"],
    readings: [],
  },
  {
    id: "fac-tour-boxheimerhof",
    name: "Historischer Boxheimerhof Bürstadt",
    locationName: "Historisches Denkmal · Bürstadt",
    address: "Boxheimerhof 1, 68642 Bürstadt",
    lat: 49.6290,
    lng: 8.4800,
    categories: ["tourism"],
    readings: [],
  },
];

export function mergeDefaultFacilities(nodes: StationNode[]): StationNode[] {
  const existingIds = new Set(nodes.map(s => s.id));
  const missing = DEFAULT_FACILITIES_NODES.filter(f => !existingIds.has(f.id));
  return missing.length > 0 ? [...nodes, ...missing] : nodes;
}


export function offsetTrafficCoordinates(nodes: StationNode[]): void {
  const trafficNodes = nodes.filter(n => n.categories.includes("traffic") && n.lat != null && n.lng != null);

  const locGroups = new Map<string, StationNode[]>();
  for (const node of trafficNodes) {
    const key = `${node.lat!.toFixed(4)},${node.lng!.toFixed(4)}`;
    const group = locGroups.get(key);
    if (group) group.push(node);
    else locGroups.set(key, [node]);
  }

  const fallbackDirs = [
    { code: "E", dlat: 0.0, dlng: 0.00030 },
    { code: "W", dlat: 0.0, dlng: -0.00030 },
    { code: "N", dlat: 0.00022, dlng: 0.0 },
    { code: "S", dlat: -0.00022, dlng: 0.0 },
    { code: "NE", dlat: 0.00015, dlng: 0.00020 },
    { code: "NW", dlat: 0.00015, dlng: -0.00020 },
    { code: "SE", dlat: -0.00015, dlng: 0.00020 },
    { code: "SW", dlat: -0.00015, dlng: -0.00020 },
  ];

  for (const group of locGroups.values()) {
    if (group.length <= 1) continue;

    const usedDirs = new Set<string>();
    const unassigned: StationNode[] = [];

    for (const node of group) {
      const nl = node.name.toLowerCase();
      if (nl.includes("nord")) {
        node.lat = Number((node.lat! + 0.00022).toFixed(6));
        usedDirs.add("N");
      } else if (nl.includes("süd") || nl.includes("sued")) {
        node.lat = Number((node.lat! - 0.00022).toFixed(6));
        usedDirs.add("S");
      } else if (nl.includes("ost")) {
        node.lng = Number((node.lng! + 0.00030).toFixed(6));
        usedDirs.add("E");
      } else if (nl.includes("west")) {
        node.lng = Number((node.lng! - 0.00030).toFixed(6));
        usedDirs.add("W");
      } else {
        unassigned.push(node);
      }
    }

    for (const node of unassigned) {
      const dir = fallbackDirs.find(d => !usedDirs.has(d.code));
      if (dir) {
        node.lat = Number((node.lat! + dir.dlat).toFixed(6));
        node.lng = Number((node.lng! + dir.dlng).toFixed(6));
        usedDirs.add(dir.code);
      }
    }
  }
}
export function toMapNodes(sensors: ApiMapSensor[]): SensorNode[] {
  return toStationNodes(sensors).filter(hasCoordinates);
}

export function readingFreshness(reading: Reading | undefined, now: number): Freshness {
  if (!reading) return "unknown";
  const age = now - Date.parse(reading.timestamp);
  if (!Number.isFinite(age) || age < -300_000) return "unknown";
  if (reading.metric.startsWith("parking_") || reading.metric.startsWith("crossing_") || reading.metric.startsWith("bike_")) return "state"; // Event-driven, not an online indicator.
  const threshold = ["pgv", "rms"].includes(reading.metric) ? 120_000 :
    reading.metric.startsWith("soil_") || reading.metric === "water_surface_distance" ? 6 * 3600_000 :
    reading.metric === "air_quality_index" ? 3 * 3600_000 : 2 * 3600_000;
  return age <= threshold ? "fresh" : "stale";
}

export function temperatureReading(node: StationNode) {
  return node.readings.find(r => ["temperature", "soil_temperature", "value"].includes(r.metric) && ["°C", "celsius", "CEL"].includes(r.unit));
}
export function primaryReading(node: StationNode, category: Category, mode: MapMode): Reading | undefined {
  if (mode === "temperature") return temperatureReading(node);
  const preferred: Record<Category, string[]> = {
    weather: ["temperature", "relative_humidity", "humidity", "precipitation", "value"],
    soil: ["soil_temperature", "temperature", "water_surface_distance", "soil_moisture"],
    water: ["water_level_delta", "water_level"], air: ["air_quality_index", "PM25", "PM10", "NO2"],
    traffic: ["crossing_state", "traffic_total_hourly", "traffic_cars_hourly", "traffic_cars_daily_city", "closure_duration"],
    parking: ["parking_free", "parking_occupied", "parking_capacity"],
    bikes: ["bike_available", "bike_racks_free", "bike_capacity", "bike_ebikes"],
    seismic: ["pgv", "rms"],
    education: ["edu_utilization", "edu_enrollment", "edu_capacity"],
    healthcare: ["emergency_duty"],
    culture: [],
    tourism: [],
    other: [],
  };
  return preferred[category].map(m => node.readings.find(r => r.metric === m)).find(Boolean) ?? node.readings[0];
}
export function visibleNodes(nodes: StationNode[], categories: Category[], mode: MapMode) {
  return nodes.filter(n => n.categories.some(c => categories.includes(c)) && (mode !== "temperature" || temperatureReading(n)));
}
export function categoriesForMode(nodes: StationNode[], categories: Category[], mode: MapMode): Category[] {
  if (mode !== "temperature" || visibleNodes(nodes, categories, mode).length > 0) return categories;
  const temperatureNodes = visibleNodes(nodes, CATEGORY_IDS, mode);
  if (!temperatureNodes.length) return categories;
  return CATEGORY_IDS.filter(category => temperatureNodes.some(node => node.categories.includes(category)));
}

export function markerCategory(node: StationNode, selected: Category[]) {
  return node.categories.find(c => selected.includes(c)) ?? node.categories[0];
}
export function temperatureColor(value: number) {
  return value < 0 ? "#818cf8" : value < 10 ? "#38bdf8" : value < 20 ? "#2dd4bf" : value < 30 ? "#fbbf24" : "#fb7185";
}
export function valueLabel(reading: Reading | undefined, readings?: Reading[]) {
  if (!reading) return "";
  const value = reading.value.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  if (reading.metric === "emergency_duty") {
    return reading.value > 0 ? "Notdienst" : "Geöffnet";
  }
  if (reading.metric === "edu_utilization") {
    return `${Math.round(reading.value)}% belegt`;
  }
  if (reading.metric === "edu_enrollment" || reading.metric === "edu_capacity") {
    return `${value} Plätze`;
  }
  if (reading.metric === "groundwater_depth_m") {
    return `${value} m Flurabstand`;
  }
  if (reading.metric === "groundwater_nitrate_mg_l") {
    return `${value} mg/l Nitrat`;
  }
  if (reading.metric === "river_gauge_m") {
    return `${value} m Pegel`;
  }
  if (reading.metric === "crossing_state") {
    return reading.value >= 2 ? "Geschlossen" : reading.value >= 1 ? "Schließt bald" : "Offen (Frei)";
  }
  if (reading.metric === "closure_duration") {
    return `${Math.round(reading.value)}s Schließdauer`;
  }
  if (reading.metric.startsWith("traffic_")) {
    if (reading.metric.endsWith("_hourly")) return `${value} / h`;
    if (reading.metric.endsWith("_daily") || reading.metric.endsWith("_daily_city")) return `${value} / Tag`;
    return `${value} gezählt`;
  }
  if (reading.metric === "bike_available" || reading.metric === "bike_racks_free" || reading.metric === "bike_capacity") {
    if (readings) {
      const bikes = bikeSummary(readings);
      if (bikes) {
        const available = readings.find(r => r.metric === "bike_available" && Number.isSafeInteger(r.value) && r.value >= 0);
        const capacity = readings.find(r => r.metric === "bike_capacity" && Number.isSafeInteger(r.value) && r.value > 0);
        if (available !== undefined && capacity !== undefined) {
          return `${available.value.toLocaleString("de-DE")}/${capacity.value.toLocaleString("de-DE")} Räder`;
        }
        if (available !== undefined) {
          return `${available.value.toLocaleString("de-DE")} ${available.value === 1 ? "Rad" : "Räder"}`;
        }
      }
    }
    return reading.metric === "bike_available" ? `${value} ${reading.value === 1 ? "Rad" : "Räder"}` : `${value} Docks`;
  }
  if (reading.metric === "parking_free" || reading.metric === "parking_occupied") {
    if (readings) {
      const parking = parkingSummary(readings);
      if (parking) {
        const free = readings.find(r => r.metric === "parking_free" && Number.isSafeInteger(r.value) && r.value >= 0);
        const capacity = readings.find(r => r.metric === "parking_capacity" && Number.isSafeInteger(r.value) && r.value >= 0);
        const occupied = readings.find(r => r.metric === "parking_occupied" && Number.isSafeInteger(r.value) && r.value >= 0);
        const total = capacity?.value ?? (free && occupied && Date.parse(free.timestamp) === Date.parse(occupied.timestamp) ? free.value + occupied.value : undefined);
        const available = free?.value ?? (total !== undefined && occupied ? total - occupied.value : undefined);
        if (available !== undefined && total !== undefined) {
          return `${available.toLocaleString("de-DE")}/${total.toLocaleString("de-DE")} frei`;
        }
        if (available !== undefined) {
          return `${available.toLocaleString("de-DE")} frei`;
        }
        if (occupied) {
          return `${occupied.value.toLocaleString("de-DE")} belegt`;
        }
      }
    }
    return reading.metric === "parking_free" ? `${value} frei` : `${value} belegt`;
  }
  return `${value} ${["celsius", "CEL"].includes(reading.unit) ? "°C" : reading.unit}`;
}
export function observationLabel(reading: Reading | undefined, now: number) {
  if (!reading) return "Keine Messdaten";
  const label = { fresh: "Aktueller Messwert", stale: "Älterer Messwert", state: "Zuletzt gemeldeter Zustand", unknown: "Zeitpunkt unbekannt" }[readingFreshness(reading, now)];
  return `${label} · ${new Date(reading.timestamp).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}`;
}

export function parkingSummary(readings: Reading[]) {
  const count = (metric: string) => readings.find(r => r.metric === metric &&
    r.unit === "count" && Number.isSafeInteger(r.value) && r.value >= 0 && Number.isFinite(Date.parse(r.timestamp)));
  const free = count("parking_free");
  const occupied = count("parking_occupied");
  const capacity = count("parking_capacity");
  if (!free && !occupied && !capacity) return undefined;
  const simultaneous = free && occupied && Date.parse(free.timestamp) === Date.parse(occupied.timestamp);
  const total = capacity?.value ?? (simultaneous ? free.value + occupied.value : undefined);
  const inconsistent = total !== undefined && ((free?.value ?? 0) > total ||
    (occupied?.value ?? 0) > total || (simultaneous && free.value + occupied.value !== total));
  const available = free?.value ?? (!inconsistent && total !== undefined && occupied ? total - occupied.value : undefined);
  const format = (value: number) => value.toLocaleString("de-DE");
  const summary = available !== undefined
    ? total !== undefined && !inconsistent ? `${format(available)} von ${format(total)} ${total === 1 ? "Stellplatz" : "Stellplätzen"} frei` : `${format(available)} ${available === 1 ? "Stellplatz" : "Stellplätze"} frei`
    : occupied ? `${format(occupied.value)} ${occupied.value === 1 ? "Stellplatz" : "Stellplätze"} belegt` : `${format(total!)} ${total === 1 ? "Stellplatz" : "Stellplätze"} insgesamt`;
  const details = [];
  if (occupied && available !== undefined) details.push(`${format(occupied.value)} ${occupied.value === 1 ? "Stellplatz" : "Stellplätze"} belegt`);
  if (total === undefined) details.push("Gesamtzahl nicht gemeldet");
  if (inconsistent) details.push("Die gemeldeten Anzahlen sind widersprüchlich.");
  if (!free && available !== undefined) details.push("Freie Plätze aus Gesamtzahl und Belegung berechnet.");
  if (!capacity && simultaneous) details.push("Gesamtzahl aus freien und belegten Plätzen berechnet.");
  return { summary, details, observations: [free, occupied, capacity].filter((r): r is Reading => !!r) };
}

export function bikeSummary(readings: Reading[]) {
  const count = (metric: string) => readings.find(r => r.metric === metric &&
    r.unit === "count" && Number.isSafeInteger(r.value) && r.value >= 0 && Number.isFinite(Date.parse(r.timestamp)));
  const available = count("bike_available");
  const freeDocks = count("bike_racks_free");
  const capacity = count("bike_capacity");
  const ebikes = count("bike_ebikes");
  if (!available && !freeDocks && !capacity) return undefined;

  const availVal = available?.value ?? 0;
  const capVal = capacity?.value;
  const freeVal = freeDocks?.value;
  const ebikeVal = ebikes?.value ?? 0;

  const format = (v: number) => v.toLocaleString("de-DE");
  let summary = "";
  if (capVal && capVal > 0) {
    summary = `${format(availVal)} von ${format(capVal)} ${capVal === 1 ? "Leihrad" : "Leihrädern"} verfügbar`;
  } else {
    summary = `${format(availVal)} ${availVal === 1 ? "Leihrad" : "Leihräder"} verfügbar`;
  }

  const details: string[] = [];
  if (freeVal !== undefined && capVal && capVal > 0) {
    if (freeVal === 0) {
      details.push("⚠️ Station voll · Aktuell keine Rückgabe an Docks möglich!");
    } else {
      details.push(`${format(freeVal)} freie ${freeVal === 1 ? "Rückgabeposition" : "Rückgabepositionen"} (Docks)`);
    }
  }
  if (availVal === 0) {
    details.push("⚠️ Station leer · Aktuell kein Rad zur Ausleihe verfügbar.");
  }
  if (ebikeVal > 0) {
    details.push(`Davon ${format(ebikeVal)} ${ebikeVal === 1 ? "E-Bike / Pedelec" : "E-Bikes / Pedelecs"}`);
  }

  return {
    summary,
    details,
    availableCount: availVal,
    capacityCount: capVal,
    freeDocksCount: freeVal,
    ebikesCount: ebikeVal,
    isFull: capVal !== undefined && capVal > 0 && freeVal === 0,
    isEmpty: availVal === 0,
    observations: [available, freeDocks, capacity, ebikes].filter((r): r is Reading => !!r),
  };
}


export function educationSummary(readings: Reading[]) {
  const cap = readings.find(r => r.metric === "edu_capacity")?.value;
  const enr = readings.find(r => r.metric === "edu_enrollment")?.value;
  const rate = readings.find(r => r.metric === "edu_utilization")?.value;
  if (cap === undefined && enr === undefined) return undefined;
  const format = (v: number) => v.toLocaleString("de-DE");
  const summary = cap !== undefined && enr !== undefined
    ? `${format(enr)} von ${format(cap)} Plätzen belegt (${rate ?? Math.round((enr / cap) * 100)}% Auslastung)`
    : enr !== undefined
    ? `${format(enr)} angemeldete Kinder / Schüler`
    : `${format(cap!)} Plätze Kapazität`;
  const details: string[] = [];
  if (cap !== undefined && enr !== undefined) {
    const free = cap - enr;
    if (free > 0) details.push(`${format(free)} freie Plätze verfügbar`);
    else if (free === 0) details.push("Voll ausgelastet (keine freien Plätze)");
    else details.push(`Überbelegung: +${format(Math.abs(free))} Plätze`);
  }
  return { summary, details };
}

export function parseStoredCategories(raw: string | null): Category[] {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (Array.isArray(value) && value.every(v => CATEGORY_IDS.includes(v as Category))) return [...new Set(value)] as Category[];
  } catch { /* Unavailable or old preferences use the default. */ }
  return DEFAULT_MAP_CATEGORIES;
}

export interface NatureArea {
  id: string;
  name: string;
  designation: string;
  municipality: string;
  area_hectares?: number | null;
  legal_ordinance_year?: number | null;
  conservation_aims?: string | null;
  visiting_rules?: Record<string, any> | null;
  geojson: any;
  source: string;
}

export interface CropZone {
  id: string;
  municipality: string;
  crop_name: string;
  crop_family: string;
  year: number;
  area_hectares?: number | null;
  irrigation_demand_class?: string | null;
  geojson: any;
}

export interface AgriculturalStat {
  municipality: string;
  year: number;
  crop_family: string;
  crop_name: string;
  area_hectares: number;
  percentage_of_agricultural_land: number;
}

export interface FloodGauge {
  id: string;
  name: string;
  water_body: string;
  municipality: string;
  latitude: number;
  longitude: number;
  current_level_m: number;
  discharge_m3_s?: number | null;
  alarm_level_1_m: number;
  alarm_level_2_m: number;
  alarm_level_3_m: number;
  status: string;
  source: string;
  updated_at: string;
}

export interface MapServiceLayer {
  id: string;
  title: string;
  category: string;
  service_type: string;
  wms_url: string;
  layer_name: string;
  legend_url?: string | null;
  attribution: string;
  default_opacity: number;
  min_zoom: number;
  max_zoom: number;
}

