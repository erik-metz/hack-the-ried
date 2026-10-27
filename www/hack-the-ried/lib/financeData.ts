import { collectedFetch as fetch } from "./collectedBackend";
import { env } from "@/env";

export interface FinanceBudget {
  id: string;
  municipality: string;
  fiscal_year: number;
  record_type: "plan" | "actual";
  total_revenue_eur: number;
  total_expense_eur: number;
  net_result_eur: number;
  tax_gewerbesteuer_eur?: number | null;
  tax_grundsteuer_a_eur?: number | null;
  tax_grundsteuer_b_eur?: number | null;
  tax_income_share_eur?: number | null;
  tax_vat_share_eur?: number | null;
  hebesatz_gewerbesteuer?: number | null;
  hebesatz_grundsteuer_a?: number | null;
  hebesatz_grundsteuer_b?: number | null;
  total_debt_eur?: number | null;
  debt_per_capita_eur?: number | null;
  reserves_eur?: number | null;
  source_document_url?: string | null;
}

export interface FinanceExpenditure {
  id: number;
  budget_id: string;
  municipality: string;
  fiscal_year: number;
  product_area_code: string;
  category_name: "administration" | "public_order" | "schools" | "social_childcare" | "culture_sport" | "roads_transport" | "utilities";
  title: string;
  expense_budgeted_eur: number;
  expense_actual_eur?: number | null;
  investments_eur: number;
  notes?: string | null;
}

export interface MunicipalFinanceComparison {
  municipality: string;
  fiscal_year: number;
  total_revenue_eur: number;
  total_expense_eur: number;
  net_result_eur: number;
  tax_gewerbesteuer_eur?: number | null;
  tax_grundsteuer_b_eur?: number | null;
  hebesatz_gewerbesteuer?: number | null;
  hebesatz_grundsteuer_b?: number | null;
  total_debt_eur?: number | null;
  debt_per_capita_eur?: number | null;
  reserves_eur?: number | null;
}

