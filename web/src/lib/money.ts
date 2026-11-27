/** Dinero: siempre centavos enteros en el código; pesos con formato en pantalla. */

const fmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function formatMoney(cents: number): string {
  return fmt.format(cents / 100);
}

const PLAIN = /^\d+(\.\d{1,2})?$/;
const GROUPED = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/;

/** Convierte lo que escribe una persona ("1,250.50", "$99", "350") a centavos, sin decimales flotantes. */
export function parsePesos(text: string): number | null {
  const t = text.replace(/\s+/g, "").replace(/^\$/, "");
  if (!PLAIN.test(t) && !GROUPED.test(t)) return null;
  const [whole, frac = ""] = t.replace(/,/g, "").split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Centavos a texto editable ("1250.5" → "1250.50"), para llenar campos. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
