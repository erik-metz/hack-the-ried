import type { RegularOffer } from "@/lib/regularOffers";

export default function RegularOffers({ offers, unavailable }: { offers: RegularOffer[]; unavailable: boolean }) {
  return (
    <section aria-labelledby="regular-offers-heading" className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6 space-y-4">
      <div>
        <h2 id="regular-offers-heading" className="text-xl font-semibold">Regelmäßige Angebote im Ried</h2>
        <p className="mt-1 text-sm text-slate-400">Wiederkehrende Vereinsangebote. Feiertage und Ausfälle bitte beim Veranstalter prüfen.</p>
      </div>
      {unavailable ? <p role="status" className="text-sm text-amber-300">Regelmäßige Angebote sind derzeit nicht abrufbar.</p> : offers.length === 0 ? <p className="text-sm text-slate-400">Zurzeit sind keine regelmäßigen Angebote erfasst.</p> : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {offers.map((offer) => (
            <li key={offer.id} className="rounded-xl border border-slate-700 p-4 space-y-2">
              <h3 className="font-semibold text-emerald-300">{offer.title}</h3>
              <p className="font-medium">{offer.weekday}, {offer.start_local}{offer.end_local ? `–${offer.end_local}` : ""} Uhr</p>
              <p className="text-sm text-slate-300">Treffpunkt: {offer.venue_name}</p>
              <p className="text-sm text-slate-400">{offer.organizer} · {offer.municipality}</p>
              <p className="text-sm text-slate-300">{offer.description}</p>
              <a href={offer.source_url} target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-emerald-300 underline underline-offset-4 hover:text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">Aktuelle Angaben beim Verein<span className="sr-only">: {offer.title} (öffnet in einem neuen Tab)</span></a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
