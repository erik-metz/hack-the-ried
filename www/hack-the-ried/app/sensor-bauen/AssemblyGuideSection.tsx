"use client";

import {
  Cable,
  CheckCircle2,
  Code2,
  Cpu,
  Flame,
  HardDrive,
  Layers,
  MapPin,
  Radio,
  Wrench,
} from "lucide-react";

export default function AssemblyGuideSection() {
  return (
    <section id="anleitung" className="space-y-6">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
          <Wrench className="w-3.5 h-3.5" /> Schritt-für-Schritt Bauanleitung
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-100">
          In 5 Schritten zur fertigen Bürger-Messstation
        </h2>
        <p className="text-slate-300 text-sm max-w-3xl leading-relaxed">
          Der Zusammenbau ist so konzipiert, dass er auch ohne tiefes Elektrotechnik-Vorwissen an
          einem Workshop-Nachmittag (ca. 2 bis 3 Stunden) erfolgreich gelingt.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* STEP 1 */}
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-extrabold flex items-center justify-center text-sm">
                1
              </span>
              <span className="text-[11px] font-mono text-slate-400">Vorbereitung</span>
            </div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-emerald-400" /> Werkzeug &amp; Arbeitsplatz
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Du benötigst einen einfachen Elektronik-Lötkolben (30–60 Watt) mit feiner Spitze,
              etwas bleifreies Lötzinn, eine Abisolierzange, kleine Kreuzschlitz-Schraubendreher
              und etwas Heißkleber oder Kabelbinder zur Fixierung.
            </p>
          </div>
          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
            💡 <em>Bei Workshops im KAMÜ steht alles Werkzeug vor Ort bereit!</em>
          </div>
        </div>

        {/* STEP 2 */}
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-extrabold flex items-center justify-center text-sm">
                2
              </span>
              <span className="text-[11px] font-mono text-slate-400">I²C-Bus</span>
            </div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Cable className="w-4 h-4 text-teal-400" /> Gemeinsamer Datenbus
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Fast alle Sensoren (SHT41, SCD41, BME688, SGP41, LTR390, INA226, SPS30) nutzen den
              I²C-Bus. Das bedeutet: Sie teilen sich exakt 4 Leitungen:{" "}
              <code className="text-emerald-300">3.3V</code>,{" "}
              <code className="text-emerald-300">GND</code>,{" "}
              <code className="text-teal-300">SDA</code> und{" "}
              <code className="text-teal-300">SCL</code>. Alle Sensoren haben eindeutige I²C-Adressen
              und kollidieren nicht.
            </p>
          </div>
          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 font-mono">
            SDA = Pin 4 · SCL = Pin 5 (RAK3113)
          </div>
        </div>

        {/* STEP 3 */}
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-extrabold flex items-center justify-center text-sm">
                3
              </span>
              <span className="text-[11px] font-mono text-slate-400">Montage</span>
            </div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" /> Gehäuse &amp; 3D-Druck
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Die Sensoren werden in die Lamellen des wetterfesten Stevenson-Screen-Gehäuses
              eingesetzt. So strömt die Außenluft frei an Temperatur- und Gassensoren vorbei,
              während direkte Sonne und Schlagregen abgehalten werden. Der SPS30-Feinstaublüfter
              wird waagerecht montiert.
            </p>
          </div>
          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
            ☀️ Weißes PETG oder ASA für besten UV-Schutz
          </div>
        </div>

        {/* STEP 4 */}
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-extrabold flex items-center justify-center text-sm">
                4
              </span>
              <span className="text-[11px] font-mono text-slate-400">Firmware &amp; Funk</span>
            </div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Code2 className="w-4 h-4 text-blue-400" /> Flashen &amp; TTN-Registrierung
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Über die Arduino IDE oder PlatformIO laden wir die HackTheRied-Firmware auf das
              RAK3113-Board. In den Geräteeinstellungen hinterlegen wir deine eindeutigen{" "}
              <code className="text-emerald-300">DevEUI</code>,{" "}
              <code className="text-emerald-300">AppEUI</code> und{" "}
              <code className="text-emerald-300">AppKey</code> für The Things Network (TTN).
            </p>
          </div>
          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
            🔒 Verschlüsselt mit AES-128 über LoRaWAN
          </div>
        </div>

        {/* STEP 5 */}
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-extrabold flex items-center justify-center text-sm">
                5
              </span>
              <span className="text-[11px] font-mono text-slate-400">Inbetriebnahme</span>
            </div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Radio className="w-4 h-4 text-amber-400" /> Antenne &amp; Stromversorgung
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Die 868-MHz-Stabantenne vertikal nach oben ausrichten und festschrauben (niemals
              einen LoRa-Transceiver ohne Antenne betreiben!). Schließe das 10m USB-C-Kabel an ein
              Standard-5V-Netzteil an. Die Kontroll-LED signalisiert den erfolgreichen
              LoRaWAN-Join.
            </p>
          </div>
          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
            ⚡ Stromaufnahme im Schnitt unter 50 mW
          </div>
        </div>

        {/* STEP 6 */}
        <div className="p-6 rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-emerald-500/40 space-y-4 flex flex-col justify-between shadow-lg shadow-emerald-500/5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-full bg-emerald-400 text-slate-950 font-extrabold flex items-center justify-center text-sm">
                ✓
              </span>
              <span className="text-[11px] font-mono text-emerald-400 font-bold">Live im Ried!</span>
            </div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-400" /> Dein Messpunkt auf der Karte
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Sobald die ersten Datenpakete über das Bürstädter TTN-Gateway empfangen werden, wird
              deine Station automatisch in unserer Datenbank erfasst. Sie erscheint auf der{" "}
              <strong>interaktiven Regionalkarte</strong> und steht allen Bürgern und
              Hackathon-Teilnehmenden als Open Data zur Verfügung!
            </p>
          </div>
          <div className="pt-2 border-t border-slate-800 text-[11px] text-emerald-300 font-semibold">
            🎉 Du bist offizieller Teil des Bürger-Messnetzwerks!
          </div>
        </div>
      </div>
    </section>
  );
}
