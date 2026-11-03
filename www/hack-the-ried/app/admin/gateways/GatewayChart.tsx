"use client";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { gatewayChartRows, type GatewayPoint } from "@/lib/gatewayData";

export default function GatewayChart({ series, resolution, unit }: { series: GatewayPoint[]; resolution: string; unit: string }) {
  const rows = gatewayChartRows(series, resolution);
  if (!rows.length) return <p className="py-12 text-slate-400">Für diesen Zeitraum liegen noch keine Messwerte vor.</p>;
  return <div className="h-80 w-full" role="img" aria-label={`Messverlauf in ${unit}; Lücken bedeuten fehlende Daten`}>
    <ResponsiveContainer width="100%" height="100%"><ComposedChart data={rows}>
      <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
      <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={v => new Date(v).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} />
      <YAxis width={80} tickFormatter={v => Number(v).toLocaleString("de-DE", { notation: "compact" })} />
      <Tooltip labelFormatter={v => new Date(Number(v)).toLocaleString("de-DE")} contentStyle={{ background: "#0f172a", borderColor: "#475569" }} />
      <Area dataKey="range" name={`Minimum–Maximum (${unit})`} stroke="none" fill="#34d399" fillOpacity={0.18} connectNulls={false} />
      <Line dataKey="value" name={`Messwert / Mittelwert (${unit})`} stroke="#34d399" dot={false} connectNulls={false} isAnimationActive={false} />
    </ComposedChart></ResponsiveContainer>
  </div>;
}
