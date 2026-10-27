"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Mail, MapPin, Send, Sparkles, User } from "lucide-react";

export default function WorkshopRegistrationForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("Bürstadt");
  const [interest, setInterest] = useState("Eigenen Sensor im Workshop bauen");
  const [busy, setBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const res = await fetch("/api/workshop-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, location, interest }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Etwas ist schiefgelaufen.");
      }

      setSuccessMessage(data.message);
      setEmail("");
      setName("");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Registrierung fehlgeschlagen."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      id="anmeldung"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 border border-emerald-500/30 p-6 sm:p-10 shadow-2xl space-y-6"
    >
      <div className="absolute top-0 right-0 -translate-y-8 translate-x-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 max-w-2xl space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" /> Nächster Workshop in Bürstadt
        </div>
        <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-100">
          Interesse am Sensor-Bau-Workshop vormerken
        </h3>
        <p className="text-sm text-slate-300 leading-relaxed">
          Möchtest du beim nächsten Mitmach-Event im <strong>Kulturzentrum KAMÜ</strong> deinen
          eigenen LoRaWAN-Sensor zusammenbauen? Trag dich unverbindlich ein – wir informieren dich,
          sobald der Termin und die Sammelbestellung der Bauteile starten!
        </p>
      </div>

      {successMessage ? (
        <div className="relative z-10 p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 flex items-start gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-sm">Vormerkung erfolgreich!</h4>
            <p className="text-xs text-emerald-200/90 leading-relaxed">
              {successMessage}
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="relative z-10 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                E-Mail-Adresse <span className="text-emerald-400">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  required
                  placeholder="deine.adresse@domain.de"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-10 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus-visible:outline-2 focus-visible:outline-emerald-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Name oder Spitzname (optional)
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="z. B. Max Mustermann"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-10 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus-visible:outline-2 focus-visible:outline-emerald-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Wohnort / Stadtteil
              </label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-10 pr-4 py-3 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-400"
                >
                  <option value="Bürstadt">Bürstadt (Kernstadt)</option>
                  <option value="Bobstadt">Bobstadt</option>
                  <option value="Riedrode">Riedrode</option>
                  <option value="Lampertheim">Lampertheim</option>
                  <option value="Hofheim">Hofheim (Ried)</option>
                  <option value="Hüttenfeld">Hüttenfeld</option>
                  <option value="Biblis">Biblis / Nordheim / Wattenheim</option>
                  <option value="Groß-Rohrheim">Groß-Rohrheim</option>
                  <option value="Lorsch / Bensheim">Lorsch / Bensheim</option>
                  <option value="Anderer Ort im Ried">Anderer Ort im Ried</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Dein Interesse / Schwerpunkt
              </label>
              <select
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
                disabled={busy}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-400"
              >
                <option value="Eigenen Sensor im Workshop bauen">
                  Eigenen Sensor im Workshop zusammenbauen
                </option>
                <option value="Standort im eigenen Garten/Balkon bereitstellen">
                  Standort im Garten/Balkon bereitstellen
                </option>
                <option value="Schul- oder Jugendprojekt (MINT)">
                  Schul- oder Jugendprojekt (MINT)
                </option>
                <option value="Software- & Dashboard-Entwicklung">
                  Software- &amp; Dashboard-Entwicklung
                </option>
                <option value="Allgemein über Termine auf dem Laufenden bleiben">
                  Allgemein über Termine informiert bleiben
                </option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 px-6 py-3 font-bold text-slate-950 text-sm hover:brightness-110 transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Wird eingetragen …</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Kostenlos &amp; unverbindlich vormerken</span>
                </>
              )}
            </button>

            <span className="text-[11px] text-slate-400">
              🔒 Kein Spam. Nur Benachrichtigungen zu Terminen und Bausätzen.
            </span>
          </div>

          {errorMessage && (
            <p className="text-xs text-rose-400 pt-1 font-medium">{errorMessage}</p>
          )}
        </form>
      )}
    </div>
  );
}
