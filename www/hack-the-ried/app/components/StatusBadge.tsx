import { cn } from "cn";

interface StatusBadgeProps {
  status: "online" | "warning" | "offline";
  label?: string;
  className?: string;
}

const statusConfig = {
  online: {
    dot: "bg-emerald-400",
    text: "text-emerald-400",
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/10",
    defaultLabel: "Online",
  },
  warning: {
    dot: "bg-amber-400",
    text: "text-amber-400",
    border: "border-amber-500/20",
    bg: "bg-amber-500/10",
    defaultLabel: "Warnung",
  },
  offline: {
    dot: "bg-red-400",
    text: "text-red-400",
    border: "border-red-500/20",
    bg: "bg-red-500/10",
    defaultLabel: "Offline",
  },
};

export default function StatusBadge({
  status,
  label,
  className,
}: StatusBadgeProps) {
  const cfg = statusConfig[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border",
        cfg.bg,
        cfg.border,
        cfg.text,
        className
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", cfg.dot)} />
      {label ?? cfg.defaultLabel}
    </span>
  );
}
