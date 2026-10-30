import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";
import { AssetActions } from "./MarketingAssets";

export const metadata: Metadata = {
  title: "Markenportal | HackTheRied",
  description: "Logos, QR-Codes und Gestaltungsfarben von HackTheRied zum Kopieren und Herunterladen.",
};

const qrCodes = [
  { id: "entdecken", title: "HackTheRied entdecken", description: "Der Einstieg ins offene Regionalportal.", destination: "https://hack-the-ried.de/" },
  { id: "karte", title: "Live-Karte", description: "Sensoren, Umwelt und regionale Daten auf der Karte.", destination: "https://hack-the-ried.de/karte" },
  { id: "umwelt", title: "Umwelt & Sensoren", description: "Messwerte und Umweltthemen im Hessischen Ried.", destination: "https://hack-the-ried.de/umwelt" },
  { id: "termine", title: "Termine & Aktionen", description: "Veranstaltungen, Workshops und Mitmachangebote.", destination: "https://hack-the-ried.de/termine" },
  { id: "daten", title: "Offene Daten", description: "Datensätze, Schnittstellen und Dokumentation.", destination: "https://hack-the-ried.de/daten" },
];

const logos = [
  { title: "Geometric Ox Coding", src: "/brand/logos/geometric-ox-coding.png", filename: "hacktheried-geometric-ox.png", description: "Primäres Logo · bevorzugte Variante für neue Materialien" },
  { title: "Bull Mascot", src: "/brand/logos/bull-mascot.png", filename: "hacktheried-bull-mascot.png", description: "Maskottchen · freundlich und nahbar" },
  { title: "Circuit Bull", src: "/brand/logos/circuit-bull.png", filename: "hacktheried-circuit-bull.png", description: "Technikmotiv · Sensorik und digitale Infrastruktur" },
];

const colors = [
  { name: "Riedgrün", value: "#00382B", use: "Flächen, Überschriften und dunkle Hintergründe" },
  { name: "Wiesengrün", value: "#8CC63E", use: "Akzente, Links und Hervorhebungen" },
  { name: "Warmweiß", value: "#FFFDF3", use: "Helle Flächen und Kontrast zum Riedgrün" },
  { name: "Nacht", value: "#020617", use: "Dunkler Seitenhintergrund des Webauftritts" },
];

