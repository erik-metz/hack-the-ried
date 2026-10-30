import { CORE_TEAM_MEMBERS } from "@/lib/pitchData";
import { ArrowDown, ArrowRight, BarChart3, CarFront, CloudSun, Database } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import DashboardClient from "./components/DashboardClient.tsx";
import SiteFooter from "./components/SiteFooter";
import NewsletterSignup from "./components/NewsletterSignup";
import SiteHeader from "./components/SiteHeader";

export const dynamic = "error";

export const metadata: Metadata = {
  title: "HackTheRied | Entdecke das Ried in Daten",
  description:
    "Lokale Messwerte und öffentliche Daten für Bürstadt, Lampertheim und das Hessische Ried. Entdecke die Sensorkarte, lerne deine Region kennen und mach mit.",
};

const TOPICS = [
  {
    title: "Umwelt",
    description: "Wetter, Luft und Wasser in deiner Umgebung.",
    href: "/umwelt",
    icon: CloudSun,
  },
  {
    title: "Mobilität",
    description: "Busse, Fahrräder und Verkehr auf der Karte.",
    href: "/karte?cats=bikes,parking,traffic&layers=charging,road,closures,traffic,buses,stops,waste,trains,crossings",
    icon: CarFront,
  },
  {
    title: "Region in Zahlen",
    description: "Wie wir leben, wohnen und wirtschaften.",
    href: "/regionalatlas",
    icon: BarChart3,
  },
  {
    title: "Offene Daten",
    description: "Daten entdecken und für eigene Ideen nutzen.",
    href: "/daten",
    icon: Database,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      <SiteHeader />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-14 space-y-12 sm:space-y-16">
        <section id="hero" aria-labelledby="hero-title" className="relative py-2 sm:py-6">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-emerald-500/5 blur-3xl" />
          <div className="relative max-w-3xl space-y-5">
            <p className="text-xs sm:text-sm font-medium tracking-wide text-emerald-400">
              Bürstadt · Lampertheim · Hessisches Ried
            </p>
            <h1 id="hero-title" className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
              Entdecke das Ried <span className="whitespace-nowrap text-emerald-400">in Daten.</span>
            </h1>
            <p className="max-w-2xl text-base sm:text-lg leading-relaxed text-slate-300">
              Wie warm ist es vor deiner Haustür? Was passiert in deiner Region?
              HackTheRied macht lokale Messwerte und öffentliche Daten sichtbar.
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4 pt-1">
              <a href="#karte" className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400">
                Karte entdecken <ArrowDown className="size-4" aria-hidden="true" />
              </a>
              <a href="#mitmachen" className="text-sm font-medium text-slate-300 hover:text-emerald-300 transition-colors">
                Mehr über das Projekt <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </section>

        <section id="karte" aria-labelledby="map-title" className="space-y-5 scroll-mt-24">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div className="space-y-2">
              <h2 id="map-title" className="text-2xl sm:text-3xl font-bold tracking-tight">Was passiert gerade im Ried?</h2>
              <p className="text-sm text-slate-400">Wähle eine Station auf der Karte und entdecke ihre Messwerte.</p>
            </div>
            <Link href="/karte" className="inline-flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 shrink-0">
              Große Kartenansicht <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div id="dashboard" className="space-y-5">
            <DashboardClient showIntro={false} />
          </div>
        </section>

        <section id="themen" aria-labelledby="topics-title" className="space-y-5 scroll-mt-24">
          <h2 id="topics-title" className="text-2xl sm:text-3xl font-bold tracking-tight">Was interessiert dich?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {TOPICS.map(({ title, description, href, icon: Icon }) => (
              <Link key={title} href={href} className="group rounded-2xl bg-slate-900/50 p-5 sm:p-6 hover:bg-slate-900 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400">
                <Icon className="size-6 text-emerald-400 mb-5" aria-hidden="true" />
                <h3 className="flex items-center justify-between gap-2 text-base font-semibold group-hover:text-emerald-300">
                  {title} <ArrowRight className="size-4 text-slate-500 group-hover:text-emerald-400" aria-hidden="true" />
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{description}</p>
              </Link>
            ))}
          </div>
        </section>

        <NewsletterSignup />

        <section id="mitmachen" aria-labelledby="community-title" className="grid lg:grid-cols-2 gap-8 lg:gap-14 border-t border-slate-800 pt-10 sm:pt-12 scroll-mt-24">
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-sm font-medium text-emerald-400">Von Menschen aus dem Ried. Für das Ried.</p>
              <h2 id="community-title" className="text-2xl sm:text-3xl font-bold tracking-tight">Baue einen Sensor. Bring eine Idee mit.</h2>
              <p className="text-sm sm:text-base leading-relaxed text-slate-400">
                Wir sind eine ehrenamtliche Bürgerinitiative im Kulturzentrum KAMÜ
                in Bürstadt. Bei Workshops und beim Hackathon machen wir gemeinsam
                mehr aus den Daten unserer Region. Neugierig? Mach mit.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link href="/sensor-bauen" className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400 transition-colors">
                Sensor bauen &amp; Workshops <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href="/termine" className="text-sm text-slate-300 hover:text-emerald-300">Termine entdecken <span aria-hidden="true">→</span></Link>
            </div>
          </div>
          <div id="team" className="space-y-5 scroll-mt-24">
            <h3 className="text-sm font-semibold text-slate-300">Die Menschen hinter HackTheRied</h3>
            <div className="space-y-5">
              {CORE_TEAM_MEMBERS.map((member) => (
                <div key={member.name} className="flex items-center gap-4">
                  <div className="relative size-14 sm:size-16 shrink-0 overflow-hidden rounded-2xl bg-slate-800">
                    <Image src={member.imageSrc} alt={member.name} fill sizes="64px" className="object-cover" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-slate-100">{member.name}</p>
                    <p className="text-xs sm:text-sm text-slate-400 mt-1">{member.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter compact />
    </div>
  );
}
