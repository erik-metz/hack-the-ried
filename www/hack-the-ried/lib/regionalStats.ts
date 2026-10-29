import { collectedFetch as fetch } from "./collectedBackend";
import { env } from "@/env";
import type { Reading, StationNode } from "./mapData";

export interface MunicipalIndicator {
  id: number;
  municipality: string;
  category: "employment" | "social" | "healthcare_density" | "associations" | "tourism";
  metric_key: string;
  period: string;
  period_date: string;
  value: number;
  unit: string;
  benchmark_value?: number | null;
  dimension: string;
  source: string;
  source_url?: string | null;
}

export interface SocialKpiSummary {
  municipality: string;
  unemployment_rate: number | null;
  unemployed_count: number | null;
  sgb2_recipients: number | null;
  sgb2_quota_pct: number | null;
  gp_doctors_per_10k: number | null;
  specialists_per_10k: number | null;
  pharmacies_count: number | null;
  versorgungsgrad_pct: number | null;
  total_clubs_count: number | null;
  sports_clubs_count: number | null;
  cultural_clubs_count: number | null;
  recycling_rate_percent: number | null;
  waste_kg_per_capita: number | null;
}

export interface ZakbWasteStat {
  id: number;
  municipality: string;
  year: number;
  fraction: "restmuell" | "biomuell" | "papier" | "wertstoffe" | "sperrmuell" | "schadstoffe" | "total";
  weight_tons: number;
  kg_per_capita: number;
  recycling_rate_percent: number | null;
  source: string;
}

export interface RegionalFacility {
  id: string;
  name: string;
  category: "healthcare" | "culture_sports" | "tourism";
  facility_type: "pharmacy" | "doctor_gp" | "doctor_specialist" | "sports_complex" | "culture_center" | "attraction";
  municipality: string;
  district?: string | null;
  street_address: string;
  postal_code: string;
  latitude: number;
  longitude: number;
  phone?: string | null;
  website?: string | null;
  description?: string | null;
  opening_hours?: Record<string, string> | null;
  extra_attributes?: Record<string, any> | null;
  is_active: boolean;
}

export interface CulturalEvent {
  id: string;
  title: string;
  organizer: string;
  venue_id?: string | null;
  venue_name: string;
  municipality: string;
  start_time: string;
  end_time?: string | null;
  category: "concert" | "exhibition" | "workshop" | "festival" | "sports" | "civic" | "market" | "theater";
  description?: string | null;
  ticket_url?: string | null;
  event_url?: string | null;
  image_url?: string | null;
  street_address?: string | null;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  expected_visitors?: number | null;
  status?: "scheduled" | "cancelled" | "postponed" | "past";
  is_free: boolean | null;
  is_archived?: boolean;
  source?: string;
}

// --- Verified Regional Baseline Data ---

export const BASELINE_SOCIAL_SUMMARIES: SocialKpiSummary[] = [
  {
    municipality: "Bürstadt",
    unemployment_rate: 3.7,
    unemployed_count: 345,
    sgb2_recipients: 680,
    sgb2_quota_pct: 4.0,
    gp_doctors_per_10k: 6.5,
    specialists_per_10k: 4.7,
    pharmacies_count: 3,
    versorgungsgrad_pct: 104.2,
    total_clubs_count: 72,
    sports_clubs_count: 24,
    cultural_clubs_count: 18,
    recycling_rate_percent: 68.4,
    waste_kg_per_capita: 373.9,
  },
  {
    municipality: "Lampertheim",
    unemployment_rate: 4.5,
    unemployed_count: 820,
    sgb2_recipients: 1650,
    sgb2_quota_pct: 5.0,
    gp_doctors_per_10k: 6.9,
    specialists_per_10k: 6.3,
    pharmacies_count: 7,
    versorgungsgrad_pct: 101.8,
    total_clubs_count: 118,
    sports_clubs_count: 41,
    cultural_clubs_count: 28,
    recycling_rate_percent: 67.9,
    waste_kg_per_capita: 383.5,
  },
  {
    municipality: "Biblis",
    unemployment_rate: 3.5,
    unemployed_count: 175,
    sgb2_recipients: 310,
    sgb2_quota_pct: 3.4,
    gp_doctors_per_10k: 5.4,
    specialists_per_10k: 3.2,
    pharmacies_count: 2,
    versorgungsgrad_pct: 94.5,
    total_clubs_count: 38,
    sports_clubs_count: 14,
    cultural_clubs_count: 9,
    recycling_rate_percent: 66.5,
    waste_kg_per_capita: 370.2,
  },
  {
    municipality: "Groß-Rohrheim",
    unemployment_rate: 3.2,
    unemployed_count: 68,
    sgb2_recipients: 115,
    sgb2_quota_pct: 3.0,
    gp_doctors_per_10k: 5.2,
    specialists_per_10k: 2.1,
    pharmacies_count: 1,
    versorgungsgrad_pct: 92.0,
    total_clubs_count: 19,
    sports_clubs_count: 7,
    cultural_clubs_count: 5,
    recycling_rate_percent: 67.1,
    waste_kg_per_capita: 368.5,
  },
  {
    municipality: "Kreis Bergstraße",
    unemployment_rate: 4.3,
    unemployed_count: 6200,
    sgb2_recipients: 13500,
    sgb2_quota_pct: 4.9,
    gp_doctors_per_10k: 6.2,
    specialists_per_10k: 7.8,
    pharmacies_count: 54,
    versorgungsgrad_pct: 100.0,
    total_clubs_count: 850,
    sports_clubs_count: 280,
    cultural_clubs_count: 210,
    recycling_rate_percent: 67.2,
    waste_kg_per_capita: 383.1,
  },
  {
    municipality: "Hessen",
    unemployment_rate: 5.2,
    unemployed_count: 175000,
    sgb2_recipients: 360000,
    sgb2_quota_pct: 5.7,
    gp_doctors_per_10k: 6.4,
    specialists_per_10k: 8.5,
    pharmacies_count: 1320,
    versorgungsgrad_pct: 100.0,
    total_clubs_count: 22000,
    sports_clubs_count: 7500,
    cultural_clubs_count: 5400,
    recycling_rate_percent: 65.8,
    waste_kg_per_capita: 395.0,
  },
];

