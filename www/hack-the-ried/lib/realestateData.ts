import { collectedFetch as fetch } from "./collectedBackend";
import { env } from "@/env";

export interface RealEstateSummary {
  municipality: string;
  total_dwellings: number;
  vacancy_rate_pct: number;
  avg_living_space_sqm: number;
  avg_land_value_residential: number;
  avg_rent_cold_sqm: number;
  avg_apartment_buy_sqm?: number | null;
  recent_permits_dwellings: number;
  recent_completions_dwellings: number;
  active_bplaene_count: number;
}

export interface HousingStock {
  id: string;
  municipality: string;
  district?: string | null;
  reference_year: number;
  total_buildings: number;
  residential_buildings: number;
  total_dwellings: number;
  avg_living_space_sqm: number;
  vacant_dwellings: number;
  vacancy_rate_pct: number;
  age_distribution: Record<string, number>;
  building_types: Record<string, number>;
  heating_energy: Record<string, number>;
  source: string;
}

export interface BorisZone {
  id: string;
  zone_code: string;
  municipality: string;
  district?: string | null;
  stichtag: string;
  land_value_eur_sqm: number;
  zone_type: string;
  development_status: string;
  floor_space_index?: number | null;
  center_lat: number;
  center_lng: number;
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
  source: string;
}

export interface LandUsePolygon {
  id: string;
  municipality: string;
  district?: string | null;
  category: "agriculture" | "forest" | "settlement" | "industrial" | "water" | "traffic";
  category_detail: string;
  area_sqm?: number | null;
  area_hectares?: number | null;
  center_lat: number;
  center_lng: number;
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
  source: string;
}

export interface ConstructionPermit {
  id: string;
  municipality: string;
  year: number;
  residential_permits_count: number;
  residential_dwellings_count: number;
  residential_living_space_sqm?: number | null;
  non_residential_volume_m3?: number | null;
  completions_buildings_count: number;
  completions_dwellings_count: number;
  source: string;
}

export interface MarketBenchmark {
  id: string;
  municipality: string;
  year: number;
  metric_type: string;
  median_val?: number | null;
  avg_val: number;
  min_val?: number | null;
  max_val?: number | null;
  unit: string;
  transaction_count?: number | null;
  source: string;
  source_title?: string | null;
}

export interface DevelopmentPlan {
  id: string;
  municipality: string;
  district?: string | null;
  plan_name: string;
  plan_number?: string | null;
  status: "rechtskraeftig" | "in_aufstellung" | "im_verfahren";
  target_use: "Wohnen" | "Gewerbe" | "Mischgebiet" | "Sondergebiet";
  area_hectares?: number | null;
  resolution_year?: number | null;
  document_url?: string | null;
  center_lat: number;
  center_lng: number;
  geometry?: {
    type: string;
    coordinates: number[][][] | number[][][][];
  } | null;
}

export const AGE_BRACKET_LABELS: Record<string, { label: string; period: string; color: string }> = {
  pre_1919: { label: "Vor 1919", period: "Altbau & Gründerzeit", color: "#64748b" },
  "1919_1948": { label: "1919 – 1948", period: "Zwischenkriegszeit", color: "#94a3b8" },
  "1949_1978": { label: "1949 – 1978", period: "Nachkriegs- & Wirtschaftswunder", color: "#f59e0b" },
  "1979_1990": { label: "1979 – 1990", period: "Energiekrise & 80er", color: "#38bdf8" },
  "1991_2000": { label: "1991 – 2000", period: "Wendezeit & 90er", color: "#2dd4bf" },
  "2001_2010": { label: "2001 – 2010", period: "Jahrtausendwende", color: "#a78bfa" },
  post_2011: { label: "Ab 2011", period: "Moderner Neubau (KfW/EnEV)", color: "#10b981" },
};

export const HEATING_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  gas: { label: "Erdgas", color: "#f97316", icon: "Flame" },
  oil: { label: "Heizöl", color: "#eab308", icon: "Fuel" },
  heat_pump: { label: "Wärmepumpe (Strom)", color: "#10b981", icon: "Zap" },
  district_heating: { label: "Fernwärme", color: "#ef4444", icon: "Factory" },
  wood_pellets: { label: "Holz & Holzpellets", color: "#84cc16", icon: "TreePine" },
  solar_thermal: { label: "Solarthermie & Sonstige", color: "#06b6d4", icon: "Sun" },
};

