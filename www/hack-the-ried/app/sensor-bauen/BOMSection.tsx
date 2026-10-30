"use client";

import { useState } from "react";
import {
  Layers,
  ShieldCheck,
} from "lucide-react";

interface BOMItem {
  name: string;
  category: "core" | "climate" | "air" | "sound" | "power";
  categoryLabel: string;
  interface: string;
  whatItMeasures: string;
  physicsPrinciple: string;
  highlight?: boolean;
}

const BOM_ITEMS: BOMItem[] = [
  {
    name: "RAK3112 auf RAK3212",
    category: "core",
    categoryLabel: "Steuerung & Funk",
    interface: "LoRaWAN, I²C, I²S, GPIO",
    whatItMeasures: "System-Controller & Funkübertragung",
    physicsPrinciple: "ESP32-S3-Steuerung und SX1262-LoRa-Funkmodul auf dem RAK3212-Board.",
    highlight: true,
  },
  {
    name: "EU868-LoRa-Antenne",
    category: "core",
    categoryLabel: "Steuerung & Funk",
    interface: "SMA / Koaxial",
    whatItMeasures: "868 MHz Funkreichweite (EU868)",
    physicsPrinciple: "Die erreichbare Funkstrecke hängt von Antenne, Montage, Gelände und Gateway ab.",
  },
  {
    name: "SHT41 Präzisions-Klimasensor",
    category: "climate",
    categoryLabel: "Klima & Wetter",
    interface: "I²C (0x44)",
    whatItMeasures: "Übertragene Temperatur (°C) und relative Luftfeuchtigkeit (%)",
    physicsPrinciple: "Kapazitiver Polymersensor (Feuchte) und Silizium-Bandgap-Widerstand (Temperatur).",
  },
  {
    name: "BME688 4-in-1 Sensor",
    category: "climate",
    categoryLabel: "Klima & Wetter",
    interface: "I²C (0x76)",
    whatItMeasures: "Luftdruck (hPa) und Gaswiderstand (Ω); Temperatur/Feuchte nur lokal",
    physicsPrinciple: "Druckmessung und beheizter Metalloxid-Gassensor; keine BSEC-IAQ- oder CO₂-Äquivalentwerte.",
  },
  {
    name: "LTR390-UV Sensor",
    category: "climate",
    categoryLabel: "Klima & Wetter",
    interface: "I²C (0x53)",
    whatItMeasures: "UV-Index und Umgebungslicht (Lux)",
    physicsPrinciple: "Spektral gefilterte Silizium-Photodioden für UV-A und UV-B Strahlung.",
  },
  {
    name: "SPS30 Feinstaub-Sensor",
    category: "air",
    categoryLabel: "Luftqualität",
    interface: "I²C (0x69)",
    whatItMeasures: "Feinstaub PM1.0, PM2.5, PM4 & PM10 (µg/m³)",
    physicsPrinciple: "Laser-Streulichtverfahren: Partikel reflektieren einen Laserstrahl auf eine Photodiode.",
    highlight: true,
  },
  {
    name: "SCD41 CO₂-Sensor",
    category: "air",
    categoryLabel: "Luftqualität",
    interface: "I²C (0x62)",
    whatItMeasures: "Kohlendioxid-Gehalt (ppm)",
    physicsPrinciple: "Photoakustisches NDIR-Verfahren: CO₂-Moleküle absorbieren Infrarotlicht und erzeugen Schallwellen.",
  },
  {
    name: "SGP41 VOC & NOx Sensor",
    category: "air",
    categoryLabel: "Luftqualität",
    interface: "I²C (0x59)",
    whatItMeasures: "VOC-Index & Stickoxid-Index (NOx)",
    physicsPrinciple: "Zwei getrennte Metalloxid-Gassensoren für flüchtige organische Stoffe und Abgase.",
  },
  {
    name: "ICS-43434 I²S Mikrofon",
    category: "sound",
    categoryLabel: "Akustik",
    interface: "I²S Digital",
    whatItMeasures: "Digitaler Schallpegel (dBFS); experimentelle lokale Ereignisklassifikation",
    physicsPrinciple: "MEMS-Mikrofon mit I²S-Ausgabe. dBFS ist nicht mit kalibriertem dB(A) gleichzusetzen.",
  },
  {
    name: "INA226 (optional)",
    category: "power",
    categoryLabel: "Versorgung",
    interface: "I²C (0x40)",
    whatItMeasures: "Busspannung, Shuntspannung, Strom und Leistung",
    physicsPrinciple: "Werte hängen von korrekter Shunt-Kalibrierung und Einbindung in den Versorgungspfad ab.",
  },
  {
    name: "USB-C-Versorgung (Aufbau)",
    category: "power",
    categoryLabel: "Versorgung",
    interface: "5V USB-C",
    whatItMeasures: "Versorgung des Sensorknotens und der angeschlossenen Module",
    physicsPrinciple: "Die endgültige Stromversorgung für den Außeneinsatz ist noch festzulegen.",
  },
];

