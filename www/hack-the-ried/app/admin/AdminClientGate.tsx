"use client";

import {
  AlertTriangle,
  BarChart3,
  Mail,
  QrCode,
  MapPin,
  ArrowLeft,
  Globe,
  Lock,
  LogOut,
  Presentation,
  Radio,
  RefreshCw,
  Server,
  Shield,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { loginAction, logoutAction } from "./actions";
import SiteFooter from "../components/SiteFooter";
import NewsletterAdminPanel from "./NewsletterAdminPanel";
import QrScansAdminPanel from "./QrScansAdminPanel";

const GpsTrackerMap = dynamic(() => import("./GpsTrackerMap"), { ssr: false, loading: () => <p role="status">GPS-Karte wird geladen…</p> });

const sections = [
  { id: "overview", label: "Übersicht", icon: BarChart3 },
  { id: "newsletter", label: "Anmeldungen", icon: Mail },
  { id: "qr", label: "QR-Scans", icon: QrCode },
  { id: "gps", label: "GPS & Reichweite", icon: MapPin },
] as const;
type Section = typeof sections[number]["id"];

interface AdminClientGateProps {
  initialAuthenticated: boolean;
}

export default function AdminClientGate({
  initialAuthenticated,
}: AdminClientGateProps) {
  const [, startTransition] = useTransition();
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuthenticated);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [section, setSection] = useState<Section>("overview");

  function callAction<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      startTransition(() => {
        operation().then(resolve, reject);
      });
    });
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    setAuthError("");

    try {
      const result = await callAction(() => loginAction(password));
      if (!result.ok) {
        setAuthError(result.error);
      } else {
        setIsAuthenticated(true);
        setPassword("");
      }
    } catch {
      setAuthError("Netzwerkfehler beim Anmelden.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    try {
      const result = await callAction(() => logoutAction());
      if (result.ok) {
        setIsAuthenticated(false);
        setSection("overview");
      }
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }

  // 1. Loading screen during session check
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
          <span>Sitzung wird überprüft...</span>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated Login Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -translate-y-8 translate-x-8 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100">
                Administration
              </h1>
              <p className="text-xs text-emerald-400 font-medium tracking-wide uppercase">
                HackTheRied Management
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            Nur autorisierte Administratorinnen und Administratoren des Projekts
            können Anmeldungen, QR-Code-Scans und die LoRa-Abdeckung einsehen.
          </p>

          {authError && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="admin-password" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Admin-Passwort
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  autoComplete="current-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Passwort eingeben..."
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute right-4 top-3.5" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loginLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Prüfe Zugang...
                </>
              ) : (
                "Anmelden"
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-800 text-center">
            <Link
              href="/"
              aria-label="Website ansehen"
              className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-emerald-400 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Zurück zur Hauptseite
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. Authenticated Admin Dashboard
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 py-3 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-slate-100">
                  HackTheRied
                </span>
                <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Admin
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Übersicht & Technik
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              aria-label="Website ansehen"
              className="flex items-center gap-2 text-sm px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-emerald-400 hover:border-slate-700 transition-all"
            >
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">Website ansehen</span>
            </Link>
            <Link
              href="/daten"
              aria-label="API-Dokumentation öffnen"
              className="flex items-center gap-2 text-sm px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-emerald-400 hover:border-slate-700 transition-all"
            >
              <Server className="w-4 h-4" />
              <span className="hidden sm:inline">API-Doku</span>
            </Link>
            <button
              onClick={handleLogout}
              aria-label="Abmelden"
              className="flex items-center gap-2 text-sm px-3.5 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Abmelden</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Administration</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{sections.find(item => item.id === section)?.label}</h1>
          <p className="mt-2 text-sm text-slate-400">Resonanz im Blick behalten und die Technik direkt erreichen.</p>
        </div>
        <nav aria-label="Adminbereiche" className="flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-2">
          {sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-emerald-400 ${section === id ? "bg-emerald-400 text-slate-950" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}><Icon className="size-4" aria-hidden="true" />{label}</button>)}
          <Link href="/admin/gateways" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"><Server className="size-4" aria-hidden="true" />Gateways<ArrowLeft className="size-3 rotate-180" aria-hidden="true" /></Link>
          <Link href="/pitch" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"><Presentation className="size-4" aria-hidden="true" />Präsentationen<ArrowLeft className="size-3 rotate-180" aria-hidden="true" /></Link>
        </nav>
        <div className={section === "overview" ? "grid items-start gap-6 xl:grid-cols-2" : "space-y-6"}>
          {(section === "overview" || section === "newsletter") && <NewsletterAdminPanel compact={section === "overview"} />}
          {(section === "overview" || section === "qr") && <QrScansAdminPanel compact={section === "overview"} />}
          {section === "overview" && <div className="grid gap-4 sm:grid-cols-2 xl:col-span-2">
            <button type="button" onClick={() => setSection("gps")} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-left hover:border-emerald-500/50"><MapPin className="mb-3 size-5 text-emerald-400" /><span className="font-semibold">GPS & Reichweite öffnen →</span><p className="mt-1 text-sm text-slate-400">Fahrten und Empfang durch eigene und öffentliche Gateways.</p></button>
            <Link href="/admin/gateways" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 hover:border-emerald-500/50"><Server className="mb-3 size-5 text-emerald-400" /><span className="font-semibold">Gateway-Betrieb öffnen →</span><p className="mt-1 text-sm text-slate-400">Betriebszustand, Messwerte und Verläufe.</p></Link>
          </div>}
          {section === "gps" && <section aria-labelledby="gps-title" className="space-y-5"><div><h2 id="gps-title" className="text-xl font-semibold">GPS-Reichweitentest & Gateway-Abdeckung</h2><p className="mt-1 text-sm text-slate-400">Empfang der 5-Minuten-Pakete über eigene und öffentliche TTN-Gateways.</p></div><GpsTrackerMap /></section>}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
