"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, MapPin, RefreshCw, Search, TrainFront } from "lucide-react";
import {
  facilityStatus, fetchBahn, filterStations, infrastructureMarkers, isFresh,
  objectLocations, objectTypeLabel, osmLocation,
  type BahnFacility, type BahnSnapshot, type BahnStation,
} from "@/lib/bahnData";
import BahnSensors from "./BahnSensors";
import BahnBoards from "./BahnBoards";

const BahnMap = dynamic(() => import("./BahnMap"), {
  ssr: false,
  loading: () => <p className="p-6 text-slate-400" role="status">Karte wird geladen …</p>,
});

interface LoadState<T> {
  snapshot: BahnSnapshot<T> | null;
  loading: boolean;
  error: string | null;
}
const INITIAL = { snapshot: null, loading: true, error: null };
const BADGES: Record<string, string> = {
  available: "border-emerald-500/40 text-emerald-300 bg-emerald-500/10",
  unavailable: "border-rose-500/40 text-rose-300 bg-rose-500/10",
  partial: "border-amber-500/40 text-amber-300 bg-amber-500/10",
  unknown: "border-slate-600 text-slate-300 bg-slate-800",
  stale: "border-amber-500/40 text-amber-300 bg-amber-500/10",
};

function dateLabel(value: string) {
  return new Date(value).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "medium" });
}

function PublicationInfo({ title, state, now }: { title: string; state: LoadState<unknown>; now: number }) {
  const fresh = isFresh(state.snapshot, now);
  return <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 text-sm space-y-2">
    <h3 className="font-semibold text-slate-200">{title}</h3>
    <p className={fresh ? "text-emerald-300" : "text-amber-300"}>
      {state.snapshot ? (fresh ? "Innerhalb der Gültigkeit" : "Gespeicherte Daten veraltet") : (state.loading ? "Daten werden geladen …" : "Keine Daten verfügbar")}
    </p>
    {state.snapshot && <dl className="text-xs text-slate-400 space-y-1">
      <div><dt className="inline">Datenstand: </dt><dd className="inline"><time dateTime={state.snapshot.sourceUpdatedAt}>{dateLabel(state.snapshot.sourceUpdatedAt)}</time></dd></div>
      <div><dt className="inline">Abgerufen: </dt><dd className="inline"><time dateTime={state.snapshot.fetchedAt}>{dateLabel(state.snapshot.fetchedAt)}</time></dd></div>
      <div><dt className="inline">Gültig bis: </dt><dd className="inline"><time dateTime={state.snapshot.expiresAt}>{dateLabel(state.snapshot.expiresAt)}</time></dd></div>
    </dl>}
    {state.error && <p className="text-amber-300" role="status">Aktualisierung fehlgeschlagen: {state.error}</p>}
    {state.loading && state.snapshot && <p className="text-slate-400">Aktualisierung läuft …</p>}
  </div>;
}

