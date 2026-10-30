"use client";

import { readSensorCount, subscribeSensorCount, saveSensorCount } from "@/lib/sensorCountCache";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronDown,
  Coins,
  Database,
  ExternalLink,
  FileText,
  Layers,
  LayoutGrid,
  Menu,
  Radio,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import HeaderLogo from "./HeaderLogo";

interface SiteHeaderProps {
  /** Number of sensors / locations or active stations to display */
  sensorCount?: number;
  activeStations?: number;
  totalStations?: number;
}

interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
  isRegionalatlas?: boolean;
}

export const REGIONALATLAS_NAV_SUBITEMS = [
  {
    href: "/regionalatlas",
    label: "Übersicht",
    description: "Zahlen, Fakten & alle Fachbereiche",
    icon: LayoutGrid,
  },
  {
    href: "/termine",
    label: "Termine",
    description: "Veranstaltungskalender, Vereine & Feste",
    icon: CalendarDays,
  },
  {
    href: "/bauen-wohnen",
    label: "Bauen & Wohnen",
    description: "Bodenrichtwerte, Gebäudealter & Bau-Pläne",
    icon: Building2,
  },
  {
    href: "/demografie",
    label: "Demografie & Bildung",
    description: "Einwohner, Pendlerströme & Schulen",
    icon: Users,
  },
  {
    href: "/statistik",
    label: "Regionalstatistik",
    description: "Soziales, ZAKB-Recycling & Vereine",
    icon: BarChart3,
  },
  {
    href: "/haushalt",
    label: "Finanzen & Haushalt",
    description: "Kommunalhaushalte, Hebesätze & Wahlen",
    icon: Coins,
  },
  {
    href: "/wirtschaft",
    label: "Wirtschaft & Gewerbe",
    description: "Gewerbebetriebe, Hebesätze & Jobs",
    icon: Briefcase,
  },
];

const MAIN_NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Karte",
    shortLabel: "Karte",
    icon: Radio,
  },
  {
    href: "/regionalatlas",
    label: "Regionalatlas",
    shortLabel: "Atlas",
    icon: Layers,
    isRegionalatlas: true,
  },
  {
    href: "/daten",
    label: "Offene Daten",
    shortLabel: "Offene Daten",
    icon: Database,
  },
  {
    href: "/sensor-bauen",
    label: "Mitmachen",
    shortLabel: "Mitmachen",
    icon: Wrench,
    highlight: true,
  },
];

const SECONDARY_NAV_ITEMS: NavItem[] = [
  {
    href: "/quellen",
    label: "Quellen",
    shortLabel: "Quellen",
    icon: FileText,
  },
  {
    href: "/admin",
    label: "Admin-Bereich",
    shortLabel: "Admin",
    icon: ShieldCheck,
  },
];