export const BASELINE_BUDGETS: FinanceBudget[] = [
  {
    id: "bst-2024-plan",
    municipality: "Bürstadt",
    fiscal_year: 2024,
    record_type: "plan",
    total_revenue_eur: 39850000,
    total_expense_eur: 41200000,
    net_result_eur: -1350000,
    tax_gewerbesteuer_eur: 9200000,
    tax_grundsteuer_a_eur: 48000,
    tax_grundsteuer_b_eur: 3450000,
    tax_income_share_eur: 11400000,
    tax_vat_share_eur: 1680000,
    hebesatz_gewerbesteuer: 400,
    hebesatz_grundsteuer_a: 380,
    hebesatz_grundsteuer_b: 495,
    total_debt_eur: 17800000,
    debt_per_capita_eur: 1048,
    reserves_eur: 4100000,
    source_document_url: "https://buerstadt.de/haushalt/2024",
  },
  {
    id: "bst-2024-actual",
    municipality: "Bürstadt",
    fiscal_year: 2024,
    record_type: "actual",
    total_revenue_eur: 41200000,
    total_expense_eur: 40950000,
    net_result_eur: 250000,
    tax_gewerbesteuer_eur: 9850000,
    tax_grundsteuer_a_eur: 49000,
    tax_grundsteuer_b_eur: 3480000,
    tax_income_share_eur: 11650000,
    tax_vat_share_eur: 1720000,
    hebesatz_gewerbesteuer: 400,
    hebesatz_grundsteuer_a: 380,
    hebesatz_grundsteuer_b: 495,
    total_debt_eur: 17250000,
    debt_per_capita_eur: 1015,
    reserves_eur: 4350000,
    source_document_url: "https://buerstadt.de/haushalt/2024",
  },
  {
    id: "bst-2025-plan",
    municipality: "Bürstadt",
    fiscal_year: 2025,
    record_type: "plan",
    total_revenue_eur: 42100000,
    total_expense_eur: 42850000,
    net_result_eur: -750000,
    tax_gewerbesteuer_eur: 9950000,
    tax_grundsteuer_a_eur: 50000,
    tax_grundsteuer_b_eur: 3600000,
    tax_income_share_eur: 12100000,
    tax_vat_share_eur: 1780000,
    hebesatz_gewerbesteuer: 400,
    hebesatz_grundsteuer_a: 380,
    hebesatz_grundsteuer_b: 495,
    total_debt_eur: 16900000,
    debt_per_capita_eur: 995,
    reserves_eur: 4200000,
    source_document_url: "https://buerstadt.de/haushalt/2025",
  },
  {
    id: "la-2024-plan",
    municipality: "Lampertheim",
    fiscal_year: 2024,
    record_type: "plan",
    total_revenue_eur: 91500000,
    total_expense_eur: 94200000,
    net_result_eur: -2700000,
    tax_gewerbesteuer_eur: 22400000,
    tax_grundsteuer_a_eur: 92000,
    tax_grundsteuer_b_eur: 8650000,
    tax_income_share_eur: 24800000,
    tax_vat_share_eur: 3950000,
    hebesatz_gewerbesteuer: 400,
    hebesatz_grundsteuer_a: 390,
    hebesatz_grundsteuer_b: 495,
    total_debt_eur: 41200000,
    debt_per_capita_eur: 1249,
    reserves_eur: 7200000,
    source_document_url: "https://lampertheim.de/haushalt/2024",
  },
  {
    id: "la-2024-actual",
    municipality: "Lampertheim",
    fiscal_year: 2024,
    record_type: "actual",
    total_revenue_eur: 93800000,
    total_expense_eur: 93650000,
    net_result_eur: 150000,
    tax_gewerbesteuer_eur: 23800000,
    tax_grundsteuer_a_eur: 94000,
    tax_grundsteuer_b_eur: 8720000,
    tax_income_share_eur: 25200000,
    tax_vat_share_eur: 4050000,
    hebesatz_gewerbesteuer: 400,
    hebesatz_grundsteuer_a: 390,
    hebesatz_grundsteuer_b: 495,
    total_debt_eur: 40100000,
    debt_per_capita_eur: 1215,
    reserves_eur: 7500000,
    source_document_url: "https://lampertheim.de/haushalt/2024",
  },
  {
    id: "bib-2024-plan",
    municipality: "Biblis",
    fiscal_year: 2024,
    record_type: "plan",
    total_revenue_eur: 24100000,
    total_expense_eur: 24800000,
    net_result_eur: -700000,
    tax_gewerbesteuer_eur: 4850000,
    tax_grundsteuer_a_eur: 36000,
    tax_grundsteuer_b_eur: 1920000,
    tax_income_share_eur: 6950000,
    tax_vat_share_eur: 1050000,
    hebesatz_gewerbesteuer: 380,
    hebesatz_grundsteuer_a: 350,
    hebesatz_grundsteuer_b: 450,
    total_debt_eur: 8900000,
    debt_per_capita_eur: 972,
    reserves_eur: 2100000,
    source_document_url: "https://biblis.de/haushalt/2024",
  },
  {
    id: "gross-2024-plan",
    municipality: "Groß-Rohrheim",
    fiscal_year: 2024,
    record_type: "plan",
    total_revenue_eur: 10900000,
    total_expense_eur: 11250000,
    net_result_eur: -350000,
    tax_gewerbesteuer_eur: 2650000,
    tax_grundsteuer_a_eur: 19000,
    tax_grundsteuer_b_eur: 940000,
    tax_income_share_eur: 3100000,
    tax_vat_share_eur: 480000,
    hebesatz_gewerbesteuer: 380,
    hebesatz_grundsteuer_a: 350,
    hebesatz_grundsteuer_b: 450,
    total_debt_eur: 3400000,
    debt_per_capita_eur: 894,
    reserves_eur: 950000,
    source_document_url: "https://gross-rohrheim.de/haushalt/2024",
  },
];

