import { proxyBackend } from "@/lib/collectedBackend";
import { Activity, Database, ExternalLink } from "lucide-react";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";
import { SOURCE_INFO, type SourceItem } from "./sourceInfo";
import { getSourceLogo } from "./SourceLogos";
import {
  formatInterval, formatItemCount, formatTimestamp, getSourceStatus,
  isPlaceholderSource, parseSourcesResponse, safeSourceUrl, sourceHttpStatus,
  summarizeSources, validTimestamp, type StatusTone,
} from "./sourceStatus";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Datenquellen & Erfassungsstatus | HackTheRied",
  description: "Originalquellen, Abruf- und Verarbeitungsstatus sowie bekannte Einschränkungen der Datenangebote im Ried.",
};
const BADGES: Record<StatusTone, string> = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  error: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  neutral: "border-slate-700 bg-slate-800 text-slate-300",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-200",
};
function TimeValue({ value }: { value: string | null | undefined }) {
  return validTimestamp(value) ? <time dateTime={value}>{formatTimestamp(value)}</time>
    : <span className="text-slate-500">Nicht gemeldet</span>;
}
function EvidenceTime({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><dt className="mb-1 text-slate-500">{label}</dt><dd className="text-slate-300"><TimeValue value={value} /></dd></div>;
}
function SourceTable({ sources, now }: { sources: SourceItem[]; now: number }) {
  return <div>
    <div role="region" aria-label="Datenquellen mit Abruf- und Verarbeitungsnachweisen" tabIndex={0}
      className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50 focus-visible:outline-2 focus-visible:outline-emerald-400">
      <table className="w-full min-w-[1050px] text-left text-sm">
        <caption className="sr-only">Quellenstatus. Quellen mit Handlungsbedarf stehen zuerst. Alle Zeiten gelten für Europe/Berlin.</caption>
        <thead className="border-b border-slate-800 bg-slate-900 text-xs text-slate-400"><tr>
          <th scope="col" className="p-4 w-[26%]">Quelle &amp; Anbieter</th>
          <th scope="col" className="p-4 w-[24%]">Aktueller Status</th>
          <th scope="col" className="p-4 w-[18%]">Abruf</th>
          <th scope="col" className="p-4 w-[20%]">Verarbeitung &amp; Daten</th>
          <th scope="col" className="p-4 w-[12%]">Betrieb</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-800/80">
          {sources.map((source) => {
            const info = SOURCE_INFO[source.source_id];
            const status = getSourceStatus(source, now);
            const url = safeSourceUrl(source.source_url);
            const http = sourceHttpStatus(source);
            return <tr key={source.source_id} className="align-top hover:bg-slate-800/30">
              <th scope="row" className="p-4 font-normal">
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="shrink-0">{getSourceLogo(source.source_id, "w-7 h-7")}</span>
                  <div className="min-w-0 space-y-1.5">
                    {url ? <a href={url} target="_blank" rel="noreferrer"
                      className="font-semibold text-emerald-300 underline decoration-emerald-500/30 underline-offset-4 hover:text-emerald-200 focus-visible:outline-2 focus-visible:outline-emerald-400">
                      {info?.title ?? source.source_id}<ExternalLink aria-hidden="true" className="ml-1 inline h-3 w-3" />
                      <span className="sr-only"> (öffnet die Originalquelle in einem neuen Tab)</span>
                    </a> : <span className="font-semibold text-slate-200">{info?.title ?? source.source_id}</span>}
                    <p className="text-xs text-slate-400">{info?.provider ?? "Anbieter nicht hinterlegt"}</p>
                    {info?.domain ? <p className="text-xs text-slate-500">{info.domain}</p> : null}
                    <p className="break-all font-mono text-[11px] text-slate-500">{source.source_id}</p>
                    {!url ? <p className="text-xs text-slate-500">Kein Quellenlink hinterlegt.</p> : null}
                  </div>
                </div>
              </th>
              <td className="p-4 space-y-2">
                <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${BADGES[status.tone]}`}>{status.label}</span>
                {status.stale ? <p className="text-xs text-amber-200"><strong>Status veraltet.</strong> Seit mehr als zwei Abrufintervallen liegt kein neuer Versuch vor; bei kurzen Intervallen gilt mindestens eine Minute Toleranz.</p> : null}
                <p className="text-xs leading-relaxed text-slate-400">{status.description}</p>
                <details className="text-xs text-slate-400">
                  <summary className="cursor-pointer text-slate-300 hover:text-white">Weitere Nachweise</summary>
                  <dl className="mt-2 space-y-2 break-words">
                    <div><dt className="text-slate-500">Gemeldeter Status</dt><dd>{source.status}</dd></div>
                    {source.error ? <div><dt className="text-slate-500">Originalmeldung</dt><dd className="break-all">{source.error}</dd></div> : null}
                    {source.error_stage ? <div><dt className="text-slate-500">Gemeldete Fehlerphase</dt><dd>{source.error_stage === "acquisition" ? "Abruf" : source.error_stage === "processing" ? "Verarbeitung" : source.error_stage === "storage" ? "Speicherung" : "Unbekannt"}</dd></div> : null}
                    {!validTimestamp(source.last_processed_at) && validTimestamp(source.last_success_at) ? <EvidenceTime label="Frühere Erfolgsmeldung ohne belegten Abschluss" value={source.last_success_at} /> : null}
                    {typeof source.published_dataset_count === "number" && Number.isSafeInteger(source.published_dataset_count) && source.published_dataset_count > 0 ? <div><dt className="text-slate-500">Veröffentlichte Datensätze (keine Messwertanzahl)</dt><dd>{source.published_dataset_count.toLocaleString("de-DE")}</dd></div> : null}
                  </dl>
                </details>
              </td>
              <td className="p-4 text-xs"><dl className="space-y-3">
                <EvidenceTime label="Letzter Versuch" value={source.received_at} />
                <EvidenceTime label="Letzter erfolgreicher Download" value={source.last_fetch_success_at} />
                {http !== null ? <div><dt className="mb-1 text-slate-500">HTTP-Antwort dieses Versuchs</dt><dd className="text-slate-300">HTTP {http}</dd></div> : null}
              </dl></td>
              <td className="p-4 text-xs"><dl className="space-y-3">
                <div><dt className="mb-1 text-slate-500">Menge im letzten Versuch</dt><dd className="font-semibold text-slate-200">{formatItemCount(source)}</dd></div>
                <EvidenceTime label="Abschluss dieses Versuchs (auch teilweise)" value={source.processed_at} />
                <EvidenceTime label="Zuletzt vollständig verarbeitet" value={source.last_processed_at} />
              </dl></td>
              <td className="p-4 text-xs">
                <p className="font-medium text-slate-300">{source.enabled === true ? "Aktiviert" : source.enabled === false ? "Deaktiviert" : "Aktivierung nicht gemeldet"}</p>
                <p className="mt-2 text-slate-400">{formatInterval(source.interval_seconds)}</p>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    <p className="mt-2 text-xs text-slate-500">Die Tabelle lässt sich seitlich verschieben. Zeitangaben: Europe/Berlin.</p>
  </div>;
}

async function loadSourceOverview() {
  let sources: SourceItem[] | null = null;
  const statusRes = await proxyBackend("collection/status", 30).catch(() => null);
  if (statusRes?.ok) {
    try { sources = parseSourcesResponse(await statusRes.json()); } catch { sources = null; }
  }
  return { sources, now: Date.now() };
}

export default async function SourcesPage() {
  const { sources, now } = await loadSourceOverview();
  const summary = sources ? summarizeSources(sources, now) : null;
  const groupOrder = { attention: 0, unknown: 1, success: 2, inactive: 3 };
  const connected = sources?.filter((source) => !isPlaceholderSource(source)).sort((a, b) =>
    groupOrder[getSourceStatus(a, now).group] - groupOrder[getSourceStatus(b, now).group]
    || (SOURCE_INFO[a.source_id]?.title ?? a.source_id).localeCompare(SOURCE_INFO[b.source_id]?.title ?? b.source_id, "de")) ?? [];
  const planned = sources?.filter(isPlaceholderSource) ?? [];
  return <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
    <SiteHeader />
    <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8 flex-1">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider"><Database aria-hidden="true" className="w-4 h-4" /><span>Herkunft &amp; Aktualität</span></div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">Datenquellen &amp; Erfassungsstatus</h1>
        <p className="text-slate-300 text-base sm:text-lg max-w-3xl leading-relaxed">Woher stammen die Daten im Ried? Hier siehst du, welche Quellen erreichbar sind, welche Daten verarbeitet wurden und wo Einschränkungen bestehen.</p>
        <p className="text-xs text-slate-500">Ansicht geladen: <TimeValue value={new Date(now).toISOString()} /> · Status beim erneuten Laden aktualisieren.</p>
      </div>
      {sources === null ? <div role="status" className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-sm flex items-center gap-3"><Activity aria-hidden="true" className="w-5 h-5 shrink-0" /><span>Der Erfassungsstatus ist momentan <strong>nicht erreichbar</strong>. Bitte später erneut versuchen.</span></div>
        : sources.length === 0 ? <div className="p-8 text-center bg-slate-900/50 rounded-2xl border border-slate-800 text-slate-400">Noch keine Quellenstatusmeldungen vorhanden.</div>
        : <>
          <section aria-label="Überblick über die gemeldeten Quellen" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {([
              ["success", "Erfolg gemeldet", "Bestätigte Verarbeitung oder Live-Empfang", "text-emerald-300"],
              ["attention", "Prüfung nötig", summary ? `${summary.attentionReasons.failed} Fehler · ${summary.attentionReasons.partial} Teilerfolge · ${summary.attentionReasons.noEntries} ohne Einträge · ${summary.attentionReasons.stale} veraltet · ${summary.attentionReasons.missingProof} ohne Abschlussnachweis` : "", "text-amber-200"],
              ["unknown", "Offen / ohne Status", "Laufende Erfassungen und fehlende Meldungen", "text-sky-200"],
              ["inactive", "Nicht eingerichtet / inaktiv", "Einschließlich geplanter Anbindungen", "text-slate-300"],
            ] as const).map(([group, label, description, color]) => <div key={group} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <p className={`text-3xl font-bold tabular-nums ${color}`}>{summary?.[group].toLocaleString("de-DE")}</p><h2 className="mt-2 font-semibold text-sm text-slate-200">{label}</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
            </div>)}
          </section>
          <section aria-labelledby="source-details-title" className="space-y-4">
            <div className="space-y-2"><h2 id="source-details-title" className="text-xl font-bold text-slate-200">Quellen und ihre Nachweise</h2><p className="text-sm leading-relaxed text-slate-400 max-w-4xl">Ein erfolgreicher Download bestätigt die Erreichbarkeit. Erst der Verarbeitungsabschluss belegt einen abgeschlossenen Import. Ein Speicher- oder Verarbeitungsfehler bedeutet deshalb nicht automatisch einen Ausfall beim Anbieter. Quellen mit Handlungsbedarf stehen zuerst.</p></div>
            {connected.length ? <SourceTable sources={connected} now={now} /> : <p className="text-sm text-slate-400">Bisher sind nur geplante Anbindungen registriert.</p>}
          </section>
          {planned.length ? <details className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            <summary className="cursor-pointer font-semibold text-slate-300">Geplante Anbindungen ({planned.length.toLocaleString("de-DE")})</summary><p className="mt-3 text-sm text-slate-400">Diese Einträge sind Platzhalter für weitere Datenangebote. Es ist noch keine verifizierte Quelle angebunden; sie zählen nicht als ausgefallene Anbieter.</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{planned.map((source) => <li key={source.source_id} className="rounded-lg border border-slate-800 p-3"><p className="text-sm font-medium text-slate-300">{SOURCE_INFO[source.source_id]?.title ?? source.source_id}</p><p className="mt-1 text-xs text-slate-500">Geplante Anbindung · Anbieter noch nicht hinterlegt</p><p className="mt-1 break-all font-mono text-[11px] text-slate-500">{source.source_id}</p></li>)}</ul>
          </details> : null}
        </>}
      <aside className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 text-xs text-slate-400 leading-relaxed space-y-2">
        <p><strong className="text-slate-300">Aktualität der Daten:</strong> Abruf- und Verarbeitungszeiten belegen keine aktuelle Messung. Maßgeblich sind Quellenzeit und Gültigkeit der jeweiligen Datenveröffentlichung. „Status veraltet“ bezieht sich auf ausbleibende Abrufversuche.</p>
        <p><strong className="text-slate-300">Datenmengen:</strong> „Nicht gemeldet“ bedeutet unbekannt. Eine gemeldete 0 ist eine echte Nullmenge. Ältere Erfolgsmeldungen ohne belegten Abschluss werden ausdrücklich gekennzeichnet.</p>
        <p>Alle Schnittstellen unterliegen den Nutzungsbedingungen und Lizenzen der jeweiligen Urheber.</p>
      </aside>
    </main><SiteFooter />
  </div>;
}
