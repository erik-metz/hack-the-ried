import { cn } from "cn";
import type { LucideIcon } from "lucide-react";

interface SensorStatCardProps {
  icon: LucideIcon;
  iconColor?: string;
  label: string;
  value: string | number;
  unit?: string;
  subLabel?: string;
  subLabelColor?: string;
  className?: string;
}

export default function SensorStatCard({
  icon: Icon,
  iconColor = "text-slate-400",
  label,
  value,
  unit,
  subLabel,
  subLabelColor = "text-slate-500",
  className,
}: SensorStatCardProps) {
  return (
    <div
      className={cn(
        "bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl flex flex-col gap-1 min-w-0",
        className
      )}
    >
      <span className={cn("text-sm text-slate-400 flex items-center gap-1.5", iconColor)}>
        <Icon className="w-4 h-4 shrink-0" />
        <span className="text-slate-400">{label}</span>
      </span>
      <span className="text-2xl font-bold text-slate-100 leading-tight">
        {value}
        {unit && (
          <span className="text-sm font-normal text-slate-400 ml-1">{unit}</span>
        )}
      </span>
      {subLabel && (
        <span className={cn("text-xs font-medium mt-0.5", subLabelColor)}>
          {subLabel}
        </span>
      )}
    </div>
  );
}
