import { cn } from "cn";
import type { LucideIcon } from "lucide-react";

interface SectionHeaderProps {
  label?: string;
  labelIcon?: LucideIcon;
  title: string;
  description?: string;
  centered?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export default function SectionHeader({
  label,
  labelIcon: LabelIcon,
  title,
  description,
  centered = false,
  className,
  children,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "space-y-2",
        centered && "text-center max-w-2xl mx-auto",
        className
      )}
    >
      {label && (
        <div
          className={cn(
            "inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-400 uppercase tracking-wider",
            centered && "justify-center w-full"
          )}
        >
          {LabelIcon && <LabelIcon className="w-3.5 h-3.5" />}
          {label}
        </div>
      )}
      <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 leading-tight">
        {title}
      </h2>
      {description && (
        <p className="text-base text-slate-400 leading-relaxed">{description}</p>
      )}
      {children}
    </div>
  );
}
