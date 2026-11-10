import Image from "next/image";
import Link from "next/link";

export default function GatewayQrCard({ qrId, name }: { qrId: string; name: string }) {
  return <aside className="flex max-w-xs flex-col items-center gap-3 rounded-2xl bg-white p-4 text-center text-slate-900">
    <Image src={`/qr/gateways/${qrId}.png`} alt={`QR-Code für ${name}`} width={200} height={200} />
    <Link href={`/g/${qrId}`} className="break-all text-sm font-semibold text-emerald-800 underline underline-offset-2">hack-the-ried.de/g/{qrId}</Link>
    <a href={`/qr/gateways/${qrId}.png`} download={`gateway-${qrId}.png`} className="text-sm text-emerald-800 underline underline-offset-2">QR-Code als PNG herunterladen</a>
  </aside>;
}
