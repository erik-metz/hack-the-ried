import { collectedFetch as fetch } from "./collectedBackend";
import { env } from "@/env";

export interface Company {
  id: string;
  name: string;
  legal_form?: string | null;
  municipality_id: string;
  municipality_name?: string | null;
  district?: string | null;
  street_address: string;
  postal_code: string;
  latitude: number;
  longitude: number;
  industry_sector: string;
  wz_code?: string | null;
  employee_range: string;
  turnover_estimated_range?: string | null;
  description?: string | null;
  website?: string | null;
  is_headquarters: boolean;
  source: string;
  source_url?: string | null;
}

export interface MunicipalityTaxRate {
  id: number;
  municipality_id: string;
  municipality_name: string;
  year: number;
  hebesatz_gewerbesteuer: number;
  hebesatz_grundsteuer_a: number;
  hebesatz_grundsteuer_b: number;
  revenue_gewerbesteuer_eur?: number | null;
  revenue_grundsteuer_a_eur?: number | null;
  revenue_grundsteuer_b_eur?: number | null;
  tax_revenue_per_capita_eur?: number | null;
  source: string;
}

export interface BusinessRegistration {
  id: number;
  region_code: string;
  region_type: "municipality" | "county";
  year: number;
  registrations_total: number;
  new_foundations: number;
  relocations_in: number;
  deregistrations_total: number;
  liquidations: number;
  relocations_out: number;
  net_balance: number;
  source: string;
}

export interface IndustryEmployment {
  id: number;
  region_code: string;
  year: number;
  sector_code: string;
  sector_name: string;
  employees_count: number;
  share_percent: number;
  source: string;
}

export interface StartupInitiative {
  id: string;
  name: string;
  category: "grant" | "consulting" | "competition" | "hub" | string;
  organizer: string;
  description: string;
  url?: string | null;
  funding_bracket?: string | null;
  target_group?: string | null;
}

export interface EconomyOverview {
  year: number;
  county_registrations_total: number;
  county_deregistrations_total: number;
  county_net_balance: number;
  county_total_employees: number;
  total_companies_cataloged: number;
  average_hebesatz_gewerbesteuer: number;
  min_hebesatz_gewerbesteuer: number;
  max_hebesatz_gewerbesteuer: number;
  key_municipalities: {
    municipality_id: string;
    name: string;
    hebesatz_gewerbesteuer: number;
    hebesatz_grundsteuer_b: number;
    revenue_gewerbesteuer_eur: number;
    tax_revenue_per_capita_eur: number;
    registrations_total: number;
    net_balance: number;
  }[];
}

