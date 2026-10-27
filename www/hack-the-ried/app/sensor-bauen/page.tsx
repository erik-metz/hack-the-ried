import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import WorkshopRegistrationForm from "./WorkshopRegistrationForm";
import BOMSection from "./BOMSection";
import AssemblyGuideSection from "./AssemblyGuideSection";
import DownloadsAndMediaSection from "./DownloadsAndMediaSection";
import EducationalHubSection from "./EducationalHubSection";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Cpu,
  Download,
  ExternalLink,
  Flame,
  HeartHandshake,
  Layers,
  MapPin,
  Radio,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Umweltsensor selber bauen (LoRaWAN & Citizen Science) | HackTheRied",
  description:
    "Bauanleitung, Stückliste (BOM) & DIY-Workshops im Hessischen Ried (Bürstadt & Lampertheim). Baue deine eigene Wetter- & Klimastation mit RAK3113, Feinstaub, CO2 & LoRaWAN.",
  keywords: [
    "Umweltsensor selber bauen",
    "LoRaWAN Sensor DIY",
    "Bürstadt Sensorbau",
    "Kulturzentrum KAMÜ",
    "Citizen Science Ried",
    "Wetterstation bauen",
    "RAK3113 LoRaWAN",
    "Feinstaub Sensor SPS30",
    "CO2 Sensor SCD41",
    "Lampertheim Umweltdaten",
  ],
  openGraph: {
    title: "Umweltsensor selber bauen · HackTheRied",
    description:
      "Stückliste, 3D-Druck Gehäuse, Bauanleitung und Workshop-Termine im Kulturzentrum KAMÜ in Bürstadt.",
    url: "https://hack-the-ried.de/sensor-bauen",
    siteName: "HackTheRied",
    locale: "de_DE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Umweltsensor selber bauen · HackTheRied",
    description:
      "Baue deine eigene LoRaWAN-Multisensor-Station für das Hessische Ried.",
  },
};

