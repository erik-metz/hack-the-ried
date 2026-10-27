"use client";

import {
  Box,
  Clock,
  Construction,
  Download,
  ExternalLink,
  FileText,
  Hammer,
  Layers,
  Play,
  Printer,
  Sparkles,
  Video,
} from "lucide-react";

export default function DownloadsAndMediaSection() {
  return (
    <section id="downloads" className="space-y-6">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
          <Download className="w-3.5 h-3.5" /> Downloads &amp; Medien
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-100">
          Vorlagen, 3D-Druck (STL) &amp; Video-Tutorial
        </h2>
        <p className="text-slate-300 text-sm max-w-3xl leading-relaxed">
          Hier entstehen alle digitalen Begleitmaterialien für den Zusammenbau deiner Station:
          Gehäuse-Dateien für deinen 3D-Drucker, druckbare PDF-Datenblätter und der Video-Demoleitfaden.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* VIDEO TUTORIAL DEMO (IN PROGRESS / COMING SOON) */}
        <div className="lg:col-span-2 rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-5 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Video className="w-4 h-4" /> Video-Tutorial (Zusammenbau)
              </span>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-semibold flex items-center gap-1">
                <Construction className="w-3 h-3" />
                Wir arbeiten noch daran · In Kürze verfügbar
              </span>
            </div>
            <h3 className="text-xl font-bold text-slate-100">
              Video-Leitfaden: Von der Platine bis zum ersten Funk-Telegramm
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              In diesem ca. 15-minütigen Video zeigen wir dir in Nahaufnahme: das Anlöten der
              I²C-Sensoren an das RAK3113-Board, den Einbau in das Lamellengehäuse und die
              Live-Überprüfung auf der HackTheRied Karte.
            </p>
          </div>

          {/* VIDEO PLAYER PREVIEW CONTAINER */}
          <div className="relative group overflow-hidden rounded-2xl bg-slate-950 border border-slate-800 aspect-video flex items-center justify-center shadow-inner">
            {/* Background Aesthetic */}
            <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-slate-900 to-amber-950/20 opacity-90" />
            
            <div className="absolute top-4 left-4 flex items-center gap-2 text-[11px] font-mono text-slate-300 bg-slate-950/90 px-3 py-1 rounded-lg border border-slate-800">
              <Clock className="w-3.5 h-3.5 text-amber-400" /> ca. 15 Minuten (Geplant)
            </div>

            <div className="absolute top-4 right-4 flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg">
              <Hammer className="w-3 h-3" /> In Produktion
            </div>

            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs text-slate-400 bg-slate-950/90 px-3 py-2 rounded-xl border border-slate-800">
              <span>Kapitel: Werkzeug · Löten · Stevenson-Gehäuse · TTN-Test</span>
              <span className="text-emerald-400 font-semibold">1080p HD</span>
            </div>

            {/* Play Button Overlay with "Coming Soon" note */}
            <div className="relative z-10 flex flex-col items-center gap-3 p-4 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-800/90 border border-slate-700 text-slate-400 flex items-center justify-center shadow-xl group-hover:scale-105 group-hover:border-amber-400/50 transition-all">
                <Play className="w-7 h-7 fill-slate-400 ml-1 text-slate-400" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-200">
                  Video-Tutorial wird derzeit im KAMÜ gefilmt
                </p>
                <p className="text-xs text-amber-300/90">
                  Wird rechtzeitig vor dem nächsten Workshop-Termin hier freigeschaltet.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 3D-PRINT & PDF DOWNLOAD CARDS */}
        <div className="space-y-4 flex flex-col justify-between">
          {/* 3D-PRINT STL CARD (COMING SOON) */}
          <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center">
                <Box className="w-4 h-4" />
              </span>
              <span className="text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1 font-semibold">
                <Construction className="w-2.5 h-2.5" /> Kommt bald · In Konstruktion
              </span>
            </div>
            <div>
              <h4 className="font-bold text-slate-100 text-base">
                Stevenson Screen Gehäuse (STL)
              </h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Wetterfeste Lamellenkonstruktion mit Montageplatte für das RAK3113, SPS30-Kanal und
                Sensoren. Das 3D-Modell wird aktuell konstruiert und getestet.
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
              <div><strong>Material:</strong> PETG oder ASA (weiß, UV-stabil)</div>
              <div><strong>Verfügbarkeit:</strong> Wird rechtzeitig vor Workshop-Start freigeschaltet</div>
            </div>
            <div className="flex items-center justify-center gap-2 w-full rounded-xl bg-slate-950 border border-slate-800 text-slate-500 px-4 py-2.5 text-xs font-medium cursor-not-allowed">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>3D-Druckdateien folgen in Kürze</span>
            </div>
          </div>

          {/* PDF MANUAL CHEATSHEET CARD (COMING SOON) */}
          <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </span>
              <span className="text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/30 font-semibold">
                Kommt bald · In Redaktion
              </span>
            </div>
            <div>
              <h4 className="font-bold text-slate-100 text-base">
                Druckfertige Bauanleitung (PDF)
              </h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Kompakte 2-seitige Schnellübersicht mit I²C-Adressenliste, Schaltplan und
                Lötanleitung zum Ausdrucken auf die Werkbank.
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
              <div><strong>Format:</strong> A4 PDF (2 Seiten, druckoptimiert)</div>
              <div><strong>Status:</strong> Layoutierung für Druckfassung</div>
            </div>
            <a
              href="https://github.com/erik-metz/kamue-digital-lora-sensor/blob/main/hardware/sensor-node/v2/bom.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-emerald-300 font-semibold px-4 py-2.5 text-xs transition-colors border border-slate-700"
            >
              <Printer className="w-3.5 h-3.5 text-blue-400" />
              <span>Online-BOM vorab auf GitHub ansehen</span>
              <ExternalLink className="w-3 h-3 text-slate-500 ml-1" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
