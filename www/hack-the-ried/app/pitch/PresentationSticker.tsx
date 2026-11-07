import Image from "next/image";

/** Reserve QR 3 is assigned to presentations in the branding portal. */
export default function PresentationSticker({ compact = false }: { compact?: boolean }) {
  return <a
    href="https://hack-the-ried.de/qr/3"
    target="_blank"
    rel="noreferrer"
    aria-label="HackTheRied entdecken – QR-Code scannen oder Startseite öffnen (neuer Tab)"
    className={`mx-auto flex shrink-0 flex-col items-center justify-center rounded-full border-4 border-emerald-200 bg-emerald-400 text-slate-950 shadow-[0_16px_60px_-20px_rgba(52,211,153,0.45)] transition hover:bg-emerald-300 focus-visible:outline-4 focus-visible:outline-offset-8 focus-visible:outline-white ${compact ? "h-72 w-72 gap-2" : "h-72 w-72 gap-2 sm:h-[22rem] sm:w-[22rem] sm:gap-3"}`}
  >
    <Image src="/brand/logos/geometric-ox-dark-round.png" alt="" width={64} height={64} className={compact ? "h-12 w-12" : "h-12 w-12 sm:h-16 sm:w-16"} />
    <span className={compact ? "text-lg font-black" : "text-lg font-black sm:text-2xl"}>HackTheRied</span>
    <Image
      src="/brand/qr/3.png"
      alt="QR-Code zur HackTheRied-Startseite"
      width={176}
      height={176}
      unoptimized
      className={`rounded-lg bg-white p-2 ${compact ? "h-36 w-36" : "h-36 w-36 sm:h-44 sm:w-44"}`}
    />
    <span className="text-sm font-bold">Scannen & mitmachen</span>
  </a>;
}
