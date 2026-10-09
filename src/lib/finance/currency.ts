/** Mirrors the seeded `public.currencies` table (minor-unit digits per ISO 4217). */
export const CURRENCIES: Record<string, { name: string; symbol: string; minorUnits: number }> = {
  CAD: { name: "Canadian Dollar", symbol: "$", minorUnits: 2 },
  USD: { name: "US Dollar", symbol: "$", minorUnits: 2 },
  EUR: { name: "Euro", symbol: "€", minorUnits: 2 },
  GBP: { name: "British Pound", symbol: "£", minorUnits: 2 },
  AUD: { name: "Australian Dollar", symbol: "$", minorUnits: 2 },
  NZD: { name: "New Zealand Dollar", symbol: "$", minorUnits: 2 },
  JPY: { name: "Japanese Yen", symbol: "¥", minorUnits: 0 },
  CHF: { name: "Swiss Franc", symbol: "CHF", minorUnits: 2 },
  MXN: { name: "Mexican Peso", symbol: "$", minorUnits: 2 },
  SEK: { name: "Swedish Krona", symbol: "kr", minorUnits: 2 },
  NOK: { name: "Norwegian Krone", symbol: "kr", minorUnits: 2 },
  DKK: { name: "Danish Krone", symbol: "kr", minorUnits: 2 },
  HKD: { name: "Hong Kong Dollar", symbol: "$", minorUnits: 2 },
  SGD: { name: "Singapore Dollar", symbol: "$", minorUnits: 2 },
  INR: { name: "Indian Rupee", symbol: "₹", minorUnits: 2 },
  BRL: { name: "Brazilian Real", symbol: "R$", minorUnits: 2 },
  ZAR: { name: "South African Rand", symbol: "R", minorUnits: 2 },
  MOP: { name: "Macanese Pataca", symbol: "MOP$", minorUnits: 2 },
  PHP: { name: "Philippine Peso", symbol: "₱", minorUnits: 2 },
  KRW: { name: "South Korean Won", symbol: "₩", minorUnits: 0 },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES);

export function minorUnits(currency: string): number {
  const c = CURRENCIES[currency];
  if (!c) throw new Error(`Unsupported currency ${currency}`);
  return c.minorUnits;
}
