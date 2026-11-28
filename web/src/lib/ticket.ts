/** Tickets de venta y de apartado: los mismos datos sirven para imprimir y para mandar por WhatsApp. */
import type { Cart, Payment } from "./cart";
import { totals } from "./cart";
import { formatMoney } from "./money";
import { METHOD_LABEL, type Layaway } from "./opTypes";
import type { BusinessSettings } from "./settings";

type Method = keyof typeof METHOD_LABEL;
export type TicketLine = { name: string; variant: string; qty: number; unitCents: number; discountCents: number };
export type TicketPayment = { label: string; amountCents: number; date?: string };
export type TicketData = {
  kind: "sale" | "layaway";
  folio: string;
  date: string;
  seller?: string | null;
  client?: string | null;
  clientPhone?: string | null;
  lines: TicketLine[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  payments: TicketPayment[];
  changeCents: number;
  pending?: boolean;
  status?: "cancelled" | "settled" | "pending" | "paid";
  layaway?: { paidCents: number; balanceCents: number; deadline: string };
};

export type SaleForTicket = {
  folio: number | string; created_at: string; status: string; user_name?: string | null; client_name?: string | null; client_phone?: string | null;
  subtotal_cents: number; discount_cents: number; total_cents: number; change_cents: number;
  items: { name: string; attrs: Record<string, string>; qty: number; unit_price_cents: number; discount_cents: number }[];
  payments: { method: Method; amount_cents: number }[];
};

const attrsText = (a: Record<string, string>) => Object.values(a ?? {}).filter(Boolean).join(" / ");

export function saleTicket(s: SaleForTicket): TicketData {
  return {
    kind: "sale", folio: `#${s.folio}`, date: s.created_at, seller: s.user_name, client: s.client_name, clientPhone: s.client_phone,
    lines: s.items.map((i) => ({ name: i.name, variant: attrsText(i.attrs), qty: i.qty, unitCents: i.unit_price_cents, discountCents: i.discount_cents })),
    subtotalCents: s.subtotal_cents, discountCents: s.discount_cents, totalCents: s.total_cents,
    payments: s.payments.map((p) => ({ label: METHOD_LABEL[p.method] ?? p.method, amountCents: p.amount_cents })),
    changeCents: s.change_cents, status: s.status === "cancelled" ? "cancelled" : "paid",
  };
}

/** Ticket armado en el dispositivo (sirve también para la venta guardada sin señal). */
export function cartTicket(cart: Cart, payments: Payment[], r: { folio: number | string; total_cents: number; change_cents: number; offline?: boolean }, seller: string, date: string): TicketData {
  const t = totals(cart);
  return {
    kind: "sale", folio: typeof r.folio === "number" ? `#${r.folio}` : String(r.folio), date, seller, client: cart.client?.name, clientPhone: cart.client?.phone,
    lines: cart.lines.map((l) => ({ name: l.name, variant: attrsText(l.attrs), qty: l.qty, unitCents: l.priceCents, discountCents: l.discountCents })),
    subtotalCents: t.subtotal, discountCents: t.discount, totalCents: r.total_cents,
    payments: payments.map((p) => ({ label: METHOD_LABEL[p.method], amountCents: p.amountCents })),
    changeCents: r.change_cents, pending: !!r.offline, status: "paid",
  };
}

export function layawayTicket(l: Layaway): TicketData {
  return {
    kind: "layaway", folio: `A-${l.folio}`, date: l.created_at, seller: l.user_name, client: l.client_name, clientPhone: l.client_phone,
    lines: l.items.map((i) => ({ name: i.name, variant: attrsText(i.attrs), qty: i.qty, unitCents: i.unit_price_cents, discountCents: i.discount_cents })),
    subtotalCents: l.subtotal_cents, discountCents: l.discount_cents, totalCents: l.total_cents,
    payments: l.payments.map((p) => ({ label: METHOD_LABEL[p.method] ?? p.method, amountCents: p.amount_cents, date: p.created_at })),
    changeCents: 0, status: l.status, layaway: { paidCents: l.paid_cents, balanceCents: l.balance_cents, deadline: l.deadline },
  };
}

export const ticketDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const shortDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

/** El mismo ticket en texto, para WhatsApp. */
export function ticketText(t: TicketData, s: Pick<BusinessSettings, "business_name" | "business_subtitle" | "address" | "ticket_footer">): string {
  const out: string[] = [];
  out.push(`*${s.business_name}*${s.business_subtitle ? ` · ${s.business_subtitle}` : ""}`);
  out.push(`${t.kind === "layaway" ? "Apartado" : "Venta"} ${t.folio} · ${ticketDate(t.date)}`);
  if (t.client) out.push(`Cliente: ${t.client}`);
  if (t.status === "cancelled") out.push("*CANCELADO*");
  out.push("");
  for (const l of t.lines) {
    out.push(`${l.qty} × ${l.name}${l.variant ? ` (${l.variant})` : ""} — ${formatMoney(l.unitCents * l.qty - l.discountCents)}`);
  }
  out.push("");
  if (t.discountCents > 0) out.push(`Descuento: −${formatMoney(t.discountCents)}`);
  out.push(`*Total: ${formatMoney(t.totalCents)}*`);
  if (t.layaway) {
    for (const p of t.payments) out.push(`Abono ${p.date ? shortDate(p.date) : ""} (${p.label}): ${formatMoney(p.amountCents)}`.replace("  ", " "));
    out.push(`Pagado: ${formatMoney(t.layaway.paidCents)}`);
    if (t.status === "pending") {
      out.push(`*Resta: ${formatMoney(t.layaway.balanceCents)}*`);
      out.push(`Fecha límite: ${shortDate(t.layaway.deadline)}`);
    }
  } else {
    for (const p of t.payments) out.push(`${p.label}: ${formatMoney(p.amountCents)}`);
    if (t.changeCents > 0) out.push(`Cambio: ${formatMoney(t.changeCents)}`);
  }
  if (t.pending) out.push("", "Folio provisional: la venta se registró sin señal.");
  if (s.ticket_footer) out.push("", s.ticket_footer);
  return out.join("\n");
}

/** Enlace de WhatsApp. Un número de 10 dígitos se toma como celular de México (+52). */
export function whatsappUrl(text: string, phone?: string | null): string {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) digits = `52${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
