import { Building2, Database, MapPinned, Radio, ThermometerSun, Truck } from "lucide-react";

const sources = [
  { title: "Smart-City-Projekt", description: "Vorhandene kommunale Messdaten", status: "Rohdaten-Anbindung gewünscht", Icon: Building2, color: "text-sky-400", line: "border-sky-400/60 border-dashed" },
  { title: "Open Data auf unserer Website", description: "Bereits zusammengetragene öffentliche Daten", status: "Bestehende Datenbasis", Icon: Database, color: "text-violet-400", line: "border-violet-400/60" },
  { title: "Eigene Sensoren", description: "Zusätzliche Messungen dort, wo Daten fehlen", status: "Geplante Ergänzung", Icon: Radio, color: "text-emerald-400", line: "border-emerald-400/60 border-dashed" },
];

export default function DataConnectionsDiagram() {
  return <figure aria-label="Drei Datenquellen verbinden sich über Ort und Zeit zu gemeinsamen Auswertungen" className="space-y-6">
    <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr_1fr] lg:gap-6">
      <div className="relative space-y-6 lg:py-3">
        <div aria-hidden="true" className="absolute right-0 top-[17%] bottom-[17%] hidden border-r border-slate-500 lg:block" />
        {sources.map(({ title, description, status, Icon, color, line }) => <div key={title} className="relative flex items-start gap-3 lg:pr-7">
          <Icon aria-hidden="true" className={`mt-1 h-7 w-7 shrink-0 ${color}`} />
          <div>
            <h3 className={`text-xl font-semibold ${color}`}>{title}</h3>
            <p className="mt-1 text-base leading-relaxed text-slate-300">{description}</p>
            <p className="mt-1 text-sm text-slate-400">{status}</p>
          </div>
          <span aria-hidden="true" className={`absolute right-0 top-4 hidden w-5 border-t-2 lg:block ${line}`} />
        </div>)}
      </div>
      <div className="relative text-center">
        <span aria-hidden="true" className="absolute -left-6 top-1/2 hidden w-6 border-t border-slate-500 lg:block" />
        <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/5">
          <MapPinned aria-hidden="true" className="h-24 w-24 text-emerald-300" strokeWidth={1} />
        </div>
        <h3 className="mt-4 text-2xl font-semibold">Gemeinsames Bild des Rieds</h3>
        <p className="mt-2 text-lg text-emerald-300">Am gleichen Ort und zur gleichen Zeit vergleichen</p>
        <span aria-hidden="true" className="absolute -right-6 top-1/2 hidden w-6 border-t border-slate-500 lg:block" />
      </div>
      <div className="space-y-6 border-t border-slate-700 pt-5 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
        <p className="text-sm uppercase tracking-wider text-slate-400">Mögliche Fragestellungen</p>
        <div>
          <Truck aria-hidden="true" className="mb-2 h-7 w-7 text-sky-400" />
          <h3 className="text-xl font-semibold">Verkehr + Lärm + Luftqualität</h3>
          <p className="mt-2 text-lg text-slate-300">Wann treten Belastungen gemeinsam auf?</p>
        </div>
        <div>
          <ThermometerSun aria-hidden="true" className="mb-2 h-7 w-7 text-amber-300" />
          <h3 className="text-xl font-semibold">Temperatur + Grünflächen + eigene Messungen</h3>
          <p className="mt-2 text-lg text-slate-300">Wo fehlen kühle Orte?</p>
        </div>
      </div>
    </div>
    <figcaption className="border-t border-slate-700 pt-5 text-xl font-medium leading-relaxed text-emerald-200">
      Unsere Sensoren schließen Messlücken und ergänzen vorhandene Daten für gemeinsame Auswertungen.
    </figcaption>
  </figure>;
}
