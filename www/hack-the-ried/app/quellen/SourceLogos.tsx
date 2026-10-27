import React from "react";

interface LogoProps {
  className?: string;
  size?: number;
}

export function VrnLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-[#004990] flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <path d="M15 25L42 75H58L85 25H68L50 60L32 25H15Z" fill="#EE7202" />
        <path d="M42 25H58V45H42V25Z" fill="#FFFFFF" opacity="0.9" />
        <circle cx="50" cy="72" r="7" fill="#FFFFFF" />
      </svg>
    </div>
  );
}

export function NextbikeLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-[#00adb5] flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-slate-950 stroke-current">
        <circle cx="28" cy="65" r="16" strokeWidth="8" />
        <circle cx="72" cy="65" r="16" strokeWidth="8" />
        <path d="M28 65L46 40H62L72 65" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M46 40L38 24H52" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M46 40L50 65" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="62" cy="30" r="5" fill="currentColor" stroke="none" />
      </svg>
    </div>
  );
}

export function ZakbLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-emerald-700 flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-emerald-100">
        <path d="M50 15C30.7 15 15 30.7 15 50C15 69.3 30.7 85 50 85C69.3 85 85 69.3 85 50" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
        <path d="M85 35L85 50L70 50" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M42 38H58L42 62H58" stroke="#A7F3D0" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function BkgLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-slate-900 border border-amber-500/40 flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <rect x="18" y="18" width="64" height="64" rx="8" stroke="#F59E0B" strokeWidth="6" />
        <path d="M18 42H82M18 64H82" stroke="#F59E0B" strokeWidth="4" strokeOpacity="0.4" />
        <path d="M42 18V82M64 18V82" stroke="#F59E0B" strokeWidth="4" strokeOpacity="0.4" />
        <circle cx="50" cy="50" r="10" fill="#3B82F6" />
        <circle cx="50" cy="50" r="4" fill="#FFFFFF" />
      </svg>
    </div>
  );
}

export function BnetzaLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-sky-950 border border-sky-500/40 flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-sky-400">
        <rect x="22" y="28" width="56" height="52" rx="10" stroke="currentColor" strokeWidth="7" />
        <path d="M38 18V28M62 18V28" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
        <path d="M50 42L42 56H56L48 70" stroke="#FDE047" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function HessenLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-red-950 border border-red-500/40 flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <path d="M25 20H75V55C75 70 50 85 50 85C50 85 25 70 25 55V20Z" fill="#DC2626" />
        <path d="M25 32H75M25 44H75M25 56C30 63 42 72 50 78C58 72 70 63 75 56H25Z" fill="#FFFFFF" fillOpacity="0.85" />
        <circle cx="50" cy="38" r="6" fill="#1E3A8A" />
      </svg>
    </div>
  );
}

export function WahlleiterinLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-slate-200">
        <rect x="20" y="38" width="60" height="46" rx="6" stroke="currentColor" strokeWidth="6" />
        <path d="M36 38V22H64V38" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        <path d="M42 16L58 16" stroke="#E2E8F0" strokeWidth="4" strokeLinecap="round" />
        <path d="M35 60L46 70L65 48" stroke="#10B981" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function Cross7Logo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-amber-600 flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-amber-50">
        <rect x="20" y="25" width="60" height="55" rx="8" stroke="currentColor" strokeWidth="7" />
        <path d="M34 18V26M66 18V26" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
        <path d="M20 42H80" stroke="currentColor" strokeWidth="6" />
        <circle cx="36" cy="55" r="4" fill="currentColor" />
        <circle cx="50" cy="55" r="4" fill="currentColor" />
        <circle cx="64" cy="55" r="4" fill="currentColor" />
        <circle cx="36" cy="68" r="4" fill="currentColor" />
        <circle cx="50" cy="68" r="4" fill="currentColor" />
      </svg>
    </div>
  );
}

export function OsmLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-[#7eb742] flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-slate-950">
        <circle cx="48" cy="45" r="24" stroke="currentColor" strokeWidth="8" />
        <path d="M65 62L82 80" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
        <circle cx="48" cy="45" r="10" fill="#FFFFFF" />
        <circle cx="48" cy="45" r="5" fill="#0284C7" />
      </svg>
    </div>
  );
}

export function TtnLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-blue-600 flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-white">
        <path d="M20 75C28 45 42 30 50 30C58 30 72 45 80 75" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
        <path d="M32 75C38 55 45 46 50 46C55 46 62 55 68 75" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
        <circle cx="50" cy="68" r="6" fill="#67E8F9" />
      </svg>
    </div>
  );
}

