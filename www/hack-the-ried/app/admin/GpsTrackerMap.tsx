"use client";

import L from "leaflet";
import { useCallback, useEffect, useRef, useState } from "react";
import { publicMapTileUrl } from "@/lib/publicMapData";
import { Radio, RefreshCw, ShieldCheck, MapPin, Eye, EyeOff, Navigation } from "lucide-react";
import "leaflet/dist/leaflet.css";

interface GpsPoint {
  id: number;
  device_id: string;
  recorded_at: string;
  received_at: string;
  slot_index: number;
  has_fix: boolean;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  satellites?: number;
  received_by_own_gateway: boolean;
  own_gateway_rssi?: number | null;
  own_gateway_snr?: number | null;
  best_gateway_id?: string | null;
  best_gateway_rssi?: number | null;
  best_gateway_snr?: number | null;
  gateway_count: number;
  decryption_error?: boolean;
}

export default function GpsTrackerMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const [points, setPoints] = useState<GpsPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyOwnGateway, setOnlyOwnGateway] = useState(false);

  const fetchPoints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/admin/gps-tracker?only_own_gateway=${onlyOwnGateway}&limit=1000`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Fehler beim Laden (${res.status})`);
      }
      const data = await res.json();
      setPoints(data.points || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [onlyOwnGateway]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPoints();
  }, [fetchPoints]);

  // Map initialization
  useEffect(() => {
    if (!container.current || mapRef.current) return;

    const defaultCenter: L.LatLngExpression = [49.683, 8.455]; // Lampertheim / Ried
    const map = L.map(container.current, {
      scrollWheelZoom: true,
      dragging: true,
    }).setView(defaultCenter, 13);

    L.tileLayer(publicMapTileUrl("base"), {
      minZoom: 6,
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = layerGroup;

    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(container.current);

    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update map markers whenever points change
  useEffect(() => {
    if (!mapRef.current || !layerGroupRef.current) return;
    const layerGroup = layerGroupRef.current;
    layerGroup.clearLayers();

    const validPoints = points.filter(
      (p) => p.has_fix && typeof p.latitude === "number" && typeof p.longitude === "number"
    );

    if (validPoints.length === 0) return;

    // Draw route line
    const latLngs: L.LatLngExpression[] = validPoints.map((p) => [
      p.latitude!,
      p.longitude!,
    ]);
    const routeLine = L.polyline(latLngs, {
      color: "#6366f1",
      weight: 3,
      opacity: 0.7,
      dashArray: "4, 6",
    });
    layerGroup.addLayer(routeLine);

    // Draw markers
    validPoints.forEach((pt) => {
      const isOwn = pt.received_by_own_gateway;
      const color = isOwn ? "#10b981" : "#f59e0b"; // Emerald green vs Amber orange
      const fillColor = isOwn ? "#059669" : "#d97706";

      const circle = L.circleMarker([pt.latitude!, pt.longitude!], {
        radius: isOwn ? 7 : 6,
        color,
        fillColor,
        fillOpacity: 0.9,
        weight: 2,
      });

      const timeFormatted = new Date(pt.recorded_at).toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      const popupHtml = `
        <div style="font-family: inherit; font-size: 13px; min-width: 200px;">
          <div style="font-weight: bold; margin-bottom: 4px; color: ${color};">
            ${isOwn ? "🟢 Eigenes Gateway (Empfangen)" : "🟠 Nur Fremd-Gateway"}
          </div>
          <div style="color: #64748b; font-size: 11px; margin-bottom: 8px;">
            Zeitpunkt: <b>${timeFormatted}</b> (Slot ${pt.slot_index + 1}/5)
          </div>
          <div style="margin-bottom: 4px;">
            <b>Signalstärke:</b> ${
              isOwn
                ? `${pt.own_gateway_rssi ?? "?"} dBm (SNR: ${pt.own_gateway_snr ?? "?"} dB)`
                : `${pt.best_gateway_rssi ?? "?"} dBm (${pt.best_gateway_id ?? "Fremd-GW"})`
            }
          </div>
          <div style="margin-bottom: 4px;">
            <b>Satelliten:</b> ${pt.satellites ?? "N/A"} | <b>Höhe:</b> ${pt.altitude ?? "N/A"} m
          </div>
          <div style="color: #64748b; font-size: 11px;">
            Gehört von insgesamt ${pt.gateway_count} Gateway(s)
          </div>
        </div>
      `;

      circle.bindPopup(popupHtml);
      layerGroup.addLayer(circle);
    });

    // Auto-fit bounds to all points
    const bounds = L.latLngBounds(latLngs);
    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [points]);

  // Statistics calculation
  const totalPoints = points.length;
  const ownPoints = points.filter((p) => p.received_by_own_gateway).length;
  const foreignPoints = totalPoints - ownPoints;
  const ownRatio = totalPoints > 0 ? Math.round((ownPoints / totalPoints) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Top Banner / Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-700/60 bg-slate-800/80 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Punkte gesamt</span>
            <Navigation className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{totalPoints}</div>
          <div className="mt-1 text-xs text-slate-400">Aus 5-Minuten-Paketen</div>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-400">Eigenes Gateway</span>
            <Radio className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-300">{ownPoints}</div>
          <div className="mt-1 text-xs text-emerald-500/80">{ownRatio}% aller Punkte</div>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-400">Nur Fremd-Gateways</span>
            <MapPin className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-300">{foreignPoints}</div>
          <div className="mt-1 text-xs text-amber-500/80">Außerhalb eigener Reichweite</div>
        </div>

        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-cyan-400">Sicherheitsstatus</span>
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-sm font-semibold text-cyan-300">AES-256-GCM</div>
          <div className="mt-1 text-xs text-cyan-400/80">Verschlüsselt in DB</div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/60 bg-slate-800/80 p-3">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setOnlyOwnGateway(!onlyOwnGateway)}
            className={`inline-flex items-center space-x-2 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              onlyOwnGateway
                ? "bg-emerald-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            {onlyOwnGateway ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            <span>Nur eigenes Gateway</span>
          </button>

          <div className="hidden sm:flex items-center space-x-4 text-xs text-slate-400">
            <span className="flex items-center space-x-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
              <span>Eigenes Gateway</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
              <span>Fremdes Gateway</span>
            </span>
          </div>
        </div>

        <button
          onClick={fetchPoints}
          disabled={loading}
          className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-600 bg-slate-700/60 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-600 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Aktualisieren</span>
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Map Container */}
      <div
        ref={container}
        className="h-[520px] w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-inner"
        role="region"
        aria-label="GPS Tracker Reichweitenkarte"
      />
    </div>
  );
}
