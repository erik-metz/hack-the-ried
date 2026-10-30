/**
 * Ziele für Marketing-QR-Codes. Die IDs werden als /qr/<id> gedruckt;
 * Ziel-URLs können interne Seiten oder externe Kampagnenseiten sein.
 */
const marketingQrTargets: Record<string, string> = {
  // Beispiel:
  // sommerfest: "https://hack-the-ried.de/veranstaltungen/sommerfest",
};

export function getMarketingQrTarget(id: string): string | undefined {
  return marketingQrTargets[id];
}