export const BASELINE_REALESTATE_SUMMARIES: RealEstateSummary[] = [
  {
    municipality: "Lampertheim",
    total_dwellings: 16420,
    vacancy_rate_pct: 3.1,
    avg_living_space_sqm: 95.8,
    avg_land_value_residential: 510.0,
    avg_rent_cold_sqm: 9.2,
    avg_apartment_buy_sqm: 3100.0,
    recent_permits_dwellings: 108,
    recent_completions_dwellings: 96,
    active_bplaene_count: 2,
  },
  {
    municipality: "Bürstadt",
    total_dwellings: 9860,
    vacancy_rate_pct: 2.7,
    avg_living_space_sqm: 98.4,
    avg_land_value_residential: 480.0,
    avg_rent_cold_sqm: 8.85,
    avg_apartment_buy_sqm: 2850.0,
    recent_permits_dwellings: 64,
    recent_completions_dwellings: 56,
    active_bplaene_count: 2,
  },
  {
    municipality: "Lorsch",
    total_dwellings: 6980,
    vacancy_rate_pct: 2.6,
    avg_living_space_sqm: 101.4,
    avg_land_value_residential: 530.0,
    avg_rent_cold_sqm: 9.8,
    avg_apartment_buy_sqm: 3350.0,
    recent_permits_dwellings: 66,
    recent_completions_dwellings: 60,
    active_bplaene_count: 1,
  },
  {
    municipality: "Biblis",
    total_dwellings: 4450,
    vacancy_rate_pct: 3.4,
    avg_living_space_sqm: 104.2,
    avg_land_value_residential: 350.0,
    avg_rent_cold_sqm: 8.1,
    avg_apartment_buy_sqm: 2480.0,
    recent_permits_dwellings: 36,
    recent_completions_dwellings: 30,
    active_bplaene_count: 1,
  },
  {
    municipality: "Einhausen",
    total_dwellings: 3250,
    vacancy_rate_pct: 2.3,
    avg_living_space_sqm: 103.8,
    avg_land_value_residential: 460.0,
    avg_rent_cold_sqm: 9.1,
    avg_apartment_buy_sqm: null,
    recent_permits_dwellings: 34,
    recent_completions_dwellings: 31,
    active_bplaene_count: 1,
  },
  {
    municipality: "Groß-Rohrheim",
    total_dwellings: 1890,
    vacancy_rate_pct: 2.5,
    avg_living_space_sqm: 106.5,
    avg_land_value_residential: 330.0,
    avg_rent_cold_sqm: 7.95,
    avg_apartment_buy_sqm: null,
    recent_permits_dwellings: 16,
    recent_completions_dwellings: 15,
    active_bplaene_count: 0,
  },
];

