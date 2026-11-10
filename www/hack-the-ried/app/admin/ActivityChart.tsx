"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ActivityPoint } from "@/lib/adminCharts";

export default function ActivityChart({ data, label, primaryLabel, secondaryLabel, monthly = false }: {
  data: ActivityPoint[];
  label: string;
  primaryLabel: string;
  secondaryLabel?: string;
  monthly?: boolean;
}) {
  const total = data.reduce((sum, point) => sum + point.primary + point.secondary, 0);
  const formatDate = (value: string) => new Date(`${value}${monthly ? "-01" : ""}T12:00:00Z`).toLocaleDateString("de-DE", monthly ? { month: "short", year: "2-digit", timeZone: "UTC" } : { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  return <figure className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-3 sm:p-5">
    <figcaption className="mb-4 text-sm font-medium text-slate-300">{label} <span className="text-slate-500">· UTC</span></figcaption>
    {total === 0 ? <div className="flex h-48 items-center justify-center text-center text-sm text-slate-400">Keine Aktivität in diesem Zeitraum.</div> : <div className="h-56 min-w-0 sm:h-64">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} accessibilityLayer margin={{ top: 8, right: 4, bottom: 4, left: -20 }}>
          <CartesianGrid stroke="#1e293b" vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip labelFormatter={value => formatDate(String(value))} contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12, color: "#e2e8f0" }} cursor={{ fill: "#1e293b" }} />
          <Legend />
          <Bar dataKey="primary" name={primaryLabel} fill="#34d399" radius={[3, 3, 0, 0]} maxBarSize={32} isAnimationActive={false} />
          {secondaryLabel && <Bar dataKey="secondary" name={secondaryLabel} fill="#38bdf8" radius={[3, 3, 0, 0]} maxBarSize={32} isAnimationActive={false} />}
        </BarChart>
      </ResponsiveContainer>
    </div>}
  </figure>;
}
