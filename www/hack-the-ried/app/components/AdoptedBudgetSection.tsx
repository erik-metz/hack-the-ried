import { readCollected } from "@/lib/collectedBackend";

type Budget = {
  municipality: string; fiscal_year: number; adopted_at: string; source_url: string; source_page: number;
  quality: "reconciled" | "needs_review";
  total_revenue_eur?: number; total_expense_eur?: number; net_result_eur?: number;
};

export default async function AdoptedBudgetSection() {
  const [budget, review] = await Promise.all([
    readCollected<Budget>("finance/adopted-budget/biblis").catch(() => null),
    readCollected<Budget>("finance/budget-review/biblis").catch(() => null),
  ]);
  const source = review ?? budget;
  const usable = budget?.quality === "reconciled" && review?.quality !== "needs_review";
  const fields = [["Geplante Erträge", budget?.total_revenue_eur], ["Geplante Aufwendungen", budget?.total_expense_eur], ["Geplantes Jahresergebnis", budget?.net_result_eur]] as const;
  return <section className="rounded-xl border border-slate-800 p-5 space-y-3">
    <h2 className="text-lg font-semibold">Beschlossene Haushaltspläne</h2>
    <p className="text-sm text-slate-400">Die Anbindung wird gemeindeweise ergänzt. Hier sind ausschließlich geprüfte Planwerte aufgeführt.</p>
    {!source ? <p role="status">Aktuell kein gespeicherter Haushaltsplan verfügbar.</p> : <>
      <h3 className="font-medium">{source.municipality} · {source.fiscal_year}</h3>
      <p className="text-sm text-slate-400">Beschluss: {new Date(source.adopted_at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}. Planwerte, keine laufenden Einnahmen oder Ausgaben.</p>
      {!usable ? <p role="status" className="text-amber-300">{review?.quality === "needs_review" ? "Die Summen in der veröffentlichten Haushaltssatzung stimmen rechnerisch nicht überein. Die Kennzahlen werden bis zur Klärung nicht angezeigt." : "Die geprüften Kennzahlen sind aktuell nicht verfügbar."}</p> :
        <dl className="grid gap-4 sm:grid-cols-3">{fields.map(([label, value]) => <div key={label}><dt className="text-sm text-slate-400">{label}</dt><dd className="text-xl font-semibold">{typeof value === "number" ? value.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : "–"}</dd></div>)}</dl>}
      <a className="text-emerald-400 underline" href={`${source.source_url}#page=${source.source_page}`}>Originaldokument · Seite {source.source_page}</a>
    </>}
  </section>;
}
