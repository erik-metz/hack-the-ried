"use client";

import { useState } from "react";
import {
  Activity,
  BookOpen,
  Flame,
  Globe2,
  Radio,
  TreePine,
  Volume2,
  Wind,
  Zap,
} from "lucide-react";

export default function EducationalHubSection() {
  const [activeTab, setActiveTab] = useState<"lora" | "physics" | "value">("physics");

  return (
    <section id="didaktik" className="space-y-6">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
          <BookOpen className="w-3.5 h-3.5" /> Bildungs-Hub &amp; Sensorik-Wissen
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-100">
          Wie Technik funktioniert: Von der Physik zum digitalen Messwert
        </h2>
        <p className="text-slate-300 text-sm max-w-3xl leading-relaxed">
          HackTheRied ist auch ein Bildungsprojekt für Schulen, Jugendliche und interessierte
          Bürger. Die Firmware v15 überträgt Temperatur und relative Luftfeuchtigkeit vom SHT41.
          Außerdem sendet sie unter anderem CO₂-, Partikel-, Licht-, Gas-, Akustik- und optionale
          Versorgungswerte. Temperatur- und Feuchtewerte anderer Sensoren bleiben lokal und werden
          nicht als Ersatz übertragen.
        </p>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex border-b border-slate-800 gap-2 sm:gap-4 overflow-x-auto pb-1 text-sm font-semibold">
        <button
          onClick={() => setActiveTab("physics")}
          className={`px-4 py-2.5 rounded-t-xl transition-all border-b-2 whitespace-nowrap flex items-center gap-2 ${
            activeTab === "physics"
              ? "border-emerald-400 text-emerald-400 bg-emerald-500/10"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Physik &rarr; Digitaler Zahlenwert</span>
        </button>

        <button
          onClick={() => setActiveTab("lora")}
          className={`px-4 py-2.5 rounded-t-xl transition-all border-b-2 whitespace-nowrap flex items-center gap-2 ${
            activeTab === "lora"
              ? "border-emerald-400 text-emerald-400 bg-emerald-500/10"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Wie funktioniert LoRa-Funk?</span>
        </button>

        <button
          onClick={() => setActiveTab("value")}
          className={`px-4 py-2.5 rounded-t-xl transition-all border-b-2 whitespace-nowrap flex items-center gap-2 ${
            activeTab === "value"
              ? "border-emerald-400 text-emerald-400 bg-emerald-500/10"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <TreePine className="w-4 h-4" />
          <span>Mehrwert für das Hessische Ried</span>
        </button>
      </div>

      {/* TAB CONTENT 1: PHYSICS TO DIGITAL VALUE */}
      {activeTab === "physics" && (
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Wie misst ein kleiner Siliziumchip Temperatur, Feinstaub oder Geräusche?
            Klicke auf die einzelnen Sensoren, um das Messprinzip zu verstehen:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* SHT41 */}
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-100 text-sm flex items-center gap-2">
                  <Wind className="w-4 h-4 text-emerald-400" /> Temperatur &amp; Feuchte (SHT41)
                </span>
                <span className="text-[10px] font-mono text-emerald-300">Kapazitiv &amp; Bandgap</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                <strong>Feuchtigkeit:</strong> Ein winziger Kondensator besitzt ein Polymer als
                Zwischenschicht (Dielektrikum). Je feuchter die Luft, desto mehr Wassermoleküle
                lagern sich an und verändern die elektrische Kapazität.<br />
                <strong>Temperatur:</strong> Eine interne Silizium-Diode ändert ihre Durchlassspannung
                präzise und linear mit der thermodynamischen Wärme (Kelvin). Ein 16-Bit Analog-Digital-Wandler
                berechnet daraus direkt den Celsius-Wert.
              </p>
            </div>

            {/* SPS30 */}
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-100 text-sm flex items-center gap-2">
                  <Flame className="w-4 h-4 text-teal-400" /> Feinstaub PM2.5 / PM10 (SPS30)
                </span>
                <span className="text-[10px] font-mono text-teal-300">Laser-Streulicht</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Ein integrierter Mikrolüfter saugt kontinuierlich Außenluft durch eine Dunkelkammer.
                Ein Halbleiter-Laserstrahl durchleuchtet den Luftstrom. Trifft der Strahl auf ein
                Staub- oder Rußpartikel, wird das Licht gestreut. Eine hochempfindliche Photodiode
                misst Intensität und Dauer des Lichtblitzes. Je größer das Partikel, desto stärker der
                Streuimpuls.
              </p>
            </div>

            {/* SCD41 */}
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-100 text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-cyan-400" /> Kohlendioxid CO₂ (SCD41)
                </span>
                <span className="text-[10px] font-mono text-cyan-300">Photoakustisches NDIR</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                CO₂-Moleküle absorbieren Infrarotstrahlung bei einer ganz bestimmten Wellenlänge
                (4,26 µm). Eine winzige Infrarotquelle pulsiert periodisch in der Messkammer. Die
                CO₂-Moleküle nehmen die Energie auf, erwärmen sich im Takt und dehnen sich aus.
                Dabei entstehen mikroskopische Druck- und Schallwellen, die ein internes MEMS-Mikrofon
                registriert. Mehr Schall = mehr CO₂!
              </p>
            </div>

            {/* ICS-43434 */}
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-100 text-sm flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-blue-400" /> Lärm &amp; Akustik (ICS-43434)
                </span>
                <span className="text-[10px] font-mono text-blue-300">MEMS-I²S &amp; FFT</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Schallwellen lenken eine wenige Nanometer dicke Silizium-Membran aus. Die Kapazitätsänderung
                wird sofort on-chip digitalisiert (I²S-Schnittstelle). Der Microcontroller führt
                eine mathematische Frequenzzerlegung (Schnelle Fourier-Transformation / FFT) durch.
                Die Firmware kann zusätzlich einen experimentellen Klassifikator lokal ausführen.
                Der Schallpegel wird als dBFS übertragen und ist kein kalibrierter dB(A)-Wert.
              </p>
            </div>

            {/* BME688 & SGP41 */}
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-100 text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-400" /> Luftgüte, VOC &amp; NOx
                </span>
                <span className="text-[10px] font-mono text-purple-300">Metalloxid-Halbleiter (MOX)</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                BME688 und SGP41 erfassen Gaswiderstands- beziehungsweise VOC- und NOx-Indexwerte.
                Die v15-Firmware überträgt BME688-Gaswiderstandswerte und SGP41-Indizes; daraus
                werden keine validierten Stoffkonzentrationen abgeleitet.
              </p>
            </div>

          </div>
        </div>
      )}

      {/* TAB CONTENT 2: HOW LORA WORKS */}
      {activeTab === "lora" && (
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg sm:text-xl font-bold text-slate-100 flex items-center gap-2">
              <Radio className="w-5 h-5 text-emerald-400" />
              LoRaWAN: Funk über Kilometer mit minimaler Sendeleistung
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Herkömmliches WLAN reicht nur ca. 20 bis 30 Meter durch Hauswände. Mobilfunk benötigt
              teure SIM-Karten und viel Akkustrom. <strong>LoRa (Long Range)</strong> wurde speziell
              für das Internet der Dinge (IoT) entwickelt:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-emerald-400 font-bold text-sm">1. Das Frequenzband</span>
              <p className="text-xs text-slate-300">
                In Europa funkt LoRa im lizenzfreien <strong>868-MHz-Band (EU868)</strong>. Diese
                niedrige Frequenz durchdringt Hauswände und Bäume wesentlich besser als 2.4-GHz-WLAN.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-teal-400 font-bold text-sm">2. Chirp Spread Spectrum</span>
              <p className="text-xs text-slate-300">
                Signale werden als kontinuierliche Frequenzrampen (Chirps) moduliert. Empfänger
                können diese Signale selbst dann noch dekodieren, wenn sie <strong>schwächer als
                das normale Hintergrundrauschen</strong> sind.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-blue-400 font-bold text-sm">3. The Things Network (TTN)</span>
              <p className="text-xs text-slate-300">
                Ein einziges Gateway (z. B. auf dem Kulturzentrum KAMÜ in Bürstadt) kann Tausende
                Sensoren im Umkreis von 5 bis 15 Kilometern empfangen und die Daten verschlüsselt an
                unsere Server weiterleiten.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/20 text-xs text-slate-300 space-y-1">
            <strong className="text-emerald-300">Warum ist das für Bürger genial?</strong>
            <p className="text-slate-400">
              Du musst der Station <strong>kein WLAN-Passwort</strong> geben. Wenn du umziehst oder
              den Sensor im Garten aufstellst, funkt er einfach weiter. Es fallen <strong>0 € monatliche
              Kosten</strong> an.
            </p>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: VALUE FOR HESSIAN RIED */}
      {activeTab === "value" && (
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg sm:text-xl font-bold text-slate-100 flex items-center gap-2">
              <Globe2 className="w-5 h-5 text-emerald-400" />
              Warum ein dichtes Sensornetzwerk im Ried den Unterschied macht
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Oft gibt es nur eine einzige offizielle Wetterstation für einen ganzen Landkreis. Doch
              das Hessische Ried ist ein komplexer Natur- und Wirtschaftsraum:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-amber-400 font-bold text-sm">🔥 Hitzeinseln erkennen</span>
              <p className="text-xs text-slate-300">
                Bürstadt und Lampertheim liegen im wärmsten Graben Deutschlands. Dicht bebaute
                Ortskerne heizen sich nachts bis zu 6 °C mehr auf als umliegende Gärten. Viele
                Stationen machen diese Mikroklima-Unterschiede sichtbar für die Stadtplanung.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-teal-400 font-bold text-sm">🌧️ Lokale Starkregen-Zellen</span>
              <p className="text-xs text-slate-300">
                Sommerliche Unwetter entladen sich oft in schmalen Schneisen von nur 500 Metern
                Breite. Ein entfernter amtlicher Regenmesser bekommt davon nichts mit. Mit 30–50
                Bürger-Sensoren im Ried sehen wir Überflutungsrisiken punktgenau.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-blue-400 font-bold text-sm">🚄 Riedbahn-Lärm &amp; Feinstaub</span>
              <p className="text-xs text-slate-300">
                Die Riedbahn ist eine der meistbefahrenen Trassen Europas. Bürger-Stationen entlang
                der Schienen erfassen Lärmspitzen und Bremsfeinstaub objektiv und transparent – als
                unwiderlegbare Datengrundlage für Lärmschutz und Bürgerinitiativen.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
