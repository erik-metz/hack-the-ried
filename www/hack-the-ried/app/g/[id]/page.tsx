import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteHeader from "@/app/components/SiteHeader";
import SiteFooter from "@/app/components/SiteFooter";
import GatewayDashboard from "@/app/admin/gateways/GatewayDashboard";
import GatewayQrCard from "@/app/components/GatewayQrCard";
import { getQrGateway } from "@/lib/qrGateways";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const gateway = getQrGateway((await params).id);
  return gateway ? {
    title: `${gateway.name} | HackTheRied`,
    description: "LoRaWAN-Gateway im Hessischen Ried: Betriebsstatus, Gehäuseklima und Funkempfang.",
    alternates: { canonical: `/g/${gateway.qrId}` },
  } : { title: "Gateway nicht gefunden | HackTheRied" };
}

export default async function GatewayPage({ params }: Props) {
  const gateway = getQrGateway((await params).id);
  if (!gateway) notFound();
  return <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
    <SiteHeader />
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <header className="grid gap-6 sm:grid-cols-[1fr_220px]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400">HackTheRied · Gateway {gateway.qrId}</p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{gateway.name}</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-300">Dieses LoRaWAN-Gateway empfängt die Funkdaten unserer Sensoren und leitet sie an The Things Network weiter.</p>
          <p className="mt-3 text-slate-400">Hier siehst du Betriebsstatus, Messwerte und Funkempfang. Die Daten werden bei geöffneter Seite jede Minute aktualisiert.</p>
        </div>
        <GatewayQrCard qrId={gateway.qrId} name={gateway.name} />
      </header>
      <GatewayDashboard publicGatewayId={gateway.qrId} />
    </main>
    <SiteFooter />
  </div>;
}