export default function SensorBauenPage() {
  // JSON-LD Structured Data for SEO (HowTo & Workshop Event)
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "HowTo",
        "name": "LoRaWAN Umweltsensor-Station v2 selber bauen",
        "description":
          "Schritt-für-Schritt-Anleitung zum Aufbau einer autarken LoRaWAN-Multisensor-Station für das Hessische Ried mit RAK3113, Feinstaub-, CO2- und Klimasensoren.",
        "totalTime": "PT3H",
        "estimatedCost": {
          "@type": "MonetaryAmount",
          "currency": "EUR",
          "value": "100",
        },
        "step": [
          {
            "@type": "HowToStep",
            "name": "Werkzeug & Bauteile vorbereiten",
            "text": "Lötkolben, Zinn, Abisolierzange und RAK3113 Bausatz bereitstellen.",
          },
          {
            "@type": "HowToStep",
            "name": "I²C-Sensoren an RAK3113 anlöten",
            "text": "Klimasensoren SHT41, BME688, SCD41, SGP41 und SPS30 über gemeinsame 3.3V, GND, SDA und SCL Busleitungen verbinden.",
          },
          {
            "@type": "HowToStep",
            "name": "Gehäusemontage im Stevenson Screen",
            "text": "Sensoren und Platine im wetterfesten 3D-Druck-Lamellengehäuse befestigen.",
          },
          {
            "@type": "HowToStep",
            "name": "Firmware flashen & TTN Keys einrichten",
            "text": "Arduino/PlatformIO Firmware auf RAK3113 aufspielen und mit The Things Network verbinden.",
          },
          {
            "@type": "HowToStep",
            "name": "Außenmontage & Inbetriebnahme",
            "text": "868 MHz Antenne anbringen, 5V USB-C Strom anschließen und Messwerte live auf HackTheRied verfolgen.",
          },
        ],
      },
      {
        "@type": "Event",
        "name": "Sensor-Bau-Workshops im Kulturzentrum KAMÜ",
        "description":
          "Mitmach-Workshop für Bürger, Schüler und Vereine: Baue deine eigene Wetter- und Klimastation für Bürstadt und das Ried.",
        "eventStatus": "https://schema.org/EventScheduled",
        "eventAttendanceMode":
          "https://schema.org/OfflineEventAttendanceMode",
        "location": {
          "@type": "Place",
          "name": "Kulturzentrum KAMÜ",
          "address": {
            "@type": "PostalAddress",
            "addressLocality": "Bürstadt",
            "postalCode": "68642",
            "addressCountry": "DE",
          },
        },
        "organizer": {
          "@type": "Organization",
          "name": "HackTheRied / KAMÜ",
          "url": "https://kamue.me",
        },
      },
    ],
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Inject Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Site Header */}
      <SiteHeader />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-16">
        {/* HERO SECTION */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-slate-800 p-8 sm:p-12 shadow-2xl">
          <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" /> Phase 2: Mitmach-Initiative im Ried
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-300 text-xs font-semibold">
                <MapPin className="w-3.5 h-3.5" /> Bürstadt · Lampertheim · Biblis
              </span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-100 leading-tight tracking-tight">
              Baue deine eigene{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300">
                LoRaWAN-Umweltstation
              </span>
            </h1>

            <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
              Mache deinen Garten oder Balkon zum offiziellen Messpunkt für das Hessische Ried!
              Gemeinsam mit dem Kulturzentrum <strong>KAMÜ</strong> in Bürstadt bauen wir ein
              bürgerschaftliches Sensornetzwerk auf. Lerne, wie du eine professionelle
              Multisensor-Station (Temperatur, Feinstaub, CO₂, UV, Lärm &amp; Regen) zusammenbaust,
              über The Things Network (TTN) verbindest und live in unser offenes Datenportal
              einspeist.
            </p>

            {/* Quick Action Navigation */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="#anmeldung"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 font-bold text-sm hover:brightness-110 transition-all shadow-lg shadow-emerald-500/10"
              >
                <span>Für nächsten Workshop vormerken</span>
                <span className="text-xs bg-slate-950/20 px-2 py-0.5 rounded-full">Kostenlos</span>
              </a>

              <a
                href="#bom"
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold text-sm transition-colors border border-slate-700"
              >
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Stückliste (BOM)</span>
              </a>

              <a
                href="#anleitung"
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold text-sm transition-colors border border-slate-700"
              >
                <Wrench className="w-4 h-4 text-teal-400" />
                <span>Bauanleitung</span>
              </a>

              <a
                href="#didaktik"
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl text-slate-400 hover:text-emerald-400 font-medium text-sm transition-colors"
              >
                <BookOpen className="w-4 h-4" />
                <span>Wie funktioniert Sensorik?</span>
              </a>
            </div>

            {/* Feature Highlights Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs text-slate-300">
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="font-bold text-emerald-400 block">Kostenrahmen</span>
                <p className="text-slate-400">ca. 100 € (+/-) pro Bausatz (Sammelbestellung möglich).</p>
              </div>
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="font-bold text-teal-400 block">0 € laufende Kosten</span>
                <p className="text-slate-400">LoRaWAN-Funk über The Things Network – keine SIM-Karte.</p>
              </div>
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="font-bold text-blue-400 block">Open Source &amp; Open Data</span>
                <p className="text-slate-400">100 % freie Schaltpläne, Code und Messwerte unter CC BY 4.0.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 1. WORKSHOP REGISTRATION FORM (RESEND INTEGRATION) */}
        <WorkshopRegistrationForm />

        {/* 2. BILL OF MATERIALS (BOM) */}
        <BOMSection />

        {/* 3. STEP-BY-STEP ASSEMBLY GUIDE */}
        <AssemblyGuideSection />

        {/* 4. DOWNLOADS, 3D-PRINT STL & VIDEO DEMO PLACEHOLDER */}
        <DownloadsAndMediaSection />

        {/* 5. EDUCATIONAL HUB: PHYSICS, LORA & RIED IMPACT */}
        <EducationalHubSection />

        {/* 6. CALL TO ACTION & PARTNER SECTION */}
        <section className="p-8 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div className="space-y-2 max-w-2xl">
            <h3 className="text-xl font-bold text-slate-100 flex items-center justify-center md:justify-start gap-2">
              <HeartHandshake className="w-5 h-5 text-emerald-400" />
              Gemeinsam das Ried vernetzen
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Du vertrittst eine Schule, einen Verein oder eine Gemeindeverwaltung im Kreis Bergstraße
              und möchtest einen eigenen Workshop oder eine Messreihe mit Schülerinnen und Schülern
              durchführen? Wir unterstützen euch gerne mit Know-how und Bausätzen!
            </p>
          </div>
          <div className="shrink-0 flex flex-col sm:flex-row gap-3">
            <a
              href="mailto:info@kamue.me?subject=Kooperation%20Sensor-Bau-Workshops%20Open%20Ried%20Sens"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-100 hover:bg-white text-slate-950 font-bold text-sm transition-colors shadow-md"
            >
              <span>Kontakt aufnehmen</span>
              <ExternalLink className="w-4 h-4 text-slate-600" />
            </a>
            <Link
              href="/daten"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition-colors border border-slate-700"
            >
              <span>Zu den Daten &amp; APIs</span>
            </Link>
          </div>
        </section>
      </main>

      {/* Site Footer */}
      <SiteFooter />
    </div>
  );
}
