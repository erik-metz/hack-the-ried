"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Layers,
  Building2,
  Users,
  Coins,
  Briefcase,
  BarChart3,
  LayoutGrid,
  CalendarDays,
  TrainFront,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface RegionalatlasTab {
  id: string;
  href: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  tag?: string;
}

export const REGIONALATLAS_TABS: RegionalatlasTab[] = [
  { id: "bahn", href: "/regionalatlas/bahn", label: "Bahnhöfe & Anlagen", shortLabel: "Bahn", icon: TrainFront, tag: "DB OpenStation" },
  {
    id: "uebersicht",
    href: "/regionalatlas",
    label: "Übersicht",
    shortLabel: "Übersicht",
    icon: LayoutGrid,
    tag: "Hub",
  },
  {
    id: "termine",
    href: "/termine",
    label: "Termine & Events",
    shortLabel: "Termine",
    icon: CalendarDays,
    tag: "Kalender",
  },
  {
    id: "bauen-wohnen",
    href: "/bauen-wohnen",
    label: "Bauen & Wohnen",
    shortLabel: "Bauen",
    icon: Building2,
    tag: "BORIS & Zensus",
  },
  {
    id: "demografie",
    href: "/demografie",
    label: "Demografie & Bildung",
    shortLabel: "Demografie",
    icon: Users,
    tag: "Bevölkerung",
  },
  {
    id: "statistik",
    href: "/statistik",
    label: "Regionalstatistik",
    shortLabel: "Statistik",
    icon: BarChart3,
    tag: "Soziales & KAMÜ",
  },
  {
    id: "haushalt",
    href: "/haushalt",
    label: "Finanzen & Haushalt",
    shortLabel: "Haushalt",
    icon: Coins,
    tag: "Kommunalhaushalte",
  },
  {
    id: "wirtschaft",
    href: "/wirtschaft",
    label: "Wirtschaft & Gewerbe",
    shortLabel: "Wirtschaft",
    icon: Briefcase,
    tag: "Gewerbe & Jobs",
  },
];

interface RegionalatlasTabsProps {
  activeTab?: "bahn" | "uebersicht" | "termine" | "bauen-wohnen" | "demografie" | "statistik" | "haushalt" | "wirtschaft";
  className?: string;
}

export default function RegionalatlasTabs({
  activeTab,
  className,
}: RegionalatlasTabsProps) {
  const pathname = usePathname();

  return (
    <div className={cn("w-full space-y-2.5", className)}>
      {/* Top Banner / Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
            <Layers className="w-3.5 h-3.5" />
            Regionalatlas Ried
          </span>
          <span className="text-slate-600">•</span>
          <span>Kommunaldaten, Statistik &amp; Bürgerinformationen</span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-500 font-mono">
          <span>Bürstadt • Lampertheim • Biblis • Groß-Rohrheim</span>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="p-1.5 rounded-2xl bg-slate-900/90 border border-slate-800/90 backdrop-blur-md shadow-xl overflow-x-auto scrollbar-none">
        <nav
          className="flex items-center gap-1 min-w-max"
          aria-label="Regionalatlas Navigation"
        >
          {REGIONALATLAS_TABS.map((tab) => {
            const Icon = tab.icon;
            const isCurrent =
              activeTab !== undefined
                ? activeTab === tab.id
                : tab.href === "/regionalatlas"
                ? pathname === "/regionalatlas"
                : pathname?.startsWith(tab.href);

            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={cn(
                  "group relative flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-150 whitespace-nowrap",
                  isCurrent
                    ? "bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/30 shadow-sm shadow-emerald-500/10"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                )}
                aria-current={isCurrent ? "page" : undefined}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 shrink-0 transition-colors",
                    isCurrent
                      ? "text-emerald-400"
                      : "text-slate-400 group-hover:text-emerald-400"
                  )}
                />
                <span>{tab.label}</span>
                {tab.tag && (
                  <span
                    className={cn(
                      "hidden md:inline-block text-[10px] px-1.5 py-0.5 rounded-md font-mono transition-colors",
                      isCurrent
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-slate-800 text-slate-500 group-hover:text-slate-400"
                    )}
                  >
                    {tab.tag}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
