"use client";

import { useState } from "react";
import Image from "next/image";
import { ExternalLink, Maximize2, X, AlertTriangle, Layers, Radio, Activity } from "lucide-react";
import type { MapEvidence } from "@/lib/pitchData";

interface MapEvidenceViewerProps {
  items: MapEvidence[];
}

export default function MapEvidenceViewer({ items }: MapEvidenceViewerProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<MapEvidence | null>(null);

  const current = items[activeTab] || items[0];

  function getIcon(name: string) {
    if (name.includes("Sensor.Community")) return <Activity className="w-4 h-4 text-emerald-400" />;
    if (name.includes("TTN")) return <Radio className="w-4 h-4 text-sky-400" />;
    return <Layers className="w-4 h-4 text-amber-400" />;
  }

  return (
    <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-2xl space-y-4">
      {/* Evidence Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Der Ried-Blindfleck im Beweis
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                Fakten & Datenlücken
              </span>
            </h4>
            <p className="text-xs text-slate-400">
              Vergleich der drei führenden globalen Citizen-Science & Funk-Netzwerke im Hessischen Ried
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 border border-slate-800 rounded-2xl overflow-x-auto">
          {items.map((item, idx) => (
            <button
              key={item.serviceName}
              onClick={() => setActiveTab(idx)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === idx
                  ? "bg-slate-800 text-slate-100 shadow-sm border border-slate-700 font-semibold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              {getIcon(item.serviceName)}
              <span>{item.serviceName.split(" ")[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area: Image + Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Map Preview Image with Lightbox Trigger */}
        <div className="lg:col-span-7 relative group rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-950 shadow-inner">
          <div className="relative aspect-[16/9] w-full">
            <Image
              src={current.imagePath}
              alt={current.headline}
              fill
              className="object-cover object-center group-hover:scale-102 transition-transform duration-300"
              sizes="(max-width: 768px) 100vw, 55vw"
            />
          </div>

          {/* Overlay Tag */}
          <div className="absolute top-3 left-3 bg-slate-950/90 backdrop-blur-md border border-slate-700/80 rounded-xl px-3 py-1 text-xs text-slate-200 font-medium flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span>{current.impactBadge}</span>
          </div>

          {/* Expand Lightbox Button */}
          <button
            onClick={() => setLightboxImage(current)}
            className="absolute bottom-3 right-3 p-2 bg-slate-950/90 hover:bg-slate-900 text-slate-200 hover:text-emerald-400 rounded-xl border border-slate-700/80 shadow-lg backdrop-blur-md transition-all flex items-center gap-1.5 text-xs font-medium"
            title="Großansicht öffnen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Vergrößern</span>
          </button>
        </div>

        {/* Narrative & Ried Status */}
        <div className="lg:col-span-5 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              {current.serviceName}
            </div>
            <h5 className="text-lg md:text-xl font-bold text-slate-100 leading-snug">
              {current.headline}
            </h5>
            <p className="text-sm text-slate-300 leading-relaxed">
              {current.description}
            </p>
          </div>

          {/* Ried-spezifische Auswertung */}
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
            <div className="text-xs font-bold text-rose-400 uppercase tracking-wide flex items-center gap-1.5">
              <span>Befund im Hessischen Ried</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-mono">
              {current.riedStatus}
            </p>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-1">
            <a
              href={current.serviceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <span>Live-Karte bei {current.serviceName.split(" ")[0]} öffnen</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <span className="text-[11px] text-slate-400">
              Klick aufs Bild zum Zoomen
            </span>
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col justify-center items-center p-4 sm:p-8 animate-in fade-in duration-200"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="max-w-6xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 space-y-4 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-100">
                  {lightboxImage.headline} · {lightboxImage.serviceName}
                </h3>
                <p className="text-xs text-rose-400 font-medium">
                  {lightboxImage.riedStatus}
                </p>
              </div>
              <button
                onClick={() => setLightboxImage(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative w-full aspect-[16/9] max-h-[70vh] rounded-2xl overflow-hidden border border-slate-800 bg-black">
              <Image
                src={lightboxImage.imagePath}
                alt={lightboxImage.headline}
                fill
                className="object-contain"
                sizes="95vw"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs text-slate-400">
              <p>{lightboxImage.description}</p>
              <a
                href={lightboxImage.serviceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-emerald-400 hover:underline shrink-0"
              >
                <span>Live-Dienst aufrufen</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
