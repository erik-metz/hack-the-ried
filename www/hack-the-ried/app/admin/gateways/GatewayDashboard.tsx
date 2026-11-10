"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { formatGatewayValue, GATEWAY_LABELS, type GatewayDevice } from "@/lib/gatewayData";

import { getGatewayQrId, type GatewayDisplayData } from "@/lib/qrGateways";
import GatewayQrCard from "@/app/components/GatewayQrCard";

const GatewayChart = dynamic(() => import("./GatewayChart"), { loading: () => <p>Diagramm wird geladen …</p> });
const eventLabels: Record<string, string> = { boot: "Pi neu gestartet", radio_ready: "Funkbereitschaft geändert", station_connected: "Station-Verbindung geändert", lns_connected: "TTN-Verbindung geändert", undervoltage: "Unterspannung geändert", throttled: "Drosselung geändert", sensor_error: "Sensorstatus geändert", data_gap: "Datenlücke" };

export default function GatewayDashboard({ publicGatewayId }: { publicGatewayId?: string }) {
  const [devices, setDevices] = useState<GatewayDevice[]>([]);
  const [id, setId] = useState(publicGatewayId || "");
  const [days, setDays] = useState(1);
  const [metric, setMetric] = useState("cpu_temperature");
  const [data, setData] = useState<GatewayDisplayData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (publicGatewayId) return;
    const abort = new AbortController();
    fetch("/api/admin/gateways", { signal: abort.signal, cache: "no-store" }).then(async r => {
      if (!r.ok) throw Error();
      const list: GatewayDevice[] = await r.json();
      setDevices(list); setId(current => current || list[0]?.id || "");
    }).catch(e => { if (e.name !== "AbortError") setError("Gateway-Liste konnte nicht geladen werden."); });
    return () => abort.abort();
  }, [publicGatewayId]);
  useEffect(() => {
    if (!id) return;
    const abort = new AbortController();
    let running = false;
    async function load() {
      if (document.hidden || running) return;
      running = true;
      try {
        const response = await fetch(publicGatewayId
          ? `/api/gateways/${publicGatewayId}?days=${days}&metric=${metric}`
          : `/api/admin/gateways?id=${encodeURIComponent(id)}&days=${days}&metric=${metric}`, { signal: abort.signal, cache: "no-store" });
        if (!response.ok) throw Error();
        setData(await response.json()); setError("");
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) setError("Aktualisierung fehlgeschlagen. Angezeigte Daten können veraltet sein.");
      } finally { running = false; }
    }
    void load();
    const timer = setInterval(load, 60_000);
    document.addEventListener("visibilitychange", load);
    return () => { abort.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", load); };
  }, [id, days, metric, publicGatewayId]);
  const qrId = publicGatewayId ? undefined : getGatewayQrId(id);
  const fresh = Boolean(data?.fresh) && !error;
  return <div className="mt-8 space-y-6">
    {error ? <p role="alert" className="rounded-xl border border-amber-600 p-4 text-amber-300">{error}</p> : null}
    {!publicGatewayId ? <label className="block">Gateway<select value={id} onChange={e => (setData(null), setId(e.target.value))} className="ml-3 rounded bg-slate-800 p-2">{devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label> : null}
    {!publicGatewayId && !devices.length && !error ? <p>Noch kein Gateway registriert.</p> : null}
    {!publicGatewayId && id ? <section className="grid gap-6 rounded-xl border border-slate-700 p-5 sm:grid-cols-[1fr_220px]" aria-label="Öffentliche Gateway-Seite und QR-Code">
      <div><h2 className="text-xl font-semibold">Öffentliche Gateway-Seite</h2>
        <p className="mt-2 text-slate-400">Der QR-Code am Gehäuse führt direkt zu Status, Messwerten und Verlauf dieses Gateways.</p>
        <p className="mt-3 font-medium">{devices.find(device => device.id === id)?.name}</p>
        <p className="mt-1 break-all text-sm text-slate-400">Interne Kennung: {id}</p>
        {qrId ? <p className="mt-3 text-emerald-400">Gateway-Nummer: {qrId}</p> : <p className="mt-3 text-amber-300">Für dieses Gateway ist noch keine öffentliche Nummer vergeben.</p>}
      </div>
      {qrId ? <GatewayQrCard qrId={qrId} name={devices.find(device => device.id === id)?.name || "Gateway"} /> : null}
    </section> : null}
    {data ? <>
      <section className="rounded-xl border border-slate-700 p-4" aria-label="Verbindungsstatus">
        <strong className={fresh ? "text-emerald-400" : "text-amber-300"}>{fresh ? "Aktuelle Messung vorhanden" : "Kein aktueller Kontakt – Zustand unbekannt"}</strong>
        <p className="mt-2 text-sm text-slate-400">Messung: {data.device.latest_at ? new Date(data.device.latest_at).toLocaleString("de-DE") : "Noch keine"} · Letzter Kontakt: {data.device.last_contact ? new Date(data.device.last_contact).toLocaleString("de-DE") : "Noch keiner"}</p>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{data.latest.filter(r => !["throttled_history"].includes(r.metric)).map(r => <div key={r.metric} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-sm text-slate-400">{GATEWAY_LABELS[r.metric] || r.metric}</p><p className="mt-2 text-xl">{r.quality !== "valid" || (!fresh && r.unit === "boolean") ? "Unbekannt" : formatGatewayValue(r.value, r.unit)}</p>
      </div>)}</div>
      {!data.device.sensor_config.sht41 ? <p className="text-slate-400">SHT41 noch nicht installiert. Gehäusetemperatur und Luftfeuchtigkeit sind noch nicht verfügbar.</p> : null}
      <section className="rounded-xl border border-slate-700 p-4">
        <div className="mb-6 flex flex-wrap gap-4"><label>Messgröße <select value={metric} onChange={e => (setData(null), setMetric(e.target.value))} className="rounded bg-slate-800 p-2">{Object.keys(data.metrics).filter(k => !k.startsWith("state_")).map(k => <option key={k} value={k}>{GATEWAY_LABELS[k] || k}</option>)}</select></label>
          <label>Zeitraum <select value={days} onChange={e => (setData(null), setDays(Number(e.target.value)))} className="rounded bg-slate-800 p-2">{[1, 7, 30, 90, 365, 730].map(n => <option key={n} value={n}>{n === 1 ? "24 Stunden" : `${n} Tage`}</option>)}</select></label></div>
        <GatewayChart series={data.series} resolution={data.resolution} unit={data.metrics[metric]?.unit || ""} />
        <p className="mt-4 text-sm text-slate-400">Auflösung: {data.resolution === "minute" ? "Minute" : data.resolution === "day" ? "Tag" : "Stunde"}. Mittelwerte mit Minimum und Maximum, soweit vorhanden. Fehlende Daten werden nicht interpoliert. Funkstatistiken beschreiben das vorangegangene abgeschlossene Intervall.</p>
      </section>
      <section className="rounded-xl border border-slate-700 p-4"><h2 className="text-xl font-semibold">Zustandsdauer und Datenabdeckung</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">{Object.entries(data.availability).map(([state, a]) => <div key={state}><p>{GATEWAY_LABELS[state] || state}</p><p>{a.known_seconds ? `${(100 * a.up_seconds / a.known_seconds).toLocaleString("de-DE", { maximumFractionDigits: 1 })} % aktiv während bekannter Zeit` : "Unbekannt"}</p><p className="text-sm text-slate-400">{(100 * a.known_seconds / a.window_seconds).toLocaleString("de-DE", { maximumFractionDigits: 1 })} % des Zeitraums beobachtet</p></div>)}</div>
        <p className="mt-3 text-sm text-slate-400">{!publicGatewayId ? "Bei Unterspannung und Drosselung bedeutet „aktiv“ einen Fehlerzustand. " : ""}Unbeobachtete Zeit wird nicht als gesund gewertet.</p></section>
      {data.events ? <section><h2 className="text-xl font-semibold">Ereignisse</h2><p className="my-2 text-sm text-slate-400">Bis zu 100 Ereignisse im gewählten Zeitraum. Keine Funkpakete allein sind kein Ausfallnachweis.</p>
        <ul className="divide-y divide-slate-800">{data.events.map((e, index) => <li key={`${e.observed_at}-${index}`} className="py-3"><time>{new Date(e.observed_at).toLocaleString("de-DE")}</time> · {eventLabels[e.kind] || e.kind}{"current" in e.details ? `: ${e.details.current === null ? "unbekannt" : Number(e.details.current) ? "aktiv" : "inaktiv"}` : ""}</li>)}</ul>
        {!data.events.length ? <p className="text-slate-400">Keine Ereignisse im Zeitraum.</p> : null}
      </section> : null}
      {data.maintenance ? <p className="text-sm text-slate-500">Stundenaggregation zuletzt: {data.maintenance.last_completed ? new Date(data.maintenance.last_completed).toLocaleString("de-DE") : "noch nicht ausgeführt"} · Ausstehende Stunden: {data.maintenance.pending_hours}. Minutenwerte: 90 Tage · Stundenwerte: dauerhaft · Ereignisse: 3 Jahre.</p> : null}
    </> : id && !error ? <p role="status">Gateway-Daten werden geladen …</p> : null}
  </div>;
}
