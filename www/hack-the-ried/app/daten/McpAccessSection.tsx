import Link from "next/link";

export default function McpAccessSection() {
  return (
    <section id="mcp" aria-labelledby="mcp-title" className="scroll-mt-24 rounded-2xl border border-emerald-500/30 bg-slate-900/50 p-6 space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-emerald-300">Offener Zugang für KI-Clients</p>
        <h2 id="mcp-title" className="text-2xl font-bold">Daten mit KI nutzen: unser MCP-Server</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-300">
          Verbinde deinen KI-Client direkt mit den öffentlichen Daten von HackTheRied.
          MCP (Model Context Protocol) ermöglicht deiner KI, passende Daten selbst abzurufen:
          öffentliche Objekte und Messwerte, Veranstaltungen, Regionalatlas und den Zustand der Datenquellen.
          Du brauchst keinen lokalen Server, kein Konto und keinen API-Schlüssel für diesen Zugang.
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-950 p-4 space-y-3">
        <h3 className="font-semibold">Verbindungsdaten</h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
          <dt className="text-slate-400">Server-URL</dt>
          <dd className="min-w-0"><code className="select-all break-all text-emerald-300">https://hack-the-ried.duckdns.org/mcp</code></dd>
          <dt className="text-slate-400">Transport</dt>
          <dd>Streamable HTTP</dd>
          <dt className="text-slate-400">Authentifizierung</dt>
          <dd>Keine / anonym</dd>
          <dt className="text-slate-400">Name, z. B.</dt>
          <dd><code>hack-the-ried</code></dd>
        </dl>
        <p className="text-xs leading-relaxed text-slate-400">Die URL ist eine Schnittstelle für MCP-Clients. Trage sie in deinem Client ein; sie ist keine Webseite zum Öffnen im Browser.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="font-semibold">So verbindest du dich</h3>
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-300">
            <li>Öffne die MCP- oder Integrations-Einstellungen deines KI-Clients und füge einen eigenen MCP-Server hinzu.</li>
            <li>Trage die Server-URL ein, wähle Streamable HTTP und keine Authentifizierung.</li>
            <li>Speichere die Verbindung und lade bei Bedarf die Werkzeuge neu oder starte den Client neu. Wähle HackTheRied für deine Anfrage aus.</li>
          </ol>
          <p className="text-xs leading-relaxed text-slate-400">Dein Client muss entfernte MCP-Server mit Streamable HTTP unterstützen. Verfügbarkeit und Bezeichnung der Einstellungen hängen vom Client ab.</p>
        </div>
        <div className="space-y-3">
          <h3 className="font-semibold">Das kannst du fragen</h3>
          <ul className="space-y-2 text-sm leading-relaxed text-slate-300">
            <li>„Welche Daten gibt es über Biblis?“</li>
            <li>„Welche Veranstaltungen finden nächste Woche im Ried statt?“</li>
            <li>„Zeige mir den Pegelverlauf von Worms der letzten sieben Tage.“</li>
            <li>„Welche Quellen haben zuletzt keine Daten mehr geliefert?“</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-800 pt-4 space-y-2 text-sm leading-relaxed text-slate-400">
        <p>Der Zugang ist ausschließlich lesend. Deine KI kann Daten abfragen, aber darüber keine Daten ändern oder Dienste reparieren. Abfragen sind begrenzt und größere Ergebnisse werden seitenweise geliefert.</p>
        <p>Der Katalog zeigt auch fehlende oder abgelaufene Daten. Fehlende Quellenhistorie bedeutet „unbekannt“. Beachte Quellenangaben, Einheiten, Bezugszeiträume und die jeweiligen Nutzungsbedingungen.</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
          <Link href="/quellen" className="text-emerald-300 hover:underline">Quellen &amp; Aktualität →</Link>
          <a href="https://github.com/erik-metz/hack-the-ried/blob/main/www/vps/mcp-server/README.md" target="_blank" rel="noopener noreferrer" className="text-emerald-300 hover:underline">Technische Dokumentation ↗</a>
        </div>
      </div>
    </section>
  );
}
