import PageContent, { type SourcesSnapshot } from "./PageContent";
import { publicApiUrl } from "@/lib/publicRequests";

// Source status changes slowly; regenerate the page at most once a day.
export const revalidate = 86400;
export const dynamic = "error";
export const metadata = {
  title: "Datenquellen & Erfassungsstatus | HackTheRied",
  description: "Originalquellen, Abruf- und Verarbeitungsstatus sowie bekannte Einschränkungen der Datenangebote im Ried.",
};

async function loadSnapshot(): Promise<SourcesSnapshot> {
  try {
    const response = await fetch(publicApiUrl("collection/status"), {
      next: { revalidate: 86400 }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    return { data: await response.json(), loadedAt: Date.now() };
  } catch {
    return null;
  }
}

export default async function Page() {
  return <PageContent snapshot={await loadSnapshot()} />;
}
