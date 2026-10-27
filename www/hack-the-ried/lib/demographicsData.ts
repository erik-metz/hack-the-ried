import { collectedFetch as fetch } from "./collectedBackend";
import { env } from "@/env";

export interface Municipality {
  id: string;
  ags: string;
  name: string;
  county: string;
  state: string;
  area_sqkm: number;
  center_lat: number;
  center_lng: number;
}

export interface DemographicSummary {
  municipality_id: string;
  name: string;
  total_population: number;
  population_density: number;
  foreign_share_pct: number;
  births: number;
  deaths: number;
  inflow: number;
  outflow: number;
  net_migration: number;
  avg_household_size: number;
  schools_count: number;
  kitas_count: number;
  year: number;
}

export interface AgeStructure {
  cohort: string;
  label: string;
  count: number;
  percentage: number;
  description: string;
}

export interface CommuterFlow {
  year: number;
  home_municipality_id: string;
  partner_ags: string;
  partner_name: string;
  direction: "inbound" | "outbound";
  commuter_count: number;
  source: string;
}

export interface EducationalFacility {
  id: string;
  name: string;
  facility_type: "kita" | "krippe" | "grundschule" | "gesamtschule" | "gymnasium" | "foerderschule";
  municipality_id: string;
  district?: string | null;
  address: string;
  latitude: number;
  longitude: number;
  operator: string;
  operator_name?: string | null;
  capacity?: number | null;
  current_enrollment?: number | null;
  utilization_rate?: number | null;
  min_age_years?: number | null;
  max_age_years?: number | null;
  opening_hours?: string | null;
  website_url?: string | null;
  reporting_year: number;
  is_active: boolean;
}

export const BASELINE_MUNICIPALITIES: Municipality[] = [
  { id: "buerstadt", ags: "06431005", name: "Bürstadt", county: "Kreis Bergstraße", state: "Hessen", area_sqkm: 34.46, center_lat: 49.6425, center_lng: 8.4552 },
  { id: "lampertheim", ags: "06431013", name: "Lampertheim", county: "Kreis Bergstraße", state: "Hessen", area_sqkm: 72.27, center_lat: 49.5958, center_lng: 8.4688 },
  { id: "biblis", ags: "06431003", name: "Biblis", county: "Kreis Bergstraße", state: "Hessen", area_sqkm: 40.44, center_lat: 49.6872, center_lng: 8.4452 },
  { id: "gross-rohrheim", ags: "06431010", name: "Groß-Rohrheim", county: "Kreis Bergstraße", state: "Hessen", area_sqkm: 19.56, center_lat: 49.7175, center_lng: 8.4785 },
  { id: "hofheim", ags: "07319000", name: "Hofheim (Ried)", county: "Stadt Worms / Ried", state: "Rheinland-Pfalz", area_sqkm: 15.20, center_lat: 49.6588, center_lng: 8.4124 },
];

export const BASELINE_SUMMARIES: DemographicSummary[] = [
  {
    municipality_id: "buerstadt",
    name: "Bürstadt",
    total_population: 16980,
    population_density: 492.7,
    foreign_share_pct: 15.8,
    births: 142,
    deaths: 188,
    inflow: 985,
    outflow: 860,
    net_migration: 125,
    avg_household_size: 2.14,
    schools_count: 3,
    kitas_count: 5,
    year: 2024,
  },
  {
    municipality_id: "lampertheim",
    name: "Lampertheim",
    total_population: 33150,
    population_density: 458.7,
    foreign_share_pct: 17.5,
    births: 278,
    deaths: 392,
    inflow: 1890,
    outflow: 1675,
    net_migration: 215,
    avg_household_size: 2.11,
    schools_count: 4,
    kitas_count: 7,
    year: 2024,
  },
  {
    municipality_id: "biblis",
    name: "Biblis",
    total_population: 9210,
    population_density: 227.7,
    foreign_share_pct: 13.9,
    births: 76,
    deaths: 112,
    inflow: 540,
    outflow: 480,
    net_migration: 60,
    avg_household_size: 2.22,
    schools_count: 1,
    kitas_count: 2,
    year: 2024,
  },
  {
    municipality_id: "gross-rohrheim",
    name: "Groß-Rohrheim",
    total_population: 3820,
    population_density: 195.3,
    foreign_share_pct: 12.0,
    births: 31,
    deaths: 44,
    inflow: 220,
    outflow: 195,
    net_migration: 25,
    avg_household_size: 2.26,
    schools_count: 1,
    kitas_count: 1,
    year: 2024,
  },
  {
    municipality_id: "hofheim",
    name: "Hofheim (Ried)",
    total_population: 3350,
    population_density: 220.4,
    foreign_share_pct: 12.2,
    births: 26,
    deaths: 38,
    inflow: 180,
    outflow: 160,
    net_migration: 20,
    avg_household_size: 2.18,
    schools_count: 1,
    kitas_count: 1,
    year: 2024,
  },
];