export function PegelLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-cyan-400">
        <path d="M15 65C25 58 35 72 50 65C65 58 75 72 85 65" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
        <path d="M15 45C25 38 35 52 50 45C65 38 75 52 85 45" stroke="#38BDF8" strokeWidth="7" strokeLinecap="round" />
        <path d="M50 20V50" stroke="#FDE047" strokeWidth="6" strokeLinecap="round" />
        <circle cx="50" cy="20" r="4" fill="#FDE047" />
      </svg>
    </div>
  );
}

export function AutobahnLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-[#004c97] flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-white">
        <rect x="16" y="16" width="68" height="68" rx="8" stroke="currentColor" strokeWidth="7" />
        <path d="M30 75L44 25M70 75L56 25" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
        <path d="M22 52H78" stroke="currentColor" strokeWidth="6" />
      </svg>
    </div>
  );
}

export function WeatherLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-sky-900 border border-sky-400/30 flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <circle cx="40" cy="40" r="16" fill="#FBBF24" />
        <path d="M32 68C24 68 18 62 18 54C18 47 24 41 31 41C33 33 40 28 49 28C59 28 67 35 68 44C75 45 80 50 80 57C80 63 74 68 66 68H32Z" fill="#E2E8F0" opacity="0.95" />
        <path d="M35 76L32 84M50 76L47 84M65 76L62 84" stroke="#38BDF8" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function SmartCityLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-emerald-950 border border-emerald-500/40 flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-emerald-400">
        <circle cx="50" cy="30" r="10" stroke="currentColor" strokeWidth="6" />
        <circle cx="28" cy="68" r="8" stroke="currentColor" strokeWidth="6" />
        <circle cx="72" cy="68" r="8" stroke="currentColor" strokeWidth="6" />
        <path d="M44 38L32 60M56 38L68 60M36 68H64" stroke="currentColor" strokeWidth="5" strokeDasharray="3 3" />
        <circle cx="50" cy="30" r="4" fill="#34D399" />
      </svg>
    </div>
  );
}

export function BlitzortungLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-amber-950 border border-amber-500/40 flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-amber-400">
        <path d="M55 12L25 54H48L42 88L75 46H52L55 12Z" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function InvekosLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-emerald-950 border border-emerald-500/40 flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-emerald-400">
        {/* Field parcel geometry with furrow lines and plant sprout */}
        <polygon points="18,32 82,22 88,78 12,82" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" fill="none" opacity="0.6" />
        <line x1="28" y1="52" x2="74" y2="46" stroke="currentColor" strokeWidth="4" strokeDasharray="3 3" opacity="0.8" />
        <line x1="24" y1="68" x2="80" y2="62" stroke="currentColor" strokeWidth="4" strokeDasharray="3 3" opacity="0.8" />
        <path d="M50 75 V35 M50 50 C40 45 38 32 50 32 M50 42 C60 37 62 25 50 25" stroke="#34D399" strokeWidth="5" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
}

export function CopernicusLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-sky-950 border border-sky-500/40 flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-sky-400">
        {/* Satellite and orbit earth observation */}
        <circle cx="50" cy="50" r="32" stroke="currentColor" strokeWidth="5" strokeDasharray="6 4" opacity="0.4" />
        <circle cx="50" cy="50" r="18" fill="#0284C7" opacity="0.7" />
        <path d="M20 72 Q 50 25 80 72" stroke="#38BDF8" strokeWidth="6" strokeLinecap="round" fill="none" />
        <rect x="68" y="24" width="16" height="10" rx="2" fill="#E0F2FE" />
        <rect x="74" y="20" width="4" height="4" fill="#38BDF8" />
        <line x1="62" y1="29" x2="68" y2="29" stroke="#E0F2FE" strokeWidth="3" />
        <line x1="84" y1="29" x2="90" y2="29" stroke="#E0F2FE" strokeWidth="3" />
      </svg>
    </div>
  );
}

export function ShakeLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-rose-950 border border-rose-500/40 flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-rose-400">
        <path d="M15 50H32L38 32L45 70L54 20L62 76L68 42L74 55H85" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function RastLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-indigo-600 flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-white">
        <rect x="15" y="15" width="70" height="70" rx="14" fill="#3B82F6" />
        <path d="M35 70V30H52C59.7 30 65 34.5 65 42C65 49.5 59.7 54 52 54H47V70H35ZM47 44H51.5C54 44 55.5 42.5 55.5 42C55.5 41.5 54 40 51.5 40H47V44Z" fill="white" />
      </svg>
    </div>
  );
}

