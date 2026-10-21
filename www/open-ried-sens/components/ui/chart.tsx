"use client";

import { ResponsiveContainer } from "recharts";

/** Small shadcn-style chart frame shared by dashboard charts. */
export function ChartContainer({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`w-full min-w-0 ${className}`}>
      <ResponsiveContainer width="100%" height="100%" minHeight={260}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}
