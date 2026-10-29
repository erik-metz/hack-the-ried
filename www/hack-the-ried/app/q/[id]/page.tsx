import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import SiteFooter from "../../components/SiteFooter";
import SiteHeader from "../../components/SiteHeader";
import { getQrSensor, getQrSensorIds } from "@/lib/qrSensors";

type QrSensorPageProps = PageProps<"/q/[id]">;

export function generateStaticParams() {
  return getQrSensorIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: QrSensorPageProps): Promise<Metadata> {
  const { id } = await params;
  const sensor = getQrSensor(id);

  if (!sensor) return { title: "Sensor nicht gefunden | HackTheRied" };

  return {
    title: `${sensor.name} | HackTheRied`,
    description: `Öffentliche Informationen zu ${sensor.name} (${sensor.model}) im Hessischen Ried.`,
    alternates: { canonical: `/q/${sensor.id}` },
  };
}

export default async function QrSensorPage({ params }: QrSensorPageProps) {
  const { id } = await params;
  const sensor = getQrSensor(id);

  if (!sensor) notFound();

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
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{sensor.name}</h1>
                <p className="text-lg text-slate-300">{sensor.model} · Hessisches Ried</p>
                <p className="max-w-2xl leading-relaxed text-slate-300">{sensor.description}</p>
              </header>

              <section aria-labelledby="sensor-details" className="space-y-4">
                <h2 id="sensor-details" className="text-xl font-semibold">Gerätestammdaten</h2>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <dt className="text-sm text-slate-400">Modell</dt>
                    <dd className="mt-1 font-medium">{sensor.model}</dd>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <dt className="text-sm text-slate-400">Standort</dt>
                    <dd className="mt-1 font-medium">{sensor.location ?? "Noch nicht eingetragen"}</dd>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <dt className="text-sm text-slate-400">Inbetriebnahme</dt>
                    <dd className="mt-1 font-medium">{sensor.commissionedAt ?? "Noch nicht eingetragen"}</dd>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <dt className="text-sm text-slate-400">Verbaute Sensoren</dt>
                    <dd className="mt-1 font-medium">
                      {sensor.modules.length ? sensor.modules.join(", ") : "Noch nicht eingetragen"}
                    </dd>
                  </div>
                </dl>
              </section>

              <p className="border-t border-slate-800 pt-5 text-sm text-slate-400">
                Diese Seite enthält öffentliche Stammdaten, keine Live-Messwerte.
              </p>
            </div>

            <aside className="flex flex-col items-center gap-3 self-start rounded-2xl border border-slate-800 bg-white p-4 text-center text-slate-900">
              <Image
                src={`/qr/${sensor.id}.png`}
                alt={`QR-Code für ${sensor.name}`}
                width={200}
                height={200}
                className="h-auto w-full max-w-[200px]"
                priority
              />
              <a
                className="text-sm font-medium text-emerald-800 underline underline-offset-2"
                href={`/qr/${sensor.id}.png`}
                download={`${sensor.id}.png`}
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