export const BASELINE_WASTE_STATS: ZakbWasteStat[] = [
  { id: 1, municipality: "Bürstadt", year: 2025, fraction: "restmuell", weight_tons: 1995.0, kg_per_capita: 117.5, recycling_rate_percent: 0.0, source: "ZAKB" },
  { id: 2, municipality: "Bürstadt", year: 2025, fraction: "biomuell", weight_tons: 2280.0, kg_per_capita: 134.3, recycling_rate_percent: 99.0, source: "ZAKB" },
  { id: 3, municipality: "Bürstadt", year: 2025, fraction: "papier", weight_tons: 1120.0, kg_per_capita: 66.0, recycling_rate_percent: 99.4, source: "ZAKB" },
  { id: 4, municipality: "Bürstadt", year: 2025, fraction: "wertstoffe", weight_tons: 615.0, kg_per_capita: 36.2, recycling_rate_percent: 89.5, source: "ZAKB" },
  { id: 5, municipality: "Bürstadt", year: 2025, fraction: "sperrmuell", weight_tons: 355.0, kg_per_capita: 20.9, recycling_rate_percent: 64.0, source: "ZAKB" },
  { id: 6, municipality: "Bürstadt", year: 2025, fraction: "total", weight_tons: 6365.0, kg_per_capita: 373.9, recycling_rate_percent: 68.4, source: "ZAKB" },

  { id: 7, municipality: "Lampertheim", year: 2025, fraction: "restmuell", weight_tons: 4045.0, kg_per_capita: 122.0, recycling_rate_percent: 0.0, source: "ZAKB" },
  { id: 8, municipality: "Lampertheim", year: 2025, fraction: "biomuell", weight_tons: 4410.0, kg_per_capita: 133.0, recycling_rate_percent: 98.8, source: "ZAKB" },
  { id: 9, municipality: "Lampertheim", year: 2025, fraction: "papier", weight_tons: 2290.0, kg_per_capita: 69.1, recycling_rate_percent: 99.1, source: "ZAKB" },
  { id: 10, municipality: "Lampertheim", year: 2025, fraction: "wertstoffe", weight_tons: 1210.0, kg_per_capita: 36.5, recycling_rate_percent: 89.0, source: "ZAKB" },
  { id: 11, municipality: "Lampertheim", year: 2025, fraction: "sperrmuell", weight_tons: 760.0, kg_per_capita: 22.9, recycling_rate_percent: 63.5, source: "ZAKB" },
  { id: 12, municipality: "Lampertheim", year: 2025, fraction: "total", weight_tons: 12715.0, kg_per_capita: 383.5, recycling_rate_percent: 67.9, source: "ZAKB" },

  { id: 13, municipality: "Kreis Bergstraße", year: 2025, fraction: "restmuell", weight_tons: 33800.0, kg_per_capita: 124.5, recycling_rate_percent: 0.0, source: "ZAKB" },
  { id: 14, municipality: "Kreis Bergstraße", year: 2025, fraction: "biomuell", weight_tons: 35600.0, kg_per_capita: 131.1, recycling_rate_percent: 98.4, source: "ZAKB" },
  { id: 15, municipality: "Kreis Bergstraße", year: 2025, fraction: "papier", weight_tons: 18700.0, kg_per_capita: 68.9, recycling_rate_percent: 99.0, source: "ZAKB" },
  { id: 16, municipality: "Kreis Bergstraße", year: 2025, fraction: "wertstoffe", weight_tons: 9800.0, kg_per_capita: 36.1, recycling_rate_percent: 88.5, source: "ZAKB" },
  { id: 17, municipality: "Kreis Bergstraße", year: 2025, fraction: "sperrmuell", weight_tons: 6100.0, kg_per_capita: 22.5, recycling_rate_percent: 61.8, source: "ZAKB" },
  { id: 18, municipality: "Kreis Bergstraße", year: 2025, fraction: "total", weight_tons: 104000.0, kg_per_capita: 383.1, recycling_rate_percent: 67.2, source: "ZAKB" },
];

