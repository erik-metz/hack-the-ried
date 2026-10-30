import { env } from "@/env";

type DailyScan = { day: string; qr_id: string; scans: number };
const qrCodes = [
  { id: "1", label: "Aufkleber", color: "#34D399" },
  { id: "2", label: "Flyer", color: "#2DD4BF" },
  { id: "3", label: "Reserve 3", color: "#A3E635" },
  { id: "4", label: "Reserve 4", color: "#38BDF8" },
  { id: "5", label: "Reserve 5", color: "#C084FC" },
];

async function loadDailyScans(): Promise<DailyScan[] | null> {
  try {
    const response = await fetch(new URL("/api/v1/qr/scans/daily?days=30", env.BACKEND_API_URL), {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    return await response.json() as DailyScan[];
  } catch {
    return null;
  }
}

export default async function QrScanStats() {
  const dailyScans = await loadDailyScans();
  const dates = Array.from({ length: 30 }, (_, index) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (29 - index));
    return date.toISOString().slice(0, 10);
  });
  const totals = Object.fromEntries(qrCodes.map(({ id }) => [
    id,
    dailyScans?.filter((row) => row.qr_id === id).reduce((total, row) => total + row.scans, 0) ?? 0,
  ]));
  const maxScans = Math.max(1, ...(dailyScans ?? []).map((row) => row.scans));

  return (
    <section aria-labelledby="scan-statistics-title" className="scroll-mt-24 pt-16 sm:pt-20">
      <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-400">QR-Statistik</p>
          <h2 id="scan-statistics-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Aufrufe der letzten 30 Tage</h2>
        </div>
        <p className="max-w-xl text-sm leading-relaxed text-slate-400">Tägliche Aufrufe je QR-Code. Link-Vorschauen und automatische Prüfungen können mitgezählt werden. Einzelne technische Ereignisdaten werden hier nicht angezeigt.</p>
      </div>

      {dailyScans === null ? (
        <p className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400">Die QR-Statistik ist gerade nicht verfügbar.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {qrCodes.map((qr) => {
            const qrRows = new Map(dailyScans.filter((row) => row.qr_id === qr.id).map((row) => [row.day, row.scans]));
            const total = totals[qr.id];
            return (
              <article key={qr.id} className="rounded-2xl border border-slate-800 bg-slate-900/65 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">QR · 0{qr.id}</p>
                    <h3 className="mt-1 text-lg font-semibold text-white">{qr.label}</h3>
                  </div>
                  <p className="text-right"><strong className="block text-2xl font-semibold text-white">{total}</strong><span className="text-xs text-slate-500">Aufrufe</span></p>
                </div>
                <div className="mt-5 grid h-20 items-end gap-[2px]" style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))` }} role="img" aria-label={`Tägliche Aufrufe für QR-Code ${qr.id} in den letzten 30 Tagen`}>
                  {dates.map((date) => {
                    const scans = qrRows.get(date) ?? 0;
                    const height = scans ? Math.max(8, (scans / maxScans) * 100) : 3;
                    return <span key={date} title={`${date}: ${scans} Aufrufe`} className="min-w-0 rounded-t-sm" style={{ height: `${height}%`, backgroundColor: scans ? qr.color : "#1E293B", opacity: scans ? 0.9 : 0.7 }} />;
                  })}
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-slate-500"><span>vor 30 Tagen</span><span>heute</span></div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
