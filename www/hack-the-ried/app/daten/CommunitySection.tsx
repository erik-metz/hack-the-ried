import Link from "next/link";
import { ArrowUpRight, Radio, Star } from "lucide-react";

const repositoryUrl = "https://github.com/erik-metz/hack-the-ried";

function SensorGraphic() {
  return (
    <svg viewBox="0 0 160 140" fill="none" aria-hidden="true" className="h-28 w-32 shrink-0 text-emerald-400 sm:h-32 sm:w-36">
      <circle cx="80" cy="72" r="58" stroke="currentColor" strokeOpacity=".1" />
      <circle cx="80" cy="72" r="44" stroke="currentColor" strokeOpacity=".15" strokeDasharray="3 7" />
      <path d="M99 29a23 23 0 0 1 23 23M99 17a35 35 0 0 1 35 35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".6" />
      <rect x="43" y="43" width="64" height="72" rx="12" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeOpacity=".6" />
      <path d="M99 43V31M43 66H29M43 92H23M107 80h22M64 115v12M87 115v12" stroke="currentColor" strokeOpacity=".4" strokeWidth="2" strokeLinecap="round" />
      <rect x="59" y="61" width="32" height="30" rx="5" fill="currentColor" fillOpacity=".12" stroke="currentColor" />
      <path d="M68 71h14M68 77h9M65 98h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="99" cy="31" r="3" fill="currentColor" />
      <circle cx="29" cy="66" r="3" fill="currentColor" fillOpacity=".5" />
      <circle cx="129" cy="80" r="3" fill="currentColor" fillOpacity=".5" />
      <circle cx="96" cy="103" r="2" fill="currentColor" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4 shrink-0">
      <path d="M12 .75a11.25 11.25 0 0 0-3.558 21.923c.563.104.768-.244.768-.542 0-.267-.01-.975-.015-1.914-3.13.68-3.791-1.508-3.791-1.508-.512-1.3-1.25-1.646-1.25-1.646-1.022-.699.078-.685.078-.685 1.13.08 1.725 1.16 1.725 1.16 1.004 1.72 2.633 1.223 3.275.935.102-.727.393-1.223.715-1.504-2.5-.284-5.128-1.25-5.128-5.563 0-1.229.44-2.234 1.16-3.021-.116-.285-.503-1.43.11-2.98 0 0 .945-.303 3.094 1.154a10.78 10.78 0 0 1 5.634 0c2.148-1.457 3.092-1.154 3.092-1.154.614 1.55.227 2.695.111 2.98.722.787 1.159 1.792 1.159 3.021 0 4.324-2.632 5.276-5.14 5.555.404.35.764 1.04.764 2.097 0 1.514-.014 2.735-.014 3.107 0 .3.203.65.774.54A11.25 11.25 0 0 0 12 .75Z" />
    </svg>
  );
}

export default function CommunitySection() {
  return (
    <section id="community" className="relative isolate overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 sm:p-6">
      <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-20 -z-10 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="hidden min-[400px]:block"><SensorGraphic /></div>
        <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">Gemeinsam vernetzt</p>
        <h2 className="text-lg font-semibold">Hilf mit, das Projekt voranzubringen</h2>
        <p className="text-sm text-slate-300">Baue einen Sensor, bring eine Idee ein oder entwickle mit uns weiter.</p>
      </div>
      </div>
      <div className="flex shrink-0 flex-col gap-3 lg:items-end">
        <div className="flex flex-wrap gap-3 text-sm font-semibold">
          <Link href="/sensor-bauen" className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-slate-950 transition-colors hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300"><Radio aria-hidden="true" className="h-4 w-4" />Sensor bauen</Link>
          <a href={repositoryUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-emerald-300 transition-colors hover:border-emerald-400/50 hover:bg-emerald-400/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300"><GitHubIcon />Auf GitHub mitmachen<ArrowUpRight aria-hidden="true" className="h-4 w-4" /></a>
        </div>
        <a href={repositoryUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 self-start rounded-md text-xs text-slate-400 transition-colors hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300 lg:self-end"><Star aria-hidden="true" className="h-3.5 w-3.5 text-emerald-300" />Gefällt dir das Projekt? Auf GitHub einen Star geben<ArrowUpRight aria-hidden="true" className="h-3 w-3" /></a>
      </div>
      </div>
    </section>
  );
}
