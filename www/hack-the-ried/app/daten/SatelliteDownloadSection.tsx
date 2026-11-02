"use client";

import React, { useState } from "react";
import { Download, Check, AlertCircle, Clock } from "lucide-react";

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
    <section id="satellit-download" className="scroll-mt-24 border-t border-slate-800 p-5 sm:p-6 space-y-5">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Zeitraum &amp; Bildtyp wählen</h3>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-300">Sentinel-2-Aufnahmen für das Hessische Ried: Echtfarben (RGB) und Vegetationsindex (NDVI). Wähle ein ZIP-Bilderarchiv oder ein GIS-Manifest mit Links zu den originalen 10-m-GeoTIFFs.</p>
      </div>

      {/* Quick Presets */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Clock className="size-3.5 text-emerald-400" />
          <span>Zeitraum vorbelegen</span>
        </p>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <option value="rgb">Nur Echtfarben (True Color RGB)</option>
            <option value="ndvi">Nur NDVI (Vegetationsindex)</option>
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
            <option value="zip">ZIP-Bilderarchiv (.zip mit Bildern &amp; Manifest)</option>
            <option value="json">GIS-Manifest &amp; COG-Links (.json)</option>
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
        <p className="max-w-xl text-xs leading-relaxed text-slate-400">Bilderarchiv mit regionalem Ausschnitt und Metadaten. Das GIS-Manifest enthält die Links für die Weiterverarbeitung in GIS-Software.</p>

        <button
          type="button"
          disabled={isDownloading}
          onClick={handleDownload}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
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
