import { cn } from "@/lib/utils";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title:
    "HackTheRied | Das offene Daten- & Smart-Region-Portal für das Hessische Ried",
  description:
    "Zentrales Regional- und Datenportal für Bürstadt, Lampertheim & das Hessische Ried: Echtzeit-Umweltsensorik, vernetzte Mobilität, Demografie, Kommunalhaushalt, Bauen, Wohnen & freie Open-Data-APIs.",
  icons: { icon: "/icon.png", apple: "/icon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={cn("h-full antialiased", "font-sans", geist.variable)}
    >
      <Analytics />
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
        {children}
      </body>
    </html>
  );
}
