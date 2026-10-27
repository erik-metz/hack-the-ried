"use client";

import React from "react";
import {
  ChevronDown,
  ChevronUp,
  Layers,
  Palette,
  SlidersHorizontal,
  Thermometer,
  RotateCcw,
  Satellite,
} from "lucide-react";
import { CATEGORIES, CATEGORY_IDS, DEFAULT_MAP_CATEGORIES, type Category, type MapMode } from "@/lib/mapData";
import { MAP_LAYER_IDS, type MapLayerId, DEFAULT_MAP_LAYERS } from "@/lib/urlState";
import {
  isLayerZoomRestricted,
  LAYER_CATEGORIES,
  type LayerCategory,
  countActiveLayers,
  countCategoryActiveLayers,
  getLayersByCategory,
} from "@/lib/mapPresets";

interface MapDarstellungBarProps {
  actions?: React.ReactNode;
  sensorCategories: Category[];
  onSensorCategoriesChange: (categories: Category[]) => void;
  sensorCounts: Record<Category, number>;
  mode: MapMode;
  onModeChange: (mode: MapMode) => void;
  satelliteMode?: "none" | "rgb" | "ndvi" | "ecostress" | "firms";
  onSatelliteModeChange?: (mode: "none" | "rgb" | "ndvi" | "ecostress" | "firms") => void;
  layers: Record<MapLayerId, boolean>;
  onLayerToggle: (id: MapLayerId, enabled: boolean) => void;
  onSetLayers: (layers: Record<MapLayerId, boolean>) => void;
  readingsAvailable?: boolean;
  activeClosuresCount?: number;
  isOpen: boolean;
  onToggleOpen: () => void;
  filteredCount: number;
  totalCount: number;
  zoom?: number;
}

