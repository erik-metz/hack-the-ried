export default function McpAccessSection() {
  return (
    <section id="mcp" aria-labelledby="mcp-title" className="scroll-mt-24 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6 space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">Für KI-Clients</p>
        <h3 id="mcp-title" className="text-xl font-semibold">MCP-Server</h3>
        <p className="text-sm leading-relaxed text-slate-300">Lass deine KI öffentliche Daten selbst abrufen: Messwerte, Veranstaltungen, Regionalatlas und Quellenstatus über das Model Context Protocol.</p>
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-2 border-y border-slate-800 py-3 text-xs">
        <div><dt className="text-slate-500">Zugang</dt><dd className="mt-1 text-slate-300">Ohne Konto oder Schlüssel</dd></div>
        <div><dt className="text-slate-500">Transport</dt><dd className="mt-1 text-slate-300">Streamable HTTP · nur lesend</dd></div>
      </dl>
      <div className="min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">
        <p className="mb-1 text-xs text-slate-400">Server-URL zum Kopieren</p>
        <code className="select-all break-all text-sm text-emerald-300">https://hack-the-ried.duckdns.org/mcp</code>
      </div>
      <details className="border-t border-slate-800 pt-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-200 focus-visible:outline-2 focus-visible:outline-emerald-400">Einrichtung &amp; Beispielanfragen</summary>
        <div className="pt-3 space-y-5 text-sm leading-relaxed text-slate-400">
          <ol className="list-decimal space-y-2 pl-5">
            <li>Füge in den MCP- oder Integrations-Einstellungen deines KI-Clients einen eigenen Server hinzu, z. B. mit dem Namen <code>hack-the-ried</code>.</li>
            <li>Trage die Server-URL ein, wähle Streamable HTTP und keine Authentifizierung.</li>
            <li>Speichere die Verbindung und lade bei Bedarf die Werkzeuge neu oder starte den Client neu.</li>
          </ol>
          <p>Dein Client muss entfernte MCP-Server mit Streamable HTTP unterstützen. Du brauchst keinen lokalen Server. Die URL ist eine Schnittstelle für deinen Client, keine Webseite.</p>
          <div className="space-y-2">
            <h4 className="font-medium text-slate-200">Probiere zum Beispiel</h4>
            <ul className="space-y-2">
              <li>„Welche Veranstaltungen finden nächste Woche im Ried statt?“</li>
              <li>„Zeige den Pegelverlauf von Worms der letzten sieben Tage.“</li>
              <li>„Welche Quellen haben zuletzt keine Daten geliefert?“</li>
            </ul>
          </div>
          <p>Der Zugang ist ausschließlich lesend. Abfragen sind begrenzt; größere Ergebnisse werden seitenweise geliefert. Fehlende oder abgelaufene Daten bleiben als solche erkennbar. Fehlende Quellenhistorie bedeutet „unbekannt“.</p>
          <a href="https://github.com/erik-metz/hack-the-ried/blob/main/www/vps/mcp-server/README.md" target="_blank" rel="noopener noreferrer" className="inline-block text-emerald-300 hover:underline">Technische Dokumentation ↗</a>
        </div>
      </details>
    </section>
  );
}