export const BASELINE_HOUSING_STOCK: HousingStock[] = [
  {
    id: "hs-buerstadt-2022",
    municipality: "Bürstadt",
    district: "Gesamtstadt",
    reference_year: 2022,
    total_buildings: 5120,
    residential_buildings: 4320,
    total_dwellings: 9860,
    avg_living_space_sqm: 98.4,
    vacant_dwellings: 266,
    vacancy_rate_pct: 2.7,
    age_distribution: {
      pre_1919: 450,
      "1919_1948": 480,
      "1949_1978": 1850,
      "1979_1990": 720,
      "1991_2000": 410,
      "2001_2010": 240,
      post_2011: 170,
    },
    building_types: {
      single_family: 2740,
      semi_detached_duplex: 890,
      multi_family: 690,
    },
    heating_energy: {
      gas: 64.2,
      oil: 21.8,
      heat_pump: 7.4,
      district_heating: 1.8,
      wood_pellets: 3.2,
      solar_thermal: 1.6,
    },
    source: "Zensus 2022 Gebäude- und Wohnungszählung (Statistik Hessen)",
  },
  {
    id: "hs-lampertheim-2022",
    municipality: "Lampertheim",
    district: "Gesamtstadt",
    reference_year: 2022,
    total_buildings: 10240,
    residential_buildings: 8640,
    total_dwellings: 16420,
    avg_living_space_sqm: 95.8,
    vacant_dwellings: 509,
    vacancy_rate_pct: 3.1,
    age_distribution: {
      pre_1919: 980,
      "1919_1948": 1040,
      "1949_1978": 3720,
      "1979_1990": 1390,
      "1991_2000": 780,
      "2001_2010": 450,
      post_2011: 280,
    },
    building_types: {
      single_family: 5150,
      semi_detached_duplex: 1840,
      multi_family: 1650,
    },
    heating_energy: {
      gas: 67.5,
      oil: 18.9,
      heat_pump: 6.8,
      district_heating: 2.4,
      wood_pellets: 2.8,
      solar_thermal: 1.6,
    },
    source: "Zensus 2022 Gebäude- und Wohnungszählung (Statistik Hessen)",
  },
  {
    id: "hs-biblis-2022",
    municipality: "Biblis",
    district: "Gesamtgemeinde",
    reference_year: 2022,
    total_buildings: 2980,
    residential_buildings: 2480,
    total_dwellings: 4450,
    avg_living_space_sqm: 104.2,
    vacant_dwellings: 151,
    vacancy_rate_pct: 3.4,
    age_distribution: {
      pre_1919: 310,
      "1919_1948": 290,
      "1949_1978": 1080,
      "1979_1990": 420,
      "1991_2000": 210,
      "2001_2010": 110,
      post_2011: 60,
    },
    building_types: {
      single_family: 1710,
      semi_detached_duplex: 490,
      multi_family: 280,
    },
    heating_energy: {
      gas: 61.0,
      oil: 24.5,
      heat_pump: 8.2,
      district_heating: 0.5,
      wood_pellets: 4.1,
      solar_thermal: 1.7,
    },
    source: "Zensus 2022 (Statistik Hessen)",
  },
  {
    id: "hs-gross-rohrheim-2022",
    municipality: "Groß-Rohrheim",
    district: "Gemeinde",
    reference_year: 2022,
    total_buildings: 1340,
    residential_buildings: 1120,
    total_dwellings: 1890,
    avg_living_space_sqm: 106.5,
    vacant_dwellings: 47,
    vacancy_rate_pct: 2.5,
    age_distribution: {
      pre_1919: 160,
      "1919_1948": 120,
      "1949_1978": 490,
      "1979_1990": 180,
      "1991_2000": 90,
      "2001_2010": 50,
      post_2011: 30,
    },
    building_types: {
      single_family: 820,
      semi_detached_duplex: 210,
      multi_family: 90,
    },
    heating_energy: {
      gas: 58.5,
      oil: 26.0,
      heat_pump: 9.5,
      district_heating: 0.0,
      wood_pellets: 4.5,
      solar_thermal: 1.5,
    },
    source: "Zensus 2022 (Statistik Hessen)",
  },
  {
    id: "hs-einhausen-2022",
    municipality: "Einhausen",
    district: "Gemeinde",
    reference_year: 2022,
    total_buildings: 2310,
    residential_buildings: 1950,
    total_dwellings: 3250,
    avg_living_space_sqm: 103.8,
    vacant_dwellings: 75,
    vacancy_rate_pct: 2.3,
    age_distribution: {
      pre_1919: 220,
      "1919_1948": 210,
      "1949_1978": 840,
      "1979_1990": 340,
      "1991_2000": 180,
      "2001_2010": 100,
      post_2011: 60,
    },
    building_types: {
      single_family: 1390,
      semi_detached_duplex: 380,
      multi_family: 180,
    },
    heating_energy: {
      gas: 59.0,
      oil: 23.2,
      heat_pump: 11.8,
      district_heating: 0.0,
      wood_pellets: 4.2,
      solar_thermal: 1.8,
    },
    source: "Zensus 2022 (Statistik Hessen)",
  },
  {
    id: "hs-lorsch-2022",
    municipality: "Lorsch",
    district: "Stadt",
    reference_year: 2022,
    total_buildings: 4350,
    residential_buildings: 3680,
    total_dwellings: 6980,
    avg_living_space_sqm: 101.4,
    vacant_dwellings: 181,
    vacancy_rate_pct: 2.6,
    age_distribution: {
      pre_1919: 410,
      "1919_1948": 390,
      "1949_1978": 1540,
      "1979_1990": 630,
      "1991_2000": 370,
      "2001_2010": 210,
      post_2011: 130,
    },
    building_types: {
      single_family: 2420,
      semi_detached_duplex: 780,
      multi_family: 480,
    },
    heating_energy: {
      gas: 62.8,
      oil: 20.4,
      heat_pump: 10.2,
      district_heating: 1.2,
      wood_pellets: 3.6,
      solar_thermal: 1.8,
    },
    source: "Zensus 2022 (Statistik Hessen)",
  },
];

