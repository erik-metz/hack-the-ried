"use client";
import { usePublicDatasets } from "@/lib/hooks/usePublicDatasets";
import BudgetPublication, { type Budget } from "./BudgetPublication";
const PATHS = ["collected/finance/adopted-budget/biblis", "collected/finance/budget-review/biblis"];
export default function AdoptedBudgetSection() {
  const publication = usePublicDatasets<[Budget, Budget]>(PATHS);
  if (!publication) return <p role="status">Haushaltsveröffentlichungen werden geladen…</p>;
  const [budget, review] = publication.results;
  return <BudgetPublication budget={budget.status === "fulfilled" ? budget.value : null} review={review.status === "fulfilled" ? review.value : null} />;
}