export const BASELINE_FACILITIES: RegionalFacility[] = [
  // Healthcare
  {
    id: "fac-apo-bst-sonnen",
    name: "Sonnen-Apotheke Bürstadt",
    category: "healthcare",
    facility_type: "pharmacy",
    municipality: "Bürstadt",
    district: "Kernstadt",
    street_address: "Mainstraße 12",
    postal_code: "68642",
    latitude: 49.6425,
    longitude: 8.4528,
    phone: "06206 6358",
    website: "https://sonnen-apotheke-buerstadt.de",
    description: "Zentrale Apotheke in der Fußgängerzone Bürstadt mit Notdienstbereitschaft.",
    opening_hours: { "Mo-Fr": "08:30–18:30", Sa: "08:30–13:00" },
    extra_attributes: { emergency_duty: false, prescription_delivery: true, badge: "Apotheke" },
    is_active: true,
  },
  {
    id: "fac-apo-bst-nibelungen",
    name: "Nibelungen-Apotheke Bürstadt",
    category: "healthcare",
    facility_type: "pharmacy",
    municipality: "Bürstadt",
    district: "Kernstadt",
    street_address: "Wilhelminenstraße 10",
    postal_code: "68642",
    latitude: 49.6441,
    longitude: 8.4560,
    phone: "06206 963131",
    website: "https://nibelungen-apotheke-buerstadt.de",
    description: "Vollversorgende Apotheke nahe Bahnhof Bürstadt mit Notdienst.",
    opening_hours: { "Mo-Fr": "08:30–18:30", Sa: "09:00–13:00" },
    extra_attributes: { emergency_duty: true, badge: "Notdienst Apotheke" },
    is_active: true,
  },
  {
    id: "fac-apo-la-andreas",
    name: "Andreas-Apotheke Lampertheim",
    category: "healthcare",
    facility_type: "pharmacy",
    municipality: "Lampertheim",
    district: "Kernstadt",
    street_address: "Kaiserstraße 18",
    postal_code: "68623",
    latitude: 49.5938,
    longitude: 8.4682,
    phone: "06206 2445",
    website: "https://andreas-apotheke-lampertheim.de",
    description: "Traditionsapotheke im Herzen Lampertheims.",
    opening_hours: { "Mo-Fr": "08:00–19:00", Sa: "08:30–14:00" },
    extra_attributes: { emergency_duty: true, badge: "Notdienst Apotheke" },
    is_active: true,
  },
  {
    id: "fac-doc-bst-hausarzt",
    name: "Hausarztzentrum & Allgemeinmedizin Bürstadt",
    category: "healthcare",
    facility_type: "doctor_gp",
    municipality: "Bürstadt",
    district: "Kernstadt",
    street_address: "Nibelungenstraße 42",
    postal_code: "68642",
    latitude: 49.6416,
    longitude: 8.4532,
    phone: "06206 70010",
    website: "https://hausarzt-buerstadt.de",
    description: "Gemeinschaftspraxis für Allgemeinmedizin, Innere Medizin und Akutversorgung.",
    opening_hours: { "Mo-Fr": "08:00–12:00, 15:00–18:00" },
    extra_attributes: { specialty: "Allgemeinmedizin", badge: "Hausarzt" },
    is_active: true,
  },
  {
    id: "fac-doc-la-mvz",
    name: "Medizinisches Versorgungszentrum (MVZ) Lampertheim",
    category: "healthcare",
    facility_type: "doctor_specialist",
    municipality: "Lampertheim",
    district: "Kernstadt",
    street_address: "Neue Schulstraße 28",
    postal_code: "68623",
    latitude: 49.5962,
    longitude: 8.4715,
    phone: "06206 9450",
    website: "https://mvz-lampertheim.de",
    description: "Fachärztliches Versorgungszentrum: Orthopädie, Kardiologie & Chirurgie.",
    opening_hours: { "Mo-Fr": "08:00–18:00" },
    extra_attributes: { specialty: "Facharztzentrum", badge: "MVZ" },
    is_active: true,
  },

  // Culture & Sports
  {
    id: "fac-kamue-kulturzentrum",
    name: "KAMÜ Kulturzentrum Bürstadt",
    category: "culture_sports",
    facility_type: "culture_center",
    municipality: "Bürstadt",
    district: "Kernstadt",
    street_address: "Industriestraße 11",
    postal_code: "68642",
    latitude: 49.6457,
    longitude: 8.4582,
    phone: "06206 157980",
    website: "https://kamue.me",
    description: "Soziokulturelles Zentrum, Initiator von HackTheRied, Raum für Konzerte, Theater, Workshops & Hackathons.",
    opening_hours: { "Di-So": "16:00–22:00" },
    extra_attributes: { is_kamue_hub: true, badge: "KAMÜ Kulturzentrum" },
    is_active: true,
  },
  {
    id: "fac-bst-sportpark",
    name: "Sportpark Bürstadt & alla hopp!",
    category: "culture_sports",
    facility_type: "sports_complex",
    municipality: "Bürstadt",
    district: "Kernstadt",
    street_address: "Wasserwerkstraße 4",
    postal_code: "68642",
    latitude: 49.6385,
    longitude: 8.4595,
    phone: "06206 7010",
    website: "https://buerstadt.de/sportpark",
    description: "Moderner Bürger- und Vereinssportpark mit Leichtathletikanlagen und Mehrgenerationen-Parcours.",
    opening_hours: { "Mo-So": "08:00–21:30" },
    extra_attributes: { badge: "Sportpark" },
    is_active: true,
  },
  {
    id: "fac-la-altrheinhalle",
    name: "Altrheinhalle & Sportzentrum Lampertheim",
    category: "culture_sports",
    facility_type: "sports_complex",
    municipality: "Lampertheim",
    district: "Kernstadt",
    street_address: "Biedensandstraße 57",
    postal_code: "68623",
    latitude: 49.5982,
    longitude: 8.4542,
    phone: "06206 9350",
    website: "https://lampertheim.de",
    description: "Große Dreifelderhalle für Hallensportarten und Kulturveranstaltungen.",
    opening_hours: { "Mo-Sa": "08:00–22:00" },
    extra_attributes: { badge: "Sporthalle" },
    is_active: true,
  },
  {
    id: "fac-la-kanuclub",
    name: "Kanu-Club Lampertheim 1929",
    category: "culture_sports",
    facility_type: "sports_complex",
    municipality: "Lampertheim",
    district: "Kernstadt",
    street_address: "Römerstraße 108 / Altrhein",
    postal_code: "68623",
    latitude: 49.5915,
    longitude: 8.4610,
    phone: "06206 4501",
    website: "https://kanu-club-lampertheim.de",
    description: "Kanu-Rennsport- und Breitensportstützpunkt direkt am Lampertheimer Altrheinarm.",
    opening_hours: { "Mo-So": "09:00–20:00" },
    extra_attributes: { badge: "Wassersport" },
    is_active: true,
  },

  // Tourism & Nature
  {
    id: "fac-tour-kloster-lorsch",
    name: "UNESCO Welterbe Kloster Lorsch & Lauresham",
    category: "tourism",
    facility_type: "attraction",
    municipality: "Lorsch",
    district: "Klosterbezirk",
    street_address: "Im Klosterbezirk 1",
    postal_code: "64653",
    latitude: 49.6538,
    longitude: 8.5695,
    phone: "06251 869200",
    website: "https://kloster-lorsch.de",
    description: "Karolingische Königshalle (UNESCO-Weltkulturerbe 1991) und Experimentalarchäologisches Freilichtlabor.",
    opening_hours: { "Di-So": "10:00–17:00" },
    extra_attributes: { unesco: true, badge: "UNESCO Welterbe" },
    is_active: true,
  },
  {
    id: "fac-tour-biedensand",
    name: "Naturschutzgebiet Lampertheimer Altrhein (Biedensand)",
    category: "tourism",
    facility_type: "attraction",
    municipality: "Lampertheim",
    district: "Biedensand",
    street_address: "Biedensandstraße",
    postal_code: "68623",
    latitude: 49.5960,
    longitude: 8.4480,
    phone: "06206 9350",
    website: "https://lampertheim.de",
    description: "Größte Auenlandschaft Hessens mit 14,5 km Rundwanderwegen und Beobachtungstürmen.",
    opening_hours: { "Mo-So": "00:00–24:00" },
    extra_attributes: { badge: "Naturerlebnis" },
    is_active: true,
  },
  {
    id: "fac-tour-biedensand-baeder",
    name: "Biedensand Bäder Lampertheim (Hallen- & Freibad)",
    category: "tourism",
    facility_type: "attraction",
    municipality: "Lampertheim",
    district: "Kernstadt",
    street_address: "Weidweg 40",
    postal_code: "68623",
    latitude: 49.5975,
    longitude: 8.4548,
    phone: "06206 94460",
    website: "https://biedensand-baeder.de",
    description: "Großzügiges Freizeit- und Hallenbad mit 50m-Becken, Liegewiese und Saunalandschaft.",
    opening_hours: { "Di-Fr": "06:30–21:00", "Sa-So": "08:00–20:00" },
    extra_attributes: { badge: "Erlebnisbad" },
    is_active: true,
  },
  {
    id: "fac-tour-boxheimerhof",
    name: "Historischer Boxheimerhof Bürstadt",
    category: "tourism",
    facility_type: "attraction",
    municipality: "Bürstadt",
    district: "Boxheimerhof",
    street_address: "Boxheimerhof 1",
    postal_code: "68642",
    latitude: 49.6290,
    longitude: 8.4800,
    website: "https://buerstadt.de",
    description: "Historischer Gutshof des Klosters Lorsch mit romanischer Kapelle St. Anna (1285).",
    opening_hours: { "Mo-So": "00:00–24:00" },
    extra_attributes: { badge: "Denkmal" },
    is_active: true,
  },
];

