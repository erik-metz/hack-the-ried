import BorisPublishedSection, { type PublishedBorisZone } from "./BorisPublishedSection";
import AdoptedBudgetSection from "./AdoptedBudgetSection";
import { readCollected } from "@/lib/collectedBackend";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import OfficialStatisticsClient, { type StatisticsData } from "./OfficialStatisticsClient";

export default async function OfficialStatisticsPage({
  domain,
  title,
}: {
  domain: string;
  title: string;
}) {
  const [data, boris] = await Promise.all([
    readCollected<StatisticsData>(`statistics/${domain}`).catch(() => null),
    domain === "realestate"
      ? readCollected<PublishedBorisZone[]>("realestate/boris").catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      <SiteHeader />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {domain === "finance" && <AdoptedBudgetSection />}
        {domain === "realestate" && <BorisPublishedSection zones={boris} />}

        {!data ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center space-y-3">
            <h1 className="text-2xl font-bold">{title}</h1>
            <p role="status" className="text-slate-300">
              Aktuell keine gespeicherte Veröffentlichung verfügbar.
            </p>
            <p className="text-sm text-slate-400">
              Zusätzliche Detaildaten sind noch nicht verfügbar. Hier erscheinen die bereits erhobenen amtlichen Statistiken mit ihrem jeweiligen Berichtszeitraum.
            </p>
          </div>
        ) : (
          <OfficialStatisticsClient domain={domain} title={title} data={data} />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