export const BASELINE_BORIS_ZONES: BorisZone[] = [
  {
    id: "boris-bst-kern-w",
    zone_code: "06431005-01",
    municipality: "Bürstadt",
    district: "Kernstadt",
    stichtag: "2024-01-01",
    land_value_eur_sqm: 480.0,
    zone_type: "Wohnbaufläche",
    development_status: "baureifes Land",
    floor_space_index: 0.8,
    center_lat: 49.6425,
    center_lng: 8.4550,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [8.4480, 49.6380],
          [8.4620, 49.6380],
          [8.4620, 49.6470],
          [8.4480, 49.6470],
          [8.4480, 49.6380],
        ],
      ],
    },
    source: "BORIS Hessen",
  },
  {
    id: "boris-bst-sonneneck-w",
    zone_code: "06431005-02",
    municipality: "Bürstadt",
    district: "Sonneneck (Neubau)",
    stichtag: "2024-01-01",
    land_value_eur_sqm: 560.0,
    zone_type: "Wohnbaufläche",
    development_status: "baureifes Land",
    floor_space_index: 0.6,
    center_lat: 49.6480,
    center_lng: 8.4670,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [8.4630, 49.6450],
          [8.4720, 49.6450],
          [8.4720, 49.6510],
          [8.4630, 49.6510],
          [8.4630, 49.6450],
        ],
      ],
    },
    source: "BORIS Hessen",
  },
  {
    id: "boris-bst-bobstadt-w",
    zone_code: "06431005-03",
    municipality: "Bürstadt",
    district: "Bobstadt",
    stichtag: "2024-01-01",
    land_value_eur_sqm: 390.0,
    zone_type: "Wohnbaufläche",
    development_status: "baureifes Land",
    floor_space_index: 0.7,
    center_lat: 49.6640,
    center_lng: 8.4480,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [8.4420, 49.6590],
          [8.4540, 49.6590],
          [8.4540, 49.6690],
          [8.4420, 49.6690],
          [8.4420, 49.6590],
        ],
      ],
    },
    source: "BORIS Hessen",
  },
  {
    id: "boris-bst-gewerbe-g",
    zone_code: "06431005-05",
    municipality: "Bürstadt",
    district: "Industriegebiet Ost",
    stichtag: "2024-01-01",
    land_value_eur_sqm: 115.0,
    zone_type: "Gewerbefläche",
    development_status: "baureifes Land",
    floor_space_index: 1.2,
    center_lat: 49.6410,
    center_lng: 8.4720,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [8.4660, 49.6360],
          [8.4780, 49.6360],
          [8.4780, 49.6450],
          [8.4660, 49.6450],
          [8.4660, 49.6360],
        ],
      ],
    },
    source: "BORIS Hessen",
  },
  {
    id: "boris-la-mitte-w",
    zone_code: "06431013-01",
    municipality: "Lampertheim",
    district: "Kernstadt Mitte",
    stichtag: "2024-01-01",
    land_value_eur_sqm: 510.0,
    zone_type: "Wohnbaufläche",
    development_status: "baureifes Land",
    floor_space_index: 0.9,
    center_lat: 49.5950,
    center_lng: 8.4680,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [8.4580, 49.5890],
          [8.4780, 49.5890],
          [8.4780, 49.6010],
          [8.4580, 49.6010],
          [8.4580, 49.5890],
        ],
      ],
    },
    source: "BORIS Hessen",
  },
  {
    id: "boris-la-rosenstock-w",
    zone_code: "06431013-02",
    municipality: "Lampertheim",
    district: "Rosenstock (Neubau)",
    stichtag: "2024-01-01",
    land_value_eur_sqm: 590.0,
    zone_type: "Wohnbaufläche",
    development_status: "baureifes Land",
    floor_space_index: 0.7,
    center_lat: 49.6040,
    center_lng: 8.4740,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [8.4690, 49.6000],
          [8.4800, 49.6000],
          [8.4800, 49.6090],
          [8.4690, 49.6090],
          [8.4690, 49.6000],
        ],
      ],
    },
    source: "BORIS Hessen",
  },
  {
    id: "boris-la-hofheim-w",
    zone_code: "06431013-03",
    municipality: "Lampertheim",
    district: "Hofheim",
    stichtag: "2024-01-01",
    land_value_eur_sqm: 370.0,
    zone_type: "Wohnbaufläche",
    development_status: "baureifes Land",
    floor_space_index: 0.7,
    center_lat: 49.6580,
    center_lng: 8.4120,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [8.4040, 49.6520],
          [8.4200, 49.6520],
          [8.4200, 49.6640],
          [8.4040, 49.6640],
          [8.4040, 49.6520],
        ],
      ],
    },
    source: "BORIS Hessen",
  },
  {
    id: "boris-bib-mitte-w",
    zone_code: "06431003-01",
    municipality: "Biblis",
    district: "Kernort",
    stichtag: "2024-01-01",
    land_value_eur_sqm: 350.0,
    zone_type: "Wohnbaufläche",
    development_status: "baureifes Land",
    floor_space_index: 0.7,
    center_lat: 49.6870,
    center_lng: 8.4450,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [8.4380, 49.6810],
          [8.4520, 49.6810],
          [8.4520, 49.6930],
          [8.4380, 49.6930],
          [8.4380, 49.6810],
        ],
      ],
    },
    source: "BORIS Hessen",
  },
  {
    id: "boris-gross-mitte-w",
    zone_code: "06431010-01",
    municipality: "Groß-Rohrheim",
    district: "Ortskern",
    stichtag: "2024-01-01",
    land_value_eur_sqm: 330.0,
    zone_type: "Wohnbaufläche",
    development_status: "baureifes Land",
    floor_space_index: 0.7,
    center_lat: 49.7170,
    center_lng: 8.4780,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [8.4710, 49.7120],
          [8.4860, 49.7120],
          [8.4860, 49.7220],
          [8.4710, 49.7220],
          [8.4710, 49.7120],
        ],
      ],
    },
    source: "BORIS Hessen",
  },
  {
    id: "boris-einh-mitte-w",
    zone_code: "06431006-01",
    municipality: "Einhausen",
    district: "Ortsmitte",
    stichtag: "2024-01-01",
    land_value_eur_sqm: 460.0,
    zone_type: "Wohnbaufläche",
    development_status: "baureifes Land",
    floor_space_index: 0.8,
    center_lat: 49.6730,
    center_lng: 8.5440,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [8.5360, 49.6670],
          [8.5520, 49.6670],
          [8.5520, 49.6790],
          [8.5360, 49.6790],
          [8.5360, 49.6670],
        ],
      ],
    },
    source: "BORIS Hessen",
  },
  {
    id: "boris-lorsch-mitte-w",
    zone_code: "06431015-01",
    municipality: "Lorsch",
    district: "Stadtkern & Welterbezone",
    stichtag: "2024-01-01",
    land_value_eur_sqm: 530.0,
    zone_type: "Wohnbaufläche",
    development_status: "baureifes Land",
    floor_space_index: 0.8,
    center_lat: 49.6540,
    center_lng: 8.5690,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [8.5580, 49.6480],
          [8.5800, 49.6480],
          [8.5800, 49.6600],
          [8.5580, 49.6600],
          [8.5580, 49.6480],
        ],
      ],
    },
    source: "BORIS Hessen",
  },
];

