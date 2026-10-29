import type { Metadata } from "next";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Datenschutz | HackTheRied",
  description: "Informationen zur Verarbeitung personenbezogener Daten auf HackTheRied.",
};

const updatedAt = "27. Oktober 2026";

export default function DatenschutzPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <article className="space-y-10">
          <header className="space-y-3">
            <p className="text-sm font-medium text-emerald-400">Stand: {updatedAt}</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Datenschutzerklärung</h1>
            <p className="text-slate-300">Hier erklären wir, welche personenbezogenen Daten beim Besuch von HackTheRied, bei einer Newsletter-Anmeldung und bei einer Workshop-Vormerkung verarbeitet werden.</p>
          </header>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Verantwortliche Stelle und Kontakt</h2>
            <p className="text-slate-300 leading-relaxed">HackTheRied ist eine ehrenamtliche Bürgerinitiative im Kulturzentrum KAMÜ. Verantwortlich und Ansprechpartner für Datenschutzanfragen ist die KamÜ GbR, Industriestraße 11, 68642 Bürstadt.</p>
            <p><a className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200" href="mailto:info@kamue.me">info@kamue.me</a></p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Newsletter-Anmeldung</h2>
            <p className="text-slate-300 leading-relaxed">Wenn du dich über das Formular anmeldest, verarbeiten wir deine E-Mail-Adresse, den Zeitpunkt deiner Anmeldung und die Fassung des Einwilligungstextes. Wir nutzen diese Angaben ausschließlich, um dir gelegentlich Neuigkeiten, Daten und Hinweise zu Workshops und Aktionen von HackTheRied per E-Mail zu schicken. Die Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO).</p>
            <p className="text-slate-300 leading-relaxed">Deine Anmeldung wird in der Projektdatenbank auf unserem Server gespeichert, solange du den Newsletter abonniert hast. Es wird keine Bestätigungsmail versendet. Der Newsletter wird zunächst von Hand verschickt; dabei verwenden wir die Blindkopie (BCC), damit Empfängerinnen und Empfänger die Adressen anderer Personen nicht sehen.</p>
            <p className="text-slate-300 leading-relaxed">Du kannst deine Einwilligung jederzeit widerrufen, indem du auf eine Newsletter-E-Mail antwortest oder an <a className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200" href="mailto:info@kamue.me">info@kamue.me</a> schreibst. Wir entfernen deine Adresse dann aus dem aktiven Verteiler. Die Adresse wird gelöscht, wenn du den Newsletter abbestellst.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Vormerkung für den Sensor-Bau-Workshop</h2>
            <p className="text-slate-300 leading-relaxed">Wenn du dich für einen Sensor-Bau-Workshop vormerkst, speichern wir deine E-Mail-Adresse sowie optional deinen Namen, Wohnort und Interessenschwerpunkt in unserer Projektdatenbank. Wir verwenden diese Angaben ausschließlich, um dich über Termine und Bausätze des Sensor-Bau-Workshops zu informieren. Es wird keine automatische Bestätigungsmail versendet. Die Verarbeitung erfolgt auf Grundlage deiner Einwilligung (Art. 6 Abs. 1 lit. a DSGVO).</p>
            <p className="text-slate-300 leading-relaxed">Du kannst deine Einwilligung jederzeit widerrufen und die Löschung deiner Angaben verlangen, indem du an <a className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200" href="mailto:info@kamue.me">info@kamue.me</a> schreibst. Wir löschen deine Vormerkung dann aus der aktiven Liste.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Hosting und technische Zugriffsdaten</h2>
            <p className="text-slate-300 leading-relaxed">Die Website wird auf Vercel gehostet. Die Datenbank für Newsletter-Anmeldungen und Workshop-Vormerkungen sowie die API laufen auf einem von uns betriebenen VPS. Beim Aufruf einer Website werden technisch notwendige Verbindungsdaten verarbeitet, insbesondere IP-Adresse, Zeitpunkt, angefragte Seite und Angaben zum Browser. Diese Verarbeitung ist erforderlich, um die Website auszuliefern, Stabilität und Sicherheit zu gewährleisten und Störungen zu untersuchen.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Karten und externe Inhalte</h2>
            <p className="text-slate-300 leading-relaxed">Auf einzelnen Kartenseiten laden wir Kartenkacheln von OpenStreetMap-Servern. Beim Aufruf dieser Karten werden Verbindungsdaten an OpenStreetMap übertragen. Mehr Informationen stehen in der <a className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200" href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noreferrer">Datenschutzerklärung der OpenStreetMap Foundation</a>.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Deine Rechte</h2>
            <p className="text-slate-300 leading-relaxed">Du kannst Auskunft über deine personenbezogenen Daten sowie deren Berichtigung oder Löschung verlangen. Außerdem kannst du unter den gesetzlichen Voraussetzungen die Verarbeitung einschränken lassen, der Verarbeitung widersprechen, die Übertragbarkeit deiner Daten verlangen oder eine erteilte Einwilligung widerrufen. Schreibe dazu an <a className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200" href="mailto:info@kamue.me">info@kamue.me</a>. Du hast außerdem das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren, in Hessen beim <a className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200" href="https://datenschutz.hessen.de/service/beschwerde-uebermitteln" target="_blank" rel="noreferrer">Hessischen Beauftragten für Datenschutz und Informationsfreiheit</a>.</p>
          </section>

          <p className="border-t border-slate-800 pt-6 text-sm text-slate-400">Stand dieser Datenschutzerklärung: {updatedAt}.</p>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