export const BASELINE_SPENDING: FinanceExpenditure[] = [
  {
    id: 1,
    budget_id: "bst-2024-plan",
    municipality: "Bürstadt",
    fiscal_year: 2024,
    product_area_code: "01",
    category_name: "administration",
    title: "Innere Verwaltung & Bürgerbüro",
    expense_budgeted_eur: 5450000,
    expense_actual_eur: 5380000,
    investments_eur: 420000,
    notes: "Personal- und Sachkosten Stadtverwaltung, Digitalisierung",
  },
  {
    id: 2,
    budget_id: "bst-2024-plan",
    municipality: "Bürstadt",
    fiscal_year: 2024,
    product_area_code: "02",
    category_name: "public_order",
    title: "Sicherheit & Freiwillige Feuerwehr",
    expense_budgeted_eur: 1850000,
    expense_actual_eur: 1810000,
    investments_eur: 680000,
    notes: "Feuerwehrstützpunkt Bürstadt, Bobstadt, Riedrode, Fuhrpark",
  },
  {
    id: 3,
    budget_id: "bst-2024-plan",
    municipality: "Bürstadt",
    fiscal_year: 2024,
    product_area_code: "03",
    category_name: "schools",
    title: "Schulträgeraufgaben, Grundschulen & Bildung",
    expense_budgeted_eur: 2650000,
    expense_actual_eur: 2590000,
    investments_eur: 850000,
    notes: "Schillerschule, Grundschule Bobstadt, Betreuung & DigitalPakt",
  },
  {
    id: 4,
    budget_id: "bst-2024-plan",
    municipality: "Bürstadt",
    fiscal_year: 2024,
    product_area_code: "06",
    category_name: "social_childcare",
    title: "Kinder-, Jugend- und Familienhilfe (Kitas)",
    expense_budgeted_eur: 11200000,
    expense_actual_eur: 11450000,
    investments_eur: 1250000,
    notes: "Betrieb städtischer & kirchlicher Kitas, U3/Ü3-Plätze, Spielplätze",
  },
  {
    id: 5,
    budget_id: "bst-2024-plan",
    municipality: "Bürstadt",
    fiscal_year: 2024,
    product_area_code: "08",
    category_name: "culture_sport",
    title: "Kultur, Sportförderung & Vereine (KAMÜ)",
    expense_budgeted_eur: 3100000,
    expense_actual_eur: 2980000,
    investments_eur: 750000,
    notes: "Bürgerhaus, KAMÜ Kulturzentrum, Sportpark Die Lache, Vereinszuschüsse",
  },
  {
    id: 6,
    budget_id: "bst-2024-plan",
    municipality: "Bürstadt",
    fiscal_year: 2024,
    product_area_code: "11",
    category_name: "roads_transport",
    title: "Bauen, Wohnen, Straßen & Mobilität",
    expense_budgeted_eur: 6450000,
    expense_actual_eur: 6380000,
    investments_eur: 2100000,
    notes: "Straßenunterhalt, Radwegenetz, Straßenbeleuchtung LED, B-Plan-Erschließung",
  },
  {
    id: 7,
    budget_id: "bst-2024-plan",
    municipality: "Bürstadt",
    fiscal_year: 2024,
    product_area_code: "12",
    category_name: "utilities",
    title: "Umwelt, Grünflächen & Entsorgung",
    expense_budgeted_eur: 2450000,
    expense_actual_eur: 2410000,
    investments_eur: 380000,
    notes: "Grünanlagenpflege, Friedhofswesen, Hochwasserschutz & Renaturierung",
  },
  // Lampertheim 2024
  {
    id: 8,
    budget_id: "la-2024-plan",
    municipality: "Lampertheim",
    fiscal_year: 2024,
    product_area_code: "01",
    category_name: "administration",
    title: "Innere Verwaltung & Ratsarbeit",
    expense_budgeted_eur: 12800000,
    expense_actual_eur: 12650000,
    investments_eur: 950000,
    notes: "Rathauszentrale, Digitalisierung Bürgerservice",
  },
  {
    id: 9,
    budget_id: "la-2024-plan",
    municipality: "Lampertheim",
    fiscal_year: 2024,
    product_area_code: "02",
    category_name: "public_order",
    title: "Öffentliche Ordnung & Feuerwehr",
    expense_budgeted_eur: 4200000,
    expense_actual_eur: 4150000,
    investments_eur: 1450000,
    notes: "Feuerwehren Lampertheim, Hofheim, Hüttenfeld, Neuschloß",
  },
  {
    id: 10,
    budget_id: "la-2024-plan",
    municipality: "Lampertheim",
    fiscal_year: 2024,
    product_area_code: "03",
    category_name: "schools",
    title: "Schulwesen & Schülerbeförderung",
    expense_budgeted_eur: 5800000,
    expense_actual_eur: 5650000,
    investments_eur: 1950000,
    notes: "Pestalozzi, Nibelungenschule Hofheim, Schulsozialarbeit",
  },
  {
    id: 11,
    budget_id: "la-2024-plan",
    municipality: "Lampertheim",
    fiscal_year: 2024,
    product_area_code: "06",
    category_name: "social_childcare",
    title: "Kindertagesstätten & Jugendpflege",
    expense_budgeted_eur: 25900000,
    expense_actual_eur: 26200000,
    investments_eur: 3100000,
    notes: "14 Kitas, Ganztagesbetreuung, Jugendzentrum Zehntscheune",
  },
  {
    id: 12,
    budget_id: "la-2024-plan",
    municipality: "Lampertheim",
    fiscal_year: 2024,
    product_area_code: "08",
    category_name: "culture_sport",
    title: "Kultur, Biedensand Bäder & Sport",
    expense_budgeted_eur: 7650000,
    expense_actual_eur: 7550000,
    investments_eur: 1850000,
    notes: "Hallen- und Freibad Biedensand, Altrheinhalle, Stadtbücherei",
  },
  {
    id: 13,
    budget_id: "la-2024-plan",
    municipality: "Lampertheim",
    fiscal_year: 2024,
    product_area_code: "11",
    category_name: "roads_transport",
    title: "Straßennetz, Tiefbau & Stadtentwicklung",
    expense_budgeted_eur: 15200000,
    expense_actual_eur: 14900000,
    investments_eur: 4800000,
    notes: "Sanierung Ortsstraßen, Ausbau Radwegenetz B44/B47, Neubaugebiete",
  },
  {
    id: 14,
    budget_id: "la-2024-plan",
    municipality: "Lampertheim",
    fiscal_year: 2024,
    product_area_code: "12",
    category_name: "utilities",
    title: "Stadtentwässerung, Grünflächen & Gewässer",
    expense_budgeted_eur: 5850000,
    expense_actual_eur: 5780000,
    investments_eur: 1100000,
    notes: "Stadtgärtnerei, Naturschutz Biedensand, Renaturierung Weschnitz",
  },
];

export async function fetchBudgets(municipality?: string, year?: number): Promise<FinanceBudget[]> {

    const url = new URL("/api/v1/finance/budgets", env.BACKEND_API_URL);
    if (municipality) url.searchParams.set("municipality", municipality);
    if (year) url.searchParams.set("year", year.toString());
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (res.ok) return await res.json();

  throw new Error("Collected data unavailable");
}

export async function fetchSpending(municipality?: string, year?: number): Promise<FinanceExpenditure[]> {

    const url = new URL("/api/v1/finance/spending", env.BACKEND_API_URL);
    if (municipality) url.searchParams.set("municipality", municipality);
    if (year) url.searchParams.set("year", year.toString());
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (res.ok) return await res.json();

  throw new Error("Collected data unavailable");
}

export async function fetchFinanceComparison(year = 2024): Promise<MunicipalFinanceComparison[]> {

    const url = new URL("/api/v1/finance/compare", env.BACKEND_API_URL);
    url.searchParams.set("year", year.toString());
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (res.ok) return await res.json();

  throw new Error("Collected data unavailable");
}
