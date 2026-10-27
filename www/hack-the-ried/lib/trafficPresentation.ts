/** The map shows current traffic only; historical data belongs in the telemetry view. */
export type TrafficCategory = "all" | "warning" | "roadworks" | "closure";

export function trafficFeatureVisible(values: Record<string, unknown>, category: TrafficCategory): boolean {
  if (values.is_stale === true) return false;
  if (values.event_status && values.event_status !== "active") return false;
  if (values.kind === "corridor") return true;
  // Municipal closures have their own status model.
  if (!values.event_status) return true;
  return category === "all" || values.source_category === category;
}

export function corridorLabel(status: string, delay: number | null | undefined): string {
  if (status === "closure") return "⛔ Gesperrt";
  if (status === "unknown") return "⚪ Unbekannt";
  if (status === "clear") return "🟢 Keine Störung gemeldet";
  if (delay == null) return status === "congestion" ? "🔴 Stau gemeldet" : "🟡 Einschränkung";
  return `${status === "congestion" ? "🔴" : "🟡"} +${delay} Min.`;
}