export const BASELINE_CONSTRUCTION_PERMITS: ConstructionPermit[] = [
  { id: "cp-bst-2020", municipality: "Bürstadt", year: 2020, residential_permits_count: 52, residential_dwellings_count: 85, completions_buildings_count: 42, completions_dwellings_count: 74, source: "Statistik Hessen F II 1" },
  { id: "cp-bst-2021", municipality: "Bürstadt", year: 2021, residential_permits_count: 56, residential_dwellings_count: 94, completions_buildings_count: 48, completions_dwellings_count: 82, source: "Statistik Hessen F II 1" },
  { id: "cp-bst-2022", municipality: "Bürstadt", year: 2022, residential_permits_count: 42, residential_dwellings_count: 71, completions_buildings_count: 51, completions_dwellings_count: 88, source: "Statistik Hessen F II 1" },
  { id: "cp-bst-2023", municipality: "Bürstadt", year: 2023, residential_permits_count: 28, residential_dwellings_count: 45, completions_buildings_count: 38, completions_dwellings_count: 65, source: "Statistik Hessen F II 1" },
  { id: "cp-bst-2024", municipality: "Bürstadt", year: 2024, residential_permits_count: 32, residential_dwellings_count: 52, completions_buildings_count: 30, completions_dwellings_count: 48, source: "Statistik Hessen F II 1" },
  { id: "cp-bst-2025", municipality: "Bürstadt", year: 2025, residential_permits_count: 39, residential_dwellings_count: 64, completions_buildings_count: 35, completions_dwellings_count: 56, source: "Statistik Hessen F II 1" },

  { id: "cp-la-2020", municipality: "Lampertheim", year: 2020, residential_permits_count: 84, residential_dwellings_count: 142, completions_buildings_count: 76, completions_dwellings_count: 126, source: "Statistik Hessen F II 1" },
  { id: "cp-la-2021", municipality: "Lampertheim", year: 2021, residential_permits_count: 92, residential_dwellings_count: 158, completions_buildings_count: 80, completions_dwellings_count: 134, source: "Statistik Hessen F II 1" },
  { id: "cp-la-2022", municipality: "Lampertheim", year: 2022, residential_permits_count: 74, residential_dwellings_count: 125, completions_buildings_count: 86, completions_dwellings_count: 145, source: "Statistik Hessen F II 1" },
  { id: "cp-la-2023", municipality: "Lampertheim", year: 2023, residential_permits_count: 49, residential_dwellings_count: 84, completions_buildings_count: 66, completions_dwellings_count: 108, source: "Statistik Hessen F II 1" },
  { id: "cp-la-2024", municipality: "Lampertheim", year: 2024, residential_permits_count: 54, residential_dwellings_count: 92, completions_buildings_count: 52, completions_dwellings_count: 86, source: "Statistik Hessen F II 1" },
  { id: "cp-la-2025", municipality: "Lampertheim", year: 2025, residential_permits_count: 62, residential_dwellings_count: 108, completions_buildings_count: 58, completions_dwellings_count: 96, source: "Statistik Hessen F II 1" },

  { id: "cp-lorsch-2025", municipality: "Lorsch", year: 2025, residential_permits_count: 38, residential_dwellings_count: 66, completions_buildings_count: 36, completions_dwellings_count: 60, source: "Statistik Hessen F II 1" },
  { id: "cp-bib-2025", municipality: "Biblis", year: 2025, residential_permits_count: 22, residential_dwellings_count: 36, completions_buildings_count: 19, completions_dwellings_count: 30, source: "Statistik Hessen F II 1" },
  { id: "cp-einh-2025", municipality: "Einhausen", year: 2025, residential_permits_count: 21, residential_dwellings_count: 34, completions_buildings_count: 19, completions_dwellings_count: 31, source: "Statistik Hessen F II 1" },
  { id: "cp-gross-2025", municipality: "Groß-Rohrheim", year: 2025, residential_permits_count: 10, residential_dwellings_count: 16, completions_buildings_count: 9, completions_dwellings_count: 15, source: "Statistik Hessen F II 1" },
];

