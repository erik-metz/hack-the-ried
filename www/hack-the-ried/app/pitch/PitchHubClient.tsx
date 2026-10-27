"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Presentation,
  Copy,
  Check,
  Shield,
  GraduationCap,
  Users,
  Briefcase,
  Sprout,
  Sparkles,
  Layers,
  ArrowRight,
  Info,
  Clock,
  FileText,
  MonitorPlay,
} from "lucide-react";
import { PITCH_DECKS, MAP_EVIDENCE_ITEMS, type PitchDeck } from "@/lib/pitchData";
import HandoutModal from "./HandoutModal";
import MapEvidenceViewer from "./MapEvidenceViewer";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

export default function PitchHubClient() {
  const [handoutDeck, setHandoutDeck] = useState<PitchDeck | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  function handleCopy(slug: string) {
    if (typeof window !== "undefined") {
      const url = `${window.location.origin}/pitch/${slug}`;
      navigator.clipboard.writeText(url);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2500);
    }
  }

  function getDeckIcon(category: string) {
    switch (category) {
      case "politik":
        return <Shield className="w-6 h-6 text-emerald-400" />;
      case "bildung":
        return <GraduationCap className="w-6 h-6 text-sky-400" />;
      case "community":
        return <Users className="w-6 h-6 text-teal-400" />;
      case "wirtschaft":
        return <Briefcase className="w-6 h-6 text-amber-400" />;
      case "umwelt":
        return <Sprout className="w-6 h-6 text-emerald-400" />;
      default:
        return <Presentation className="w-6 h-6 text-slate-400" />;
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      <SiteHeader />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
        {/* Secret / Hidden Area Indicator */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Interne Präsentations-Zentrale:</strong> Diese Seiten sind nicht in der öffentlichen Hauptnavigation verlinkt. Sie dienen gezielt für Vor-Ort-Termine, Beamer-Präsentationen und Stakeholder-Pitches.
            </span>
          </div>
          <Link
            href="/admin"
            className="text-xs font-semibold px-3 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 transition-colors shrink-0"
          >
            Zum Admin Panel →
          </Link>
        </div>

        {/* Hero Section */}
        <div className="space-y-4 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Pitch-Decks & Präsentationen</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-slate-100 tracking-tight leading-tight">
            Vier Gespräche, eine gemeinsame Idee fürs Ried
          </h1>
          <p className="text-base sm:text-lg text-slate-300 font-light leading-relaxed">
            Drei Menschen aus dem Ried möchten einen Hackathon organisieren. Die Website bündelt dafür bereits regionale Daten.
            Eigene Sensoren und Bildungsprojekte ergänzen die Initiative. Jedes Deck führt zu einer konkreten Bitte an seine Zielgruppe.
          </p>
        </div>

        {/* Presenter Features Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-emerald-400">
              <Presentation className="w-4 h-4" />
              <span>Slides & Scroll-Modus</span>
            </div>
            <p className="text-xs text-slate-300">
              Umschaltbar zwischen interaktiver Keynote-Präsentation (Vollbild [F]) und übersichtlichem Dossier zum Durchscrollen.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-sky-400">
              <FileText className="w-4 h-4" />
              <span>Handouts je Zielgruppe</span>
            </div>
            <p className="text-xs text-slate-300">
              Das druckbare One-Pager-Handout öffnest du direkt bei der jeweiligen Präsentation auf dieser Übersicht.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-amber-400">
              <Layers className="w-4 h-4" />
              <span>Daten und Quellen</span>
            </div>
            <p className="text-xs text-slate-300">
              Die Bonusfolie zeigt echte Rohmesswerte seit Vortragsbeginn. Fehlende Daten bleiben als solche erkennbar.
            </p>
          </div>
        </div>

        {/* Deck Cards Grid */}
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2">
              <span>Verfügbare Zielgruppen-Decks</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                {PITCH_DECKS.length} Präsentationen
              </span>
            </h2>
            <span className="text-xs text-slate-400 hidden sm:inline">
              1-Klick Präsentation starten oder Link teilen
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PITCH_DECKS.map((deck) => (
              <div
                key={deck.slug}
                className="group p-6 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-5 shadow-xl relative overflow-hidden"
              >
                <div className="space-y-4">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                      {getDeckIcon(deck.category)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {deck.badge}
                      </span>
                    </div>
                  </div>

                  {/* Title & Target */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>ca. {deck.estimatedMinutes} Min.</span>
                      <span>•</span>
                      <span>{deck.slides.length} Folien</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-100 group-hover:text-emerald-400 transition-colors leading-snug">
                      {deck.title}
                    </h3>
                    <p className="text-xs font-semibold text-emerald-400/90">
                      Ziel: {deck.targetAudience}
                    </p>
                  </div>

                  {/* Summary */}
                  <p className="text-xs text-slate-300 font-light leading-relaxed">
                    {deck.summary}
                  </p>
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-slate-800/80 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/pitch/${deck.slug}`}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-500/10 transition-all"
                    >
                      <MonitorPlay className="w-3.5 h-3.5" />
                      <span>Präsentieren</span>
                    </Link>

                    <button
                      onClick={() => handleCopy(deck.slug)}
                      className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 transition-all"
                      title="Direktlink kopieren"
                    >
                      {copiedSlug === deck.slug ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <button type="button" onClick={() => setHandoutDeck(deck)} className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 py-2.5 text-sm text-slate-200" aria-label={`One-Pager-Handout: ${deck.badge}`}><FileText className="h-4 w-4" />One-Pager-Handout</button>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-1">
                    <span className="font-mono text-slate-400">/pitch/{deck.slug}</span>
                    <Link
                      href={`/pitch/${deck.slug}`}
                      className="hover:text-emerald-400 flex items-center gap-1 transition-colors"
                    >
                      <span>Vorschau</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Global Evidence Maps Showcase */}
        <div className="space-y-6 pt-6">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2">
              <span>Hintergrund für Rückfragen: externe Netzwerke</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Diese Karten bilden jeweils ein bestimmtes Netzwerk ab. Für Aussagen zur Abdeckung den aktuellen Stand direkt bei der Quelle prüfen.
            </p>
          </div>

          <MapEvidenceViewer items={MAP_EVIDENCE_ITEMS} />
        </div>

        {/* Presenter Guidelines / Speaker Tips */}
        <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4">
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            Tipps für erfolgreiche Stakeholder-Präsentationen
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
              <strong className="text-slate-100 block text-sm font-semibold">1. Beamer & Shortcuts nutzen</strong>
              <p className="leading-relaxed">
                Drücke <kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-[11px] text-slate-200">F</kbd> für Vollbildmodus. 
                Navigation klappt mit den Pfeiltasten oder der Leertaste.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
              <strong className="text-slate-100 block text-sm font-semibold">2. Frei erzählen</strong>
              <p className="leading-relaxed">
                Lies niemals die Folien ab! Die Slides liefern visuelle Anker (Zahlen, Karten, Stichworte). Deine Stimme und Begeisterung für das Projekt tragen den Vortrag.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
              <strong className="text-slate-100 block text-sm font-semibold">3. Hardware zum Anfassen mitbringen</strong>
              <p className="leading-relaxed">
                Bring wenn möglich einen aufgebauten Sensor mit. Damit lässt sich das geplante Bauprojekt anschaulich erklären.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
              <strong className="text-slate-100 block text-sm font-semibold">4. Konkreten Call to Action einfordern</strong>
              <p className="leading-relaxed">
                Beende kein Gespräch ohne den nächsten konkreten Schritt: Einen Datenansprechpartner benennen, einen Planungstermin festhalten oder einen ersten Beitrag abstimmen.
              </p>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
      {handoutDeck && <HandoutModal deck={handoutDeck} onClose={() => setHandoutDeck(null)} />}
    </div>
  );
}