export const BASELINE_COMPANIES: Company[] = [
  {
    id: "comp-erdt-gruppe",
    name: "ERDT Gruppe",
    legal_form: "GmbH & Co. KG",
    municipality_id: "buerstadt",
    municipality_name: "Bürstadt",
    district: "Bürstadt-Ost",
    street_address: "Industriestraße 18",
    postal_code: "68642",
    latitude: 49.6468,
    longitude: 8.4625,
    industry_sector: "Logistik & Medizintechnik-Packaging",
    wz_code: "52.10",
    employee_range: "250–499",
    turnover_estimated_range: "50–100 Mio. €",
    description: "Führender Dienstleister für Medizintechnik-Packaging, Kontraktlogistik und Co-Packing.",
    website: "https://www.erdt-gruppe.de",
    is_headquarters: true,
    source: "bundesanzeiger_northdata",
  },
  {
    id: "comp-fiege-buerstadt",
    name: "FIEGE Logistik Bürstadt",
    legal_form: "GmbH",
    municipality_id: "buerstadt",
    municipality_name: "Bürstadt",
    district: "Bürstadt-Ost",
    street_address: "Riedstraße 2",
    postal_code: "68642",
    latitude: 49.6435,
    longitude: 8.4680,
    industry_sector: "Kontraktlogistik & Spedition",
    wz_code: "52.29",
    employee_range: "250–499",
    turnover_estimated_range: "> 50 Mio. €",
    description: "Großes Distributionszentrum an der B47/A67 mit automatisiertem Hochregallager.",
    website: "https://www.fiege.com",
    is_headquarters: false,
    source: "bundesanzeiger_northdata",
  },
  {
    id: "comp-moebel-kempf",
    name: "Möbel Kempf / Binnig Bürstadt",
    legal_form: "GmbH & Co. KG",
    municipality_id: "buerstadt",
    municipality_name: "Bürstadt",
    district: "Bürstadt-Ost",
    street_address: "Riedstraße 1",
    postal_code: "68642",
    latitude: 49.6420,
    longitude: 8.4665,
    industry_sector: "Möbel- & Einzelhandel",
    wz_code: "47.59",
    employee_range: "100–249",
    turnover_estimated_range: "25–50 Mio. €",
    description: "Großflächiges Einrichtungshaus und Fachmarkt mit starker regionaler Reichweite.",
    website: "https://www.moebel-kempf.de",
    is_headquarters: false,
    source: "bundesanzeiger_northdata",
  },
  {
    id: "comp-reinig-metallbau",
    name: "Reinig Metallbau GmbH",
    legal_form: "GmbH",
    municipality_id: "buerstadt",
    municipality_name: "Bürstadt",
    district: "Bobstadt",
    street_address: "Industriestraße 3",
    postal_code: "68642",
    latitude: 49.6640,
    longitude: 8.4490,
    industry_sector: "Metallbau & Fassadenbau",
    wz_code: "25.11",
    employee_range: "50–99",
    turnover_estimated_range: "10–25 Mio. €",
    description: "Präzisionsmetallbau und Glaskonstruktionen für Industrie- und Gewerbeobjekte.",
    website: "https://www.reinig-metallbau.de",
    is_headquarters: true,
    source: "bundesanzeiger_northdata",
  },
  {
    id: "comp-basf-lampertheim",
    name: "BASF Lampertheim GmbH",
    legal_form: "GmbH",
    municipality_id: "lampertheim",
    municipality_name: "Lampertheim",
    district: "Chemiestraße",
    street_address: "Chemiestraße 22",
    postal_code: "68623",
    latitude: 49.5965,
    longitude: 8.4578,
    industry_sector: "Spezialchemie & Kunststoffadditive",
    wz_code: "20.14",
    employee_range: "500–999",
    turnover_estimated_range: "> 100 Mio. €",
    description: "Großer Produktionsstandort für Lichtschutzmittel, Antioxidantien und chemische Additive.",
    website: "https://www.basf.com",
    is_headquarters: false,
    source: "bundesanzeiger_northdata",
  },
  {
    id: "comp-ixys-lampertheim",
    name: "IXYS Semiconductor GmbH (Littelfuse)",
    legal_form: "GmbH",
    municipality_id: "lampertheim",
    municipality_name: "Lampertheim",
    district: "Gewerbegebiet Nord",
    street_address: "Edisonstraße 15",
    postal_code: "68623",
    latitude: 49.6055,
    longitude: 8.4720,
    industry_sector: "Leistungshalbleiter & Elektronik",
    wz_code: "26.11",
    employee_range: "250–499",
    turnover_estimated_range: "50–100 Mio. €",
    description: "Entwicklung und Fertigung von Leistungsdioden, Thyristoren und Halbleitermodulen.",
    website: "https://www.littelfuse.com",
    is_headquarters: false,
    source: "bundesanzeiger_northdata",
  },
  {
    id: "comp-brenntag-lampertheim",
    name: "Brenntag Chempartner",
    legal_form: "GmbH",
    municipality_id: "lampertheim",
    municipality_name: "Lampertheim",
    district: "Riedstraße",
    street_address: "Riedstraße 45",
    postal_code: "68623",
    latitude: 49.5910,
    longitude: 8.4710,
    industry_sector: "Chemiedistribution & Logistik",
    wz_code: "46.75",
    employee_range: "50–149",
    turnover_estimated_range: "25–50 Mio. €",
    description: "Zentrales Chemielager und Distributionsdrehscheibe im Südwesten.",
    website: "https://www.brenntag.com",
    is_headquarters: false,
    source: "bundesanzeiger_northdata",
  },
  {
    id: "comp-amprion-biblis",
    name: "Amprion Konverterstation Biblis",
    legal_form: "GmbH",
    municipality_id: "biblis",
    municipality_name: "Biblis",
    district: "Kernort",
    street_address: "Am Kernkraftwerk 1",
    postal_code: "68647",
    latitude: 49.7080,
    longitude: 8.4150,
    industry_sector: "Energieinfrastruktur & Gleichstromübertragung",
    wz_code: "35.12",
    employee_range: "50–99",
    turnover_estimated_range: "> 100 Mio. €",
    description: "Zentraler Einspeisepunkt für Gleichstromtrassen (Ultranet) zur Energiewende.",
    website: "https://www.amprion.net",
    is_headquarters: false,
    source: "bundesanzeiger_northdata",
  },
  {
    id: "comp-dentsply-sirona",
    name: "Dentsply Sirona Dental Systems",
    legal_form: "GmbH",
    municipality_id: "bensheim",
    municipality_name: "Bensheim",
    district: "Industriegebiet Süd",
    street_address: "Fabrikstraße 31",
    postal_code: "64625",
    latitude: 49.6730,
    longitude: 8.6180,
    industry_sector: "Medizintechnik & Dentalgeräte",
    wz_code: "32.50",
    employee_range: "1000+",
    turnover_estimated_range: "> 100 Mio. €",
    description: "Weltweit größter Standort für dentale Behandlungseinheiten und bildgebende Röntgensysteme.",
    website: "https://www.dentsplysirona.com",
    is_headquarters: true,
    source: "bundesanzeiger_northdata",
  },
  {
    id: "comp-surtec-bensheim",
    name: "SurTec International GmbH",
    legal_form: "GmbH",
    municipality_id: "bensheim",
    municipality_name: "Bensheim",
    district: "Industriegebiet Süd",
    street_address: "SurTec-Straße 2",
    postal_code: "64625",
    latitude: 49.6710,
    longitude: 8.6210,
    industry_sector: "Spezialchemie für Oberflächentechnik",
    wz_code: "20.59",
    employee_range: "100–249",
    turnover_estimated_range: "50–100 Mio. €",
    description: "Spezialist für industrielle Teilereinigung, funktionale und dekorative Galvanotechnik.",
    website: "https://www.surtec.com",
    is_headquarters: true,
    source: "bundesanzeiger_northdata",
  },
];

