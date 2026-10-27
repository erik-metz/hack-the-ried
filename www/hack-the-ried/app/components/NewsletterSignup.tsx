"use client";

import Link from "next/link";
import { useState } from "react";

export default function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent, website: new FormData(event.currentTarget).get("website") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Die Anmeldung ist fehlgeschlagen.");
      setEmail("");
      setConsent(false);
      setFeedback({ type: "success", text: "Danke für deine Registrierung! Wir haben deine E-Mail-Adresse aufgenommen." });
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Die Anmeldung ist fehlgeschlagen." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="newsletter" aria-labelledby="newsletter-title" className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-6 sm:p-9 scroll-mt-24">
      <div className="max-w-3xl space-y-4">
        <p className="text-sm font-medium text-emerald-400">Neuigkeiten aus dem Ried</p>
        <h2 id="newsletter-title" className="text-2xl sm:text-3xl font-bold tracking-tight">Bleib auf dem Laufenden.</h2>
        <p className="text-sm sm:text-base leading-relaxed text-slate-300">
          Wir informieren dich gelegentlich über neue Daten, Workshops und Aktionen von HackTheRied.
          Der Versand erfolgt zunächst manuell. Du kannst deine Einwilligung jederzeit widerrufen, indem du auf eine Newsletter-Mail antwortest oder uns an <a className="underline decoration-emerald-500/60 underline-offset-2 hover:text-emerald-300" href="mailto:info@kamue.me">info@kamue.me</a> schreibst.
        </p>
        <form onSubmit={submit} className="space-y-4" aria-describedby={feedback ? "newsletter-feedback" : undefined}>
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="sr-only" htmlFor="newsletter-email">E-Mail-Adresse</label>
            <input
              id="newsletter-email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="deine@email.de"
              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-emerald-400"
            />
            <button type="submit" disabled={busy || !consent} className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? "Wird eingetragen …" : "Newsletter abonnieren"}
            </button>
          </div>
          <label className="flex items-start gap-3 text-xs sm:text-sm leading-relaxed text-slate-400">
            <input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-emerald-500" />
            <span>Ich möchte den HackTheRied-Newsletter per E-Mail erhalten. Meine Adresse wird dafür gespeichert. Details stehen in der <Link href="/datenschutz" className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200">Datenschutzerklärung</Link>.</span>
          </label>
          <label htmlFor="newsletter-website" className="hidden" aria-hidden="true">Website
            <input id="newsletter-website" name="website" tabIndex={-1} autoComplete="off" />
          </label>
          {feedback && <p id="newsletter-feedback" role={feedback.type === "success" ? "status" : "alert"} className={`text-sm font-semibold ${feedback.type === "success" ? "text-emerald-300" : "text-rose-300"}`}>{feedback.text}</p>}
        </form>
      </div>
    </section>
  );
}