export default function MapDarstellungBar({
  actions,
  sensorCategories,
  onSensorCategoriesChange,
  sensorCounts,
  mode,
  onModeChange,
  satelliteMode = "none",
  onSatelliteModeChange,
  layers,
  onLayerToggle,
  onSetLayers,
  readingsAvailable = true,
  activeClosuresCount = 7,
  isOpen,
  onToggleOpen,
  filteredCount,
  zoom = 12,
}: MapDarstellungBarProps) {
  const totalActive = countActiveLayers(layers) + sensorCategories.length;

  const toggleCategoryAll = (category: LayerCategory) => {
    const items = getLayersByCategory(category);
    const { active, total } = countCategoryActiveLayers(category, layers);
    const setAllTo = active < total;
    const next = { ...layers };
    for (const item of items) {
      next[item.id] = setAllTo;
    }
    onSetLayers(next);
  };

  const enableAllLayers = () => {
    onSensorCategoriesChange(CATEGORY_IDS);
    const next = Object.fromEntries(MAP_LAYER_IDS.map((id) => [id, true])) as Record<MapLayerId, boolean>;
    onSetLayers(next);
  };

  const disableAllLayers = () => {
    onSensorCategoriesChange([]);
    onSatelliteModeChange?.("none");
    const next = Object.fromEntries(MAP_LAYER_IDS.map((id) => [id, false])) as Record<MapLayerId, boolean>;
    onSetLayers(next);
  };

  const resetToDefaultLayers = () => {
    onSetLayers(DEFAULT_MAP_LAYERS);
    onSensorCategoriesChange(DEFAULT_MAP_CATEGORIES);
    onSatelliteModeChange?.("none");
  };

  const categories: LayerCategory[] = ["mobility", "environment", "infrastructure", "planning"];

  return (
    <div
      id="darstellung-control-panel"
      className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5 sm:p-4 shadow-lg transition-all duration-200"
      aria-label="Darstellung und Kartenfilter"
    >
      {/* Top Primary Bar */}
      <div className="flex flex-col gap-3">
        {/* Left: View Mode Segmented Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 uppercase tracking-wider mr-1">
            <Palette className="size-3.5 text-emerald-400" />
            <span>Darstellung:</span>
          </div>

          <div
            className="inline-flex rounded-xl bg-slate-950/70 p-1 border border-slate-800 shadow-inner"
            role="group"
            aria-label="Darstellungsmodus"
          >
            <button
              type="button"
              aria-pressed={mode === "category"}
              onClick={() => onModeChange("category")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-all ${
                mode === "category"
                  ? "bg-slate-800 text-emerald-300 shadow-sm border border-emerald-500/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Stationen nach Themengebieten farbig und mit Symbolen darstellen"
            >
              <Palette className="size-3.5" />
              <span>Themenfarben</span>
            </button>
            <button
              type="button"
              aria-pressed={mode === "temperature"}
              disabled={!readingsAvailable}
              onClick={() => onModeChange("temperature")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-all ${
                mode === "temperature"
                  ? "bg-slate-800 text-amber-300 shadow-sm border border-amber-500/40"
                  : "text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
              title={
                readingsAvailable
                  ? "Flächige Temperatur-Interpolation und Hitzekarte im Ried"
                  : "Temperaturdaten derzeit nicht verfügbar"
              }
            >
              <Thermometer className="size-3.5 text-amber-400" />
              <span>Temperatur · °C</span>
            </button>
          </div>

          {/* Copernicus Sentinel-2 Satellite Switcher */}
          <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto border-t sm:border-t-0 sm:border-l border-slate-800 pt-2 sm:pt-0 sm:pl-3">
            <span className="text-[11px] font-semibold text-slate-300 inline-flex items-center gap-1">
              <Satellite className="size-3 text-cyan-400" />
              <span>Satellit:</span>
            </span>
            <div
              className="inline-flex flex-wrap rounded-xl bg-slate-950/70 p-1 border border-slate-800 shadow-inner"
              role="group"
              aria-label="Umweltdaten aus Satellitenaufnahmen"
            >
              <button
                type="button"
                aria-pressed={satelliteMode === "none" || !satelliteMode}
                onClick={() => onSatelliteModeChange?.("none")}
                className={`rounded-lg px-2 py-1 text-xs font-medium transition-all ${
                  satelliteMode === "none" || !satelliteMode
                    ? "bg-slate-800 text-slate-200 border border-slate-700 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Keine Satelliten-Rasterebene anzeigen"
              >
                Aus
              </button>
              <button
                type="button"
                aria-pressed={satelliteMode === "rgb"}
                onClick={() => onSatelliteModeChange?.("rgb")}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  satelliteMode === "rgb"
                    ? "bg-blue-950/90 text-blue-300 shadow-sm border border-blue-500/50 font-medium"
                    : "text-slate-400 hover:text-blue-300"
                }`}
                title="Copernicus Sentinel-2 Echtfarben-Satellitenbild (20m RGB-Ausschnitt)"
              >
                <span>🌍</span>
                <span>Echtfarben (RGB)</span>
              </button>
              <button
                type="button"
                aria-pressed={satelliteMode === "ndvi"}
                onClick={() => onSatelliteModeChange?.("ndvi")}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  satelliteMode === "ndvi"
                    ? "bg-emerald-950/90 text-emerald-300 shadow-sm border border-emerald-500/50 font-medium"
                    : "text-slate-400 hover:text-emerald-300"
                }`}
                title="Copernicus Sentinel-2 NDVI: Vegetationskontrast aus wolkenmaskierten Rasterdaten"
              >
                <span>🌱</span>
                <span>NDVI</span>
              </button>
              {([['ecostress', 'Oberflächentemperatur'], ['firms', 'Thermische Auffälligkeiten']] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={satelliteMode === value}
                  onClick={() => onSatelliteModeChange?.(value)}
                  className={`rounded-lg px-2.5 py-1 text-xs ${satelliteMode === value ? 'bg-slate-800 text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>



        </div>

        {/* Actions and filter summary share the full panel width. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t pt-3 border-slate-800/80">
          {actions}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="text-xs text-slate-400 whitespace-nowrap">
            <span className="text-slate-200 font-medium">{filteredCount}</span> Stationen im Themenfilter
          </div>

          <button
            type="button"
            onClick={onToggleOpen}
            aria-expanded={isOpen}
            aria-controls="map-filter-groups"
            className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-all border ${
              isOpen
                ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-300 shadow-sm"
                : "bg-slate-950/70 border-slate-700 text-slate-200 hover:border-slate-500 hover:text-white"
            }`}
            title="Sensorstationen und Kartenebenen gemeinsam filtern"
          >
            <Layers className="size-3.5 text-emerald-400" />
            <span>Filter &amp; Ebenen</span>
            <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[11px]">{totalActive} aktiv</span>
            {isOpen ? (
              <ChevronUp className="size-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="size-3.5 text-slate-400" />
            )}
          </button>
          </div>
        </div>
      </div>

      {/* Expandable Layer Management Drawer */}
      {isOpen && (
        <div id="map-filter-groups" className="mt-4 pt-4 border-t border-slate-800 space-y-4 animate-in fade-in-50 duration-200">
          {/* Quick global layer action toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/50 rounded-xl p-2.5 border border-slate-800/80">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="size-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-300">Sensoren & Kartenebenen</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={enableAllLayers}
                className="text-xs text-slate-400 hover:text-emerald-300 transition-colors"
                title="Alle Sensorgruppen und Kartenebenen anzeigen"
              >
                Alle an
              </button>
              <span className="text-slate-700">·</span>
              <button
                type="button"
                onClick={disableAllLayers}
                className="text-xs text-slate-400 hover:text-rose-300 transition-colors"
                title="Alle Sensorgruppen und Kartenebenen ausblenden"
              >
                Alle aus
              </button>
              <span className="text-slate-700">·</span>
              <button
                type="button"
                onClick={resetToDefaultLayers}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                title="Standard-Ebenen wiederherstellen"
              >
                <RotateCcw className="size-3" />
                <span>Standard</span>
              </button>
            </div>
          </div>

          {/* 4 Thematic Columns / Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2.5" aria-label="Sensorstationen">
              <div className="flex items-center justify-between pb-1 border-b border-slate-800/80">
                <h4 className="text-xs font-semibold text-slate-200">Sensorstationen <span className="text-slate-400">{sensorCategories.length}/{CATEGORY_IDS.length}</span></h4>
                <button type="button" onClick={() => onSensorCategoriesChange(sensorCategories.length === CATEGORY_IDS.length ? [] : CATEGORY_IDS)} className="text-[11px] text-slate-400 hover:text-emerald-300" aria-label={sensorCategories.length === CATEGORY_IDS.length ? "Alle Sensorgruppen ausblenden" : "Alle Sensorgruppen anzeigen"}>
                  {sensorCategories.length === CATEGORY_IDS.length ? "Alle aus" : "Alle an"}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">Messstationen nach Thema auswählen. Ein Standort kann zu mehreren Themen gehören.</p>
              <div className="flex flex-col gap-1.5" role="group" aria-label="Sensorgruppen auswählen">
                {CATEGORY_IDS.filter(category => sensorCounts[category] > 0).map(category => {
                  const enabled = sensorCategories.includes(category);
                  return <button key={category} type="button" aria-pressed={enabled}
                    onClick={() => onSensorCategoriesChange(enabled ? sensorCategories.filter(item => item !== category) : [...sensorCategories, category])}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs ${enabled ? "bg-slate-900 border-emerald-500/50 text-slate-200" : "border-slate-800 text-slate-400 hover:bg-slate-900"}`}>
                    <span className="flex items-center gap-2"><svg viewBox="0 0 24 24" fill="none" stroke={CATEGORIES[category].color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0" aria-hidden="true"><path d={CATEGORIES[category].path} /></svg>{CATEGORIES[category].label} <span className="text-slate-400">{sensorCounts[category]}</span></span>
                    <span className={enabled ? "text-emerald-300" : "text-slate-500"}>{enabled ? "An" : "Aus"}</span>
                  </button>;
                })}
              </div>
            </section>
            {categories.map((catKey) => {
              const catInfo = LAYER_CATEGORIES[catKey];
              const catLayers = getLayersByCategory(catKey);
              const { active, total } = countCategoryActiveLayers(catKey, layers);
              const allCategoryActive = active === total;

              return (
                <div
                  key={catKey}
                  className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2.5 hover:border-slate-700/80 transition-colors"
                >
                  {/* Category Header */}
                  <div className="flex items-center justify-between pb-1 border-b border-slate-800/80">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{catInfo.icon}</span>
                      <h4 className="text-xs font-semibold text-slate-200">
                        {catInfo.label}
                      </h4>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400">
                        {active}/{total}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleCategoryAll(catKey)}
                      className="text-[11px] font-medium text-slate-400 hover:text-emerald-300 transition-colors"
                      title={`${catInfo.label}: Alle ${allCategoryActive ? "aus" : "an"}`}
                    >
                      {allCategoryActive ? "Aus" : "An"}
                    </button>
                  </div>

                  {/* Layer Toggle Chips */}
                  <div className="flex flex-col gap-1.5">
                    {catLayers.map((layerMeta) => {
                      const isEnabled = Boolean(layers[layerMeta.id]);
                      const isZoomRestricted = isLayerZoomRestricted(layerMeta.id, zoom);

                      let extraBadge = "";
                      if (layerMeta.id === "closures" && activeClosuresCount > 0) {
                        extraBadge = ` (${activeClosuresCount})`;
                      } else if (isZoomRestricted) {
                        extraBadge = " · Details beim Hineinzoomen";
                      }

                      return (
                        <button
                          key={layerMeta.id}
                          type="button"
                          aria-pressed={isEnabled}
                          onClick={() => onLayerToggle(layerMeta.id, !isEnabled)}
                          className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs transition-all text-left ${
                            isEnabled
                              ? `bg-slate-900 border ${layerMeta.highlightColor || "border-emerald-500/50 text-emerald-300"} font-medium shadow-sm`
                              : "bg-slate-950/40 border border-slate-800/70 text-slate-400 hover:bg-slate-900 hover:text-slate-300"
                          }`}
                          title={`${layerMeta.label}: ${layerMeta.description}${
                            isZoomRestricted ? ` (Details ab Zoom ${layerMeta.minZoom})` : ""
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0">{layerMeta.icon}</span>
                            <span className="truncate">
                              {layerMeta.label}
                              {extraBadge && (
                                <span className="text-[10px] opacity-80 font-normal ml-0.5">
                                  {extraBadge}
                                </span>
                              )}
                            </span>
                          </div>

                          <div className="shrink-0 ml-2">
                            {isEnabled ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700/50">
                                An
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-slate-900 text-slate-500 border border-slate-800">
                                Aus
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
