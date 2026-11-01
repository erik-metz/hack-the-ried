import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import SiteFooter from "../../components/SiteFooter";
import SiteHeader from "../../components/SiteHeader";
import { getQrDatabaseId, getQrSensor, getQrSensorModules } from "@/lib/qrSensors";

type QrSensorPageProps = PageProps<"/q/[id]">;

export async function generateMetadata({ params }: QrSensorPageProps): Promise<Metadata> {
  const { id } = await params;
  if (!getQrDatabaseId(id)) return { title: "Sensor nicht gefunden | HackTheRied" };
  const sensor = await getQrSensor(id).catch(() => null);

  if (!sensor) return { title: "Sensor nicht gefunden | HackTheRied" };

  return {
    title: `${sensor.friendly_name} | HackTheRied`,
    description: sensor.description ?? `Öffentliche Informationen zu ${sensor.friendly_name} im Hessischen Ried.`,
    alternates: { canonical: `/q/${id}` },
  };
}

export default async function QrSensorPage({ params }: QrSensorPageProps) {
  const { id } = await params;
  if (!getQrDatabaseId(id)) notFound();
  let sensor;
  try {
    sensor = await getQrSensor(id);
  } catch {
    return (
      <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
        <SiteHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 sm:p-10">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-400">HackTheRied · Sensorpass</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">Stammdaten vorübergehend nicht verfügbar</h1>
            <p className="mt-4 leading-relaxed text-slate-300">Die Datenbank ist gerade nicht erreichbar. Bitte lade diese Seite später erneut.</p>
          </section>
        </main>
        <SiteFooter />
      </div>
    );
  }
  if (!sensor) notFound();

  let modules;
  try {
    modules = await getQrSensorModules(sensor.id);
  } catch {
    modules = null;
  }

  const coordinates = sensor.latitude != null && sensor.longitude != null
    ? `${sensor.latitude}, ${sensor.longitude}`
    : null;
  const fields = [
    ["Datenbank-ID", sensor.id],
    ["Name", sensor.friendly_name],
    ["Koordinaten", coordinates],
    ["Sichtbarkeit", sensor.is_hidden ? "Verborgen" : "Öffentlich"],
    ["Beschreibung", sensor.description],
    ["Erstellt", sensor.created_at],
    ["Zuletzt aktualisiert", sensor.updated_at],
  ].filter((field): field is [string, string] => Boolean(field[1]));

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <article className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 shadow-2xl shadow-black/20">
          <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_240px] md:gap-12 md:p-10">
            <div className="space-y-8">
              <header className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-400">
                  HackTheRied · Sensorpass
                </p>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{sensor.friendly_name}</h1>
                <p className="text-lg text-slate-300">Öffentlicher Datenbankeintrag · Hessisches Ried</p>
                {sensor.description && <p className="max-w-2xl leading-relaxed text-slate-300">{sensor.description}</p>}
              </header>

              <section aria-labelledby="sensor-details" className="space-y-4">
                <h2 id="sensor-details" className="text-xl font-semibold">Stammdaten aus der Datenbank</h2>
                <dl className="grid gap-4 sm:grid-cols-2">
                  {fields.map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                      <dt className="text-sm text-slate-400">{label}</dt>
                      <dd className="mt-1 break-words font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section aria-labelledby="sensor-modules" className="space-y-4">
                <div>
                  <h2 id="sensor-modules" className="text-xl font-semibold">In den Messdaten erkannte Sensoren</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Abgeleitet aus gespeicherten Messgrößen; die Datenbank führt keine bestätigte Hardware-Stückliste.
                  </p>
                </div>
                {modules === null ? (
                  <p className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-slate-300">
                    Die Messkanäle konnten gerade nicht geladen werden.
                  </p>
                ) : modules.length ? (
                  <ul className="grid gap-4 sm:grid-cols-2">
                    {modules.map((module) => (
                      <li key={module.name} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                        <h3 className="font-medium">{module.name}</h3>
                        <p className="mt-2 text-sm text-slate-400">Messgrößen: {module.metrics.join(", ")}</p>
                        <p className="mt-1 text-sm text-slate-400">
                          Letzter gespeicherter Messwert: {new Intl.DateTimeFormat("de-DE", {
                            dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin",
                          }).format(new Date(module.latestObservedAt))}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-slate-300">
                    Für dieses Gerät sind noch keine Messkanäle gespeichert.
                  </p>
                )}
              </section>

              <p className="border-t border-slate-800 pt-5 text-sm text-slate-400">
                Stammdaten und Messkanäle werden direkt aus der Datenbank geladen. Diese Seite zeigt keine Live-Werte.
              </p>
            </div>

            <aside className="flex flex-col items-center gap-3 self-start rounded-2xl border border-slate-800 bg-white p-4 text-center text-slate-900">
              <Image
                src={`/qr/${id}.png`}
                alt={`QR-Code für ${sensor.friendly_name}`}
                width={200}
                height={200}
                className="h-auto w-full max-w-[200px]"
                priority
              />
              <a
                className="text-sm font-medium text-emerald-800 underline underline-offset-2"
                href={`/qr/${id}.png`}
                download={`${id}.png`}
              >
                QR-Code als PNG herunterladen
              </a>
            </aside>
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
