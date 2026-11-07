import Image from "next/image";
import { ArrowUpRight } from "lucide-react";

/** Shared presentation QR, assigned to code 3 in the branding portal. */
export default function PresentationSticker({ compact = false }: { compact?: boolean }) {
  return <a
    href="https://hack-the-ried.de/qr/3"
    target="_blank"
    rel="noreferrer"
    aria-label="HackTheRied entdecken – QR-Code scannen oder Startseite öffnen (neuer Tab)"
    className={`group block w-full rounded-3xl border border-emerald-300/25 bg-slate-900 p-5 transition hover:border-emerald-300 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-emerald-300 ${compact ? "max-w-60" : "max-w-72"}`}
  >
    <div className="flex items-center gap-3">
      <Image src="/brand/logos/geometric-ox-dark-round.png" alt="" width={48} height={48} className="h-12 w-12" />
      <div><p className="text-base font-bold text-white">HackTheRied</p><p className="text-xs text-emerald-300">Daten. Menschen. Ideen.</p></div>
    </div>
    <div className={`mx-auto mt-5 w-fit rounded-2xl bg-white p-3 ${compact ? "" : "sm:p-4"}`}>
      <Image src="/brand/qr/3.png" alt="QR-Code zur HackTheRied-Startseite" width={192} height={192} unoptimized className={compact ? "h-36 w-36" : "h-44 w-44"} />
    </div>
    <div className="mt-5 flex items-center justify-between gap-2"><span className={`font-semibold text-emerald-300 ${compact ? "text-sm" : "text-lg"}`}>Scannen & entdecken</span><ArrowUpRight className="h-5 w-5 text-emerald-300" aria-hidden="true" /></div>
    <p className="mt-1 text-xs text-slate-400">hack-the-ried.de</p>
  </a>;
}