export const BASELINE_TAX_RATES: MunicipalityTaxRate[] = [
  { id: 1, municipality_id: "buerstadt", municipality_name: "Bürstadt", year: 2024, hebesatz_gewerbesteuer: 380, hebesatz_grundsteuer_a: 350, hebesatz_grundsteuer_b: 480, revenue_gewerbesteuer_eur: 9450000, tax_revenue_per_capita_eur: 1085.50, source: "haushalt_2024" },
  { id: 2, municipality_id: "lampertheim", municipality_name: "Lampertheim", year: 2024, hebesatz_gewerbesteuer: 400, hebesatz_grundsteuer_a: 360, hebesatz_grundsteuer_b: 520, revenue_gewerbesteuer_eur: 22800000, tax_revenue_per_capita_eur: 1265.40, source: "haushalt_2024" },
  { id: 3, municipality_id: "biblis", municipality_name: "Biblis", year: 2024, hebesatz_gewerbesteuer: 400, hebesatz_grundsteuer_a: 360, hebesatz_grundsteuer_b: 450, revenue_gewerbesteuer_eur: 4950000, tax_revenue_per_capita_eur: 1020.30, source: "haushalt_2024" },
  { id: 4, municipality_id: "gross-rohrheim", municipality_name: "Groß-Rohrheim", year: 2024, hebesatz_gewerbesteuer: 380, hebesatz_grundsteuer_a: 350, hebesatz_grundsteuer_b: 450, revenue_gewerbesteuer_eur: 2210000, tax_revenue_per_capita_eur: 948.20, source: "haushalt_2024" },
  { id: 5, municipality_id: "bensheim", municipality_name: "Bensheim", year: 2024, hebesatz_gewerbesteuer: 380, hebesatz_grundsteuer_a: 350, hebesatz_grundsteuer_b: 495, revenue_gewerbesteuer_eur: 34500000, tax_revenue_per_capita_eur: 1420.00, source: "haushalt_2024" },
  { id: 6, municipality_id: "heppenheim", municipality_name: "Heppenheim", year: 2024, hebesatz_gewerbesteuer: 390, hebesatz_grundsteuer_a: 350, hebesatz_grundsteuer_b: 490, revenue_gewerbesteuer_eur: 18400000, tax_revenue_per_capita_eur: 1210.50, source: "hsl_realsteuervergleich" },
  { id: 7, municipality_id: "viernheim", municipality_name: "Viernheim", year: 2024, hebesatz_gewerbesteuer: 410, hebesatz_grundsteuer_a: 370, hebesatz_grundsteuer_b: 550, revenue_gewerbesteuer_eur: 25600000, tax_revenue_per_capita_eur: 1340.20, source: "haushalt_2024" },
  { id: 8, municipality_id: "lorsch", municipality_name: "Lorsch", year: 2024, hebesatz_gewerbesteuer: 395, hebesatz_grundsteuer_a: 350, hebesatz_grundsteuer_b: 490, revenue_gewerbesteuer_eur: 8920000, tax_revenue_per_capita_eur: 1180.40, source: "hsl_realsteuervergleich" },
  { id: 9, municipality_id: "einhausen", municipality_name: "Einhausen", year: 2024, hebesatz_gewerbesteuer: 380, hebesatz_grundsteuer_a: 350, hebesatz_grundsteuer_b: 465, revenue_gewerbesteuer_eur: 3450000, tax_revenue_per_capita_eur: 925.80, source: "hsl_realsteuervergleich" },
  { id: 10, municipality_id: "zwingenberg", municipality_name: "Zwingenberg", year: 2024, hebesatz_gewerbesteuer: 380, hebesatz_grundsteuer_a: 350, hebesatz_grundsteuer_b: 470, revenue_gewerbesteuer_eur: 4120000, tax_revenue_per_capita_eur: 1125.00, source: "hsl_realsteuervergleich" },
  { id: 11, municipality_id: "lautertal", municipality_name: "Lautertal (Odenwald)", year: 2024, hebesatz_gewerbesteuer: 400, hebesatz_grundsteuer_a: 360, hebesatz_grundsteuer_b: 520, revenue_gewerbesteuer_eur: 2850000, tax_revenue_per_capita_eur: 740.10, source: "hsl_realsteuervergleich" },
  { id: 12, municipality_id: "lindenfels", municipality_name: "Lindenfels", year: 2024, hebesatz_gewerbesteuer: 420, hebesatz_grundsteuer_a: 380, hebesatz_grundsteuer_b: 580, revenue_gewerbesteuer_eur: 1420000, tax_revenue_per_capita_eur: 690.40, source: "hsl_realsteuervergleich" },
  { id: 13, municipality_id: "fuerth", municipality_name: "Fürth (Odenwald)", year: 2024, hebesatz_gewerbesteuer: 390, hebesatz_grundsteuer_a: 360, hebesatz_grundsteuer_b: 480, revenue_gewerbesteuer_eur: 4890000, tax_revenue_per_capita_eur: 860.20, source: "hsl_realsteuervergleich" },
  { id: 14, municipality_id: "rimbach", municipality_name: "Rimbach", year: 2024, hebesatz_gewerbesteuer: 380, hebesatz_grundsteuer_a: 350, hebesatz_grundsteuer_b: 460, revenue_gewerbesteuer_eur: 3450000, tax_revenue_per_capita_eur: 810.50, source: "hsl_realsteuervergleich" },
  { id: 15, municipality_id: "moerlenbach", municipality_name: "Mörlenbach", year: 2024, hebesatz_gewerbesteuer: 390, hebesatz_grundsteuer_a: 360, hebesatz_grundsteuer_b: 490, revenue_gewerbesteuer_eur: 4100000, tax_revenue_per_capita_eur: 850.30, source: "hsl_realsteuervergleich" },
  { id: 16, municipality_id: "birkenau", municipality_name: "Birkenau", year: 2024, hebesatz_gewerbesteuer: 400, hebesatz_grundsteuer_a: 370, hebesatz_grundsteuer_b: 510, revenue_gewerbesteuer_eur: 3600000, tax_revenue_per_capita_eur: 790.00, source: "hsl_realsteuervergleich" },
  { id: 17, municipality_id: "wald-michelbach", municipality_name: "Wald-Michelbach", year: 2024, hebesatz_gewerbesteuer: 400, hebesatz_grundsteuer_a: 360, hebesatz_grundsteuer_b: 500, revenue_gewerbesteuer_eur: 3850000, tax_revenue_per_capita_eur: 760.80, source: "hsl_realsteuervergleich" },
  { id: 18, municipality_id: "grasellenbach", municipality_name: "Grasellenbach", year: 2024, hebesatz_gewerbesteuer: 390, hebesatz_grundsteuer_a: 350, hebesatz_grundsteuer_b: 480, revenue_gewerbesteuer_eur: 1250000, tax_revenue_per_capita_eur: 710.20, source: "hsl_realsteuervergleich" },
  { id: 19, municipality_id: "abtsteinach", municipality_name: "Abtsteinach", year: 2024, hebesatz_gewerbesteuer: 380, hebesatz_grundsteuer_a: 350, hebesatz_grundsteuer_b: 450, revenue_gewerbesteuer_eur: 890000, tax_revenue_per_capita_eur: 780.00, source: "hsl_realsteuervergleich" },
  { id: 20, municipality_id: "gorxheimertal", municipality_name: "Gorxheimertal", year: 2024, hebesatz_gewerbesteuer: 390, hebesatz_grundsteuer_a: 360, hebesatz_grundsteuer_b: 470, revenue_gewerbesteuer_eur: 1180000, tax_revenue_per_capita_eur: 730.50, source: "hsl_realsteuervergleich" },
  { id: 21, municipality_id: "hirschhorn", municipality_name: "Hirschhorn (Neckar)", year: 2024, hebesatz_gewerbesteuer: 410, hebesatz_grundsteuer_a: 380, hebesatz_grundsteuer_b: 540, revenue_gewerbesteuer_eur: 1340000, tax_revenue_per_capita_eur: 750.00, source: "hsl_realsteuervergleich" },
  { id: 22, municipality_id: "neckarsteinach", municipality_name: "Neckarsteinach", year: 2024, hebesatz_gewerbesteuer: 400, hebesatz_grundsteuer_a: 370, hebesatz_grundsteuer_b: 520, revenue_gewerbesteuer_eur: 1280000, tax_revenue_per_capita_eur: 740.00, source: "hsl_realsteuervergleich" },
];

