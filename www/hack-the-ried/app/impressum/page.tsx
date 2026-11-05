import type { Metadata } from "next";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Impressum | HackTheRied",
  description: "Anbieter und Kontakt für die Bürgerinitiative HackTheRied.",
};

export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <article className="space-y-10">
          <header className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Impressum</h1>
            <p className="text-slate-300 leading-relaxed">HackTheRied ist eine ehrenamtliche Bürgerinitiative ohne kommerzielle Absicht. Die Inhalte entstehen gemeinschaftlich im Projektteam.</p>
          </header>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Betreiber dieser Website</h2>
            <address className="not-italic text-slate-300 leading-relaxed">
              Erik Metz<br />
              c/o KAMÜ – Kultur am Übergang<br />
              Industriestraße 11<br />
              68642 Bürstadt<br />
              Deutschland
            </address>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Kontakt</h2>
            <p>E-Mail: <a className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200" href="mailto:info@kamue.me">info@kamue.me</a></p>
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
