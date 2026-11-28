import { describe, expect, it } from "vitest";
import type { Cart } from "./cart";
import type { Layaway } from "./opTypes";
import { DEFAULT_SETTINGS } from "./settings";
import { cartTicket, layawayTicket, saleTicket, ticketText, whatsappUrl, type SaleForTicket } from "./ticket";

const sale: SaleForTicket = {
  folio: 12, created_at: "2026-11-28T10:30:00", status: "paid", user_name: "Andrea", client_name: "Lupita", client_phone: "4731234567",
  subtotal_cents: 70000, discount_cents: 5000, total_cents: 65000, change_cents: 3500,
  items: [
    { name: "Termo", attrs: { Color: "Rosa" }, qty: 2, unit_price_cents: 25000, discount_cents: 0 },
    { name: "Cobija", attrs: {}, qty: 1, unit_price_cents: 20000, discount_cents: 5000 },
  ],
  payments: [{ method: "cash", amount_cents: 65000 }],
};

describe("tickets", () => {
  it("convierte una venta del servidor", () => {
    const t = saleTicket(sale);
    expect(t.folio).toBe("#12");
    expect(t.lines[0]).toEqual({ name: "Termo", variant: "Rosa", qty: 2, unitCents: 25000, discountCents: 0 });
    expect(t.payments).toEqual([{ label: "Efectivo", amountCents: 65000 }]);
  });

  it("arma el texto para WhatsApp con total, pago, cambio y pie", () => {
    const text = ticketText(saleTicket(sale), DEFAULT_SETTINGS);
    expect(text).toContain("*Modas Andrea* · Yuda");
    expect(text).toContain("Venta #12");
    expect(text).toContain("2 × Termo (Rosa) — $500.00");
    expect(text).toContain("1 × Cobija — $150.00");
    expect(text).toContain("Descuento: −$50.00");
    expect(text).toContain("*Total: $650.00*");
    expect(text).toContain("Efectivo: $650.00");
    expect(text).toContain("Cambio: $35.00");
    expect(text.trim().endsWith("¡Gracias por tu compra!")).toBe(true);
  });

  it("marca el folio provisional de una venta sin señal", () => {
    const cart: Cart = { id: "x", discountCents: 0, lines: [{ variantId: 1, name: "Termo", attrs: {}, priceCents: 25000, qty: 1, stock: 3, discountCents: 0, photo: "" }] };
    const t = cartTicket(cart, [{ method: "card", amountCents: 25000 }], { folio: "P-0042", total_cents: 25000, change_cents: 0, offline: true }, "Andrea", "2026-11-28T10:00:00");
    expect(t.folio).toBe("P-0042");
    expect(ticketText(t, DEFAULT_SETTINGS)).toContain("Folio provisional");
  });

  it("el ticket de apartado lleva abonos, saldo y fecha límite", () => {
    const l = {
      folio: 3, status: "pending", created_at: "2026-11-01T09:00:00", user_name: "Andrea", client_name: "Lupita", client_phone: "",
      subtotal_cents: 90000, discount_cents: 0, total_cents: 90000, paid_cents: 40000, balance_cents: 50000, deadline: "2026-12-15",
      items: [{ name: "Mochila", attrs: { Personaje: "Mario" }, qty: 1, unit_price_cents: 90000, discount_cents: 0 }],
      payments: [
        { id: "a", method: "cash", amount_cents: 20000, received_cents: 20000, user_name: "Andrea", created_at: "2026-11-01T09:00:00" },
        { id: "b", method: "transfer", amount_cents: 20000, received_cents: null, user_name: "Andrea", created_at: "2026-11-15T09:00:00" },
      ],
    } as unknown as Layaway; // solo los campos que usa el ticket
    const text = ticketText(layawayTicket(l), DEFAULT_SETTINGS);
    expect(text).toContain("Apartado A-3");
    expect(text).toMatch(/Abono 15 nov 2026 \(Transferencia\): \$200\.00/);
    expect(text).toContain("*Resta: $500.00*");
    expect(text).toContain("Fecha límite: 15 dic 2026");
  });

  it("el enlace de WhatsApp agrega +52 a un celular de 10 dígitos", () => {
    expect(whatsappUrl("hola", "473 123 4567")).toBe("https://wa.me/524731234567?text=hola");
    expect(whatsappUrl("hola")).toBe("https://wa.me/?text=hola");
  });
});
