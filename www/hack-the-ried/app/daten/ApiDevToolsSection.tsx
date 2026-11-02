import { env } from "@/env";

export default function ApiDevToolsSection() {
  return (
    <section id="api-tools" aria-labelledby="api-title" className="scroll-mt-24 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6 space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">Für Anwendungen</p>
        <h3 id="api-title" className="text-xl font-semibold">HTTP-API</h3>
        <p className="text-sm leading-relaxed text-slate-300">Rufe öffentliche Daten mit deinem Code ab. Die interaktive Dokumentation zeigt Endpunkte, Parameter und Antwortformate.</p>
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-2 border-y border-slate-800 py-3 text-xs">
        <div><dt className="text-slate-500">Zugang</dt><dd className="mt-1 text-slate-300">Ohne API-Key lesbar</dd></div>
        <div><dt className="text-slate-500">Beschreibung</dt><dd className="mt-1 text-slate-300">OpenAPI</dd></div>
      </dl>
      <div className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">
        <p className="mb-1 text-xs text-slate-400">Interaktive Dokumentation</p>
        <a href={new URL("/docs", env.BACKEND_API_URL).toString()} target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-medium text-emerald-300 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400">API-Dokumentation öffnen ↗</a>
      </div>
      <details className="border-t border-slate-800 pt-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-200 focus-visible:outline-2 focus-visible:outline-emerald-400">In Postman oder Insomnia verwenden</summary>
        <div className="pt-3 space-y-3 text-sm leading-relaxed text-slate-400">
          <p>Lade die OpenAPI-Datei herunter und öffne sie über die Import-Funktion deines API-Clients.</p>
          <a href="/api/public-openapi" download className="inline-block text-emerald-300 hover:underline">OpenAPI-Datei herunterladen ↓</a>
        </div>
      </details>
    </section>
  );
}