export function OpenSenseMapLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-teal-700 flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-white">
        <path d="M50 16L84 35V65L50 84L16 65V35L50 16Z" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" fill="#14B8A6" fillOpacity="0.3" />
        <path d="M50 16V84M16 35L50 54L84 35" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" />
        <circle cx="50" cy="35" r="5" fill="#38BDF8" />
        <circle cx="33" cy="65" r="4" fill="#FDE047" />
        <circle cx="67" cy="65" r="4" fill="#34D399" />
      </svg>
    </div>
  );
}

export function UbaLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-teal-900 border border-teal-400/40 flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-teal-300">
        <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="6" fill="#042F2E" />
        <path d="M28 62 C32 45, 45 35, 60 36 C72 37, 76 48, 72 60 C68 70, 52 72, 38 66" stroke="#2DD4BF" strokeWidth="6" strokeLinecap="round" fill="none" />
        <path d="M35 48 C40 38, 52 30, 65 32" stroke="#38BDF8" strokeWidth="4" strokeLinecap="round" strokeDasharray="3 3" />
        <circle cx="50" cy="50" r="5" fill="#FDE047" />
      </svg>
    </div>
  );
}

export function VerkehrsinfoHessenLogo({ className = "w-7 h-7" }: LogoProps) {
  return (
    <div className={`rounded-lg bg-[#b81d13] border border-amber-400/50 flex items-center justify-center p-1.5 shadow-sm shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-white">
        <polygon points="50,14 88,82 12,82" stroke="currentColor" strokeWidth="7" strokeLinejoin="round" fill="#DC2626" />
        <rect x="46" y="38" width="8" height="24" rx="4" fill="#FFFFFF" />
        <circle cx="50" cy="71" r="5" fill="#FFFFFF" />
      </svg>
    </div>
  );
}

export function getSourceLogo(sourceId: string, className = "w-7 h-7") {
  if (sourceId.includes("uba") || sourceId.includes("luftdaten") || sourceId.includes("air-data")) {
    return <UbaLogo className={className} />;
  }
  if (sourceId.includes("hessen-verkehr") || sourceId.includes("verkehrsservice") || sourceId.includes("verkehrsinfo")) {
    return <VerkehrsinfoHessenLogo className={className} />;
  }
  if (sourceId.includes("opensensemap") || sourceId.includes("sensebox") || sourceId.includes("osem")) {
    return <OpenSenseMapLogo className={className} />;
  }
  if (sourceId.includes("vrn-realtime") || sourceId === "vrn" || sourceId.includes("gtfs")) {
    return <VrnLogo className={className} />;
  }
  if (sourceId.includes("rast") || sourceId.includes("truck-parking")) {
    return <RastLogo className={className} />;
  }
  if (sourceId.includes("nextbike") || sourceId.includes("bike")) {
    return <NextbikeLogo className={className} />;
  }
  if (sourceId.includes("zakb")) {
    return <ZakbLogo className={className} />;
  }
  if (sourceId.includes("bkg")) {
    return <BkgLogo className={className} />;
  }
  if (sourceId.includes("bnetza") || sourceId.includes("charger")) {
    return <BnetzaLogo className={className} />;
  }
  if (sourceId.includes("copernicus") || sourceId.includes("sentinel") || sourceId.includes("satellite")) {
    return <CopernicusLogo className={className} />;
  }
  if (sourceId.includes("invekos") || sourceId.includes("crop") || sourceId.includes("agriculture") || sourceId.includes("field")) {
    return <InvekosLogo className={className} />;
  }
  if (sourceId.includes("hessen") || sourceId.includes("hlnug") || sourceId.includes("groundwater")) {
    return <HessenLogo className={className} />;
  }
  if (sourceId.includes("wahl") || sourceId.includes("election")) {
    return <WahlleiterinLogo className={className} />;
  }
  if (sourceId.includes("cross7")) {
    return <Cross7Logo className={className} />;
  }
  if (sourceId.includes("osm") || sourceId.includes("address")) {
    return <OsmLogo className={className} />;
  }
  if (sourceId.includes("pegel") || sourceId.includes("flood") || sourceId.includes("water")) {
    return <PegelLogo className={className} />;
  }
  if (sourceId.includes("traffic") || sourceId.includes("autobahn")) {
    return <AutobahnLogo className={className} />;
  }
  if (sourceId.includes("blitz") || sourceId.includes("lightning")) {
    return <BlitzortungLogo className={className} />;
  }
  if (
    sourceId.includes("weather") ||
    sourceId.includes("dwd") ||
    sourceId.includes("radolan") ||
    sourceId.includes("mosmix")
  ) {
    return <WeatherLogo className={className} />;
  }
  if (sourceId.includes("shake")) {
    return <ShakeLogo className={className} />;
  }
  if (sourceId.includes("smartcity") || sourceId.includes("soil") || sourceId.includes("scs")) {
    return <SmartCityLogo className={className} />;
  }
  return <TtnLogo className={className} />;
}
