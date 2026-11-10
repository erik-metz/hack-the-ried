"use client";

import type { ScanPage } from "@/lib/adminOverview";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export default function QrScansAdminPanel() {
  const [qrId, setQrId] = useState("");
  const [days, setDays] = useState("0");
  const [cursors, setCursors] = useState<string[]>([""]);
  const [data, setData] = useState<ScanPage | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const cursor = cursors[cursors.length - 1];

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ qr_id: qrId, days, before: cursor });
    fetch(`/api/admin/qr-scans?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Die QR-Code-Scans konnten nicht geladen werden.");
        return response.json();
      })
      .then(result => { setData(result); setError(""); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [cursor, qrId, days, revision]);

  function resetPage() {
    setData(null);
    setError("");
    setCursors([""]);
  }

  return <section aria-labelledby="qr-scans-title" className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6">
      <h2 id="qr-scans-title" className="font-semibold text-slate-100">QR-Code-Scans</h2>
      <p className="mt-1 text-sm text-slate-400">Alle gespeicherten Scans, auch älter als 30 Tage · neueste zuerst. Server-Cache: 60 Sekunden.</p>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs text-slate-400">QR-Code
          <select value={qrId} onChange={event => { setQrId(event.target.value); resetPage(); }} className="rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-sm text-slate-100">
            <option value="">Alle QR-Codes</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={String(i + 1)}>QR-Code {i + 1}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-400">Zeitraum
          <select value={days} onChange={event => { setDays(event.target.value); resetPage(); }} className="rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-sm text-slate-100">
            <option value="0">Gesamter Zeitraum</option><option value="30">Letzte 30 Tage</option><option value="90">Letzte 90 Tage</option><option value="365">Letzte 365 Tage</option>
          </select>
        </label>
        <button type="button" onClick={() => { resetPage(); setRevision(value => value + 1); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2.5 text-sm text-slate-200"><RefreshCw className="size-4" aria-hidden="true" /> Neu laden</button>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
      {!data && !error && <p role="status" className="mt-4 text-sm text-slate-400">Scans werden geladen…</p>}
      {data && <>
        <p className="mt-4 text-xs text-slate-400">Seite {cursors.length} · {data.items.length} Scans · Datenstand: {new Date(data.fetched_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Einzelne QR-Code-Scans, Zeitangaben in Europe/Berlin</caption>
            <thead className="bg-slate-950 text-slate-400"><tr>{["Gescannt am", "QR-Code", "Herkunft", "Kampagne", "Browser / Gerät"].map(title => <th scope="col" key={title} className="p-3">{title}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-800">{data.items.map(scan => <tr key={scan.id}>
              <td className="whitespace-nowrap p-3 text-slate-100"><time dateTime={scan.scanned_at}>{new Date(scan.scanned_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</time></td>
              <td className="whitespace-nowrap p-3 text-emerald-300">QR-Code {scan.qr_id}</td>
              <td className="max-w-48 break-words p-3 text-slate-300">{scan.referrer_host || "Direkt / unbekannt"}</td>
              <td className="min-w-40 max-w-64 break-words p-3 text-xs text-slate-400">{Object.entries(scan.campaign).filter(([key]) => key !== "qr").map(([key, value]) => <div key={key}>{key}: {value}</div>) }{Object.keys(scan.campaign).filter(key => key !== "qr").length === 0 && "—"}</td>
              <td className="min-w-48 max-w-80 break-words p-3 text-xs text-slate-400">{scan.user_agent || "Unbekannt"}</td>
            </tr>)}{data.items.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">Keine Scans für diese Auswahl vorhanden.</td></tr>}</tbody>
          </table>
        </div>
      </>}
      <nav aria-label="Scan-Seiten" className="mt-4 flex justify-between gap-3">
        <button type="button" disabled={cursors.length === 1} onClick={() => { setData(null); setError(""); setCursors(values => values.slice(0, -1)); }} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 disabled:opacity-40">Neuere Scans</button>
        <button type="button" disabled={!data?.next_cursor} onClick={() => { if (data?.next_cursor) { setCursors(values => [...values, data.next_cursor!]); setData(null); setError(""); } }} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 disabled:opacity-40">Ältere Scans</button>
      </nav>
    </div>
  </section>;
}
