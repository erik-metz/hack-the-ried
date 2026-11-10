import { isAuthenticated } from "@/lib/adminAuth";
import { redirect } from "next/navigation";
import Link from "next/link";
import GatewayDashboard from "./GatewayDashboard";

export const dynamic = "force-dynamic";
export default async function GatewaysPage() {
  if (!(await isAuthenticated())) redirect("/admin");
  return <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8"><div className="mx-auto max-w-6xl">
    <Link href="/admin" className="text-emerald-400">← Administration</Link>
    <h1 className="mt-6 text-3xl font-bold">LoRa-Gateways</h1>
    <p className="mt-2 text-slate-400">Öffentliche Gateway-Seiten und QR-Codes verwalten. Betriebszustand, Gehäuseklima und Funkempfang überwachen.</p>
    <GatewayDashboard />
  </div></main>;
}