export const BASELINE_MARKET_BENCHMARKS: MarketBenchmark[] = [
  { id: "mb-bst-apt-2025", municipality: "Bürstadt", year: 2025, metric_type: "apartment_buy_sqm", avg_val: 2850.0, median_val: 2820.0, min_val: 1950.0, max_val: 4200.0, unit: "EUR/m2", transaction_count: 48, source: "Gutachterausschuss Bergstraße" },
  { id: "mb-bst-house-2025", municipality: "Bürstadt", year: 2025, metric_type: "house_buy_avg", avg_val: 430000.0, median_val: 425000.0, min_val: 280000.0, max_val: 680000.0, unit: "EUR", transaction_count: 62, source: "Gutachterausschuss Bergstraße" },
  { id: "mb-bst-rent-2025", municipality: "Bürstadt", year: 2025, metric_type: "rent_cold_sqm", avg_val: 8.85, median_val: 8.80, min_val: 6.50, max_val: 12.00, unit: "EUR/m2", source: "Zensus / Mietindex" },

  { id: "mb-la-apt-2025", municipality: "Lampertheim", year: 2025, metric_type: "apartment_buy_sqm", avg_val: 3100.0, median_val: 3050.0, min_val: 2100.0, max_val: 4450.0, unit: "EUR/m2", transaction_count: 86, source: "Gutachterausschuss Bergstraße" },
  { id: "mb-la-house-2025", municipality: "Lampertheim", year: 2025, metric_type: "house_buy_avg", avg_val: 465000.0, median_val: 460000.0, min_val: 310000.0, max_val: 740000.0, unit: "EUR", transaction_count: 94, source: "Gutachterausschuss Bergstraße" },
  { id: "mb-la-rent-2025", municipality: "Lampertheim", year: 2025, metric_type: "rent_cold_sqm", avg_val: 9.20, median_val: 9.15, min_val: 6.80, max_val: 12.80, unit: "EUR/m2", source: "Zensus / Mietindex" },

  { id: "mb-lorsch-apt-2025", municipality: "Lorsch", year: 2025, metric_type: "apartment_buy_sqm", avg_val: 3350.0, median_val: 3300.0, min_val: 2300.0, max_val: 4650.0, unit: "EUR/m2", transaction_count: 42, source: "Gutachterausschuss Bergstraße" },
  { id: "mb-lorsch-house-2025", municipality: "Lorsch", year: 2025, metric_type: "house_buy_avg", avg_val: 520000.0, median_val: 515000.0, min_val: 350000.0, max_val: 810000.0, unit: "EUR", transaction_count: 46, source: "Gutachterausschuss Bergstraße" },
  { id: "mb-lorsch-rent-2025", municipality: "Lorsch", year: 2025, metric_type: "rent_cold_sqm", avg_val: 9.80, median_val: 9.75, min_val: 7.50, max_val: 13.50, unit: "EUR/m2", source: "Zensus / Mietindex" },

  { id: "mb-bib-house-2025", municipality: "Biblis", year: 2025, metric_type: "house_buy_avg", avg_val: 360000.0, median_val: 355000.0, min_val: 240000.0, max_val: 520000.0, unit: "EUR", transaction_count: 34, source: "Gutachterausschuss Bergstraße" },
  { id: "mb-bib-rent-2025", municipality: "Biblis", year: 2025, metric_type: "rent_cold_sqm", avg_val: 8.10, median_val: 8.05, min_val: 6.20, max_val: 10.50, unit: "EUR/m2", source: "Zensus / Mietindex" },
];

