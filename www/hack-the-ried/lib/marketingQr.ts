/**
 * Ziele für Marketing-QR-Codes. Die IDs werden als /qr/<id> gedruckt.
 * Der QR-Parameter auf der Homepage ordnet Zugriffe dem jeweiligen Code zu.
 */
const marketingQrTargets: Record<string, string> = {
  "1": "https://hack-the-ried.de/?qr=1",
  "2": "https://hack-the-ried.de/?qr=2",
  "3": "https://hack-the-ried.de/?qr=3",
  "4": "https://hack-the-ried.de/?qr=4",
  "5": "https://hack-the-ried.de/?qr=5",
  "6": "https://hack-the-ried.de/?qr=6",
  "7": "https://hack-the-ried.de/?qr=7",
  "8": "https://hack-the-ried.de/?qr=8",
  "9": "https://hack-the-ried.de/?qr=9",
  "10": "https://hack-the-ried.de/?qr=10",
};

export function getMarketingQrTarget(id: string): string | undefined {
  return marketingQrTargets[id];
}
