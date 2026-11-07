import { ArrowRight, Building2, CalendarDays, Cpu, GraduationCap, MessagesSquare, Users } from "lucide-react";
import type { PitchSlide } from "@/lib/pitchData";
import PresentationSticker from "./PresentationSticker";

export default function OutlookSlide({ outlook }: { outlook: NonNullable<PitchSlide["outlook"]> }) {
  const audiences = [
    { label: outlook.audiences[0], icon: GraduationCap },
    { label: outlook.audiences[1], icon: Building2 },
    { label: outlook.audiences[2], icon: Users },
  ];
  return <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <div className="space-y-5">
      <div className="relative grid gap-4 sm:grid-cols-2">
        <article className="relative overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 p-5">
          <MessagesSquare className="absolute -right-3 -top-3 h-36 w-36 -rotate-12 text-slate-800" strokeWidth={1} aria-hidden="true" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">01 · Kennenlernen</p>
            <p className="mt-4 text-5xl font-black tracking-tight text-white">{outlook.infoMonth}</p>
            <p className="mt-1 text-lg text-emerald-300">{outlook.infoTiming}</p>
            <h3 className="mt-4 text-xl font-semibold text-white">Infoveranstaltung</h3>
            <p className="mt-2 text-sm text-slate-400">Für alle Interessierten · geplant</p>
          </div>
        </article>
        <div className="absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/40 bg-slate-950 p-2 text-emerald-300 sm:block"><ArrowRight className="h-5 w-5" aria-hidden="true" /></div>
        <article className="relative overflow-hidden rounded-3xl border border-emerald-400/40 bg-emerald-400/10 p-5">
          <CalendarDays className="absolute -right-3 -top-3 h-36 w-36 rotate-12 text-emerald-400/10" strokeWidth={1} aria-hidden="true" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">02 · Gemeinsam loslegen</p>
            <p className="mt-4 text-5xl font-black tracking-tight text-emerald-300">{outlook.hackathonDays}</p>
            <p className="mt-1 text-lg text-emerald-200">{outlook.hackathonMonth}</p>
            <h3 className="mt-4 text-xl font-semibold text-white">Hackathon im Ried</h3>
            <p className="mt-2 text-sm text-slate-300">Regionale Daten → gemeinsame Ideen</p>
          </div>
        </article>
      </div>
      <div className="rounded-3xl border border-slate-700/80 bg-slate-900/50 p-4">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-emerald-400/15 p-2 text-emerald-300"><Cpu className="h-6 w-6" aria-hidden="true" /></span><div><h3 className="text-lg font-semibold text-white">Sensoren selbst bauen</h3><p className="text-sm text-slate-400">Geplante Workshops von jetzt bis zum Hackathon</p></div></div>
        <div className="mx-auto mt-3 hidden h-3 w-2/3 border-x border-t border-emerald-400/30 sm:block" aria-hidden="true" />
        <div className="mt-3 grid gap-3 sm:mt-0 sm:grid-cols-3">{audiences.map(({ label, icon: Icon }) => <div key={label} className="flex items-center gap-2 rounded-2xl bg-slate-800/70 p-3 sm:flex-col sm:text-center"><Icon className="h-6 w-6 shrink-0 text-emerald-300" strokeWidth={1.5} aria-hidden="true" /><p className="text-sm font-medium leading-snug text-slate-200">{label}</p></div>)}</div>
      </div>
    </div>
    <aside aria-label="HackTheRied entdecken" className="flex justify-center lg:justify-end"><PresentationSticker /></aside>
  </div>;
}
