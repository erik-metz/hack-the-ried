import type { SourceItem } from "./sourceInfo";

export type StatusTone = "success" | "warning" | "error" | "neutral" | "info";
export type StatusGroup = "success" | "attention" | "unknown" | "inactive";
export interface SourceStatus {
  label: string;
  description: string;
  tone: StatusTone;
  group: StatusGroup;
  stale: boolean;
}

const LIVE_SOURCES = new Set(["adsblol-ried", "aisstream-rhein", "ogn-ried", "rhein-map"]);
const NUMBER = new Intl.NumberFormat("de-DE");
const DATE = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

export function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function formatTimestamp(value: string | null | undefined) {
  return validTimestamp(value) ? DATE.format(new Date(value)) : "Nicht gemeldet";
}

export function formatInterval(seconds: number | null | undefined) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return "Nicht gemeldet";
  for (const [divisor, singular, plural] of [[604800, "Woche", "Wochen"], [86400, "Tag", "Tage"], [3600, "Stunde", "Stunden"], [60, "Minute", "Minuten"]] as const) {
    if (seconds % divisor === 0) {
      const count = seconds / divisor;
      return count === 1 ? `Jede${singular === "Tag" ? "n" : ""} ${singular}` : `Alle ${NUMBER.format(count)} ${plural}`;
    }
  }
  return seconds === 1 ? "Jede Sekunde" : `Alle ${NUMBER.format(seconds)} Sekunden`;
}

export function hasItemCount(source: SourceItem) {
  return typeof source.item_count === "number" && Number.isSafeInteger(source.item_count) && source.item_count >= 0;
}

export function formatItemCount(source: SourceItem) {
  if (!hasItemCount(source)) return "Datenmenge nicht gemeldet";
  const units: Record<string, readonly [string, string]> = {
    gateways: ["Gateway", "Gateways"], sites: ["Standort", "Standorte"],
    metrics: ["Messwert", "Messwerte"], observations: ["Beobachtung", "Beobachtungen"],
    gauges: ["Pegel", "Pegel"], items: ["Eintrag", "Einträge"], datasets: ["Datensatz", "Datensätze"],
  };
  const count = source.item_count as number;
  const unit = units[source.item_count_unit ?? ""];
  return `${NUMBER.format(count)} ${unit ? unit[count === 1 ? 0 : 1] : "(Einheit nicht gemeldet)"}`;
}

export function isPlaceholderSource(source: SourceItem) {
  return source.enabled !== true && (source.source_id.endsWith("-published-source") || source.source_id === "energy-meter-feed");
}

export function safeSourceUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function sourceHttpStatus(source: SourceItem) {
  if (typeof source.http_status === "number" && Number.isInteger(source.http_status) && source.http_status >= 100 && source.http_status <= 599) return source.http_status;
  const match = source.error?.match(/(?:HTTP |status=)([1-5]\d{2})\b/);
  return match ? Number(match[1]) : null;
}

export function errorStage(source: SourceItem) {
  if (["acquisition", "processing", "storage"].includes(source.error_stage ?? "")) return source.error_stage;
  if (/ForeignKeyViolation|UndefinedFunction|UndefinedTable|UndefinedColumn|IntegrityError|DatabaseError/.test(source.error ?? "")) return "storage";
  if (/ValueError|TypeError|JSONDecodeError/.test(source.error ?? "")) return "processing";
  const http = sourceHttpStatus(source);
  if ((http !== null && http >= 400) || /HTTPStatusError|ConnectError|Timeout/.test(source.error ?? "")) return "acquisition";
  return null;
}

export function failureDescription(source: SourceItem) {
  const error = source.error ?? "";
  if (error.includes("ordinary_totals_do_not_reconcile")) return "Die ausgelesenen Haushaltssummen stimmen rechnerisch nicht überein.";
  const rejected = error.match(/(\d+) street samples rejected/);
  if (rejected) return `${NUMBER.format(Number(rejected[1]))} Straßenstichproben wurden abgelehnt. Die Adressabdeckung ist unvollständig.`;
  if (error.includes("No usable regional observations produced")) return "Der Download war erfolgreich; daraus wurden keine verwertbaren regionalen Werte verarbeitet.";
  if (error.includes("Cycle interrupted by required source failure")) return "Die Daten wurden heruntergeladen. Der gemeinsame Verarbeitungslauf wurde durch den Abruffehler einer benötigten Quelle unterbrochen.";
  if (error.includes("ForeignKeyViolation")) return "Die Speicherung scheitert an einem fehlenden Datenbankbezug.";
  if (error.includes("UndefinedFunction")) return "Die Speicherung scheitert an einer fehlenden oder nicht passenden Datenbankfunktion.";
  const http = sourceHttpStatus(source);
  if (http === 401 || http === 403) return "Der Anbieter verweigert den Zugriff. Die Zugangsberechtigung muss geprüft werden.";
  if (http === 429) return "Der Anbieter begrenzt die Abrufe. Ein späterer Versuch ist erforderlich.";
  if (http !== null && http >= 500) return "Die Schnittstelle des Anbieters hat einen Serverfehler gemeldet.";
  if (http !== null && http >= 400) return "Die Schnittstelle hat den Abruf abgewiesen.";
  if (errorStage(source) === "storage") return "Die Daten konnten nicht erfolgreich gespeichert werden.";
  if (errorStage(source) === "processing") return "Die empfangenen Daten konnten nicht vollständig ausgewertet werden.";
  if (errorStage(source) === "acquisition") return "Der Abruf konnte nicht abgeschlossen werden.";
  return source.status === "partial"
    ? "Der Versuch wurde nur teilweise abgeschlossen. Weitere Einzelheiten stehen in den technischen Nachweisen."
    : "Der letzte Versuch ist fehlgeschlagen. Die genaue Ursache wurde nicht gemeldet.";
}

