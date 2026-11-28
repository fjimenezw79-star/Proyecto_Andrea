/** Carrito del punto de venta: lógica pura, sin pantallas. Dinero en centavos. */

export type CartLine = {
  variantId: number;
  name: string;
  attrs: Record<string, string>;
  priceCents: number;
  qty: number;
  stock: number;
  discountCents: number;
  photo: string;
};

export type CartClient = { id: string; name: string; points: number; creditCents: number };
export type Cart = { id: string; lines: CartLine[]; discountCents: number; client?: CartClient; clientId?: string; error?: string };

export type CartAction =
  | { type: "add"; line: CartLine }
  | { type: "setQty"; variantId: number; qty: number }
  | { type: "remove"; variantId: number }
  | { type: "setLineDiscount"; variantId: number; cents: number }
  | { type: "setDiscount"; cents: number }
  | { type: "refreshStock"; stock: Record<number, number> }
  | { type: "setClient"; client: CartClient | null }
  | { type: "clear" };

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

export function empty(): Cart {
  return { id: newId(), lines: [], discountCents: 0 };
}

const STORE = "ma-cart";

/** El carrito sobrevive a cambiar de pantalla o volver a iniciar sesión (mismo id = misma venta). */
export function loadCart(): Cart {
  try {
    const c = JSON.parse(sessionStorage.getItem(STORE) ?? "null");
    if (c && typeof c.id === "string" && Array.isArray(c.lines)) return { id: c.id, lines: c.lines, discountCents: c.discountCents ?? 0, client: c.client, clientId: c.client?.id };
  } catch {
    /* sin almacenamiento */
  }
  return empty();
}

export function saveCart(cart: Cart) {
  try {
    sessionStorage.setItem(STORE, JSON.stringify({ id: cart.id, lines: cart.lines, discountCents: cart.discountCents, client: cart.client }));
  } catch {
    /* sin almacenamiento */
  }
}

const left = (n: number) => `Quedan ${n}.`;

export function cartReducer(cart: Cart, action: CartAction): Cart {
  const base = { ...cart, error: undefined };
  switch (action.type) {
    case "add": {
      const cur = cart.lines.find((l) => l.variantId === action.line.variantId);
      const stock = action.line.stock;
      if (stock <= 0) return { ...base, error: "Este producto está agotado." };
      if (!cur) return { ...base, lines: [...cart.lines, { ...action.line, qty: 1, discountCents: 0 }] };
      if (cur.qty >= stock) return { ...base, lines: cart.lines.map((l) => (l === cur ? { ...l, stock } : l)), error: left(stock) };
      return { ...base, lines: cart.lines.map((l) => (l === cur ? { ...l, stock, qty: l.qty + 1 } : l)) };
    }
    case "setQty": {
      if (action.qty <= 0) return { ...base, lines: cart.lines.filter((l) => l.variantId !== action.variantId) };
      let error: string | undefined;
      const lines = cart.lines.map((l) => {
        if (l.variantId !== action.variantId) return l;
        const qty = Math.min(Math.floor(action.qty), l.stock);
        if (action.qty > l.stock) error = left(l.stock);
        return { ...l, qty, discountCents: Math.min(l.discountCents, l.priceCents * qty) };
      });
      return { ...base, lines, error };
    }
    case "remove":
      return { ...base, lines: cart.lines.filter((l) => l.variantId !== action.variantId) };
    case "setLineDiscount":
      return {
        ...base,
        lines: cart.lines.map((l) => (l.variantId === action.variantId ? { ...l, discountCents: Math.max(0, Math.min(action.cents, l.priceCents * l.qty)) } : l)),
      };
    case "setDiscount":
      return { ...base, discountCents: Math.max(0, action.cents) };
    case "refreshStock":
      return { ...base, lines: cart.lines.map((l) => (l.variantId in action.stock ? { ...l, stock: action.stock[l.variantId] } : l)) };
    case "setClient":
      return { ...base, client: action.client ?? undefined, clientId: action.client?.id };
    case "clear":
      return empty();
  }
}

export function totals(cart: Cart) {
  const subtotal = cart.lines.reduce((s, l) => s + l.priceCents * l.qty, 0);
  const discount = Math.min(subtotal, cart.lines.reduce((s, l) => s + l.discountCents, 0) + cart.discountCents);
  return { subtotal, discount, total: subtotal - discount, pieces: cart.lines.reduce((s, l) => s + l.qty, 0) };
}

export function maxDiscountCents(subtotal: number, role: "admin" | "seller", pct = 10): number {
  return role === "admin" ? subtotal : Math.floor((subtotal * pct) / 100);
}

export type Method = "cash" | "card" | "transfer" | "credit";
export type Payment = { method: Method; amountCents: number; receivedCents?: number };

export function validatePayments(total: number, payments: Payment[]): { ok: true; changeCents: number } | { ok: false; message: string } {
  if (total === 0 && payments.length === 0) return { ok: true, changeCents: 0 };
  if (payments.length === 0 || payments.some((p) => !(p.amountCents > 0))) return { ok: false, message: "Agrega la forma de pago." };
  for (const p of payments) {
    if (p.method === "cash" && (p.receivedCents ?? p.amountCents) < p.amountCents)
      return { ok: false, message: "El efectivo recibido es menor que lo que se cobra." };
  }
  if (payments.reduce((s, p) => s + p.amountCents, 0) !== total) return { ok: false, message: "Los pagos no cuadran con el total." };
  const changeCents = payments.filter((p) => p.method === "cash").reduce((s, p) => s + ((p.receivedCents ?? p.amountCents) - p.amountCents), 0);
  return { ok: true, changeCents };
}

/** Lo que espera POST /api/sales. */
export function salePayload(cart: Cart, payments: Payment[]) {
  return {
    id: cart.id,
    items: cart.lines.map((l) => ({ variant_id: l.variantId, qty: l.qty, discount_cents: l.discountCents })),
    discount_cents: cart.discountCents,
    client_id: cart.clientId ?? null,
    payments: paymentsPayload(payments),
  };
}

export function paymentsPayload(payments: Payment[]) {
  return payments.map((p) => ({ method: p.method, amount_cents: p.amountCents, ...(p.method === "cash" ? { received_cents: p.receivedCents ?? p.amountCents } : {}) }));
}