export const BASELINE_EVENTS: CulturalEvent[] = [
  // 1. Bürstädter Kerwe (Großes Bürger- & Kirchweihfest)
  {
    id: "evt-bst-kerwe-2026",
    title: "Bürstädter Kerwe (Kirchweih Bürstadt)",
    organizer: "Stadt Bürstadt & Vereins-AG",
    venue_id: "fac-bst-buergerhaus",
    venue_name: "Bürgerhaus & Marktplatz Bürstadt",
    municipality: "Bürstadt",
    start_time: "2026-10-02T17:00:00+02:00",
    end_time: "2026-10-05T23:00:00+02:00",
    category: "festival",
    description: "Traditionelles Bürger- und Kirchweihfest mit großem Kerwe-Umzug, Fahrgeschäften auf dem Marktplatz, Live-Musik und Ständen der Bürstädter Vereine.",
    ticket_url: "https://www.buerstadt.de/de/kultur-freizeit/veranstaltungen/veranstaltungskalender",
    event_url: "https://www.buerstadt.de",
    street_address: "Rathausstraße 2",
    postal_code: "68642",
    status: "scheduled",
    is_free: true,
    is_archived: false,
    source: "stadt_buerstadt",
  },
  // 2. Chako Habekost (Kulturbeirat Bürstadt / Reservix)
  {
    id: "evt-bst-chako-2026",
    title: "Christian „CHAKO“ Habekost – Es kummt wie’s kummt",
    organizer: "Kulturbeirat Bürstadt",
    venue_id: "fac-bst-buergerhaus",
    venue_name: "Bürgerhaus Bürstadt",
    municipality: "Bürstadt",
    start_time: "2026-11-05T20:00:00+01:00",
    end_time: "2026-11-05T22:30:00+01:00",
    category: "theater",
    description: "Neues Comedy- und Mundart-Soloprogramm des Kurpfälzer Kult-Kabarettisten live im Bürstädter Bürgerhaus.",
    ticket_url: "https://kulturbeirat-buerstadt.reservix.de",
    event_url: "https://www.reservix.de",
    street_address: "Rathausstraße 2",
    postal_code: "68642",
    status: "scheduled",
    is_free: false,
    is_archived: false,
    source: "reservix",
  },
  // 3. Bürstädter Stadtlauf (TSG Bürstadt)
  {
    id: "evt-bst-stadtlauf-2026",
    title: "34. Bürstädter Stadtlauf & Schülercup",
    organizer: "TSG 1855 Bürstadt e.V.",
    venue_id: "fac-bst-sportpark",
    venue_name: "Sportpark Bürstadt",
    municipality: "Bürstadt",
    start_time: "2026-11-08T09:30:00+01:00",
    end_time: "2026-11-08T14:00:00+01:00",
    category: "sports",
    description: "Traditioneller Volkslauf mit 5 km, 10 km und Schülerstaffeln der TSG 1855 Bürstadt durch das Stadtgebiet.",
    ticket_url: "https://www.buerstadt.de/de/kultur-freizeit/veranstaltungen/veranstaltungskalender",
    event_url: "https://tsg-buerstadt.de",
    street_address: "Wasserwerkstraße 4",
    postal_code: "68642",
    status: "scheduled",
    is_free: false,
    is_archived: false,
    source: "tsg_buerstadt",
  },
  // 4. Bürstadt im Advent
  {
    id: "evt-bst-advent-2026",
    title: "Bürstadt im Advent & Kunsthandwerkermarkt",
    organizer: "Stadt Bürstadt",
    venue_id: "fac-bst-buergerhaus",
    venue_name: "Historisches Rathaus & Marktplatz",
    municipality: "Bürstadt",
    start_time: "2026-12-04T17:00:00+01:00",
    end_time: "2026-12-06T20:00:00+01:00",
    category: "market",
    description: "Festliche Budenstadt rund um das historische Rathaus Bürstadt mit Kunsthandwerk, Chormusik und winterlichen Spezialitäten.",
    ticket_url: "https://www.buerstadt.de/de/kultur-freizeit/veranstaltungen/veranstaltungskalender",
    event_url: "https://www.buerstadt.de",
    street_address: "Rathausstraße 2",
    postal_code: "68642",
    status: "scheduled",
    is_free: true,
    is_archived: false,
    source: "stadt_buerstadt",
  },
  // 5. Lampertheimer Spargelfest (Historisches Referenz-Event 2026)
  {
    id: "evt-la-spargelfest-2026",
    title: "Lampertheimer Spargelfest",
    organizer: "Stadt Lampertheim (Fachbereich Kultur & Stadtmarketing)",
    venue_id: "fac-la-altrheinhalle",
    venue_name: "Schillerplatz, Europaplatz & Domgasse",
    municipality: "Lampertheim",
    start_time: "2026-06-12T16:00:00+02:00",
    end_time: "2026-06-14T23:00:00+02:00",
    category: "festival",
    description: "Das größte traditionelle Volksfest der Spargelstadt Lampertheim mit Spargelkönigin, Live-Bühnen, Gastromeile und Kunsthandwerk.",
    ticket_url: "https://www.lampertheim.de",
    event_url: "https://www.lampertheim.de",
    street_address: "Schillerplatz",
    postal_code: "68623",
    status: "past",
    is_free: true,
    is_archived: false,
    source: "stadt_lampertheim",
  },
  // 6. Dance Masters (Hans-Pfeiffer-Halle Lampertheim / Reservix)
  {
    id: "evt-la-dance-masters-2027",
    title: "DANCE MASTERS! Best of Irish Dance",
    organizer: "Reset Production",
    venue_id: "fac-la-altrheinhalle",
    venue_name: "Hans-Pfeiffer-Halle Lampertheim",
    municipality: "Lampertheim",
    start_time: "2027-01-31T19:00:00+01:00",
    end_time: "2027-01-31T21:30:00+01:00",
    category: "concert",
    description: "Die mitreißende Stepptanzerfolgs-Show live in Lampertheim mit original irischen Stepptänzern und Live-Band.",
    ticket_url: "https://www.reservix.de",
    event_url: "https://www.lampertheim.de",
    street_address: "Weidweg 4",
    postal_code: "68623",
    status: "scheduled",
    is_free: false,
    is_archived: false,
    source: "reservix",
  },
  // 7. Lampertheimer Weihnachtsmarkt am Dom
  {
    id: "evt-la-weihnachtsmarkt-2026",
    title: "Lampertheimer Weihnachtsmarkt am Dom",
    organizer: "Stadt Lampertheim & Gewerbeverein",
    venue_id: "fac-la-altrheinhalle",
    venue_name: "Domplatz & St. Andreas Lampertheim",
    municipality: "Lampertheim",
    start_time: "2026-11-27T16:00:00+01:00",
    end_time: "2026-11-29T21:00:00+01:00",
    category: "market",
    description: "Atmosphärischer Adventsmarkt vor der Kulisse der Domkirche mit regionalen Ausstellern und Bühnenprogramm.",
    ticket_url: "https://www.lampertheim.de",
    event_url: "https://www.lampertheim.de",
    street_address: "Römerstraße 102",
    postal_code: "68623",
    status: "scheduled",
    is_free: true,
    is_archived: false,
    source: "stadt_lampertheim",
  },
  // 8. Bibliser Gurkenfest (Historisches Referenz-Event 2026)
  {
    id: "evt-bib-gurkenfest-2026",
    title: "72. Bibliser Gurkenfest & Inthronisation",
    organizer: "Wirtschafts- und Verkehrsverein Biblis e.V.",
    venue_name: "Rathausplatz & Bürgerzentrum Biblis",
    municipality: "Biblis",
    start_time: "2026-06-26T18:00:00+02:00",
    end_time: "2026-06-29T22:00:00+02:00",
    category: "festival",
    description: "Traditionelles Heimat- und Straßenfest mit Inthronisation der neuen Bibliser Gurkenkönigin, Festmeile und Feuerwerk.",
    ticket_url: "https://www.biblis.eu",
    event_url: "https://www.biblis.eu",
    street_address: "Darmstädter Straße 25",
    postal_code: "68647",
    status: "past",
    is_free: true,
    is_archived: false,
    source: "gemeinde_biblis",
  },
  // 9. Bibliser Weihnachtsmarkt
  {
    id: "evt-bib-weihnachtsmarkt-2026",
    title: "Bibliser Weihnachtsmarkt",
    organizer: "Bürgerstiftung & Vereine Biblis",
    venue_name: "Darmstädter Straße & Bürgerzentrum",
    municipality: "Biblis",
    start_time: "2026-11-28T14:00:00+01:00",
    end_time: "2026-11-29T20:00:00+01:00",
    category: "market",
    description: "Vorweihnachtliche Stimmung mit lokalen Chören, Vereinen und regionalen Spezialitäten im Bürgerzentrum Biblis.",
    ticket_url: "https://www.biblis.eu",
    event_url: "https://www.biblis.eu",
    street_address: "Darmstädter Straße 25",
    postal_code: "68647",
    status: "scheduled",
    is_free: true,
    is_archived: false,
    source: "gemeinde_biblis",
  },
  // 10. Rohremer Kerb (Groß-Rohrheim)
  {
    id: "evt-gr-rohremer-kerb-2026",
    title: "Rohremer Kerb (Kirchweih Groß-Rohrheim)",
    organizer: "Gemeinde & Vereinsring Groß-Rohrheim",
    venue_name: "Bürgerhalle & Festplatz Groß-Rohrheim",
    municipality: "Groß-Rohrheim",
    start_time: "2026-10-02T18:00:00+02:00",
    end_time: "2026-10-05T22:00:00+02:00",
    category: "festival",
    description: "Traditionelle Rohremer Kirchweih mit Kerwe-Gottesdienst, Aufstellen des Kerwebaums, Kerweredd und Tanzabend in der Bürgerhalle.",
    ticket_url: "https://www.gross-rohrheim.de",
    event_url: "https://www.gross-rohrheim.de",
    street_address: "Kornstraße 1",
    postal_code: "68649",
    status: "scheduled",
    is_free: true,
    is_archived: false,
    source: "gross_rohrheim",
  },
  // 11. HackTheRied Hackathon Infoabend (KAMÜ)
  {
    id: "evt-kamue-hackathon-info",
    title: "HackTheRied & Smart City Hackathon Infoabend",
    organizer: "KAMÜ Kulturzentrum",
    venue_id: "fac-kamue-kulturzentrum",
    venue_name: "KAMÜ Kulturzentrum Bürstadt",
    municipality: "Bürstadt",
    start_time: "2026-10-15T18:30:00+02:00",
    end_time: "2026-10-15T21:30:00+02:00",
    category: "workshop",
    description: "Einführung in die offenen Sensordaten, REST-API-Zugriff, Sensorknoten-Bau und Themen für den regionalen Ried-Hackathon.",
    ticket_url: "https://kamue.me",
    event_url: "https://kamue.me",
    street_address: "Mainstraße",
    postal_code: "68642",
    status: "scheduled",
    is_free: true,
    is_archived: false,
    source: "kamue_events",
  },
  // 12. Ried Acoustic Session (KAMÜ)
  {
    id: "evt-kamue-live-acoustic",
    title: "Ried Acoustic Session – Lokale Singer/Songwriter",
    organizer: "KAMÜ Kulturzentrum",
    venue_id: "fac-kamue-kulturzentrum",
    venue_name: "KAMÜ Kulturzentrum Bürstadt",
    municipality: "Bürstadt",
    start_time: "2026-10-24T20:00:00+02:00",
    end_time: "2026-10-24T23:00:00+02:00",
    category: "concert",
    description: "Gemütlicher Live-Musikabend mit regionalen Singer/Songwritern aus dem Ried und der Metropolregion Rhein-Neckar.",
    ticket_url: "https://kamue.me",
    event_url: "https://kamue.me",
    street_address: "Mainstraße",
    postal_code: "68642",
    status: "scheduled",
    is_free: false,
    is_archived: false,
    source: "kamue_events",
  },
  // 13. ZAKB Repair-Café
  {
    id: "evt-zakb-repair-cafe",
    title: "ZAKB Repair-Café & Nachhaltigkeitswerkstatt",
    organizer: "ZAKB & Bürgerstiftung Bürstadt",
    venue_id: "fac-bst-buergerhaus",
    venue_name: "Bürgerhaus Bürstadt",
    municipality: "Bürstadt",
    start_time: "2026-11-14T14:00:00+01:00",
    end_time: "2026-11-14T17:30:00+01:00",
    category: "civic",
    description: "Gemeinsam defekte Haushaltsgeräte, Fahrräder und Elektronik reparieren statt wegwerfen – unterstützt von ehrenamtlichen Experten.",
    ticket_url: "https://www.zakb.de",
    event_url: "https://www.zakb.de",
    street_address: "Rathausstraße 2",
    postal_code: "68642",
    status: "scheduled",
    is_free: true,
    is_archived: false,
    source: "zakb_bergstrasse",
  },
  // 14. Ried-Spargelwanderung (Historisches Referenz-Event 2026)
  {
    id: "evt-bst-spargelwanderung-2026",
    title: "Ried-Spargelwanderung Bürstadt / Lampertheim",
    organizer: "Bauernverband & Touristikgemeinschaft Ried",
    venue_name: "Feldflur Bürstadt – Lampertheim (Spargelhöfe)",
    municipality: "Bürstadt",
    start_time: "2026-05-01T10:00:00+02:00",
    end_time: "2026-05-01T18:00:00+02:00",
    category: "festival",
    description: "Traditionelle Wanderung auf den Feldwegen zwischen Bürstadt und Lampertheim mit Genussstationen regionaler Spargelanbauer.",
    ticket_url: "https://www.buerstadt.de",
    event_url: "https://www.buerstadt.de",
    street_address: "Feldflur Ried",
    postal_code: "68642",
    status: "past",
    is_free: true,
    is_archived: false,
    expected_visitors: 1200,
    latitude: 49.625,
    longitude: 8.460,
    source: "tourismus_ried",
  },
  // --- Lampertheim Events ---
  {
    id: "evt-la-ria-arbeit",
    title: "RIA – Rein in die Arbeit (Bürgerberatung & Berufseinstieg)",
    organizer: "Lernmobil e.V. & Stadt Lampertheim",
    venue_name: "Stadthaus Lampertheim (Sitzungssaal)",
    municipality: "Lampertheim",
    start_time: "2026-10-02T10:00:00+02:00",
    end_time: "2026-10-02T13:00:00+02:00",
    category: "civic",
    description: "Kostenfreie offene Sprechstunde und Beratung für Wiedereinsteiger, Jobsuchende und berufliche Weiterbildung im Ried.",
    ticket_url: "https://www.lampertheim.de/de/veranstaltungen/",
    event_url: "https://www.lampertheim.de",
    street_address: "Römerstraße 102",
    postal_code: "68623",
    latitude: 49.594,
    longitude: 8.467,
    status: "scheduled",
    is_free: true,
    is_archived: false,
    expected_visitors: 45,
    source: "stadt_lampertheim",
  },
  {
    id: "evt-la-inklusionscafe",
    title: "Inklusionscafé in der Notkirche",
    organizer: "Behindertenbeirat der Stadt Lampertheim",
    venue_name: "Saal der Notkirche (Lukasgemeinde)",
    municipality: "Lampertheim",
    start_time: "2026-10-02T15:00:00+02:00",
    end_time: "2026-10-02T17:00:00+02:00",
    category: "civic",
    description: "Offener Treffpunkt für Menschen mit und ohne Beeinträchtigung bei Kaffee, Kuchen und barrierefreiem Austausch.",
    ticket_url: "https://www.lampertheim.de/de/veranstaltungen/",
    event_url: "https://www.lampertheim.de",
    street_address: "Römerstraße 94",
    postal_code: "68623",
    latitude: 49.595,
    longitude: 8.468,
    status: "scheduled",
    is_free: true,
    is_archived: false,
    expected_visitors: 60,
    source: "stadt_lampertheim",
  },
  {
    id: "evt-la-spieletreff-huettenfeld",
    title: "Spieletreff in Hüttenfeld",
    organizer: "Ortsbeirat Hüttenfeld & Vereine",
    venue_name: "Bürgerhaus Hüttenfeld",
    municipality: "Lampertheim",
    start_time: "2026-10-02T18:00:00+02:00",
    end_time: "2026-10-02T21:00:00+02:00",
    category: "civic",
    description: "Gemeinsamer Gesellschaftsspieleabend für Jung und Alt im Stadtteil Hüttenfeld. Brettspiele, Kartenspiele und Snacks.",
    ticket_url: "https://www.lampertheim.de/de/veranstaltungen/",
    event_url: "https://www.lampertheim.de",
    street_address: "Alfred-Delp-Straße 50",
    postal_code: "68623",
    latitude: 49.598,
    longitude: 8.587,
    status: "scheduled",
    is_free: true,
    is_archived: false,
    expected_visitors: 40,
    source: "stadt_lampertheim",
  },
  {
    id: "evt-la-tag-der-vielfalt",
    title: "Tag der Vielfalt im Vogelpark Lampertheim",
    organizer: "Vogelpark Lampertheim e.V.",
    venue_name: "Vogelpark Lampertheim",
    municipality: "Lampertheim",
    start_time: "2026-10-03T11:00:00+02:00",
    end_time: "2026-10-03T17:00:00+02:00",
    category: "festival",
    description: "Familienfest rund um Natur, Artenschutz und gelebte Vielfalt im Vogelpark mit Führungen, Kinderprogramm und Kulinarischem.",
    ticket_url: "https://www.lampertheim.de/de/veranstaltungen/",
    event_url: "https://www.lampertheim.de",
    street_address: "In den Böllenruthen",
    postal_code: "68623",
    latitude: 49.601,
    longitude: 8.455,
    status: "scheduled",
    is_free: true,
    is_archived: false,
    expected_visitors: 650,
    source: "stadt_lampertheim",
  },
  {
    id: "evt-la-zanderessen-olympia",
    title: "Traditionelles Zanderessen des FC Olympia",
    organizer: "FC Olympia 1909 Lampertheim e.V.",
    venue_name: "Vereinsheim im Adam-Günderoth-Stadion",
    municipality: "Lampertheim",
    start_time: "2026-10-03T11:30:00+02:00",
    end_time: "2026-10-03T14:30:00+02:00",
    category: "festival",
    description: "Das beliebte Vereinsfest mit frischem Zanderfilet, Kartoffelsalat und hausgemachter Remouladensauce im Stadion.",
    ticket_url: "https://www.lampertheim.de/de/veranstaltungen/",
    event_url: "https://www.lampertheim.de",
    street_address: "Weidweg 6",
    postal_code: "68623",
    latitude: 49.591,
    longitude: 8.472,
    status: "scheduled",
    is_free: true,
    is_archived: false,
    expected_visitors: 300,
    source: "stadt_lampertheim",
  },
  {
    id: "evt-la-chor-joyful-2026",
    title: "Konzert Chor Joyful – The Show Must Go On",
    organizer: "MGV 1840 Lampertheim e. V.",
    venue_name: "WSV-Halle Lampertheim",
    municipality: "Lampertheim",
    start_time: "2026-10-03T20:00:00+02:00",
    end_time: "2026-10-03T22:30:00+02:00",
    category: "concert",
    description: "Großes Chorkonzert mit Pop-, Rock- und Musical-Highlights von Queen bis Abba unter Leitung des traditionsreichen MGV 1840.",
    ticket_url: "https://www.lampertheim.de/de/veranstaltungen/",
    event_url: "https://www.lampertheim.de",
    street_address: "Albrecht-Dürer-Straße 46",
    postal_code: "68623",
    latitude: 49.588,
    longitude: 8.463,
    status: "scheduled",
    is_free: false,
    is_archived: false,
    expected_visitors: 400,
    source: "stadt_lampertheim",
  },
  {
    id: "evt-la-heimatmuseum-schmiede",
    title: "Heimatmuseum geöffnet & Historische Schmiede beheizt",
    organizer: "Heimat-, Kultur- und Museumsverein Lampertheim e.V.",
    venue_name: "Heimatmuseum Lampertheim",
    municipality: "Lampertheim",
    start_time: "2026-10-04T10:00:00+02:00",
    end_time: "2026-10-04T12:30:00+02:00",
    category: "exhibition",
    description: "Lebendige Handwerksgeschichte erleben: Die historische Museumsschmiede wird angefeuert, dazu Führungen durch die Dauerausstellung.",
    ticket_url: "https://www.lampertheim.de/de/veranstaltungen/",
    event_url: "https://www.lampertheim.de",
    street_address: "Römerstraße 21",
    postal_code: "68623",
    latitude: 49.596,
    longitude: 8.466,
    status: "scheduled",
    is_free: true,
    is_archived: false,
    expected_visitors: 120,
    source: "stadt_lampertheim",
  },
  {
    id: "evt-la-spargelfest-2025-hist",
    title: "Lampertheimer Spargelfest 2025 (Historisch)",
    organizer: "Stadt Lampertheim",
    venue_name: "Schillerplatz & Europaplatz",
    municipality: "Lampertheim",
    start_time: "2025-06-13T16:00:00+02:00",
    end_time: "2025-06-15T23:00:00+02:00",
    category: "festival",
    description: "Historische Dokumentation des Spargelfestes 2025: Drei Festtage mit Krönung der Spargelkönigin und über 35.000 Besuchern im Ried.",
    ticket_url: "https://www.lampertheim.de",
    event_url: "https://www.lampertheim.de",
    street_address: "Schillerplatz",
    postal_code: "68623",
    latitude: 49.594,
    longitude: 8.468,
    status: "past",
    is_free: true,
    is_archived: true,
    expected_visitors: 35000,
    source: "stadt_lampertheim",
  },
  // --- Groß-Rohrheim Events ---
  {
    id: "evt-gr-neujahrsempfang-2026",
    title: "Neujahrsempfang der Gemeinde Groß-Rohrheim",
    organizer: "Gemeindevorstand Groß-Rohrheim",
    venue_name: "Historische Rathausscheune",
    municipality: "Groß-Rohrheim",
    start_time: "2026-01-18T11:00:00+01:00",
    end_time: "2026-01-18T13:30:00+01:00",
    category: "civic",
    description: "Traditioneller Neujahrsempfang für Bürgerinnen und Bürger mit Rückblick auf kommunale Projekte und musikalischer Umrahmung.",
    ticket_url: "https://www.gross-rohrheim.de",
    event_url: "https://www.gross-rohrheim.de",
    street_address: "Rheinstraße 14",
    postal_code: "68649",
    latitude: 49.718,
    longitude: 8.479,
    status: "past",
    is_free: true,
    is_archived: true,
    expected_visitors: 220,
    source: "gross_rohrheim",
  },
  {
    id: "evt-gr-blutspende-drk",
    title: "DRK Blutspende Groß-Rohrheim",
    organizer: "DRK Ortsverein Groß-Rohrheim",
    venue_name: "Bürgerhalle Groß-Rohrheim (Hallenanbau)",
    municipality: "Groß-Rohrheim",
    start_time: "2026-11-09T15:00:00+01:00",
    end_time: "2026-11-09T19:30:00+01:00",
    category: "civic",
    description: "Lebensretter werden: Regelmäßiger Blutspendetermin des DRK Blutspendedienstes Baden-Württemberg/Hessen in Groß-Rohrheim.",
    ticket_url: "https://www.gross-rohrheim.de",
    event_url: "https://www.gross-rohrheim.de",
    street_address: "Kornstraße 1",
    postal_code: "68649",
    latitude: 49.717,
    longitude: 8.482,
    status: "scheduled",
    is_free: true,
    is_archived: false,
    expected_visitors: 110,
    source: "drk_gross_rohrheim",
  },
  {
    id: "evt-gr-wagenburgfest",
    title: "Wagenburgfest des Reit- und Fahrvereins",
    organizer: "Reit- und Fahrverein Groß-Rohrheim e.V.",
    venue_name: "Vereinsgelände am Riedstadion",
    municipality: "Groß-Rohrheim",
    start_time: "2026-10-18T14:00:00+02:00",
    end_time: "2026-10-18T19:00:00+02:00",
    category: "sports",
    description: "Gemütliches Herbstfest der Pferdesportler mit Reitvorführungen, Kutschfahrten und Zwiebelkuchen im Vereinsheim.",
    ticket_url: "https://www.gross-rohrheim.de",
    event_url: "https://www.gross-rohrheim.de",
    street_address: "Am Sportfeld 2",
    postal_code: "68649",
    latitude: 49.721,
    longitude: 8.484,
    status: "scheduled",
    is_free: true,
    is_archived: false,
    expected_visitors: 250,
    source: "gross_rohrheim",
  },
  {
    id: "evt-gr-maimarkt-off-de-gass",
    title: "Maimarkt „Off de Gass“ Groß-Rohrheim",
    organizer: "Gewerbeverein & Gemeinde Groß-Rohrheim",
    venue_name: "Ortskern & Kornstraße",
    municipality: "Groß-Rohrheim",
    start_time: "2026-05-17T11:00:00+02:00",
    end_time: "2026-05-17T19:00:00+02:00",
    category: "market",
    description: "Historischer Handwerker- und Gewerbemarkt entlang der historischen Hofreiten mit Kunsthandwerk, Oldtimer-Treffen und Gastronomie.",
    ticket_url: "https://www.gross-rohrheim.de",
    event_url: "https://www.gross-rohrheim.de",
    street_address: "Kornstraße",
    postal_code: "68649",
    latitude: 49.718,
    longitude: 8.480,
    status: "past",
    is_free: true,
    is_archived: true,
    expected_visitors: 4500,
    source: "gross_rohrheim",
  },
  // --- Biblis Events ---
  {
    id: "evt-bib-gurkenfest-2025-hist",
    title: "71. Bibliser Gurkenfest 2025 (Historisch)",
    organizer: "Wirtschafts- und Verkehrsverein Biblis e.V.",
    venue_name: "Rathausplatz & Bürgerzentrum Biblis",
    municipality: "Biblis",
    start_time: "2025-06-27T18:00:00+02:00",
    end_time: "2025-06-30T22:00:00+02:00",
    category: "festival",
    description: "Rückblick Gurkenfest 2025: Viertägiges Heimatfest mit Inthronisation der Gurkenkönigin, Festzelt und großem Musikfeuerwerk.",
    ticket_url: "https://www.biblis.eu",
    event_url: "https://www.biblis.eu",
    street_address: "Darmstädter Straße 25",
    postal_code: "68647",
    latitude: 49.689,
    longitude: 8.455,
    status: "past",
    is_free: true,
    is_archived: true,
    expected_visitors: 12000,
    source: "gemeinde_biblis",
  },
  {
    id: "evt-bib-ferienspiele-2026",
    title: "Kommunale Ferienspiele Biblis (Sommerferien)",
    organizer: "Jugendförderung Gemeinde Biblis",
    venue_name: "Bürgerzentrum & Riedhalle Biblis",
    municipality: "Biblis",
    start_time: "2026-07-20T08:30:00+02:00",
    end_time: "2026-07-31T16:30:00+02:00",
    category: "civic",
    description: "Zweiwöchiges Sommer-Freizeitprogramm für Kinder und Jugendliche mit Ausflügen in die Altrheinauen und Forscher-Workshops.",
    ticket_url: "https://www.biblis.eu",
    event_url: "https://www.biblis.eu",
    street_address: "Darmstädter Straße 25",
    postal_code: "68647",
    latitude: 49.688,
    longitude: 8.454,
    status: "past",
    is_free: false,
    is_archived: true,
    expected_visitors: 180,
    source: "gemeinde_biblis",
  },
  {
    id: "evt-bib-senioren-fruehstueck",
    title: "Seniorenfrühstück & Singkreis Biblis",
    organizer: "Katholische Pfarrgemeinde St. Bartholomäus",
    venue_name: "Pfarrzentrum St. Bartholomäus",
    municipality: "Biblis",
    start_time: "2026-10-22T09:30:00+02:00",
    end_time: "2026-10-22T11:45:00+02:00",
    category: "civic",
    description: "Monatlicher Geselligkeitstreff mit Frühstücksbuffet, Volksliedersingen und Vortrag zur regionalen Mundart.",
    ticket_url: "https://www.biblis.eu",
    event_url: "https://www.biblis.eu",
    street_address: "Kirchstraße 8",
    postal_code: "68647",
    latitude: 49.686,
    longitude: 8.456,
    status: "scheduled",
    is_free: true,
    is_archived: false,
    expected_visitors: 55,
    source: "kirche_biblis",
  },
  // --- Bürstadt Events ---
  {
    id: "evt-bst-fruehjahrsmarkt-2026",
    title: "Bürstädter Frühjahrsmarkt & Verkaufsoffener Sonntag",
    organizer: "Wirtschafts- und Gewerbeverein Bürstadt e.V.",
    venue_name: "Innenstadt & Marktplatz Bürstadt",
    municipality: "Bürstadt",
    start_time: "2026-04-18T11:00:00+02:00",
    end_time: "2026-04-19T18:00:00+02:00",
    category: "market",
    description: "Bunter Frühlingsmarkt in der Bürstädter Fußgängerzone mit Händlermeile, Autoschau, Kinderkarussell und Live-Musik.",
    ticket_url: "https://www.buerstadt.de",
    event_url: "https://www.buerstadt.de",
    street_address: "Mainstraße",
    postal_code: "68642",
    latitude: 49.643,
    longitude: 8.454,
    status: "past",
    is_free: true,
    is_archived: true,
    expected_visitors: 6000,
    source: "stadt_buerstadt",
  },
  {
    id: "evt-bst-fastnacht-2026",
    title: "Großer Bürstädter Fastnachtsumzug",
    organizer: "Vereins-AG & Stadt Bürstadt",
    venue_name: "Innenstadt Bürstadt",
    municipality: "Bürstadt",
    start_time: "2026-02-15T14:11:00+01:00",
    end_time: "2026-02-15T18:00:00+01:00",
    category: "festival",
    description: "Traditioneller Fastnachtsumzug durch Bürstadt mit Prunkwagen, Spielmannszügen und Garden aus dem gesamten Ried.",
    ticket_url: "https://www.buerstadt.de",
    event_url: "https://www.buerstadt.de",
    street_address: "Wilhelminenstraße",
    postal_code: "68642",
    latitude: 49.644,
    longitude: 8.455,
    status: "past",
    is_free: true,
    is_archived: true,
    expected_visitors: 15000,
    source: "stadt_buerstadt",
  },
  {
    id: "evt-bst-zakb-umweltmobil",
    title: "ZAKB Umweltmobil & Schadstoffsammlung Bürstadt",
    organizer: "ZAKB Service GmbH",
    venue_name: "Wertstoffhof Bürstadt",
    municipality: "Bürstadt",
    start_time: "2026-10-17T09:00:00+02:00",
    end_time: "2026-10-17T12:00:00+02:00",
    category: "civic",
    description: "Kostenlose Abgabe von Sonderabfällen, Lacken, Batterien und Schadstoffen aus Privathaushalten am Umweltmobil.",
    ticket_url: "https://www.zakb.de",
    event_url: "https://www.zakb.de",
    street_address: "Waldgartenstraße 8",
    postal_code: "68642",
    latitude: 49.638,
    longitude: 8.448,
    status: "scheduled",
    is_free: true,
    is_archived: false,
    expected_visitors: 160,
    source: "zakb_bergstrasse",
  },
];

