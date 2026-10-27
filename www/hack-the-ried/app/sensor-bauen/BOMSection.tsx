"use client";

import { useState } from "react";
import {
  Activity,
  Cpu,
  Layers,
  Radio,
  ShieldCheck,
  Sparkles,
  Volume2,
  Wind,
  Zap,
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
    name: "RAK3113 WisDuo LoRaWAN SiP",
    category: "core",
    categoryLabel: "Steuerung & Funk",
    interface: "I²C, I²S, GPIO, UART",
    whatItMeasures: "System-Controller & Funkübertragung",
    physicsPrinciple: "Integriertes Modul: Microcontroller + Semtech SX1262 LoRa-Funk in einem Baustein.",
    highlight: true,
  },
  {
    name: "TX868-BLG-26 LoRa-Antenne",
    category: "core",
    categoryLabel: "Steuerung & Funk",
    interface: "SMA / Koaxial",
    whatItMeasures: "868 MHz Funkreichweite (EU868)",
    physicsPrinciple: "Optimierte Rundstrahlantenne für Distanzen bis 15 km zu TTN-Gateways im Ried.",
  },
  {
    name: "SHT41 Präzisions-Klimasensor",
    category: "climate",
    categoryLabel: "Klima & Wetter",
    interface: "I²C (0x44)",
    whatItMeasures: "Temperatur (°C) & Luftfeuchtigkeit (% r.F.)",
    physicsPrinciple: "Kapazitiver Polymersensor (Feuchte) und Silizium-Bandgap-Widerstand (Temperatur).",
  },
  {
    name: "BME688 4-in-1 Sensor",
    category: "climate",
    categoryLabel: "Klima & Wetter",
    interface: "I²C (0x76)",
    whatItMeasures: "Luftdruck (hPa), Feuchte & VOC-Gas",
    physicsPrinciple: "Piezoresistive Druckmessung und beheizter Metalloxid-Gassensor (MOX).",
  },
  {
    name: "LTR390-UV Sensor",
    category: "climate",
    categoryLabel: "Klima & Wetter",
    interface: "I²C (0x53)",
    whatItMeasures: "UV-Index (0–11+) & Umgebungslicht (Lux)",
    physicsPrinciple: "Spektral gefilterte Silizium-Photodioden für UV-A und UV-B Strahlung.",
  },
  {
    name: "RG-11 Optischer Regensensor",
    category: "climate",
    categoryLabel: "Klima & Wetter",
    interface: "GPIO / Puls",
    whatItMeasures: "Regenbeginn & Niederschlagsmenge (mm)",
    physicsPrinciple: "Infrarot-Strahlen werden an der transparenten Kuppel gebrochen, sobald Tropfen auftreffen.",
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
    whatItMeasures: "Schallpegel (dB) & Lärmklassifizierung",
    physicsPrinciple: "MEMS-Kondensatormembran; On-Device Frequenzanalyse unterscheidet Autos, Stimmen und Regen.",
  },
  {
    name: "INA226 Diagnose-Chip",
    category: "power",
    categoryLabel: "Versorgung",
    interface: "I²C (0x40)",
    whatItMeasures: "Spannung (V), Strom (mA) & Leistung (mW)",
    physicsPrinciple: "Misst den Spannungsabfall über einen Präzisions-Shunt-Widerstand (Systemgesundheit).",
  },
  {
    name: "USB-C Buchse & 10m Kabel",
    category: "power",
    categoryLabel: "Versorgung",
    interface: "5V USB-C",
    whatItMeasures: "Kontinuierliche 5V Außenstromversorgung",
    physicsPrinciple: "Wetterfestes Flach- oder Rundkabel zur einfachen Durchführung durch Fenster oder Türen.",
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
            Bill of Materials (BOM) v2 mit RAK3113
          </h2>
          <p className="text-slate-300 text-sm max-w-3xl leading-relaxed">
            In der zweiten Hardware-Generation ersetzt das integrierte <strong>RAK3113-Modul</strong>{" "}
            die frühere Kombination aus separatem ESP32 und Funk-Shield. Das spart Platz, senkt den
            Verdrahtungsaufwand und minimiert den Stromverbrauch.
          </p>
        </div>

        {/* PRICE SUMMARY CARD */}
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/30 shrink-0 space-y-1 sm:text-right">
          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block">
            Gesamter Hardware-Kostenrahmen
          </span>
          <div className="text-3xl font-extrabold text-slate-100">
            ca. 100 € <span className="text-sm font-normal text-slate-400">(+/-)</span>
          </div>
          <p className="text-[11px] text-slate-400 max-w-xs">
            Abhängig von aktuellen Bauteil-Tagespreisen und Losgröße bei Sammelbestellung für Workshops.
          </p>
        </div>
      </div>

      {/* WORKSHOP BULK ORDER BENEFIT NOTE */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-200">
            Tipp für Selberbauer &amp; Workshop-Teilnehmende:
          </strong>{" "}
          Einzelbestellungen aus verschiedenen Shops verursachen hohe Versandkosten. Bei unseren
          Mitmach-Events im <strong>Kulturzentrum KAMÜ</strong> bestellen wir alle Sensoren, das
          RAK3113-Board und die Antennen gesammelt im Voraus als Bausatz (10–30 Sets) – das spart
          rund 20–30 % der Kosten im Vergleich zum Einzeleinkauf!
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
          Klima, UV &amp; Regen
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