export const BASELINE_DEVELOPMENT_PLANS: DevelopmentPlan[] = [
  {
    id: "dp-bst-sonneneck-2",
    municipality: "Bürstadt",
    district: "Kernstadt",
    plan_name: "Bebauungsplan Sonneneck II",
    plan_number: "BP-BST-52",
    status: "rechtskraeftig",
    target_use: "Wohnen",
    area_hectares: 8.4,
    resolution_year: 2021,
    document_url: "https://buerstadt.de/stadtentwicklung/sonneneck-2",
    center_lat: 49.6480,
    center_lng: 8.4670,
  },
  {
    id: "dp-bst-gewerbe-ost-erw",
    municipality: "Bürstadt",
    district: "Kernstadt",
    plan_name: "Gewerbegebiet Ost – 3. Bauabschnitt",
    plan_number: "BP-BST-61",
    status: "im_verfahren",
    target_use: "Gewerbe",
    area_hectares: 6.2,
    resolution_year: 2024,
    document_url: "https://buerstadt.de/stadtentwicklung/gewerbe-ost-3",
    center_lat: 49.6430,
    center_lng: 8.4750,
  },
  {
    id: "dp-la-rosenstock-3",
    municipality: "Lampertheim",
    district: "Kernstadt",
    plan_name: "Bebauungsplan Rosenstock III",
    plan_number: "BP-LA-88",
    status: "rechtskraeftig",
    target_use: "Wohnen",
    area_hectares: 11.2,
    resolution_year: 2022,
    document_url: "https://lampertheim.de/bauen-wohnen/rosenstock-3",
    center_lat: 49.6040,
    center_lng: 8.4740,
  },
  {
    id: "dp-la-gleisdreieck",
    municipality: "Lampertheim",
    district: "Kernstadt",
    plan_name: "Gewerbepark Gleisdreieck",
    plan_number: "BP-LA-94",
    status: "in_aufstellung",
    target_use: "Gewerbe",
    area_hectares: 7.5,
    resolution_year: 2025,
    document_url: "https://lampertheim.de/wirtschaft/gleisdreieck",
    center_lat: 49.5910,
    center_lng: 8.4790,
  },
  {
    id: "dp-bib-hinter-kirche",
    municipality: "Biblis",
    district: "Kernort",
    plan_name: "Wohngebiet Hinter der katholischen Kirche",
    plan_number: "BP-BIB-28",
    status: "rechtskraeftig",
    target_use: "Wohnen",
    area_hectares: 3.2,
    resolution_year: 2023,
    document_url: "https://biblis.de/bauen/hinter-der-kirche",
    center_lat: 49.6890,
    center_lng: 8.4420,
  },
  {
    id: "dp-einh-am-sportfeld",
    municipality: "Einhausen",
    district: "Ortsrand",
    plan_name: "Wohngebiet Am Sportfeld Nord",
    plan_number: "BP-EINH-19",
    status: "rechtskraeftig",
    target_use: "Wohnen",
    area_hectares: 4.1,
    resolution_year: 2023,
    document_url: "https://einhausen.de/bauen/am-sportfeld",
    center_lat: 49.6760,
    center_lng: 8.5480,
  },
  {
    id: "dp-lorsch-klosterfeld",
    municipality: "Lorsch",
    district: "Nordost",
    plan_name: "Wohn- und Mischgebiet Klosterfeld",
    plan_number: "BP-LOR-45",
    status: "im_verfahren",
    target_use: "Mischgebiet",
    area_hectares: 5.6,
    resolution_year: 2024,
    document_url: "https://lorsch.de/stadtplanung/klosterfeld",
    center_lat: 49.6590,
    center_lng: 8.5750,
  },
];