export function staleThresholdSeconds(source: SourceItem) {
  const interval = source.interval_seconds;
  return typeof interval === "number" && Number.isFinite(interval) && interval > 0
    ? Math.max(interval * 2, interval + 60) : null;
}

export function isSourceStale(source: SourceItem, now: number) {
  const threshold = staleThresholdSeconds(source);
  return source.enabled !== false && source.status !== "not_configured" && !isPlaceholderSource(source)
    && threshold !== null && validTimestamp(source.received_at)
    && now - Date.parse(source.received_at) > threshold * 1000;
}

export function getSourceStatus(source: SourceItem, now = Date.now()): SourceStatus {
  let status: Omit<SourceStatus, "stale">;
  if (isPlaceholderSource(source)) {
    status = { label: "Geplante Anbindung", description: "Für dieses Thema ist noch keine verifizierte Datenquelle angebunden.", tone: "neutral", group: "inactive" };
  } else if (source.status === "not_configured") {
    status = { label: "Nicht eingerichtet", description: "Diese Anbindung ist noch nicht eingerichtet. Freischaltung und erforderliche Konfiguration müssen geprüft werden.", tone: "neutral", group: "inactive" };
  } else if (source.enabled === false) {
    status = { label: "Deaktiviert", description: "Diese Quelle ist deaktiviert. Vorhandene Zeitstempel gehören zu früheren Versuchen.", tone: "neutral", group: "inactive" };
  } else if (source.status === "failed") {
    const stage = errorStage(source);
    const label = stage === "acquisition" ? "Abruffehler" : stage === "storage" ? "Speicherfehler" : stage === "processing" ? "Verarbeitungsfehler" : "Fehlgeschlagen";
    status = { label, description: failureDescription(source), tone: "error", group: "attention" };
  } else if (source.status === "partial") {
    status = { label: "Teilweise verarbeitet", description: source.error ? failureDescription(source) : "Der letzte Versuch wurde nur teilweise abgeschlossen. Eine vollständige Verarbeitung ist nicht bestätigt.", tone: "warning", group: "attention" };
  } else if (source.status === "running" || source.status === "received") {
    status = { label: source.status === "running" ? "Erfassung läuft" : "Verarbeitung offen", description: source.status === "running" ? "Der aktuelle Erfassungslauf ist noch nicht abgeschlossen." : "Die Daten sind empfangen; der Verarbeitungsabschluss ist noch nicht bestätigt.", tone: "info", group: "unknown" };
  } else if (source.status === "success") {
    if (hasItemCount(source) && source.item_count === 0) {
      status = { label: "Ohne verarbeitete Einträge", description: "Der Versuch ist abgeschlossen; es wurden 0 Einträge verarbeitet.", tone: "warning", group: "attention" };
    } else if (LIVE_SOURCES.has(source.source_id)) {
      status = { label: "Live-Empfang gemeldet", description: "Der Dienst meldet Empfang oder eine Verbindung. Die vollständige Abdeckung ist damit nicht nachgewiesen.", tone: "info", group: "success" };
    } else if (source.completion_recorded !== false && validTimestamp(source.processed_at)) {
      status = { label: "Erfolgreich verarbeitet", description: hasItemCount(source) ? "Der Verarbeitungsabschluss wurde bestätigt." : "Der Verarbeitungsabschluss wurde gemeldet; die Datenmenge ist unbekannt.", tone: "success", group: "success" };
    } else {
      status = { label: "Erfolg ohne Abschlussnachweis", description: "Ein Erfolg wurde gemeldet. Ein belegter Verarbeitungsabschluss fehlt für diesen Versuch.", tone: "warning", group: "attention" };
    }
  } else {
    status = { label: source.status === "pending" ? "Noch kein Status" : "Unbekannter Status", description: "Es liegt kein auswertbarer Verarbeitungsstatus vor.", tone: "neutral", group: "unknown" };
  }
  const stale = isSourceStale(source, now);
  return { ...status, tone: stale && status.group === "success" ? "warning" : status.tone, group: stale ? "attention" : status.group, stale };
}

export function summarizeSources(sources: SourceItem[], now: number) {
  const summary: Record<StatusGroup, number> = { success: 0, attention: 0, unknown: 0, inactive: 0 };
  for (const source of sources) summary[getSourceStatus(source, now).group] += 1;
  return summary;
}

export function parseSourcesResponse(value: unknown): SourceItem[] | null {
  if (!value || typeof value !== "object" || !("sources" in value) || !Array.isArray(value.sources)) return null;
  const ids = new Set<string>();
  for (const source of value.sources) {
    if (!source || typeof source !== "object" || typeof source.source_id !== "string" || !source.source_id
      || typeof source.status !== "string" || ids.has(source.source_id)
      || !(source.enabled === null || typeof source.enabled === "boolean")
      || !(source.source_url === null || typeof source.source_url === "string")) return null;
    ids.add(source.source_id);
  }
  return value.sources as SourceItem[];
}