export const BASELINE_AGE_STRUCTURE: Record<string, AgeStructure[]> = {
  buerstadt: [
    { cohort: "under_6", label: "< 6 Jahre", count: 915, percentage: 5.4, description: "Krippe & Kindertagesstätte" },
    { cohort: "6_to_18", label: "6–18 Jahre", count: 2110, percentage: 12.4, description: "Schulpflicht & Jugendliche" },
    { cohort: "19_to_29", label: "19–29 Jahre", count: 1845, percentage: 10.9, description: "Ausbildung, Studium & Berufseinstieg" },
    { cohort: "30_to_49", label: "30–49 Jahre", count: 4290, percentage: 25.3, description: "Familien- & Haupterwerbsphase" },
    { cohort: "50_to_64", label: "50–64 Jahre", count: 4070, percentage: 24.0, description: "Späte Erwerbsphase / Babyboomer" },
    { cohort: "65_plus", label: "65+ Jahre", count: 3750, percentage: 22.0, description: "Ruhestand & Senioren" },
  ],
  lampertheim: [
    { cohort: "under_6", label: "< 6 Jahre", count: 1780, percentage: 5.4, description: "Krippe & Kindertagesstätte" },
    { cohort: "6_to_18", label: "6–18 Jahre", count: 4120, percentage: 12.4, description: "Schulpflicht & Jugendliche" },
    { cohort: "19_to_29", label: "19–29 Jahre", count: 3620, percentage: 10.9, description: "Ausbildung, Studium & Berufseinstieg" },
    { cohort: "30_to_49", label: "30–49 Jahre", count: 8310, percentage: 25.1, description: "Familien- & Haupterwerbsphase" },
    { cohort: "50_to_64", label: "50–64 Jahre", count: 7940, percentage: 24.0, description: "Späte Erwerbsphase / Babyboomer" },
    { cohort: "65_plus", label: "65+ Jahre", count: 7380, percentage: 22.2, description: "Ruhestand & Senioren" },
  ],
  biblis: [
    { cohort: "under_6", label: "< 6 Jahre", count: 485, percentage: 5.3, description: "Krippe & Kindertagesstätte" },
    { cohort: "6_to_18", label: "6–18 Jahre", count: 1130, percentage: 12.3, description: "Schulpflicht & Jugendliche" },
    { cohort: "19_to_29", label: "19–29 Jahre", count: 970, percentage: 10.5, description: "Ausbildung, Studium & Berufseinstieg" },
    { cohort: "30_to_49", label: "30–49 Jahre", count: 2340, percentage: 25.4, description: "Familien- & Haupterwerbsphase" },
    { cohort: "50_to_64", label: "50–64 Jahre", count: 2285, percentage: 24.8, description: "Späte Erwerbsphase / Babyboomer" },
    { cohort: "65_plus", label: "65+ Jahre", count: 2000, percentage: 21.7, description: "Ruhestand & Senioren" },
  ],
  "gross-rohrheim": [
    { cohort: "under_6", label: "< 6 Jahre", count: 205, percentage: 5.4, description: "Krippe & Kindertagesstätte" },
    { cohort: "6_to_18", label: "6–18 Jahre", count: 470, percentage: 12.3, description: "Schulpflicht & Jugendliche" },
    { cohort: "19_to_29", label: "19–29 Jahre", count: 410, percentage: 10.7, description: "Ausbildung, Studium & Berufseinstieg" },
    { cohort: "30_to_49", label: "30–49 Jahre", count: 975, percentage: 25.5, description: "Familien- & Haupterwerbsphase" },
    { cohort: "50_to_64", label: "50–64 Jahre", count: 940, percentage: 24.6, description: "Späte Erwerbsphase / Babyboomer" },
    { cohort: "65_plus", label: "65+ Jahre", count: 820, percentage: 21.5, description: "Ruhestand & Senioren" },
  ],
  hofheim: [
    { cohort: "under_6", label: "< 6 Jahre", count: 175, percentage: 5.2, description: "Krippe & Kindertagesstätte" },
    { cohort: "6_to_18", label: "6–18 Jahre", count: 415, percentage: 12.4, description: "Schulpflicht & Jugendliche" },
    { cohort: "19_to_29", label: "19–29 Jahre", count: 360, percentage: 10.7, description: "Ausbildung, Studium & Berufseinstieg" },
    { cohort: "30_to_49", label: "30–49 Jahre", count: 850, percentage: 25.4, description: "Familien- & Haupterwerbsphase" },
    { cohort: "50_to_64", label: "50–64 Jahre", count: 830, percentage: 24.8, description: "Späte Erwerbsphase / Babyboomer" },
    { cohort: "65_plus", label: "65+ Jahre", count: 720, percentage: 21.5, description: "Ruhestand & Senioren" },
  ],
};

