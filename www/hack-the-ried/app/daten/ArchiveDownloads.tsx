import { env } from "@/env";

type Archive = {
  month: string;
  generated_at: string;
  is_complete: boolean;
  reading_count: number;
  files: { filename: string; url: string; size_bytes: number }[];
};

export default async function ArchiveDownloads() {
  let archives: Archive[] | null = null;
  try {
    const response = await fetch(new URL("/api/v1/archives", env.BACKEND_API_URL), {
      cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Archive catalogue unavailable");
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("Invalid archive catalogue");
    archives = data;
  } catch { archives = null; }

  const years = new Map<string, Archive[]>();
  for (const archive of (archives ?? []).filter(archive => archive.files.length > 0)
    .sort((a, b) => b.month.localeCompare(a.month))) {
    const year = archive.month.slice(0, 4);
    const months = years.get(year) ?? [];
    months.push(archive);
    years.set(year, months);
  }

  return (
    <section id="monatsarchive" className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4">
      <h2 className="text-2xl font-bold">Sensorarchive</h2>
      <p className="text-sm text-slate-300">Gespeicherte öffentliche Daten als ZIP mit drei verknüpften CSV-Tabellen: Objekte, Messgrößen und Messwerte. Bei mehrteiligen Archiven alle Teile des Zeitraums herunterladen.</p>
      {archives === null ? (
        <p role="status" className="text-sm text-amber-300">Der Downloadkatalog ist momentan nicht erreichbar. Bitte später erneut versuchen.</p>
      ) : years.size === 0 ? (
        <p role="status" className="text-sm text-amber-300">Der Downloadkatalog liefert derzeit keine Archivdateien. Nutze den Themen-Export oben für die gespeicherten Daten.</p>
      ) : (
        <div className="space-y-3">
          {[...years].map(([year, months], yearIndex) => (
            <details key={year} open={yearIndex === 0} className="group rounded-xl border border-slate-800">
              <summary className="cursor-pointer rounded-xl px-4 py-3 text-slate-200 hover:bg-slate-800/50 focus-visible:outline-2 focus-visible:outline-emerald-400">
                <span className="ml-2 font-semibold">{year}</span>
                <span className="ml-3 text-sm text-slate-400">{months.length} {months.length === 1 ? "Monat" : "Monate"}</span>
              </summary>
              <ul className="grid gap-3 p-3 pt-0 sm:grid-cols-2 lg:grid-cols-3">
                {months.map(archive => (
                  <li key={archive.month} className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/40 p-4 space-y-2">
                    <h3 className="font-semibold">{new Date(`${archive.month}-01T00:00:00Z`).toLocaleDateString("de-DE", { month: "long", timeZone: "UTC" })}</h3>
                    <p className="text-sm text-slate-300">{archive.reading_count.toLocaleString("de-DE")} Messwerte{archive.is_complete ? "" : " · laufender Zeitraum"}</p>
                    <p className="text-xs text-slate-400">Stand {new Date(archive.generated_at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}</p>
                    <div className="flex flex-wrap gap-2">
                      {archive.files.map((file, partIndex) => (
                        <a key={file.filename} href={file.url} aria-label={`${archive.month}: ${file.filename} herunterladen`} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-emerald-300 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-emerald-400">
                          {archive.files.length === 1 ? "ZIP" : `ZIP · Teil ${partIndex + 1}`} · {(file.size_bytes / (file.size_bytes < 1024 * 1024 ? 1024 : 1024 * 1024)).toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} {file.size_bytes < 1024 * 1024 ? "KB" : "MB"} ↓
                        </a>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
