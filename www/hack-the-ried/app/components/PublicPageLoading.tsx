import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
export default function PublicPageLoading({ title = "Regionale Daten" }: { title?: string }) {
  return <div className="min-h-screen flex flex-col"><SiteHeader /><main className="flex-1 max-w-7xl mx-auto w-full px-4 py-10 space-y-4">
    <h1 className="text-3xl font-bold">{title}</h1><p role="status" className="text-slate-400">Gespeicherte Daten werden geladen…</p>
  </main><SiteFooter /></div>;
}
