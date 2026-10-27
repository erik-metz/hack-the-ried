import { AIRCRAFT_STYLES } from "@/lib/aircraftPresentation";

export default function AircraftLegend() {
  return <details className="mt-1"><summary className="cursor-pointer">Flugverkehr: Symbole & Kategorien</summary>
    <ul className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto py-2">
      {Object.values(AIRCRAFT_STYLES).map(category => <li key={category.key} className="flex items-center gap-2">
        <svg viewBox="0 0 32 32" width="24" height="24" className="shrink-0" aria-hidden="true" style={{color:category.color}}>
          <path d={category.path} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg><span>{category.label}</span>
      </li>)}
    </ul><p>Kategorie laut empfangener Meldung. Ohne eindeutige Kategorie erscheint das allgemeine Flugzeugsymbol.</p>
  </details>;
}