export const BASELINE_COMMUTER_FLOWS: CommuterFlow[] = [
  // Bürstadt
  { year: 2024, home_municipality_id: "buerstadt", partner_ags: "08222000", partner_name: "Mannheim", direction: "outbound", commuter_count: 1650, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "buerstadt", partner_ags: "07319000", partner_name: "Worms", direction: "outbound", commuter_count: 1280, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "buerstadt", partner_ags: "06431013", partner_name: "Lampertheim", direction: "outbound", commuter_count: 890, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "buerstadt", partner_ags: "07314000", partner_name: "Ludwigshafen am Rhein", direction: "outbound", commuter_count: 720, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "buerstadt", partner_ags: "06412000", partner_name: "Frankfurt am Main", direction: "outbound", commuter_count: 510, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "buerstadt", partner_ags: "06411000", partner_name: "Darmstadt", direction: "outbound", commuter_count: 480, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "buerstadt", partner_ags: "06431002", partner_name: "Bensheim", direction: "outbound", commuter_count: 440, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "buerstadt", partner_ags: "06431011", partner_name: "Heppenheim", direction: "outbound", commuter_count: 320, source: "bundesagentur_fuer_arbeit" },

  { year: 2024, home_municipality_id: "buerstadt", partner_ags: "06431013", partner_name: "Lampertheim", direction: "inbound", commuter_count: 680, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "buerstadt", partner_ags: "07319000", partner_name: "Worms", direction: "inbound", commuter_count: 640, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "buerstadt", partner_ags: "06431003", partner_name: "Biblis", direction: "inbound", commuter_count: 390, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "buerstadt", partner_ags: "08222000", partner_name: "Mannheim", direction: "inbound", commuter_count: 310, source: "bundesagentur_fuer_arbeit" },

  // Lampertheim
  { year: 2024, home_municipality_id: "lampertheim", partner_ags: "08222000", partner_name: "Mannheim", direction: "outbound", commuter_count: 4650, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "lampertheim", partner_ags: "07314000", partner_name: "Ludwigshafen (BASF)", direction: "outbound", commuter_count: 2180, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "lampertheim", partner_ags: "07319000", partner_name: "Worms", direction: "outbound", commuter_count: 1820, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "lampertheim", partner_ags: "06412000", partner_name: "Frankfurt am Main", direction: "outbound", commuter_count: 950, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "lampertheim", partner_ags: "06431005", partner_name: "Bürstadt", direction: "outbound", commuter_count: 680, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "lampertheim", partner_ags: "08226101", partner_name: "Viernheim", direction: "outbound", commuter_count: 620, source: "bundesagentur_fuer_arbeit" },

  { year: 2024, home_municipality_id: "lampertheim", partner_ags: "08222000", partner_name: "Mannheim", direction: "inbound", commuter_count: 1420, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "lampertheim", partner_ags: "07319000", partner_name: "Worms", direction: "inbound", commuter_count: 1250, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "lampertheim", partner_ags: "06431005", partner_name: "Bürstadt", direction: "inbound", commuter_count: 890, source: "bundesagentur_fuer_arbeit" },

  // Biblis
  { year: 2024, home_municipality_id: "biblis", partner_ags: "07319000", partner_name: "Worms", direction: "outbound", commuter_count: 860, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "biblis", partner_ags: "08222000", partner_name: "Mannheim", direction: "outbound", commuter_count: 640, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "biblis", partner_ags: "06411000", partner_name: "Darmstadt", direction: "outbound", commuter_count: 410, source: "bundesagentur_fuer_arbeit" },
  { year: 2024, home_municipality_id: "biblis", partner_ags: "06431005", partner_name: "Bürstadt", direction: "outbound", commuter_count: 390, source: "bundesagentur_fuer_arbeit" },
];