export function getBorisZoneColor(value: number, type: string): string {
  if (type === "Landwirtschaft") return "#84cc16"; // light green
  if (type === "Gewerbefläche") return "#8b5cf6"; // purple
  if (value >= 550) return "#ef4444"; // red (high value new construction)
  if (value >= 450) return "#f97316"; // orange (established core residential)
  if (value >= 350) return "#f59e0b"; // amber
  return "#06b6d4"; // cyan (< 350 €/m²)
}

export function getLandUseColor(category: string): string {
  switch (category) {
    case "forest":
      return "#15803d"; // dark green
    case "agriculture":
      return "#84cc16"; // lime
    case "water":
      return "#0284c7"; // sky blue
    case "settlement":
      return "#f59e0b"; // amber/residential
    case "industrial":
      return "#7c3aed"; // violet
    case "traffic":
      return "#64748b"; // slate
    default:
      return "#94a3b8";
  }
}

export function formatEuro(value: number, isPerSqm = false): string {
  if (!Number.isFinite(value)) return "–";
  const formatted = new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: isPerSqm ? 2 : 0,
  }).format(value);
  return `${formatted} €${isPerSqm ? "/m²" : ""}`;
}

export async function fetchRealEstateSummary(): Promise<RealEstateSummary[]> {

    const res = await fetch(new URL("/api/v1/realestate/summary", env.BACKEND_API_URL), {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("Realestate summary failed");
    return await res.json();

  throw new Error("Collected data unavailable");
}

export async function fetchHousingStock(municipality?: string): Promise<HousingStock[]> {

    const url = new URL("/api/v1/realestate/housing-stock", env.BACKEND_API_URL);
    if (municipality && municipality !== "all") {
      url.searchParams.set("municipality", municipality);
    }
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("Housing stock failed");
    return await res.json();

  throw new Error("Collected data unavailable");
}

export async function fetchBorisZones(municipality?: string): Promise<BorisZone[]> {

    const url = new URL("/api/v1/realestate/boris", env.BACKEND_API_URL);
    if (municipality && municipality !== "all") {
      url.searchParams.set("municipality", municipality);
    }
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("BORIS request failed");
    return await res.json();

  throw new Error("Collected data unavailable");
}

export async function fetchConstructionActivity(municipality?: string): Promise<ConstructionPermit[]> {

    const url = new URL("/api/v1/realestate/construction-activity", env.BACKEND_API_URL);
    if (municipality && municipality !== "all") {
      url.searchParams.set("municipality", municipality);
    }
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("Construction request failed");
    return await res.json();

  throw new Error("Collected data unavailable");
}

export async function fetchMarketBenchmarks(municipality?: string): Promise<MarketBenchmark[]> {

    const url = new URL("/api/v1/realestate/market-benchmarks", env.BACKEND_API_URL);
    if (municipality && municipality !== "all") {
      url.searchParams.set("municipality", municipality);
    }
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("Market benchmarks failed");
    return await res.json();

  throw new Error("Collected data unavailable");
}

export async function fetchDevelopmentPlans(municipality?: string): Promise<DevelopmentPlan[]> {

    const url = new URL("/api/v1/realestate/development-plans", env.BACKEND_API_URL);
    if (municipality && municipality !== "all") {
      url.searchParams.set("municipality", municipality);
    }
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("Dev plans request failed");
    return await res.json();

  throw new Error("Collected data unavailable");
}
