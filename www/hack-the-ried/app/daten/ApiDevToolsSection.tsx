export default function ApiDevToolsSection() {
  return (
    <section id="api-tools" className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4">
      <h2 className="text-2xl font-bold">Daten über die API abrufen</h2>
      <p className="text-sm text-slate-300">Die FastAPI-Dokumentation zeigt Endpunkte, Parameter und Antwortformate. Öffentliche Lesezugriffe benötigen keinen API-Key.</p>
      <a href="https://open-ried-sens.duckdns.org/docs" target="_blank" rel="noopener noreferrer" className="inline-flex rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-300">API-Dokumentation öffnen ↗</a>
      <div className="border-t border-slate-800 pt-4 text-sm">
        <h3 className="font-semibold text-slate-300">In Postman / Insomnia importieren</h3>
        <p className="mt-3 text-slate-400">Lade die OpenAPI-Datei herunter und öffne sie über die Import-Funktion deines API-Clients.</p>
        <a href="/api/public-openapi" download className="mt-3 inline-block text-emerald-300 hover:underline">OpenAPI-Datei herunterladen</a>
      </div>
    </section>
  );
}
