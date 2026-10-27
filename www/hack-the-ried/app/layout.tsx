import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "HackTheRied | Das offene Daten- & Smart-Region-Portal für das Hessische Ried",
  description: "Zentrales Regional- und Datenportal für Bürstadt, Lampertheim & das Hessische Ried: Echtzeit-Umweltsensorik, vernetzte Mobilität, Demografie, Kommunalhaushalt, Bauen, Wohnen & freie Open-Data-APIs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={cn("h-full antialiased", "font-sans", geist.variable)}>
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
        {children}
      </body>
    </html>
  );
}
