"use client";

import type { SensorItem } from "@/lib/backend";
import {
  AlertTriangle,
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
import { useState, useTransition } from "react";
import { listSensorsAction, loginAction, logoutAction } from "./actions";
import AdminClient from "./AdminClient";
import SiteFooter from "../components/SiteFooter";
import NewsletterAdminPanel from "./NewsletterAdminPanel";

interface AdminClientGateProps {
  initialAuthenticated: boolean;
  initialSensors: SensorItem[];
  initialError?: string;
}

function getSensorId(sensor: SensorItem | null | undefined): string {
  return sensor?.id ?? "";
}

export default function AdminClientGate({
  initialAuthenticated,
  initialSensors,
  initialError,
}: AdminClientGateProps) {
  const [, startTransition] = useTransition();
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuthenticated);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Dashboard state
  const [sensors, setSensors] = useState<SensorItem[]>(initialSensors);
  const [loadingSensors, setLoadingSensors] = useState(false);

  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(initialError ? { type: "error", text: initialError } : null);

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
        fetchSensors();
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
        setSensors([]);
      }
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }

  async function fetchSensors() {
    setLoadingSensors(true);
    try {
      const result = await callAction(() => listSensorsAction());
      if (result.ok) {
        setSensors(result.data);
      } else {
        setFeedbackMessage({
          type: "error",
          text: result.error,
        });
      }
    } catch {
      setFeedbackMessage({
        type: "error",
        text: "Verbindung zum Server fehlgeschlagen.",
      });
    } finally {
      setLoadingSensors(false);
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
                Admin Control Panel
              </h1>
              <p className="text-xs text-emerald-400 font-medium tracking-wide uppercase">
                HackTheRied Management
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            Nur autorisierte Administratorinnen und Administratoren des Projekts
            dürfen Stationen anlegen, konfigurieren, verbergen oder löschen.
          </p>

          {authError && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Admin-Passwort
              </label>
              <div className="relative">
                <input
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
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
                  Admin Panel
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Geschützter Verwaltungsbereich für Sensoren & Stationen
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/pitch"
              className="flex items-center gap-2 text-sm px-3.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all font-semibold"
            >
              <Presentation className="w-4 h-4" />
              <span className="hidden sm:inline">Pitch-Decks</span>
            </Link>
            <Link
              href="/"
              className="flex items-center gap-2 text-sm px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-emerald-400 hover:border-slate-700 transition-all"
            >
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">Website ansehen</span>
            </Link>
            <Link
              href="/daten"
              className="flex items-center gap-2 text-sm px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-emerald-400 hover:border-slate-700 transition-all"
            >
              <Server className="w-4 h-4" />
              <span className="hidden sm:inline">API-Doku</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm px-3.5 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Abmelden</span>
            </button>
          </div>
        </div>
      </header>

      <NewsletterAdminPanel />
      <AdminClient initialSensors={initialSensors} initialError="" />
      <SiteFooter />
    </div>
  );
}