export const BASELINE_REGISTRATIONS: BusinessRegistration[] = [
  { id: 1, region_code: "kreis-bergstrasse", region_type: "county", year: 2024, registrations_total: 2640, new_foundations: 2180, relocations_in: 460, deregistrations_total: 2380, liquidations: 1940, relocations_out: 440, net_balance: 260, source: "hsl_d_i_1" },
  { id: 2, region_code: "kreis-bergstrasse", region_type: "county", year: 2023, registrations_total: 2580, new_foundations: 2140, relocations_in: 440, deregistrations_total: 2410, liquidations: 1980, relocations_out: 430, net_balance: 170, source: "hsl_d_i_1" },
  { id: 3, region_code: "kreis-bergstrasse", region_type: "county", year: 2022, registrations_total: 2490, new_foundations: 2050, relocations_in: 440, deregistrations_total: 2290, liquidations: 1860, relocations_out: 430, net_balance: 200, source: "hsl_d_i_1" },
  { id: 4, region_code: "kreis-bergstrasse", region_type: "county", year: 2021, registrations_total: 2620, new_foundations: 2190, relocations_in: 430, deregistrations_total: 2210, liquidations: 1790, relocations_out: 420, net_balance: 410, source: "hsl_d_i_1" },
  { id: 5, region_code: "kreis-bergstrasse", region_type: "county", year: 2020, registrations_total: 2380, new_foundations: 1960, relocations_in: 420, deregistrations_total: 2150, liquidations: 1740, relocations_out: 410, net_balance: 230, source: "hsl_d_i_1" },
  { id: 6, region_code: "buerstadt", region_type: "municipality", year: 2024, registrations_total: 184, new_foundations: 152, relocations_in: 32, deregistrations_total: 158, liquidations: 129, relocations_out: 29, net_balance: 26, source: "hsl_d_i_1" },
  { id: 7, region_code: "lampertheim", region_type: "municipality", year: 2024, registrations_total: 324, new_foundations: 268, relocations_in: 56, deregistrations_total: 298, liquidations: 245, relocations_out: 53, net_balance: 26, source: "hsl_d_i_1" },
  { id: 8, region_code: "biblis", region_type: "municipality", year: 2024, registrations_total: 88, new_foundations: 73, relocations_in: 15, deregistrations_total: 76, liquidations: 62, relocations_out: 14, net_balance: 12, source: "hsl_d_i_1" },
  { id: 9, region_code: "gross-rohrheim", region_type: "municipality", year: 2024, registrations_total: 38, new_foundations: 31, relocations_in: 7, deregistrations_total: 34, liquidations: 27, relocations_out: 7, net_balance: 4, source: "hsl_d_i_1" },
];