export default function BOMSection() {
  const [activeFilter, setActiveFilter] = useState<
    "all" | "core" | "climate" | "air" | "sound" | "power"
  >("all");

  const filteredItems =
    activeFilter === "all"
      ? BOM_ITEMS
      : BOM_ITEMS.filter((item) => item.category === activeFilter);

  return (
    <section id="bom" className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <Layers className="w-3.5 h-3.5" /> Stückliste &amp; Hardware
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-100">
            Aktuelle Hardware mit RAK3112 und Firmware v15
          </h2>
          <p className="text-slate-300 text-sm max-w-3xl leading-relaxed">
            Der Sensorknoten nutzt ein <strong>RAK3112 auf RAK3212</strong>. Die Firmware v15 sendet
            Temperatur und Luftfeuchtigkeit ausschließlich vom SHT41. Weitere Messwerte kommen von
            CO₂-, Partikel-, Licht-, Gas- und Akustiksensoren; optionale INA226-Werte setzen eine
            korrekt angeschlossene Messstrecke voraus. Sensoren und tatsächlich übertragene Werte
            sind in der Firmware-Dokumentation versioniert.
          </p>
        </div>

        {/* PRICE SUMMARY CARD */}
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/30 shrink-0 space-y-1 sm:text-right">
          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block">
            Kostenrahmen
          </span>
          <div className="text-3xl font-extrabold text-slate-100">
            Noch offen
          </div>
          <p className="text-[11px] text-slate-400 max-w-xs">
            Wird nach Bestätigung der Bauteile, Gehäuse- und Versorgungslösung ergänzt.
          </p>
        </div>
      </div>

      {/* WORKSHOP BULK ORDER BENEFIT NOTE */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-200">
            Stückliste im Aufbau:
          </strong>{" "}
          Die Liste beschreibt Sensoren und Messwerte der aktuellen RAK3112-Firmware. Verfügbarkeit,
          genaue Modulvarianten und Preise werden ergänzt, sobald sie für den konkreten Bausatz
          bestätigt sind. Optionale Komponenten sind in der Liste entsprechend markiert.
        </div>
      </div>

      {/* FILTER BUTTONS */}
      <div className="flex flex-wrap gap-2 pt-2">
        <button
          onClick={() => setActiveFilter("all")}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            activeFilter === "all"
              ? "bg-emerald-400 text-slate-950 shadow-md"
              : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
          }`}
        >
          Alle Komponenten ({BOM_ITEMS.length})
        </button>
        <button
          onClick={() => setActiveFilter("core")}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            activeFilter === "core"
              ? "bg-emerald-400 text-slate-950 shadow-md"
              : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
          }`}
        >
          MCU &amp; LoRaWAN
        </button>
        <button
          onClick={() => setActiveFilter("climate")}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            activeFilter === "climate"
              ? "bg-emerald-400 text-slate-950 shadow-md"
              : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
          }`}
        >
          Klima, UV &amp; Licht
        </button>
        <button
          onClick={() => setActiveFilter("air")}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            activeFilter === "air"
              ? "bg-emerald-400 text-slate-950 shadow-md"
              : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
          }`}
        >
          Feinstaub, CO₂ &amp; Gase
        </button>
        <button
          onClick={() => setActiveFilter("sound")}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            activeFilter === "sound"
              ? "bg-emerald-400 text-slate-950 shadow-md"
              : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
          }`}
        >
          Akustik &amp; Lärm
        </button>
        <button
          onClick={() => setActiveFilter("power")}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            activeFilter === "power"
              ? "bg-emerald-400 text-slate-950 shadow-md"
              : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
          }`}
        >
          Versorgung &amp; Diagnose
        </button>
      </div>

      {/* ITEMS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.map((item) => (
          <div
            key={item.name}
            className={`p-5 rounded-2xl border transition-all space-y-3 flex flex-col justify-between ${
              item.highlight
                ? "bg-gradient-to-b from-slate-900 to-slate-950 border-emerald-500/40 shadow-lg shadow-emerald-500/5"
                : "bg-slate-950/80 border-slate-800 hover:border-slate-700"
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-400">
                  {item.categoryLabel}
                </span>
                <span className="text-[11px] font-mono text-emerald-400">
                  {item.interface}
                </span>
              </div>

              <h4 className="font-bold text-slate-100 text-base">
                {item.name}
              </h4>

              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-300">
                  <strong>Erfasst:</strong> {item.whatItMeasures}
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {item.physicsPrinciple}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
