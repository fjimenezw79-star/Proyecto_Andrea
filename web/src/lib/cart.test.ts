import { describe, expect, it } from "vitest";
import { cartReducer, empty, maxDiscountCents, totals, validatePayments, type CartLine } from "./cart";

const L = (over: Partial<CartLine> = {}): CartLine => ({
  variantId: 1, name: "Mario Bros", attrs: {}, priceCents: 35000, qty: 1, stock: 3, discountCents: 0, photo: "", ...over,
});

describe("carrito", () => {
  it("agrega y suma cantidad del mismo producto", () => {
    let c = cartReducer(empty(), { type: "add", line: L() });
    c = cartReducer(c, { type: "add", line: L() });
    expect(c.lines).toHaveLength(1);
    expect(c.lines[0].qty).toBe(2);
    expect(c.error).toBeUndefined();
  });

  it("no deja pasar del stock", () => {
    const c = cartReducer(empty(), { type: "add", line: L({ stock: 1 }) });
    const r = cartReducer(c, { type: "add", line: L({ stock: 1 }) });
    expect(r.lines[0].qty).toBe(1);
    expect(r.error).toBe("Quedan 1.");
  });

  it("agotado no entra al carrito", () => {
    const r = cartReducer(empty(), { type: "add", line: L({ stock: 0 }) });
    expect(r.lines).toHaveLength(0);
    expect(r.error).toBe("Este producto está agotado.");
  });

  it("setQty respeta límites y 0 quita el renglón", () => {
    let c = cartReducer(empty(), { type: "add", line: L({ stock: 3 }) });
    c = cartReducer(c, { type: "setQty", variantId: 1, qty: 5 });
    expect(c.lines[0].qty).toBe(3);
    expect(c.error).toBe("Quedan 3.");
    c = cartReducer(c, { type: "setQty", variantId: 1, qty: 0 });
    expect(c.lines).toHaveLength(0);
  });

  it("totales con descuentos", () => {
    let c = cartReducer(empty(), { type: "add", line: L({ variantId: 2, name: "Botella", priceCents: 19000, stock: 4 }) });
    c = cartReducer(c, { type: "setQty", variantId: 2, qty: 2 });
    c = cartReducer(c, { type: "add", line: L() });
    c = cartReducer(c, { type: "setLineDiscount", variantId: 1, cents: 2000 });
    c = cartReducer(c, { type: "setDiscount", cents: 1000 });
    expect(totals(c)).toEqual({ subtotal: 73000, discount: 3000, total: 70000, pieces: 3 });
  });

  it("clear genera id nuevo y vacía", () => {
    const a = cartReducer(empty(), { type: "add", line: L() });
    const b = cartReducer(a, { type: "clear" });
    expect(b.id).not.toBe(a.id);
    expect(b.lines).toEqual([]);
  });

  it("el id se conserva mientras se edita el carrito", () => {
    const a = empty();
    expect(cartReducer(a, { type: "add", line: L() }).id).toBe(a.id);
  });
});

describe("descuentos y pagos", () => {
  it("tope de descuento de vendedor 10 %", () => {
    expect(maxDiscountCents(35000, "seller")).toBe(3500);
    expect(maxDiscountCents(35000, "admin")).toBe(35000);
  });

  it("pago mixto debe cuadrar", () => {
    expect(validatePayments(73000, [{ method: "card", amountCents: 20000 }, { method: "cash", amountCents: 10000, receivedCents: 10000 }]))
      .toEqual({ ok: false, message: "Los pagos no cuadran con el total." });
  });

  it("cambio en efectivo", () => {
    expect(validatePayments(73000, [{ method: "cash", amountCents: 73000, receivedCents: 100000 }])).toEqual({ ok: true, changeCents: 27000 });
  });

  it("efectivo insuficiente", () => {
    expect(validatePayments(73000, [{ method: "cash", amountCents: 73000, receivedCents: 50000 }]))
      .toEqual({ ok: false, message: "El efectivo recibido es menor que lo que se cobra." });
  });

  it("total cero no necesita pago", () => {
    expect(validatePayments(0, [])).toEqual({ ok: true, changeCents: 0 });
  });
});
