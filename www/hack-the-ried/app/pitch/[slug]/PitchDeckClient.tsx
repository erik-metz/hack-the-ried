"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Maximize2, Minimize2, Copy, Check } from "lucide-react";
import type { PitchDeck, PitchSlide } from "@/lib/pitchData";
import DataConnectionsDiagram from "../DataConnectionsDiagram";
import CollectedDataEvidence from "../CollectedDataEvidence";

function SlideBody({ slide, startedAt }: { slide: PitchSlide; startedAt: number }) {
  if (slide.layout === "data-connections") return <DataConnectionsDiagram />;
  if (slide.layout === "collected-evidence") return <CollectedDataEvidence startedAt={startedAt} />;
  if (slide.website) return <iframe
    src={slide.website.src} title={slide.website.title}
    className="h-[48vh] min-h-[260px] w-full rounded-xl border border-slate-700 bg-white"
    referrerPolicy="no-referrer" loading="lazy"
    onLoad={(event) => {
      if (slide.website?.src.startsWith("/")) {
        event.currentTarget.contentDocument?.getElementById("ried-map")?.scrollIntoView({ block: "start" });
      }
    }}
  />;
  if (slide.teamMembers) return <div className="grid gap-6 md:grid-cols-3">
    {slide.teamMembers.map((member) => <article key={member.name} className="text-center">
      <div className="relative mx-auto h-40 w-40 lg:h-44 lg:w-44 overflow-hidden rounded-2xl border border-slate-700">
        <Image src={member.imageSrc} alt={member.name} fill className="object-cover object-top" sizes="176px" priority />
      </div>
      <h3 className="mt-4 text-2xl font-bold">{member.name}</h3>
      <p className="mt-1 text-base text-slate-400">{member.location}</p>
      <p className="mt-2 text-lg text-emerald-400">{member.role}</p>
    </article>)}
  </div>;
  if (slide.specificAsks) return <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
    {slide.specificAsks.map((ask, index) => <article key={ask.id} className={`border-t-2 pt-4 ${index < 2 ? "border-emerald-500" : "border-slate-700"}`}>
      <h3 className="text-xl font-semibold">{ask.title}</h3>
      <p className="mt-2 text-lg leading-relaxed text-slate-300">{ask.description}</p>
    </article>)}
  </div>;
  return <div className={`grid items-center gap-8 ${slide.imageVisual ? "md:grid-cols-2" : "max-w-5xl"}`}>
    {slide.imageVisual && <figure>
      <div className="relative aspect-video max-h-[38vh] overflow-hidden rounded-xl">
        <Image src={slide.imageVisual.src} alt={slide.imageVisual.alt} fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
      </div>
      {slide.imageVisual.caption && <figcaption className="mt-3 text-sm text-slate-400">{slide.imageVisual.caption}</figcaption>}
    </figure>}
    <div className="space-y-6">{slide.bullets?.map((bullet) => <div key={bullet.title} className="border-l-2 border-emerald-500 pl-5">
      <h3 className="text-xl md:text-2xl font-semibold">{bullet.title}</h3>
      <p className="mt-2 text-lg leading-relaxed text-slate-300">{bullet.description}</p>
    </div>)}</div>
  </div>;
}

export default function PitchDeckClient({ deck }: { deck: PitchDeck }) {
  const [index, setIndex] = useState(0);
  const [scrollMode, setScrollMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  // This timestamp stays fixed throughout the presentation, including slide changes.
  const [startedAt] = useState(() => Date.now());
  const slide = deck.slides[index];
  const next = useCallback(() => setIndex((value) => Math.min(value + 1, deck.slides.length - 1)), [deck.slides.length]);
  const previous = useCallback(() => setIndex((value) => Math.max(value - 1, 0)), []);
  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  }, []);
  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))) return;
      if (["ArrowRight", " ", "PageDown"].includes(event.key)) { event.preventDefault(); next(); }
      else if (["ArrowLeft", "PageUp"].includes(event.key)) { event.preventDefault(); previous(); }
      else if (event.key.toLowerCase() === "f") { event.preventDefault(); fullscreen(); }
      else if (event.key === "Home") setIndex(0);
      else if (event.key === "End") setIndex(deck.slides.length - 1);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("fullscreenchange", syncFullscreen); window.removeEventListener("keydown", onKey); };
  }, [deck.slides.length, fullscreen, next, previous]);
  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }
  return <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
    <header className="sticky top-0 z-40 bg-slate-950/95 border-b border-slate-800 print:hidden">
      <div className="max-w-7xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/pitch" aria-label="Zurück zur Pitch-Übersicht" className="rounded-lg border border-slate-700 p-2"><ArrowLeft className="h-4 w-4" /></Link>
          <h1 className="truncate text-base font-semibold">{deck.title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setScrollMode((value) => !value)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm">{scrollMode ? "Folien anzeigen" : "Alle Folien"}</button>
          <button type="button" onClick={copyLink} aria-label="Präsentationslink kopieren" className="rounded-lg border border-slate-700 p-2">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
          <button type="button" onClick={fullscreen} aria-label="Vollbild umschalten" className="hidden sm:block rounded-lg border border-slate-700 p-2">{isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
        </div>
      </div>
      {!scrollMode && <div className="h-1 bg-slate-900"><div className="h-1 bg-emerald-500 transition-all" style={{ width: `${(index + 1) / deck.slides.length * 100}%` }} /></div>}
    </header>
    <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-5 flex flex-col justify-center">
      {scrollMode ? <div className="space-y-16">{deck.slides.map((item) => <section key={item.id} className="space-y-5 border-b border-slate-800 pb-12">
        <p className="text-sm text-emerald-400">{item.stepLabel} · {deck.badge}</p>
        <h2 className="text-3xl font-bold">{item.title}</h2><p className="text-lg text-slate-300">{item.lead}</p>
        <SlideBody slide={item} startedAt={startedAt} />
      </section>)}</div> : <section key={slide.id} className="space-y-5">
        <div className="flex justify-between gap-4 text-sm text-emerald-400"><span>{slide.stepLabel} · {deck.badge}</span><span className="text-slate-400">Folie {index + 1} / {deck.slides.length}</span></div>
        <h2 className={`text-3xl md:text-4xl ${slide.layout === "collected-evidence" ? "lg:text-4xl" : "lg:text-5xl"} font-bold leading-tight`}>{slide.title}</h2>
        {slide.lead && <p className="max-w-6xl text-lg leading-relaxed text-slate-300">{slide.lead}</p>}
        <SlideBody slide={slide} startedAt={startedAt} />
      </section>}
    </main>
    {!scrollMode && <footer className="sticky bottom-0 z-30 bg-slate-950/95 border-t border-slate-800 py-3 px-4 print:hidden">
      <div className="max-w-7xl mx-auto flex justify-between items-center gap-4">
        <span className="text-sm text-slate-400">{index + 1} / {deck.slides.length}</span>
        <div className="hidden md:flex gap-2">{deck.slides.map((item, position) => <button key={item.id} type="button" onClick={() => setIndex(position)} aria-label={`Zu Folie ${position + 1} springen`} aria-current={position === index ? "step" : undefined} className={`h-2 rounded-full ${position === index ? "w-8 bg-emerald-400" : "w-2 bg-slate-700"}`} />)}</div>
        <div className="flex gap-2"><button type="button" onClick={previous} disabled={index === 0} className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Zurück</button>
          <button type="button" onClick={next} disabled={index === deck.slides.length - 1} className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 font-semibold text-slate-950 disabled:opacity-40">Weiter<ChevronRight className="h-4 w-4" /></button></div>
      </div>
    </footer>}
  </div>;
}