export const BASELINE_INDUSTRY_EMPLOYMENT: IndustryEmployment[] = [
  { id: 1, region_code: "kreis-bergstrasse", year: 2024, sector_code: "A", sector_name: "Land- & Forstwirtschaft", employees_count: 1320, share_percent: 1.6, source: "statistik_hessen" },
  { id: 2, region_code: "kreis-bergstrasse", year: 2024, sector_code: "B-F", sector_name: "Produzierendes Gewerbe & Industrie", employees_count: 26800, share_percent: 32.5, source: "statistik_hessen" },
  { id: 3, region_code: "kreis-bergstrasse", year: 2024, sector_code: "G-J", sector_name: "Handel, Verkehr, Gastgewerbe & Logistik", employees_count: 23100, share_percent: 28.0, source: "statistik_hessen" },
  { id: 4, region_code: "kreis-bergstrasse", year: 2024, sector_code: "K-N", sector_name: "Finanz- & Unternehmensdienstleister", employees_count: 14850, share_percent: 18.0, source: "statistik_hessen" },
  { id: 5, region_code: "kreis-bergstrasse", year: 2024, sector_code: "O-U", sector_name: "Öffentliche Hand, Gesundheit & Bildung", employees_count: 16430, share_percent: 19.9, source: "statistik_hessen" },
];

