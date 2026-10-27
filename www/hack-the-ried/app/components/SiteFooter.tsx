import Link from "next/link";

export default function SiteFooter({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <footer className="mt-auto border-t border-slate-800/80 py-7 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <p>HackTheRied · Ehrenamtlich. Offen. Für die Region.</p>
          <nav aria-label="Weiterführende Links" className="flex flex-wrap gap-x-5 gap-y-3">
            <Link href="/quellen" className="hover:text-emerald-300">Quellen</Link>
            <Link href="/daten" className="hover:text-emerald-300">Daten &amp; API</Link>
            <a href="https://kamue.me" target="_blank" rel="noreferrer" className="hover:text-emerald-300">KAMÜ</a>
            <a href="https://github.com/erik-metz/hack-the-ried" target="_blank" rel="noreferrer" className="hover:text-emerald-300">GitHub</a>
          </nav>
        </div>
      </footer>
    );
  }
  return (
    <footer className="border-t border-slate-800/80 bg-slate-950 py-7 mt-auto text-sm text-slate-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Bottom Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div>
            &copy; {new Date().getFullYear()} HackTheRied. Freie Daten und
            offene Schnittstellen für das Hessische Ried.
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <Link href="/" className="hover:text-slate-200 transition-colors">
              Dashboard
            </Link>
            <span>•</span>
            <Link href="/regionalatlas" className="hover:text-slate-200 transition-colors">
              Regionalatlas
            </Link>
            <span>•</span>
            <Link href="/daten" className="hover:text-slate-200 transition-colors">
              API
            </Link>
            <span>•</span>
            <Link href="/quellen" className="hover:text-slate-200 transition-colors">
              Datenquellen
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