export default function MarketingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <section className="relative isolate overflow-hidden rounded-[2rem] border border-emerald-300/15 bg-[radial-gradient(ellipse_at_top_right,_rgba(140,198,62,0.2),_transparent_42%),linear-gradient(135deg,_#00382b,_#071b17_60%,_#020617)] p-6 shadow-2xl shadow-black/20 sm:p-10 lg:p-14">
          <div className="absolute -right-16 -top-20 -z-10 h-72 w-72 rounded-full border border-emerald-300/10" />
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_260px]">
            <div className="max-w-3xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-lime-300">Presse · Partner · Veranstalter</p>
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">Das Ried. Offen gedacht.</h1>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-200">Hier findest du die offiziellen HackTheRied-Logos, fünf teilbare QR-Codes und unsere Gestaltungsfarben. Frei nutzbar für Berichte, Flyer, Veranstaltungen und gemeinsame Projekte.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#qr-codes" className="rounded-xl bg-lime-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-lime-300">QR-Codes entdecken</a>
                <a href="#logos" className="rounded-xl border border-white/20 bg-white/5 px-5 py-3 font-semibold text-white transition hover:bg-white/10">Logos ansehen</a>
              </div>
            </div>
            <div className="mx-auto w-full max-w-[260px] rounded-3xl border border-white/15 bg-[#00382b] p-3 shadow-2xl shadow-black/30">
              <Image src="/brand/logos/geometric-ox-coding.png" alt="Geometric Ox Coding, HackTheRied Hauptlogo" width={1536} height={1024} priority className="h-auto w-full rounded-2xl" />
              <div className="px-1 pt-1"><AssetActions src="/brand/logos/geometric-ox-coding.png" filename="hacktheried-geometric-ox.png" /></div>
            </div>
          </div>
        </section>

        <section id="qr-codes" className="scroll-mt-24 pt-16 sm:pt-20">
          <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-400">Direkt zum Ziel</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Fünf QR-Codes für unterwegs</h2>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-slate-400">Die Kurzlinks bleiben stabil. Kampagnenparameter werden beim Weiterleiten automatisch ergänzt, damit wir sehen, welche Themen geteilt werden.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {qrCodes.map((qr, index) => {
              const shortUrl = `https://hack-the-ried.de/qr/${qr.id}`;
              return <article key={qr.id} className="group rounded-2xl border border-slate-800 bg-slate-900/65 p-5 transition hover:-translate-y-1 hover:border-emerald-400/30 hover:bg-slate-900">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-400">QR · 0{index + 1}</span>
                    <h3 className="mt-2 text-xl font-semibold text-white">{qr.title}</h3>
                    <p className="mt-2 min-h-12 text-sm leading-relaxed text-slate-400">{qr.description}</p>
                  </div>
                  <a href={shortUrl} target="_blank" rel="noreferrer" aria-label={`QR-Link öffnen: ${qr.title}`} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/10">Öffnen ↗</a>
                </div>
                <div className="mt-5 flex justify-center rounded-xl bg-white p-4">
                  <Image src={`/brand/qr/${qr.id}.png`} alt={`QR-Code für ${qr.title}`} width={240} height={240} className="h-52 w-52 max-w-full object-contain sm:h-56 sm:w-56" />
                </div>
                <p className="mt-4 break-all rounded-lg bg-slate-950/70 px-3 py-2 font-mono text-xs text-slate-300">{shortUrl}</p>
                <AssetActions src={`/brand/qr/${qr.id}.png`} filename={`hacktheried-qr-${qr.id}.png`} linkToCopy={shortUrl} />
                <p className="text-xs text-slate-500">Ziel: <Link href={qr.destination.replace("https://hack-the-ried.de", "")} className="text-slate-400 underline decoration-slate-700 underline-offset-2 hover:text-emerald-300">{qr.destination.replace("https://hack-the-ried.de", "") || "/"}</Link></p>
              </article>;
            })}
          </div>
        </section>

        <section id="logos" className="scroll-mt-24 pt-16 sm:pt-20">
          <div className="mb-7">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-400">Offizielle Bildmarken</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Ein Ried. Drei Charaktere.</h2>
            <p className="mt-3 max-w-2xl text-slate-400">Das Geometric Ox ist unser primäres Logo. Die beiden Bullenvarianten ergänzen es für passende Themen und Formate.</p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {logos.map((logo, index) => <article key={logo.src} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/65">
              <div className="flex h-56 items-center justify-center bg-[#fffdf3] p-4 sm:h-64">
                <Image src={logo.src} alt={`${logo.title} Logo von HackTheRied`} width={1536} height={1024} className="max-h-full w-full rounded-lg object-contain" />
              </div>
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-400">{index === 0 ? "Primärlogo" : "Weitere Variante"}</p>
                <h3 className="mt-1 text-xl font-semibold text-white">{logo.title}</h3>
                <p className="mt-2 min-h-10 text-sm text-slate-400">{logo.description}</p>
                <AssetActions src={logo.src} filename={logo.filename} />
              </div>
            </article>)}
          </div>

          <article className="mt-5 grid gap-6 rounded-2xl border border-emerald-300/20 bg-[#00382b]/50 p-5 sm:grid-cols-[220px_1fr] sm:items-center sm:p-7">
            <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-full bg-[#00382b] p-2 shadow-xl shadow-black/25 ring-4 ring-lime-400/30">
              <Image src="/brand/logos/geometric-ox-round.svg" alt="Runde Geometric Ox Bildmarke von HackTheRied" width={512} height={512} className="h-full w-full rounded-full" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lime-300">Avatar · Profilbild · Favicon</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">Geometric Ox, rund</h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">Die runde Bildmarke eignet sich für Social-Media-Profile, runde Sticker und kleine Flächen. Das Hauptlogo wirkt am besten auf ruhigem, kontraststarkem Hintergrund.</p>
              <AssetActions src="/brand/logos/geometric-ox-round.svg" filename="hacktheried-geometric-ox-rund.svg" copyLabel="Bild kopieren" />
            </div>
          </article>
        </section>

        <section id="farben" className="scroll-mt-24 pt-16 sm:pt-20">
          <div className="mb-7">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-400">Gestaltungsfarben</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Die Farben des Rieds</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {colors.map((color) => <article key={color.value} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/65">
              <div className="h-24" style={{ backgroundColor: color.value }} aria-label={`${color.name}: ${color.value}`} />
              <div className="p-4">
                <h3 className="font-semibold text-white">{color.name}</h3>
                <p className="font-mono text-sm text-emerald-300">{color.value}</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">{color.use}</p>
              </div>
            </article>)}
          </div>
          <p className="mt-5 rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm leading-relaxed text-slate-400">Typografie: <span className="font-semibold text-slate-200">Geist</span>. Nutze klare, gut lesbare Schriften und lass Logos genug Freiraum. QR-Codes bitte nicht verzerren, umfärben oder auf unruhigen Hintergründen platzieren.</p>
        </section>

        <section className="mt-16 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 sm:mt-20 sm:p-8">
          <h2 className="text-2xl font-semibold text-white">Du brauchst etwas anderes?</h2>
          <p className="mt-2 max-w-2xl text-slate-400">Für Druckdaten, gemeinsame Aktionen oder eine passende Darstellung helfen wir gern weiter.</p>
          <a href="mailto:info@kamue.me?subject=HackTheRied%20Markenmaterial" className="mt-5 inline-flex rounded-xl border border-emerald-400/40 px-4 py-2.5 font-semibold text-emerald-300 transition hover:bg-emerald-400/10">Kontakt aufnehmen</a>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
