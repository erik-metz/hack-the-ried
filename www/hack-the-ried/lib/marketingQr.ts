/**
 * Ziele für Marketing-QR-Codes. Die IDs werden als /qr/<id> gedruckt;
 * Ziel-URLs können interne Seiten oder externe Kampagnenseiten sein.
 */
const marketingQrTargets: Record<string, string> = {
  entdecken: "https://hack-the-ried.de/?utm_source=qr&utm_medium=print&utm_campaign=allgemein",
  karte: "https://hack-the-ried.de/karte?utm_source=qr&utm_medium=print&utm_campaign=karte",
  umwelt: "https://hack-the-ried.de/umwelt?utm_source=qr&utm_medium=print&utm_campaign=umwelt",
  termine: "https://hack-the-ried.de/termine?utm_source=qr&utm_medium=print&utm_campaign=termine",
  daten: "https://hack-the-ried.de/daten?utm_source=qr&utm_medium=print&utm_campaign=daten",
};

export function getMarketingQrTarget(id: string): string | undefined {
  return marketingQrTargets[id];
}
