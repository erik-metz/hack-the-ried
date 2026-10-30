import Image from "next/image";

export default function HeaderLogo() {
  return (
    <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 whitespace-nowrap select-none">
      <div className="relative w-9 h-9 sm:w-10 sm:h-10 overflow-hidden rounded-xl border border-emerald-400/30 shadow-md shadow-emerald-500/20 shrink-0">
        <Image src="/icon.png" alt="" fill sizes="40px" className="object-cover" priority />
      </div>
      <div className="flex flex-col justify-center min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-base sm:text-lg text-slate-100 tracking-tight whitespace-nowrap">
            HackTheRied
          </span>
          {/* <span className="hidden sm:inline-flex items-center text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
            Bürstadt &amp; Lampertheim
          </span> */}
        </div>
        <span className="text-[11px] text-slate-400 font-medium hidden 2xl:block truncate whitespace-nowrap leading-tight">
          Initiative von{" "}
          <span className="text-emerald-400">KAMÜ Kulturzentrum</span> &amp;
          Bürger/innen
        </span>
      </div>
    </div>
  );
}
