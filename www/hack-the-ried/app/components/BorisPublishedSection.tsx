export interface PublishedBorisZone {
  id: string;
  municipality: string;
  district: string | null;
  zone_code: string;
  stichtag: string;
  land_value_eur_sqm: number;
  zone_type: string;
  development_status: string;
}

export default function BorisPublishedSection({ zones }: { zones: PublishedBorisZone[] | null }) {
  if (!zones?.length) return <section aria-label="Bodenrichtwerte" className="rounded-2xl border border-slate-800 p-6"><h2 className="text-xl font-bold">Amtliche Bodenrichtwerte</h2><p role="status" className="text-slate-400">Noch keine gespeicherten Bodenrichtwertzonen verfügbar.</p></section>;
  const dates = [...new Set(zones.map(zone => zone.stichtag))].join(", ");
  return (
    <section aria-label="Bodenrichtwerte" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
      <h2 className="text-xl font-bold">Amtliche Bodenrichtwertzonen ({zones.length})</h2>
      <p className="text-sm text-slate-300">Historischer Stichtag: {dates}. Bodenrichtwerte in €/m², keine aktuellen Immobilienverkaufspreise.</p>
      <p className="text-xs text-slate-400">Die HVBG bietet 2026 zur Online-Recherche an; der hier verwendete amtliche Vektordienst enthält 2024. Nutzungs- und Entwicklungsarten erscheinen als Originalcodes. W = Wohnbauflächen, G = gewerbliche Bauflächen, M = gemischte Bauflächen; weitere Codes bleiben unverändert.</p>
      <details>
        <summary className="cursor-pointer font-medium text-amber-300">Alle Zonen und Originalwerte anzeigen</summary>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Amtliche Bodenrichtwerte je Zone, Stichtag {dates}</caption>
            <thead><tr className="border-b border-slate-700"><th scope="col" className="p-2">Gemeinde / Gemarkung</th><th scope="col" className="p-2">Zone</th><th scope="col" className="p-2">Nutzung</th><th scope="col" className="p-2">Entwicklungsart</th><th scope="col" className="p-2 text-right">€/m²</th></tr></thead>
            <tbody>{zones.map(zone => <tr key={zone.id} className="border-b border-slate-800"><td className="p-2">{zone.municipality}{zone.district ? ` / ${zone.district}` : ""}</td><td className="p-2">{zone.zone_code}</td><td className="p-2">{zone.zone_type}</td><td className="p-2">{zone.development_status}</td><td className="p-2 text-right tabular-nums">{zone.land_value_eur_sqm.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
      <p className="text-xs text-slate-400">Quelle: HVBG · BORIS Hessen 2024 · Datenlizenz Deutschland – Zero 2.0. Zonenpolygone stehen in der Karte als Bodenrichtwert-Ebene bereit. <a href="https://hvbg.hessen.de/immobilienwertermittlung/boris-hessen" target="_blank" rel="noopener noreferrer" className="text-amber-300 underline">Amtliche Auskunft und Erläuterungen</a></p>
    </section>
  );
}