export default function SiteHeader({
  sensorCount,
  activeStations,
  totalStations,
}: SiteHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileAtlasOpen, setMobileAtlasOpen] = useState(false);
  const [desktopDropdownOpen, setDesktopDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [navigationPath, setNavigationPath] = useState(pathname);

  if (navigationPath !== pathname) {
    setNavigationPath(pathname);
    setMobileOpen(false);
    setDesktopDropdownOpen(false);
  }

  const isRegionalatlasActive =
    pathname === "/regionalatlas" ||
    pathname?.startsWith("/termine") ||
    pathname?.startsWith("/bauen-wohnen") ||
    pathname?.startsWith("/demografie") ||
    pathname?.startsWith("/haushalt") ||
    pathname?.startsWith("/wirtschaft") ||
    pathname?.startsWith("/statistik");

  // Handle click outside desktop dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDesktopDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle Escape key and disable background scrolling when drawer is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        setDesktopDropdownOpen(false);
      }
    };

    if (mobileOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const cachedCount = useSyncExternalStore(subscribeSensorCount, readSensorCount, () => undefined);
  useEffect(() => {
    if (sensorCount !== undefined) saveSensorCount(sensorCount);
  }, [sensorCount]);
  const count = sensorCount ?? cachedCount;
  const displayCount = count ?? "–";
  const hasStationFraction =
    activeStations !== undefined && totalStations !== undefined;

  return (
    <>
      {/* Sticky Top Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl transition-all">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo */}
          <Link
            href="/"
            className="shrink-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <HeaderLogo />
          </Link>

          {/* Desktop Navigation (>= lg / 1024px) */}
          <nav
            className="hidden lg:flex items-center gap-1 xl:gap-2 text-xs xl:text-sm font-medium"
            aria-label="Hauptnavigation"
          >
            {MAIN_NAV_ITEMS.map((item) => {
              if (item.isRegionalatlas) {
                return (
                  <div
                    key={item.href}
                    ref={dropdownRef}
                    className="relative"
                    onMouseEnter={() => setDesktopDropdownOpen(true)}
                    onMouseLeave={() => setDesktopDropdownOpen(false)}
                  >
                    <div className="flex items-center">
                      <Link
                        href="/regionalatlas"
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg transition-all duration-150 whitespace-nowrap",
                          isRegionalatlasActive
                            ? "bg-emerald-500/15 text-emerald-300 font-semibold border-y border-l border-emerald-500/30 shadow-sm shadow-emerald-500/10"
                            : "text-slate-300 hover:text-emerald-300 hover:bg-slate-800/60"
                        )}
                      >
                        <Layers className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDesktopDropdownOpen((prev) => !prev)}
                        aria-expanded={desktopDropdownOpen}
                        aria-label="Regionalatlas Untermenü öffnen"
                        className={cn(
                          "px-1.5 py-1.5 rounded-r-lg transition-all duration-150 border-l border-slate-800/60",
                          isRegionalatlasActive
                            ? "bg-emerald-500/15 text-emerald-300 border-y border-r border-emerald-500/30"
                            : "text-slate-400 hover:text-emerald-300 hover:bg-slate-800/60"
                        )}
                      >
                        <ChevronDown
                          className={cn(
                            "w-3.5 h-3.5 transition-transform duration-200",
                            desktopDropdownOpen && "rotate-180 text-emerald-400"
                          )}
                        />
                      </button>
                    </div>

                    {/* Flyout Dropdown Menu */}
                    {desktopDropdownOpen && (
                      <div className="absolute top-full left-0 mt-1 w-64 rounded-2xl bg-slate-900/95 border border-slate-800 p-2 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in-0 zoom-in-95 duration-150">
                        <div className="px-2.5 py-1.5 border-b border-slate-800/80 mb-1">
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            Themen im Regionalatlas
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          {REGIONALATLAS_NAV_SUBITEMS.map((sub) => {
                            const SubIcon = sub.icon;
                            const isSubActive =
                              sub.href === "/regionalatlas"
                                ? pathname === "/regionalatlas"
                                : pathname?.startsWith(sub.href);

                            return (
                              <Link
                                key={sub.href}
                                href={sub.href}
                                onClick={() => setDesktopDropdownOpen(false)}
                                className={cn(
                                  "group flex items-start gap-2.5 p-2 rounded-xl transition-all",
                                  isSubActive
                                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"
                                    : "text-slate-300 hover:bg-slate-800/70 hover:text-emerald-300"
                                )}
                              >
                                <SubIcon
                                  className={cn(
                                    "w-4 h-4 mt-0.5 shrink-0 transition-colors",
                                    isSubActive
                                      ? "text-emerald-400"
                                      : "text-slate-400 group-hover:text-emerald-400"
                                  )}
                                />
                                <div className="space-y-0.5">
                                  <div className="font-semibold text-xs leading-none">
                                    {sub.label}
                                  </div>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname?.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-3 py-1.5 rounded-lg transition-all duration-150 whitespace-nowrap",
                    isActive
                      ? "bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/30 shadow-sm shadow-emerald-500/10"
                      : item.highlight
                      ? "text-emerald-400/95 hover:text-emerald-300 hover:bg-emerald-500/10 font-medium"
                      : "text-slate-300 hover:text-emerald-300 hover:bg-slate-800/60"
                  )}
                >
                  <span className="hidden xl:inline">{item.label}</span>
                  <span className="xl:hidden">{item.shortLabel}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right side: Status badge + mobile hamburger */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Network status badge */}
            <div
              className="flex items-center gap-2 bg-slate-900/90 border border-slate-800/90 px-2.5 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm text-slate-300 select-none shadow-sm"
              title={
                hasStationFraction
                  ? `${activeStations} von ${totalStations} Stationen aktiv`
                  : count === undefined
                  ? "Sensoranzahl noch nicht geladen – öffne die Karte"
                  : `${displayCount} Sensorstandorte im Ried${sensorCount === undefined ? " (zuletzt geladener Kartenstand)" : ""}`
              }
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="font-medium text-emerald-400 whitespace-nowrap">
                {hasStationFraction ? (
                  <>
                    <span className="hidden sm:inline">
                      {activeStations}/{totalStations} Stationen aktiv
                    </span>
                    <span className="sm:hidden">
                      {activeStations}/{totalStations}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="hidden sm:inline">
                      {displayCount} Sensorstandorte
                    </span>
                    <span className="sm:hidden">{displayCount} Standorte</span>
                  </>
                )}
              </span>
            </div>

            {/* Hamburger Button (< lg) */}
            <button
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label={mobileOpen ? "Menü schließen" : "Menü öffnen"}
              aria-expanded={mobileOpen}
              className="lg:hidden flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-emerald-400 hover:border-slate-700 active:scale-95 transition-all"
            >
              {mobileOpen ? (
                <X className="w-5 h-5 text-emerald-400" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md lg:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Slide-Out Drawer */}
      <aside
        className={cn(
          "fixed top-0 right-0 h-full w-80 max-w-[85vw] z-50 bg-slate-900 border-l border-slate-800 flex flex-col shadow-2xl transition-transform duration-300 ease-out lg:hidden",
          mobileOpen ? "translate-x-0" : "translate-x-full"
        )}
        aria-label="Navigationsmenü"
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80 bg-slate-950/50">
          <div className="flex items-center gap-2">
            <Image src="/icon.png" alt="" width={28} height={28} className="h-7 w-7 rounded-lg" />
            <span className="font-bold text-sm text-slate-100 tracking-tight">
              HackTheRied
            </span>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Menü schließen"
            className="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400 hover:text-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Navigation Links */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
          {/* Main sections */}
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2 block">
              Themen &amp; Daten
            </span>
            <nav className="flex flex-col gap-1">
              {/* Sensor-Karte */}
              <Link
                href="/"
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  pathname === "/"
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-semibold"
                    : "text-slate-300 hover:bg-slate-800/70 hover:text-emerald-300"
                )}
              >
                <Radio
                  className={cn(
                    "w-4 h-4 shrink-0",
                    pathname === "/" ? "text-emerald-400" : "text-slate-400"
                  )}
                />
                <span>Karte</span>
              </Link>

              {/* Regionalatlas with expandable sub-links */}
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-1 space-y-1">
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <Link
                    href="/regionalatlas"
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 text-sm font-semibold transition-colors flex-1",
                      isRegionalatlasActive
                        ? "text-emerald-300"
                        : "text-slate-200 hover:text-emerald-400"
                    )}
                  >
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span>Regionalatlas</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setMobileAtlasOpen((prev) => !prev)}
                    aria-label="Regionalatlas Untermenü ein-/ausklappen"
                    aria-expanded={mobileAtlasOpen}
                    className="p-1 text-slate-400 hover:text-slate-200"
                  >
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 transition-transform",
                        mobileAtlasOpen && "rotate-180 text-emerald-400"
                      )}
                    />
                  </button>
                </div>

                {mobileAtlasOpen && (
                  <div className="pl-3 pr-1 py-1 space-y-0.5 border-t border-slate-800/60">
                    {REGIONALATLAS_NAV_SUBITEMS.map((sub) => {
                      const SubIcon = sub.icon;
                      const isSubActive =
                        sub.href === "/regionalatlas"
                          ? pathname === "/regionalatlas"
                          : pathname?.startsWith(sub.href);

                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                            isSubActive
                              ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 font-semibold"
                              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                          )}
                        >
                          <SubIcon
                            className={cn(
                              "w-3.5 h-3.5 shrink-0",
                              isSubActive
                                ? "text-emerald-400"
                                : "text-slate-500"
                            )}
                          />
                          <span>{sub.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Offene Daten & API */}
              <Link
                href="/daten"
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  pathname?.startsWith("/daten")
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-semibold"
                    : "text-slate-300 hover:bg-slate-800/70 hover:text-emerald-300"
                )}
              >
                <Database
                  className={cn(
                    "w-4 h-4 shrink-0",
                    pathname?.startsWith("/daten")
                      ? "text-emerald-400"
                      : "text-slate-400"
                  )}
                />
                <span>Offene Daten</span>
              </Link>

              {/* Sensor bauen */}
              <Link
                href="/sensor-bauen"
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  pathname?.startsWith("/sensor-bauen")
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-semibold"
                    : "text-emerald-400/95 hover:bg-slate-800/70 hover:text-emerald-300"
                )}
              >
                <Wrench
                  className={cn(
                    "w-4 h-4 shrink-0",
                    pathname?.startsWith("/sensor-bauen")
                      ? "text-emerald-400"
                      : "text-emerald-500"
                  )}
                />
                <span>Mitmachen</span>
              </Link>
            </nav>
          </div>

          {/* Secondary sections */}
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2 block">
              System &amp; Transparenz
            </span>
            <nav className="flex flex-col gap-1">
              {SECONDARY_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = pathname?.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                      isActive
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-semibold"
                        : "text-slate-400 hover:bg-slate-800/70 hover:text-emerald-300"
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-4 h-4 shrink-0",
                        isActive ? "text-emerald-400" : "text-slate-500"
                      )}
                    />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 space-y-3">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-emerald-400">
              {displayCount} Sensorstandorte
            </span>
          </div>
          <div className="text-[11px] text-slate-500 leading-relaxed px-1">
            Initiative von{" "}
            <a
              href="https://kamue.me"
              target="_blank"
              rel="noreferrer"
              className="text-emerald-400 font-medium hover:underline inline-flex items-center gap-0.5"
            >
              KAMÜ Kulturzentrum <ExternalLink className="w-2.5 h-2.5" />
            </a>{" "}
            &amp; Bürgerinnen/Bürgern Bürstadt &amp; Lampertheim.
          </div>
        </div>
      </aside>
    </>
  );
}