// --- Data Fetchers ---

export async function fetchSocialSummary(): Promise<SocialKpiSummary[]> {

    const res = await fetch(new URL("/api/v1/social/indicators/summary", env.BACKEND_API_URL), {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("Social summary request failed");
    return await res.json();

  throw new Error("Collected data unavailable");
}

export async function fetchWasteStatistics(municipality?: string, year?: number): Promise<ZakbWasteStat[]> {

    const url = new URL("/api/v1/social/waste-statistics", env.BACKEND_API_URL);
    if (municipality && municipality !== "all") url.searchParams.set("municipality", municipality);
    if (year) url.searchParams.set("year", year.toString());
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("Waste stats request failed");
    return await res.json();

  throw new Error("Collected data unavailable");
}

export async function fetchRegionalFacilities(category?: string, municipality?: string): Promise<RegionalFacility[]> {

    const url = new URL("/api/v1/social/facilities", env.BACKEND_API_URL);
    if (category && category !== "all") url.searchParams.set("category", category);
    if (municipality && municipality !== "all") url.searchParams.set("municipality", municipality);
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("Facilities request failed");
    return await res.json();

  throw new Error("Collected data unavailable");
}

export interface FetchCulturalEventsOptions {
  municipality?: string;
  category?: string;
  search?: string;
  includePast?: boolean;
  fromDate?: string;
  toDate?: string;
}

export async function fetchCulturalEvents(options?: string | FetchCulturalEventsOptions): Promise<CulturalEvent[]> {
  const opts: FetchCulturalEventsOptions = typeof options === "string" ? { municipality: options } : (options || {});

  const url = new URL("/api/v1/social/events", env.BACKEND_API_URL);
  if (opts.municipality && opts.municipality !== "all") url.searchParams.set("municipality", opts.municipality);
  if (opts.category && opts.category !== "all") url.searchParams.set("category", opts.category);
  if (opts.search) url.searchParams.set("search", opts.search);
  if (opts.includePast) url.searchParams.set("include_past", "true");
  if (opts.fromDate) url.searchParams.set("from_date", opts.fromDate);
  if (opts.toDate) url.searchParams.set("to_date", opts.toDate);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("Collected events unavailable");
    return await res.json();
  } catch {
    // The live database can still serve events when its combined publication expires.
    const res = await globalThis.fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("Events request failed");
    return await res.json();
  }

}

/**
 * Generates an RFC 5545 iCalendar (.ics) string for 1-click addition to Apple/Google/Outlook calendar.
 */
export function generateIcsCalendar(event: CulturalEvent): string {
  const formatDate = (iso: string) => {
    return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  };

  const dtStart = formatDate(event.start_time);
  const dtEnd = event.end_time ? formatDate(event.end_time) : dtStart;
  const location = [event.venue_name, event.street_address, `${event.postal_code || ""} ${event.municipality}`].filter(Boolean).join(", ");
  const cleanDesc = (event.description || "").replace(/\n/g, "\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HackTheRied//Veranstaltungen Hessen-Ried//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@hack-the-ried.de`,
    `DTSTAMP:${formatDate(new Date().toISOString())}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${cleanDesc}\\nVeranstalter: ${event.organizer}`,
    `LOCATION:${location}`,
    event.ticket_url || event.event_url ? `URL:${event.ticket_url || event.event_url}` : "",
    event.status === "cancelled" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

/**
 * Generates a direct Google Calendar web event creation URL.
 */
export function generateGoogleCalendarUrl(event: CulturalEvent): string {
  const formatDate = (iso: string) => {
    return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  };
  const dtStart = formatDate(event.start_time);
  const dtEnd = event.end_time ? formatDate(event.end_time) : dtStart;
  const location = [event.venue_name, event.street_address, `${event.postal_code || ""} ${event.municipality}`].filter(Boolean).join(", ");
  const details = `${event.description || ""}\n\nVeranstalter: ${event.organizer}\nMehr Infos: ${event.event_url || event.ticket_url || "https://hack-the-ried.de/termine"}`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${dtStart}/${dtEnd}`,
    details,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Transforms regional physical facilities into Map StationNodes for Leaflet display.
 */
export function facilitiesToStationNodes(facilities: RegionalFacility[]): StationNode[] {
  const now = new Date().toISOString();
  return facilities.map((f) => {
    let cat: "healthcare" | "culture" | "tourism" = "healthcare";
    if (f.category === "culture_sports") cat = "culture";
    else if (f.category === "tourism") cat = "tourism";

    const readings: Reading[] = [];
    if (f.extra_attributes?.emergency_duty !== undefined) {
      readings.push({
        metric: "emergency_duty",
        value: f.extra_attributes.emergency_duty ? 1 : 0,
        unit: "state",
        timestamp: now,
      });
    }

    return {
      id: f.id,
      name: f.name,
      locationName: f.extra_attributes?.badge ? `${f.extra_attributes.badge} · ${f.municipality}` : f.municipality,
      address: `${f.street_address}, ${f.postal_code} ${f.municipality}${f.phone ? ` · Tel. ${f.phone}` : ""}`,
      lat: f.latitude,
      lng: f.longitude,
      categories: [cat as any],
      readings,
    };
  });
}