export const BASELINE_STARTUPS: StartupInitiative[] = [
  {
    id: "init-wfb-gruenderberatung",
    name: "Gründungsberatung Kreis Bergstraße",
    category: "consulting",
    organizer: "Wirtschaftsförderung Bergstraße GmbH (WFB)",
    description: "Kostenfreie Erstberatung, Begleitung bei Businessplan, Fördermitteln und Genehmigungen für Existenzgründer und Startups.",
    url: "https://www.wirtschaftsfoerderung-bergstrasse.de",
    funding_bracket: "Kostenlos",
    target_group: "Gründerinnen, Gründer & Nachfolger",
  },
  {
    id: "init-gruenderpreis-bergstrasse",
    name: "Gründerpreis Bergstraße",
    category: "competition",
    organizer: "Wirtschaftsförderung Bergstraße GmbH (WFB)",
    description: "Jährlicher Wettbewerb mit Auszeichnung innovativer Neugründungen in den Kategorien Mut, Innovation und Nachhaltigkeit.",
    url: "https://www.wirtschaftsfoerderung-bergstrasse.de/gruenderpreis",
    funding_bracket: "Bis zu 10.000 € Preisgeld",
    target_group: "Startups & Betriebe bis 5 Jahre",
  },
  {
    id: "init-hessen-ideen",
    name: "Hessen Ideen Stipendium",
    category: "grant",
    organizer: "Land Hessen & Hochschulen",
    description: "Förderstipendium für technologie- und wissensbasierte Gründungsprojekte von Studierenden und Hochschulabsolventen.",
    url: "https://www.hessen-ideen.de",
    funding_bracket: "2.000 € / Monat pro Gründer",
    target_group: "Akademische Gründungsteams",
  },
  {
    id: "init-wibank-mikrodarlehen",
    name: "WIBank Hessen-Mikrodarlehen",
    category: "grant",
    organizer: "WIBank Hessen",
    description: "Gefördertes Nachrangdarlehen zur Anschubfinanzierung von Betriebsmitteln und Erstinvestitionen.",
    url: "https://www.wibank.de",
    funding_bracket: "Bis 35.000 €",
    target_group: "Kleinbetriebe & Freiberufler",
  },
  {
    id: "init-hub31-darmstadt",
    name: "HUB31 Technologiezentrum",
    category: "hub",
    organizer: "IHK & Wissenschaftsstadt Darmstadt / Bergstraße",
    description: "Regionaler Technologie-Inkubator mit Co-Working, Sensorik-Labs und direktem Zugang zu Business Angels.",
    url: "https://www.hub31.de",
    funding_bracket: "Lab- & Office-Infrastruktur",
    target_group: "Deep-Tech & IoT-Startups",
  },
];

