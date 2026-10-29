"use client";

import { Download, Trash2 } from "lucide-react";
import { useState } from "react";

export default function NewsletterAdminPanel() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function downloadList() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/newsletter", { cache: "no-store" });
      if (!response.ok) throw new Error("Die Liste konnte nicht geladen werden.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "hacktheried-anmeldungen.csv";
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Die aktuellen Anmeldungen wurden heruntergeladen.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function removeSubscriber(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/newsletter", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error("Die Adresse konnte nicht entfernt werden.");
      setEmail("");
      setMessage("Die Adresse wurde aus der aktiven Liste entfernt.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Entfernen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="newsletter-admin-title" className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-8">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="newsletter-admin-title" className="font-semibold text-slate-100">Newsletter- und Workshop-Anmeldungen</h2>
            <p className="mt-1 text-sm text-slate-400">Die CSV enthält Kategorie und Workshop-Angaben. Widerrufe oder Löschanfragen hier entfernen.</p>
          </div>
          <button type="button" onClick={downloadList} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
            <Download className="size-4" aria-hidden="true" /> CSV herunterladen
          </button>
        </div>
        <form onSubmit={removeSubscriber} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="newsletter-remove-email">E-Mail-Adresse widerrufen</label>
          <input id="newsletter-remove-email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Adresse nach Widerruf entfernen" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-emerald-400" />
          <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50">
            <Trash2 className="size-4" aria-hidden="true" /> Alle Anmeldungen dieser Adresse entfernen
          </button>
        </form>
        {message && <p role="status" className="mt-3 text-sm text-emerald-300">{message}</p>}
      </div>
    </section>
  );
}
