export type Client = { id: string; name: string; phone: string; email: string; points: number; credit_cents: number; notes: string; active: boolean; created_at: string };
export type LayawayPayment = { id: string; method: "cash" | "card" | "transfer" | "credit"; amount_cents: number; received_cents: number | null; user_name: string; created_at: string };
export type Layaway = {
  id: string; folio: number; status: "pending" | "settled" | "cancelled"; client_id: string; client_name: string; client_phone: string;
  user_name: string; subtotal_cents: number; discount_cents: number; total_cents: number; paid_cents: number; balance_cents: number;
  deadline: string; days_left: number; overdue: boolean; created_at: string; settled_sale_id: string | null; cancel_reason: string | null;
  refund_mode: "refund" | "credit" | null; refund_method: string | null;
  items: { variant_id: number; sku: string; name: string; attrs: Record<string, string>; qty: number; unit_price_cents: number; discount_cents: number; photo: string | null }[];
  payments: LayawayPayment[];
};
export const METHOD_LABEL = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", credit: "Saldo a favor" } as const;
export const dateMx = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
export const dateTimeMx = (iso: string) => new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
