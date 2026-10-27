import type { DemographicSummary, Municipality } from "./demographicsData";
import type { HousingStock, RealEstateSummary } from "./realestateData";

const IDS = ["buerstadt", "lampertheim", "biblis", "gross-rohrheim"];
const NAMES = ["Bürstadt", "Lampertheim", "Biblis", "Groß-Rohrheim"];
const valid = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
function sum(values: unknown[]): number | null {
  return values.length && values.every(valid) ? values.reduce((a, b) => a + b, 0) : null;
}
function complete<T>(rows: T[], keys: string[], key: (row: T) => string): T[] {
  return keys.every(k => rows.filter(r => key(r) === k).length === 1)
    ? keys.map(k => rows.find(r => key(r) === k)!) : [];
}
function year(values: unknown[]) {
  return values.length && values.every(v => valid(v) && Number.isInteger(v) && v > 0 && v === values[0])
    ? values[0] as number : null;
}
function weighted(values: unknown[], weights: unknown[]) {
  const denominator = sum(weights);
  if (!values.every(valid) || !weights.every(v => valid(v) && v >= 0) || denominator == null || denominator <= 0) return null;
  return values.reduce((total, value, i) => total + value * (weights[i] as number), 0) / denominator;
}
export function demographicView(rows: DemographicSummary[], municipalities: Municipality[], selected: string) {
  const blank = { name: selected === "all" ? "Vier Ried-Kommunen" : selected,
    total_population: null, population_density: null, foreign_share_pct: null,
    births: null, deaths: null, inflow: null, outflow: null, net_migration: null,
    schools_count: null, kitas_count: null, avg_household_size: null, year: null };
  if (selected !== "all") return rows.filter(r => r.municipality_id === selected).length === 1
    ? rows.find(r => r.municipality_id === selected)! : blank;
  const scope = complete(rows, IDS, r => r.municipality_id);
  const period = year(scope.map(r => r.year));
  if (!period) return blank;
  const population = sum(scope.map(r => r.total_population));
  const areas = complete(municipalities, IDS, r => r.id);
  const area = areas.length ? sum(areas.map(r => r.area_sqkm)) : null;
  return { ...blank, year: period, total_population: population,
    population_density: population != null && area != null && area > 0 && areas.every(r => r.area_sqkm > 0) ? population / area : null,
    foreign_share_pct: weighted(scope.map(r => r.foreign_share_pct), scope.map(r => r.total_population)),
    births: sum(scope.map(r => r.births)), deaths: sum(scope.map(r => r.deaths)),
    inflow: sum(scope.map(r => r.inflow)), outflow: sum(scope.map(r => r.outflow)),
    net_migration: sum(scope.map(r => r.net_migration)), schools_count: sum(scope.map(r => r.schools_count)),
    kitas_count: sum(scope.map(r => r.kitas_count)),
    // No household counts or matching household-population denominator in this contract.
    avg_household_size: null };
}
export function estateView(rows: RealEstateSummary[], selected: string) {
  const match = rows.filter(r => r.municipality.toLowerCase() === selected.toLowerCase());
  if (selected !== "all" && match.length === 1) return match[0];
  // The summary contract has no reference periods or price sample weights.
  return { municipality: selected === "all" ? "Vier Ried-Kommunen" : selected,
    total_dwellings: null, vacancy_rate_pct: null, avg_living_space_sqm: null,
    avg_land_value_residential: null, avg_rent_cold_sqm: null, avg_apartment_buy_sqm: null,
    recent_permits_dwellings: null, recent_completions_dwellings: null, active_bplaene_count: null };
}
const wholeMunicipality = (row: HousingStock) => !row.district || ["Gesamtstadt", "Gesamtgemeinde", "Gemeinde", "Stadt"].includes(row.district);
export function stockView(rows: HousingStock[], selected: string) {
  const blank = { municipality: selected === "all" ? "Vier Ried-Kommunen" : selected,
    reference_year: null, total_buildings: null, residential_buildings: null, total_dwellings: null,
    avg_living_space_sqm: null, vacant_dwellings: null, vacancy_rate_pct: null,
    age_distribution: {} as Record<string, number | null>, building_types: {} as Record<string, number | null>,
    heating_energy: {} as Record<string, number | null> };
  if (selected !== "all") {
    const match = rows.filter(r => r.municipality.toLowerCase() === selected.toLowerCase() && wholeMunicipality(r));
    return match.length === 1 ? match[0] : blank;
  }
  const scope = complete(rows.filter(wholeMunicipality), NAMES, r => r.municipality);
  const period = year(scope.map(r => r.reference_year));
  if (!period) return blank;
  const dwellings = sum(scope.map(r => r.total_dwellings));
  const vacant = sum(scope.map(r => r.vacant_dwellings));
  function counts(field: "age_distribution" | "building_types") {
    const keys = new Set(scope.flatMap(r => Object.keys(r[field] ?? {})));
    return Object.fromEntries([...keys].map(key => [key, sum(scope.map(r => r[field]?.[key]))]));
  }
  return { ...blank, reference_year: period, total_buildings: sum(scope.map(r => r.total_buildings)),
    residential_buildings: sum(scope.map(r => r.residential_buildings)), total_dwellings: dwellings,
    avg_living_space_sqm: weighted(scope.map(r => r.avg_living_space_sqm), scope.map(r => r.total_dwellings)),
    vacant_dwellings: vacant, vacancy_rate_pct: dwellings != null && dwellings > 0 && vacant != null && vacant >= 0 && vacant <= dwellings ? vacant / dwellings * 100 : null,
    age_distribution: counts("age_distribution"), building_types: counts("building_types"),
    // Heating percentages do not declare whether their denominator is buildings, dwellings or systems.
    heating_energy: {} as Record<string, number | null> };
}
export function statNumber(value: unknown, digits = 1) {
  return valid(value) ? value.toLocaleString("de-DE", { maximumFractionDigits: digits }) : "–";
}
export function signedStat(value: unknown) {
  return valid(value) ? `${value > 0 ? "+" : ""}${statNumber(value)}` : "–";
}