export const BASELINE_FACILITIES: EducationalFacility[] = [
  // Bürstadt Schools
  {
    id: "sch-bst-eks",
    name: "Erich-Kästner-Schule (IGS)",
    facility_type: "gesamtschule",
    municipality_id: "buerstadt",
    district: "Bürstadt",
    address: "Wolfstraße 23, 68642 Bürstadt",
    latitude: 49.6483,
    longitude: 8.4615,
    operator: "kreis_bergstrasse",
    operator_name: "Kreis Bergstraße Schulamt",
    capacity: 980,
    current_enrollment: 940,
    utilization_rate: 95.9,
    min_age_years: 10,
    max_age_years: 17,
    opening_hours: "Mo–Fr 07:30–16:00",
    website_url: "https://eks-buerstadt.de",
    reporting_year: 2025,
    is_active: true,
  },
  {
    id: "sch-bst-schillerschule",
    name: "Schillerschule Bürstadt",
    facility_type: "grundschule",
    municipality_id: "buerstadt",
    district: "Bürstadt",
    address: "Boxheimerhofstraße 22, 68642 Bürstadt",
    latitude: 49.6496,
    longitude: 8.4618,
    operator: "kreis_bergstrasse",
    operator_name: "Kreis Bergstraße",
    capacity: 380,
    current_enrollment: 365,
    utilization_rate: 96.1,
    min_age_years: 6,
    max_age_years: 10,
    opening_hours: "Mo–Fr 07:45–14:30",
    website_url: "https://schillerschule-buerstadt.de",
    reporting_year: 2025,
    is_active: true,
  },
  {
    id: "sch-bst-astrid-lindgren",
    name: "Astrid-Lindgren-Schule Bobstadt",
    facility_type: "grundschule",
    municipality_id: "buerstadt",
    district: "Bobstadt",
    address: "Wolfsfahrtweg 2, 68642 Bürstadt-Bobstadt",
    latitude: 49.6642,
    longitude: 8.4478,
    operator: "kreis_bergstrasse",
    operator_name: "Kreis Bergstraße",
    capacity: 140,
    current_enrollment: 128,
    utilization_rate: 91.4,
    min_age_years: 6,
    max_age_years: 10,
    opening_hours: "Mo–Fr 07:45–13:30",
    website_url: "https://als-bobstadt.de",
    reporting_year: 2025,
    is_active: true,
  },

  // Bürstadt Kitas
  {
    id: "kita-bst-wichtelburg",
    name: "Kita Wichtelburg",
    facility_type: "kita",
    municipality_id: "buerstadt",
    district: "Bürstadt",
    address: "Rathausstraße 2, 68642 Bürstadt",
    latitude: 49.6420,
    longitude: 8.4558,
    operator: "stadt_buerstadt",
    operator_name: "Stadt Bürstadt",
    capacity: 110,
    current_enrollment: 105,
    utilization_rate: 95.5,
    min_age_years: 1,
    max_age_years: 6,
    opening_hours: "Mo–Fr 07:00–16:30",
    website_url: "https://buerstadt.de",
    reporting_year: 2025,
    is_active: true,
  },
  {
    id: "kita-bst-sonnenschein",
    name: "Kita Sonnenschein",
    facility_type: "kita",
    municipality_id: "buerstadt",
    district: "Bürstadt",
    address: "Gartenstraße 14, 68642 Bürstadt",
    latitude: 49.6448,
    longitude: 8.4632,
    operator: "stadt_buerstadt",
    operator_name: "Stadt Bürstadt",
    capacity: 125,
    current_enrollment: 120,
    utilization_rate: 96.0,
    min_age_years: 1,
    max_age_years: 6,
    opening_hours: "Mo–Fr 07:00–17:00",
    website_url: "https://buerstadt.de",
    reporting_year: 2025,
    is_active: true,
  },
  {
    id: "kita-bst-st-peter",
    name: "Katholische Kita St. Peter",
    facility_type: "kita",
    municipality_id: "buerstadt",
    district: "Bürstadt",
    address: "Wolfstraße 2, 68642 Bürstadt",
    latitude: 49.6438,
    longitude: 8.4525,
    operator: "kirche",
    operator_name: "Kath. Pfarrgemeinde St. Michael",
    capacity: 95,
    current_enrollment: 92,
    utilization_rate: 96.8,
    min_age_years: 2,
    max_age_years: 6,
    opening_hours: "Mo–Fr 07:30–16:30",
    reporting_year: 2025,
    is_active: true,
  },
  {
    id: "kita-bst-regenbogen",
    name: "Kita Regenbogen Bobstadt",
    facility_type: "kita",
    municipality_id: "buerstadt",
    district: "Bobstadt",
    address: "Sankt-Josef-Straße 10, 68642 Bürstadt-Bobstadt",
    latitude: 49.6628,
    longitude: 8.4468,
    operator: "stadt_buerstadt",
    operator_name: "Stadt Bürstadt",
    capacity: 85,
    current_enrollment: 82,
    utilization_rate: 96.5,
    min_age_years: 1,
    max_age_years: 6,
    opening_hours: "Mo–Fr 07:00–16:30",
    website_url: "https://buerstadt.de",
    reporting_year: 2025,
    is_active: true,
  },
  {
    id: "kita-bst-riedrode",
    name: "Waldkindergarten / Kita Riedrode",
    facility_type: "kita",
    municipality_id: "buerstadt",
    district: "Riedrode",
    address: "Bahnhofstraße 34, 68642 Bürstadt-Riedrode",
    latitude: 49.6472,
    longitude: 8.4905,
    operator: "stadt_buerstadt",
    operator_name: "Stadt Bürstadt",
    capacity: 65,
    current_enrollment: 60,
    utilization_rate: 92.3,
    min_age_years: 2,
    max_age_years: 6,
    opening_hours: "Mo–Fr 07:30–15:00",
    website_url: "https://buerstadt.de",
    reporting_year: 2025,
    is_active: true,
  },

  // Lampertheim
  {
    id: "sch-la-lessing-gymnasium",
    name: "Lessing-Gymnasium Lampertheim",
    facility_type: "gymnasium",
    municipality_id: "lampertheim",
    district: "Lampertheim",
    address: "Biedensandstraße 55, 68623 Lampertheim",
    latitude: 49.5989,
    longitude: 8.4552,
    operator: "kreis_bergstrasse",
    operator_name: "Kreis Bergstraße",
    capacity: 1150,
    current_enrollment: 1110,
    utilization_rate: 96.5,
    min_age_years: 10,
    max_age_years: 19,
    opening_hours: "Mo–Fr 07:45–16:30",
    website_url: "https://lgl.de",
    reporting_year: 2025,
    is_active: true,
  },
  {
    id: "sch-la-alfred-delp",
    name: "Alfred-Delp-Schule Lampertheim",
    facility_type: "gesamtschule",
    municipality_id: "lampertheim",
    district: "Lampertheim",
    address: "Carl-Lepper-Straße 7, 68623 Lampertheim",
    latitude: 49.5992,
    longitude: 8.4568,
    operator: "kreis_bergstrasse",
    operator_name: "Kreis Bergstraße",
    capacity: 720,
    current_enrollment: 680,
    utilization_rate: 94.4,
    min_age_years: 10,
    max_age_years: 16,
    opening_hours: "Mo–Fr 07:45–15:30",
    website_url: "https://ads-lampertheim.de",
    reporting_year: 2025,
    is_active: true,
  },
  {
    id: "sch-la-pestalozzi",
    name: "Pestalozzischule Lampertheim",
    facility_type: "grundschule",
    municipality_id: "lampertheim",
    district: "Lampertheim",
    address: "Wilhelmstraße 61, 68623 Lampertheim",
    latitude: 49.5991,
    longitude: 8.4631,
    operator: "kreis_bergstrasse",
    operator_name: "Kreis Bergstraße",
    capacity: 340,
    current_enrollment: 325,
    utilization_rate: 95.6,
    min_age_years: 6,
    max_age_years: 10,
    opening_hours: "Mo–Fr 07:45–14:00",
    reporting_year: 2025,
    is_active: true,
  },
  {
    id: "sch-la-schiller-hofheim",
    name: "Nibelungenschule Hofheim",
    facility_type: "grundschule",
    municipality_id: "hofheim",
    district: "Hofheim",
    address: "Schulstraße 4, 68623 Lampertheim-Hofheim",
    latitude: 49.6586,
    longitude: 8.4121,
    operator: "stadt_worms",
    operator_name: "Stadt Worms",
    capacity: 130,
    current_enrollment: 120,
    utilization_rate: 92.3,
    min_age_years: 6,
    max_age_years: 10,
    opening_hours: "Mo–Fr 07:45–13:30",
    reporting_year: 2025,
    is_active: true,
  },
  {
    id: "kita-la-falterweg",
    name: "Städtische Kita Falterweg",
    facility_type: "kita",
    municipality_id: "lampertheim",
    district: "Lampertheim",
    address: "Falterweg 24, 68623 Lampertheim",
    latitude: 49.5971,
    longitude: 8.4691,
    operator: "stadt_lampertheim",
    operator_name: "Stadt Lampertheim",
    capacity: 130,
    current_enrollment: 124,
    utilization_rate: 95.4,
    min_age_years: 1,
    max_age_years: 6,
    opening_hours: "Mo–Fr 07:00–17:00",
    website_url: "https://lampertheim.de",
    reporting_year: 2025,
    is_active: true,
  },
  {
    id: "kita-la-neuschloss",
    name: "Kita Neuschloß",
    facility_type: "kita",
    municipality_id: "lampertheim",
    district: "Neuschloß",
    address: "Ahornweg 12, 68623 Lampertheim-Neuschloß",
    latitude: 49.6012,
    longitude: 8.5165,
    operator: "stadt_lampertheim",
    operator_name: "Stadt Lampertheim",
    capacity: 75,
    current_enrollment: 72,
    utilization_rate: 96.0,
    min_age_years: 2,
    max_age_years: 6,
    opening_hours: "Mo–Fr 07:00–16:30",
    website_url: "https://lampertheim.de",
    reporting_year: 2025,
    is_active: true,
  },
  {
    id: "kita-la-huettenfeld",
    name: "Kita Hüttenfeld (Bürgerhaus)",
    facility_type: "kita",
    municipality_id: "lampertheim",
    district: "Hüttenfeld",
    address: "Alfred-Delp-Straße 50, 68623 Lampertheim-Hüttenfeld",
    latitude: 49.5982,
    longitude: 8.5829,
    operator: "stadt_lampertheim",
    operator_name: "Stadt Lampertheim",
    capacity: 80,
    current_enrollment: 78,
    utilization_rate: 97.5,
    min_age_years: 1,
    max_age_years: 6,
    opening_hours: "Mo–Fr 07:00–16:30",
    website_url: "https://lampertheim.de",
    reporting_year: 2025,
    is_active: true,
  },

  // Biblis
  {
    id: "sch-bib-weschnitzauen",
    name: "Schule in den Weschnitzauen",
    facility_type: "grundschule",
    municipality_id: "biblis",
    district: "Biblis",
    address: "Pfaffenau 4, 68647 Biblis",
    latitude: 49.6881,
    longitude: 8.4531,
    operator: "kreis_bergstrasse",
    operator_name: "Kreis Bergstraße",
    capacity: 320,
    current_enrollment: 305,
    utilization_rate: 95.3,
    min_age_years: 6,
    max_age_years: 10,
    opening_hours: "Mo–Fr 07:45–14:00",
    website_url: "https://schule-biblis.de",
    reporting_year: 2025,
    is_active: true,
  },
  {
    id: "kita-bib-sonnenschein",
    name: "Kommunale Kita Sonnenschein",
    facility_type: "kita",
    municipality_id: "biblis",
    district: "Biblis",
    address: "Kirchstraße 28, 68647 Biblis",
    latitude: 49.6851,
    longitude: 8.4462,
    operator: "gemeinde_biblis",
    operator_name: "Gemeinde Biblis",
    capacity: 115,
    current_enrollment: 110,
    utilization_rate: 95.7,
    min_age_years: 1,
    max_age_years: 6,
    opening_hours: "Mo–Fr 07:00–16:30",
    website_url: "https://biblis.de",
    reporting_year: 2025,
    is_active: true,
  },
  {
    id: "kita-bib-pusteblume-wattenheim",
    name: "Kita Pusteblume Wattenheim",
    facility_type: "kita",
    municipality_id: "biblis",
    district: "Wattenheim",
    address: "Rheinstraße 15, 68647 Biblis-Wattenheim",
    latitude: 49.6854,
    longitude: 8.4128,
    operator: "gemeinde_biblis",
    operator_name: "Gemeinde Biblis",
    capacity: 65,
    current_enrollment: 62,
    utilization_rate: 95.4,
    min_age_years: 2,
    max_age_years: 6,
    opening_hours: "Mo–Fr 07:30–16:00",
    website_url: "https://biblis.de",
    reporting_year: 2025,
    is_active: true,
  },

  // Groß-Rohrheim
  {
    id: "sch-gr-lindenhof",
    name: "Lindenhofschule Groß-Rohrheim",
    facility_type: "grundschule",
    municipality_id: "gross-rohrheim",
    district: "Groß-Rohrheim",
    address: "Kornstraße 38, 68649 Groß-Rohrheim",
    latitude: 49.7182,
    longitude: 8.4791,
    operator: "kreis_bergstrasse",
    operator_name: "Kreis Bergstraße",
    capacity: 150,
    current_enrollment: 142,
    utilization_rate: 94.7,
    min_age_years: 6,
    max_age_years: 10,
    opening_hours: "Mo–Fr 07:45–13:30",
    reporting_year: 2025,
    is_active: true,
  },
  {
    id: "kita-gr-abenteuerland",
    name: "Kita Abenteuerland Groß-Rohrheim",
    facility_type: "kita",
    municipality_id: "gross-rohrheim",
    district: "Groß-Rohrheim",
    address: "Speyerer Straße 12, 68649 Groß-Rohrheim",
    latitude: 49.7168,
    longitude: 8.4755,
    operator: "gemeinde_gross_rohrheim",
    operator_name: "Gemeinde Groß-Rohrheim",
    capacity: 95,
    current_enrollment: 90,
    utilization_rate: 94.7,
    min_age_years: 1,
    max_age_years: 6,
    opening_hours: "Mo–Fr 07:00–16:30",
    reporting_year: 2025,
    is_active: true,
  },
];

export async function fetchDemographicSummary(): Promise<DemographicSummary[]> {

    const res = await fetch(new URL("/api/v1/demographics/summary", env.BACKEND_API_URL), {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("Summary request failed");
    return await res.json();

  throw new Error("Collected data unavailable");
}

export async function fetchEducationalFacilities(municipalityId?: string): Promise<EducationalFacility[]> {

    const url = new URL("/api/v1/demographics/facilities", env.BACKEND_API_URL);
    if (municipalityId && municipalityId !== "all") {
      url.searchParams.set("municipality_id", municipalityId);
    }
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("Facilities request failed");
    return await res.json();

  throw new Error("Collected data unavailable");
}

export async function fetchCommuterFlows(municipalityId: string): Promise<CommuterFlow[]> {

    const res = await fetch(new URL(`/api/v1/demographics/${municipalityId}/commuters`, env.BACKEND_API_URL), {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("Commuters request failed");
    return await res.json();

  throw new Error("Collected data unavailable");
}
