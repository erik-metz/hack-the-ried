"use client";

import React, { useState } from "react";
import {
  Satellite,
  Download,
  Calendar,
  Layers,
  Sparkles,
  FileCode,
  Archive,
  Check,
  AlertCircle,
  Clock,
  ExternalLink,
  Info,
} from "lucide-react";

const PRESETS = [
  { label: "Aktuelle Saison 2026", start: "2026-04-01", end: "2026-09-30", hint: "Neueste Befliegungen" },
  { label: "Saison 2025", start: "2025-04-01", end: "2025-09-30", hint: "Spätsommer-Zyklus" },
  { label: "Dürresommer 2023", start: "2023-06-01", end: "2023-09-30", hint: "Hitzewellen-Szenen" },
  { label: "Feuchtes Frühjahr 2023", start: "2023-03-01", end: "2023-06-01", hint: "Wasserreiche Referenz" },
  { label: "Rekord-Dürre 2022", start: "2022-06-01", end: "2022-09-30", hint: "Historischer Tiefstand" },
];

export default function SatelliteDownloadSection() {
  const [startDate, setStartDate] = useState("2026-04-01");
  const [endDate, setEndDate] = useState("2026-09-30");
  const [selectedLayer, setSelectedLayer] = useState<"rgb" | "ndvi" | "all">("all");
  const [selectedFormat, setSelectedFormat] = useState<"zip" | "json">("zip");
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const applyPreset = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    setErrorMessage("");
  };

  const handleDownload = async () => {
    if (!startDate || !endDate) {
      setErrorMessage("Bitte gib sowohl ein Start- als auch ein Enddatum an.");
      return;
    }
    if (startDate > endDate) {
      setErrorMessage("Das Startdatum muss vor oder am Enddatum liegen.");
      return;
    }

    setIsDownloading(true);
    setErrorMessage("");
    setDownloadSuccess(false);

    try {
      const url = `/api/satellite/download?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}&layer=${encodeURIComponent(selectedLayer)}&format=${encodeURIComponent(selectedFormat)}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || errorData?.detail || `Fehler beim Abruf (Status ${response.status})`);
      }

      // Read blob and trigger browser file download
      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = `hack-the-ried-sentinel2-${selectedLayer}-${startDate}-to-${endDate}.${selectedFormat}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      const objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(objectUrl);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Download fehlgeschlagen. Bitte versuche es erneut.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <section id="satellit-download" className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8 space-y-6 shadow-2xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            <Satellite className="size-3.5" /> Copernicus Sentinel-2 Zeitreihen-Download
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2">
            <span>Satellitenbilder für bestimmten Zeitraum herunterladen</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono">
              ZIP &amp; GeoTIFF
            </span>
          </h2>
          <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
            Wähle ein Start- und Enddatum, um alle wolkenfreien Sentinel-2 Satellitenaufnahmen über dem Hessischen Ried
            als <strong>komplettes ZIP-Bilderarchiv</strong> oder als <strong>GIS-Manifest mit originalen 10m-COG-Links</strong> herunterzuladen.
          </p>
        </div>
      </div>

      {/* Quick Presets */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Clock className="size-3.5 text-emerald-400" />
          <span>Häufige Zeiträume &amp; Dürre-Referenzen:</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const isActive = startDate === p.start && endDate === p.end;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.start, p.end)}
                className={`px-3 py-1.5 rounded-xl text-xs transition-all border flex items-center gap-1.5 ${
                  isActive
                    ? "bg-emerald-950 border-emerald-500/50 text-emerald-300 font-medium shadow-sm"
                    : "bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
                title={`${p.start} bis ${p.end} (${p.hint})`}
              >
                <span>{p.label}</span>
                <span className="text-[10px] text-slate-500 hidden sm:inline">({p.hint})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Download Configuration Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-5 rounded-2xl bg-slate-950/80 border border-slate-800">
        {/* Start Date */}
        <div className="space-y-1.5">
          <label htmlFor="sat-start-date" className="block text-xs font-semibold text-slate-300">
            Startdatum (YYYY-MM-DD):
          </label>
          <div className="relative">
            <input
              id="sat-start-date"
              type="date"
              value={startDate}
              min="2020-01-01"
              max="2026-12-31"
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-400"
            />
          </div>
        </div>

        {/* End Date */}
        <div className="space-y-1.5">
          <label htmlFor="sat-end-date" className="block text-xs font-semibold text-slate-300">
            Enddatum (YYYY-MM-DD):
          </label>
          <div className="relative">
            <input
              id="sat-end-date"
              type="date"
              value={endDate}
              min="2020-01-01"
              max="2026-12-31"
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-400"
            />
          </div>
        </div>

        {/* Layer Selection */}
        <div className="space-y-1.5">
          <label htmlFor="sat-layer" className="block text-xs font-semibold text-slate-300">
            Gewünschte Bild-Ebene:
          </label>
          <select
            id="sat-layer"
            value={selectedLayer}
            onChange={(e) => setSelectedLayer(e.target.value as "rgb" | "ndvi" | "all")}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-400"
          >
            <option value="all">Beide (RGB Echtfarben &amp; NDVI)</option>
            <option value="rgb">🌍 Nur Echtfarben (True Color RGB)</option>
            <option value="ndvi">🌱 Nur NDVI (Vegetationsindex)</option>
          </select>
        </div>

        {/* Format Selection */}
        <div className="space-y-1.5">
          <label htmlFor="sat-format" className="block text-xs font-semibold text-slate-300">
            Export-Format:
          </label>
          <select
            id="sat-format"
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value as "zip" | "json")}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-400"
          >
            <option value="zip">📦 ZIP-Bilderarchiv (.zip mit Bildern &amp; Manifest)</option>
            <option value="json">📄 GIS-Manifest &amp; COG-Links (.json)</option>
          </select>
        </div>
      </div>

      {/* Error or Success Feedback */}
      {errorMessage && (
        <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800 text-red-200 text-xs flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {downloadSuccess && (
        <div role="status" className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-2">
          <Check className="size-4 shrink-0 text-emerald-400" />
          <span>Download erfolgreich gestartet! Die Datei wird auf deinem Gerät gespeichert.</span>
        </div>
      )}

      {/* Action Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Info className="size-4 text-cyan-400 shrink-0" />
          <span>
            Enthält automatische BBOX-Clipping-Bilder des Hessischen Rieds [49.54, 8.33, 49.75, 8.58] und Metadaten.
          </span>
        </div>

        <button
          type="button"
          disabled={isDownloading}
          onClick={handleDownload}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {isDownloading ? (
            <>
              <span className="size-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
              <span>Archiv wird erstellt …</span>
            </>
          ) : (
            <>
              <Download className="size-4" />
              <span>
                {selectedFormat === "zip" ? "Bilder als ZIP herunterladen" : "JSON-Manifest herunterladen"}
              </span>
            </>
          )}
        </button>
      </div>
    </section>
  );
}