export async function fetchEconomyOverview(year = 2024): Promise<EconomyOverview> {

    const res = await fetch(new URL(`/api/v1/economy/overview?year=${year}`, env.BACKEND_API_URL), {
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Backend response not ok");
    return await res.json();

  throw new Error("Collected data unavailable");
}

export async function fetchCompanies(filter?: { municipality_id?: string; industry_sector?: string }): Promise<Company[]> {

    const url = new URL("/api/v1/economy/companies", env.BACKEND_API_URL);
    if (filter?.municipality_id) url.searchParams.set("municipality_id", filter.municipality_id);
    if (filter?.industry_sector) url.searchParams.set("industry_sector", filter.industry_sector);
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!res.ok) throw new Error("Backend response not ok");
    return await res.json();

  throw new Error("Collected data unavailable");
}

export async function fetchTaxRates(year?: number): Promise<MunicipalityTaxRate[]> {

    const url = new URL("/api/v1/economy/taxes", env.BACKEND_API_URL);
    if (year) url.searchParams.set("year", year.toString());
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!res.ok) throw new Error("Backend response not ok");
    return await res.json();

  throw new Error("Collected data unavailable");
}

export async function fetchBusinessRegistrations(regionCode?: string): Promise<BusinessRegistration[]> {

    const url = new URL("/api/v1/economy/registrations", env.BACKEND_API_URL);
    if (regionCode) url.searchParams.set("region_code", regionCode);
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!res.ok) throw new Error("Backend response not ok");
    return await res.json();

  throw new Error("Collected data unavailable");
}

export async function fetchIndustryStructure(regionCode = "kreis-bergstrasse", year = 2024): Promise<IndustryEmployment[]> {

    const url = new URL(`/api/v1/economy/industry-structure?region_code=${regionCode}&year=${year}`, env.BACKEND_API_URL);
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!res.ok) throw new Error("Backend response not ok");
    return await res.json();

  throw new Error("Collected data unavailable");
}

export async function fetchStartupInitiatives(): Promise<StartupInitiative[]> {

    const url = new URL("/api/v1/economy/startups", env.BACKEND_API_URL);
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!res.ok) throw new Error("Backend response not ok");
    return await res.json();

  throw new Error("Collected data unavailable");
}
