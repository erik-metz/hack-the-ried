"use client";

import { useState } from "react";
import {
  Printer,
  X,
  Sun,
  Moon,
  MapPin,
} from "lucide-react";
import type { PitchDeck } from "@/lib/pitchData";

interface HandoutModalProps {
  deck: PitchDeck;
  onClose: () => void;
}

export default function HandoutModal({ deck, onClose }: HandoutModalProps) {
  // Theme state: "ink-saver" (white background) vs "dark"
  const [inkSaverMode, setInkSaverMode] = useState(true);

  function handlePrint() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  const asks = deck.slides.flatMap((slide) => slide.specificAsks ?? []);
  const origin = deck.slides.find((slide) => slide.id.endsWith("-origin"));
  const collected = deck.slides.find((slide) => slide.id.endsWith("-collected"));

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col justify-center items-center p-2 sm:p-6 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Top Modal Controls (Hidden during print) */}
      <div
        className="max-w-4xl w-full flex items-center justify-between gap-3 mb-3 print:hidden bg-slate-900 border border-slate-800 p-3 rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-300">
            Handout-Generator:
          </span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {deck.badge}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme Switcher for printing */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
            <button
              onClick={() => setInkSaverMode(true)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${
                inkSaverMode
                  ? "bg-white text-slate-950 font-bold shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Weißer Hintergrund: Spart Tinte & Toner beim Ausdrucken"
            >
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>Druck-Weiß (Tinte sparen)</span>
            </button>
            <button
              onClick={() => setInkSaverMode(false)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${
                !inkSaverMode
                  ? "bg-slate-800 text-slate-100 font-bold shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Originales dunkles Design der Website"
            >
              <Moon className="w-3.5 h-3.5 text-sky-400" />
              <span>Dark Theme</span>
            </button>
          </div>

          {/* Print Button */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition-all"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Als PDF drucken</span>
          </button>

          {/* Close Button */}
          <button
            onClick={onClose}
            aria-label="Handout schließen"
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Handout Page (Engineered for A4 Print & PDF) */}
      <div
        id="handout-print-area"
        className={`max-w-4xl w-full rounded-3xl p-6 sm:p-10 shadow-2xl transition-all print:p-0 print:shadow-none print:rounded-none ${
          inkSaverMode
            ? "bg-white text-slate-900 border border-slate-300 print:border-none"
            : "bg-slate-950 text-slate-100 border border-slate-800"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Document Header */}
        <div
          className={`flex items-start justify-between gap-4 pb-6 mb-6 border-b ${
            inkSaverMode ? "border-slate-200" : "border-slate-800"
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-black text-xl tracking-tight text-emerald-600">
                HackTheRied
              </span>
              <span
                className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  inkSaverMode
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                    : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                }`}
              >
                Stakeholder Dossier & One-Pager
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {deck.title}
            </h1>
            <p
              className={`text-sm ${
                inkSaverMode ? "text-slate-600" : "text-slate-400"
              }`}
            >
              Zielgruppe: <strong>{deck.targetAudience}</strong> · Standort: Kulturzentrum KAMÜ, Bürstadt
            </p>
          </div>

          <div
            className={`text-right text-xs shrink-0 p-2.5 rounded-xl border ${
              inkSaverMode
                ? "bg-slate-50 border-slate-200 text-slate-600"
                : "bg-slate-900 border-slate-800 text-slate-400"
            }`}
          >
            <div className="font-bold text-slate-900 dark:text-slate-100">
              Oktober 2026
            </div>
            <div>hack-the-ried.de/pitch/{deck.slug}</div>
          </div>
        </div>

        {/* Executive Summary & Hook */}
        <div
          className={`p-4 rounded-2xl mb-6 border ${
            inkSaverMode
              ? "bg-emerald-50/60 border-emerald-200 text-emerald-950"
              : "bg-emerald-950/30 border-emerald-500/30 text-emerald-200"
          }`}
        >
          <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1">
            Die Initiative
          </h2>
          <p className="text-sm sm:text-base font-medium leading-relaxed">
            {deck.subtitle}
          </p>
        </div>

        <div className="mb-6 space-y-5">
          <section><h2 className="text-lg font-bold">Unsere gemeinsame Idee</h2><p className="mt-2">{deck.subtitle}</p><p className="mt-2">{origin?.lead}</p></section>
          <section><h2 className="text-lg font-bold">{collected?.title}</h2><p className="mt-2">{collected?.lead}</p>
            <ul className="mt-2 list-disc pl-5 space-y-2">{collected?.bullets?.map((bullet) => <li key={bullet.title}><strong>{bullet.title}:</strong> {bullet.description}</li>)}</ul>
          </section>
          <p className="text-sm">Eigene Sensoren ergänzen die Datenbasis. Schulprojekte und Kurse ermöglichen praktische digitale Bildung. Beim Hackathon können Teams Daten untersuchen und erste Prototypen entwickeln.</p>
        </div>

        {/* The Ask / Konkrete Commitments */}
        {asks.length > 0 && (
          <div
            className={`p-5 rounded-2xl border mb-6 space-y-3 ${
              inkSaverMode
                ? "bg-slate-50 border-slate-300"
                : "bg-slate-900/80 border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Unsere konkreten Bitten
              </h3>
              <span className="text-[11px] font-semibold text-slate-500">
                Für das Kooperationsgespräch
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {asks.map((ask) => (
                <div
                  key={ask.id}
                  className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                    inkSaverMode
                      ? "bg-white border-slate-200"
                      : "bg-slate-950 border-slate-800"
                  }`}
                >
                  <div className="w-4 h-4 rounded border border-slate-400 mt-0.5 shrink-0 flex items-center justify-center">
                    <span className="text-[10px] text-slate-400 font-mono">

                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-bold">{ask.title}</h4>
                    <p
                      className={`text-[11px] leading-relaxed ${
                        inkSaverMode ? "text-slate-600" : "text-slate-400"
                      }`}
                    >
                      {ask.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer & Contact */}
        <div
          className={`flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t text-xs ${
            inkSaverMode
              ? "border-slate-200 text-slate-600"
              : "border-slate-800 text-slate-400"
          }`}
        >
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-600" />
            <span>
              <strong>Kulturzentrum KAMÜ</strong> · Bürstadt (Hessen) · E-Mail: info@hack-the-ried.de
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span>Online-Bauanleitung: <strong>hack-the-ried.de/sensor-bauen</strong></span>
            <span>•</span>
            <span>Dashboard: <strong>hack-the-ried.de</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}