export default function BahnClient() {
  const [inventory, setInventory] = useState<LoadState<BahnStation[]>>(INITIAL);
  const [facilities, setFacilities] = useState<LoadState<BahnFacility[]>>(INITIAL);
  const [query, setQuery] = useState("");
  const [stationId, setStationId] = useState("");
  const [objectId, setObjectId] = useState("");
  const [type, setType] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const refresh = useRef<() => void>(() => {});

  useEffect(() => {
    let controller: AbortController | null = null;
    let disposed = false;
    const load = () => {
      if (document.hidden) return;
      controller?.abort();
      const pending = new AbortController();
      controller = pending;
      setInventory(state => ({ ...state, loading: true }));
      setFacilities(state => ({ ...state, loading: true }));
      const failed = <T,>(previous: LoadState<T>, error: unknown): LoadState<T> => ({
        ...previous, loading: false, error: error instanceof Error ? error.message : "Abruf fehlgeschlagen.",
      });
      // Independently publish either result: an unavailable status feed must not hide the inventory.
      void fetchBahn("stations", pending.signal).then(snapshot => {
        if (!disposed && !pending.signal.aborted) setInventory({ snapshot, loading: false, error: null });
      }).catch(error => {
        if (!disposed && !pending.signal.aborted) setInventory(state => failed(state, error));
      });
      void fetchBahn("facilities", pending.signal).then(snapshot => {
        if (!disposed && !pending.signal.aborted) setFacilities({ snapshot, loading: false, error: null });
      }).catch(error => {
        if (!disposed && !pending.signal.aborted) setFacilities(state => failed(state, error));
      });
    };
    refresh.current = load;
    load();
    const poll = window.setInterval(load, 60000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const visibility = () => { if (!document.hidden) { setNow(Date.now()); load(); } };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(poll);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  const stations = useMemo(() => [...(inventory.snapshot?.data ?? [])]
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "de")), [inventory.snapshot]);
  const visible = useMemo(() => filterStations(stations, query), [stations, query]);
  const selected = visible.find(station => station.id === stationId) ?? visible[0];
  const facilityIndex = useMemo(() => new Map(facilities.snapshot?.data.map(facility => [facility.id, facility]) ?? []), [facilities.snapshot]);
  const stationFacilities = selected?.components.filter(component =>
    ["LiftEquipment", "EscalatorEquipment", "TravelatorEquipment"].includes(component.type)) ?? [];
  const types = [...new Set(selected?.components.map(component => component.type) ?? [])];
  const effectiveType = types.includes(type) ? type : "";
  const components = selected?.components.filter(component => !effectiveType || component.type === effectiveType) ?? [];
  const inventoryFresh = isFresh(inventory.snapshot, now);
  const statusTime = facilities.snapshot
    ? Date.parse(isFresh(facilities.snapshot, now) ? facilities.snapshot.sourceUpdatedAt : facilities.snapshot.expiresAt)
    : 0;
  // Keep marker identity stable between expiry transitions so open popups survive clock ticks.
  const markers = useMemo(() => selected && inventoryFresh
    ? infrastructureMarkers([selected], facilities.snapshot, statusTime) : [], [selected, inventoryFresh, facilities.snapshot, statusTime]);

  const chooseObject = (id: string) => {
    const providerId = selected?.components.find(object => object.id === id)?.provider_id ?? id;
    setObjectId(providerId);
    setType("");
    window.requestAnimationFrame(() => {
      const row = document.getElementById(id === selected?.id ? `bahn-station-${id}` : `bahn-object-${providerId}`);
      row?.scrollIntoView({ block: "center" });
      row?.focus({ preventScroll: true });
    });
  };

  return <div className="space-y-6">
    <section aria-label="Datenquellen und Aktualität" className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-300">Quelle: <a className="text-emerald-300 underline" href="https://github.com/dbinfrago/openstation-docs" target="_blank" rel="noopener noreferrer">DB InfraGO OpenStation</a> · CC0 · Zeiten in Europe/Berlin</p>
        <button type="button" onClick={() => refresh.current()} disabled={inventory.loading || facilities.loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50">
          <RefreshCw className="size-4" aria-hidden="true" /> Aktualisieren
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <PublicationInfo title="Bahnhofsinfrastruktur · NeTEx" state={inventory} now={now} />
        <PublicationInfo title="Anlagenzustände · SIRI FM" state={facilities} now={now} />
      </div>
    </section>

    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-4 self-start">
        <label htmlFor="bahn-suche" className="block text-sm font-medium">Bahnhof suchen</label>
        <div className="relative">
          <Search className="absolute left-3 top-3 size-4 text-slate-400" aria-hidden="true" />
          <input id="bahn-suche" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, EVA oder DS100" className="w-full rounded-lg border border-slate-600 bg-slate-950 py-2.5 pl-9 pr-3 text-sm" />
        </div>
        <p className="text-xs text-slate-400" role="status">{inventory.snapshot ? `${visible.length} von ${stations.length} erfassten Bahnhöfen` : "Bahnhofsliste wird geladen"}</p>
        <nav aria-label="Bahnhof auswählen" className="space-y-2">
          {visible.map(station => <button key={station.id} type="button" aria-pressed={selected?.id === station.id}
            onClick={() => { setStationId(station.id); setObjectId(""); setType(""); }}
            className={`w-full rounded-xl border p-3 text-left text-sm ${selected?.id === station.id ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200" : "border-slate-700 hover:bg-slate-800"}`}>
            <span className="block font-semibold">{station.name ?? "Bahnhof ohne Namen"}</span>
            <span className="mt-1 block text-xs text-slate-400">{station.ds100_codes.join(" · ") || "Kein DS100 gemeldet"}</span>
          </button>)}
        </nav>
        {inventory.snapshot && !visible.length && <p className="text-sm text-slate-400">Keine Bahnhöfe für diese Suche gefunden.</p>}
        {!inventory.loading && !inventory.snapshot && <p className="text-sm text-amber-300">Die Bahnhofsliste ist nicht verfügbar. Bitte erneut aktualisieren.</p>}
        <p className="text-xs text-slate-500">Erfasste Stationen entlang des Korridors Frankfurt–Mannheim und Hofheim (Ried). Die Anzahl entspricht dem zuletzt importierten Export.</p>
      </aside>

      {selected && <div className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
          <h2 id={`bahn-station-${selected.id}`} tabIndex={-1} className="flex items-center gap-2 text-2xl font-semibold"><TrainFront className="size-6 text-emerald-400" aria-hidden="true" />{selected.name}</h2>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
            <div><dt className="inline">EVA: </dt><dd className="inline text-slate-200">{selected.eva_numbers.join(", ") || "Nicht gemeldet"}</dd></div>
            <div><dt className="inline">DS100: </dt><dd className="inline text-slate-200">{selected.ds100_codes.join(", ") || "Nicht gemeldet"}</dd></div>
          </dl>
          <p className="text-sm text-slate-400">{selected.components.length} Infrastruktur-Objekte · {markers.length} Kartenpositionen einschließlich referenzierter Anlagenstandorte</p>
          {!selected.coordinates && <p className="text-xs text-slate-400">Für den Bahnhof selbst wurde keine Koordinate geliefert. Vorhandene Objektpositionen stehen unten in der Karte und Liste.</p>}
          {!isFresh(inventory.snapshot, now) && <p className="text-amber-300" role="status">Diese Bahnhofsinfrastruktur ist veraltet. Sie bleibt als letzte gespeicherte Auskunft sichtbar.</p>}
        </section>

        <section aria-labelledby="bahn-status-title" className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <h3 id="bahn-status-title" className="flex items-center gap-2 text-lg font-semibold"><ArrowUpDown className="size-5 text-emerald-400" aria-hidden="true" />Aufzüge &amp; Rolltreppen</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {stationFacilities.map(component => {
              const facility = facilityIndex.get(component.id);
              const status = facilityStatus(facility, facilities.snapshot?.expiresAt, now);
              return <article key={component.id} className="rounded-xl border border-slate-700 p-4 space-y-2">
                <h4 className="font-medium">{component.name ?? objectTypeLabel(component)}</h4>
                <p><span className={`inline-block rounded-full border px-2 py-1 text-xs ${BADGES[status.tone]}`}>{status.label}</span></p>
                {facility?.description && <p className="text-xs text-slate-400">DB-Hinweis: {facility.description}</p>}
                <details className="text-xs text-slate-400"><summary className="cursor-pointer">Anlagenkennung</summary><p className="mt-2 break-all">{component.provider_id}</p></details>
              </article>;
            })}
          </div>
          {!stationFacilities.length && <p className="text-sm text-slate-400">Für diesen Bahnhof wurden keine Aufzüge, Rolltreppen oder Fahrsteige im Infrastruktur-Export geliefert.</p>}
        </section>

        <section aria-labelledby="bahn-map-title" className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="bahn-map-title" className="flex items-center gap-2 text-lg font-semibold"><MapPin className="size-5 text-emerald-400" aria-hidden="true" />Objektpositionen</h3>
            {!!markers.length && <button type="button" aria-expanded={showMap} aria-controls="bahn-karte" onClick={() => setShowMap(value => !value)} className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800">{showMap ? "Karte ausblenden" : "Karte anzeigen"}</button>}
          </div>
          {markers.length ? <p className="text-sm text-slate-400">{markers.length} gemeldete Objektpositionen. Die Hintergrundkarte deckt das Ried ab; alle Positionen sind auch über OpenStreetMap erreichbar.</p> : <p className="text-sm text-slate-400">Für diesen Bahnhof sind momentan keine gültigen Objektpositionen für die Karte verfügbar.</p>}
          {showMap && markers.length > 0 && <div id="bahn-karte"><BahnMap markers={markers} onSelect={chooseObject} /></div>}
        </section>

        <BahnBoards station={selected} now={now} />
        <BahnSensors station={selected} stations={stations} fresh={inventoryFresh} now={now} onSelect={chooseObject} />

        <section id="bahn-infrastruktur" aria-labelledby="bahn-objects-title" className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4 scroll-mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="bahn-objects-title" className="text-lg font-semibold">Infrastruktur im Detail</h3>
            <label className="flex items-center gap-2 text-sm text-slate-400">Objekttyp
              <select value={effectiveType} onChange={event => setType(event.target.value)} className="rounded-lg border border-slate-600 bg-slate-950 p-2">
                <option value="">Alle Typen</option>
                {types.map(type => <option key={type} value={type}>{objectTypeLabel({ type })}</option>)}
              </select>
            </label>
          </div>
          <div className="max-h-[36rem] overflow-auto rounded-lg border border-slate-800" tabIndex={0} aria-label="Infrastruktur-Tabelle">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Infrastruktur-Objekte von {selected.name}, einschließlich Objekten ohne Koordinaten</caption>
              <thead className="sticky top-0 bg-slate-900 text-xs text-slate-400"><tr><th scope="col" className="p-3">Objekt</th><th scope="col" className="p-3">Typ</th><th scope="col" className="p-3">Position</th></tr></thead>
              <tbody>{components.map(component => <tr key={component.provider_id} id={`bahn-object-${component.provider_id}`} tabIndex={objectId === component.provider_id ? 0 : undefined} className={`border-t border-slate-800 ${objectId === component.provider_id ? "bg-emerald-500/10" : ""}`}>
                <td className="p-3 align-top"><span className="font-medium">{component.name ?? objectTypeLabel(component)}</span><details className="mt-1 text-xs text-slate-500"><summary className="cursor-pointer">Kennung</summary><p className="mt-1 break-all max-w-xs">{component.provider_id}</p></details></td>
                <td className="p-3 align-top text-slate-400">{objectTypeLabel(component)}</td>
                <td className="p-3 align-top text-xs">{objectLocations(selected, component).length ? objectLocations(selected, component).map(location => <div key={location.objectId} className="mb-2">
                  <a href={osmLocation(location.coordinates.latitude, location.coordinates.longitude)} target="_blank" rel="noopener noreferrer" className="text-emerald-300 underline whitespace-nowrap">{location.coordinates.latitude.toFixed(6)}, {location.coordinates.longitude.toFixed(6)}<span className="sr-only"> auf OpenStreetMap öffnen</span></a>
                  <span className="block mt-1 text-slate-400">{location.basis === "own" ? "Eigene Position" : "Referenzierter Anlagenstandort"}</span>
                  {location.basis === "equipment_place" && <button type="button" onClick={() => chooseObject(location.objectId)} className="text-emerald-300 underline">Standortdetails</button>}
                </div>) : <span className="text-slate-500">Keine Koordinate</span>}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {!components.length && <p className="text-sm text-slate-400">Keine Infrastruktur-Objekte für diese Auswahl vorhanden.</p>}
        </section>
      </div>}
    </div>
  </div>;
}
