import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CalendarClock, Minus, Plus, Trash2, User } from "lucide-react";
import { useState } from "react";
import type { Cart, CartAction } from "../lib/cart";
import { maxDiscountCents, totals } from "../lib/cart";
import { formatMoney, parsePesos } from "../lib/money";
import { Button } from "../ui/Button";
import { variantLabel } from "./ProductGrid";

export const DISCOUNT_DENIED = "Ese descuento necesita autorización del administrador.";

export function CartPanel({ cart, dispatch, role, onCharge, onPickClient, onLayaway }: { cart: Cart; dispatch: (a: CartAction) => void; role: "admin" | "seller"; onCharge: () => void; onPickClient: () => void; onLayaway: () => void }) {
  const reduce = useReducedMotion();
  const t = totals(cart);
  const [showDiscount, setShowDiscount] = useState(cart.discountCents > 0);
  const [discountText, setDiscountText] = useState(cart.discountCents > 0 ? (cart.discountCents / 100).toFixed(2) : "");
  const parsed = discountText.trim() ? parsePesos(discountText) : 0;
  const lineDisc = cart.lines.reduce((s, l) => s + l.discountCents, 0);
  const tooMuch = parsed !== null && parsed + lineDisc > maxDiscountCents(t.subtotal, role);
  const discountError = parsed === null ? "Escribe una cantidad válida." : tooMuch ? DISCOUNT_DENIED : null;

  function onDiscount(text: string) {
    setDiscountText(text);
    const c = text.trim() ? parsePesos(text) : 0;
    dispatch({ type: "setDiscount", cents: c ?? 0 });
  }

  return (
    <section aria-label="Carrito" className="flex h-full flex-col">
      <div className="flex items-baseline justify-between px-5 pb-3 pt-5">
        <h2 className="font-serif text-4xl">Carrito</h2>
        {cart.lines.length > 0 && (
          <button className="text-sm text-muted underline" onClick={() => { dispatch({ type: "clear" }); setDiscountText(""); setShowDiscount(false); }}>
            Vaciar
          </button>
        )}
      </div>
      <div className="px-5 pb-3">
        <button onClick={onPickClient} className="flex w-full items-center gap-3 rounded-2xl border border-line px-4 py-2.5 text-left hover:bg-surface">
          <User className="size-5 shrink-0 text-muted" aria-hidden />
          {cart.client ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">Cliente: {cart.client.name}</span>
              <span className="block text-sm text-muted">{cart.client.points} puntos{cart.client.creditCents > 0 ? ` · Saldo ${formatMoney(cart.client.creditCents)}` : ""}</span>
            </span>
          ) : (
            <span className="flex-1 text-muted">Cliente <span className="text-sm">(opcional, suma puntos)</span></span>
          )}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5">
        {cart.lines.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-5 py-10 text-center text-muted">
            El carrito está vacío. Toca un producto, escanea su código o busca con Ctrl+K.
          </p>
        ) : (
          <ul className="grid gap-3">
            <AnimatePresence initial={false}>
              {cart.lines.map((l) => (
                <motion.li
                  key={l.variantId}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduce ? undefined : { opacity: 0, x: -24, height: 0, marginTop: 0 }}
                  transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
                  className="grid grid-cols-[56px_1fr_auto] items-center gap-3"
                >
                  <img src={l.photo} alt="" className="size-14 rounded-xl bg-surface object-cover" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{l.name}</p>
                    <p className="truncate text-sm text-muted">
                      {variantLabel(l.attrs) ? `${variantLabel(l.attrs)} · ` : ""}
                      {formatMoney(l.priceCents)}
                    </p>
                    <div className="mt-1 inline-flex items-center rounded-full border border-line">
                      <button className="grid size-9 place-items-center" aria-label={`Quitar una pieza de ${l.name}`} onClick={() => dispatch({ type: "setQty", variantId: l.variantId, qty: l.qty - 1 })}>
                        <Minus className="size-4" aria-hidden />
                      </button>
                      <span className="tnum min-w-7 text-center font-bold" aria-label={`${l.qty} piezas`}>{l.qty}</span>
                      <button className="grid size-9 place-items-center" aria-label={`Agregar una pieza de ${l.name}`} onClick={() => dispatch({ type: "setQty", variantId: l.variantId, qty: l.qty + 1 })}>
                        <Plus className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="tnum font-bold">{formatMoney(l.priceCents * l.qty - l.discountCents)}</span>
                    <button className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface" aria-label={`Quitar ${l.name} del carrito`} onClick={() => dispatch({ type: "remove", variantId: l.variantId })}>
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
      <div className="grid gap-3 border-t border-line px-5 pb-5 pt-4">
        {cart.lines.length > 0 && (
          <>
            {showDiscount ? (
              <div className="grid gap-1.5">
                <label htmlFor="cart-discount" className="text-sm font-semibold">Descuento en pesos</label>
                <input
                  id="cart-discount"
                  inputMode="decimal"
                  autoFocus
                  value={discountText}
                  onChange={(e) => onDiscount(e.target.value)}
                  aria-invalid={discountError ? true : undefined}
                  aria-describedby="cart-discount-msg"
                  className={`min-h-11 rounded-xl border bg-paper px-3.5 ${discountError ? "border-danger" : "border-line"}`}
                  placeholder={role === "seller" ? `Hasta ${formatMoney(maxDiscountCents(t.subtotal, role))}` : "0"}
                />
                {discountError && <p id="cart-discount-msg" className="text-sm text-danger">{discountError}</p>}
              </div>
            ) : (
              <button className="justify-self-start text-sm font-semibold underline" onClick={() => setShowDiscount(true)}>
                Descuento
              </button>
            )}
            <dl className="grid gap-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal · {t.pieces} {t.pieces === 1 ? "pieza" : "piezas"}</dt><dd className="tnum">{formatMoney(t.subtotal)}</dd></div>
              {t.discount > 0 && <div className="flex justify-between"><dt className="text-muted">Descuento</dt><dd className="tnum">−{formatMoney(t.discount)}</dd></div>}
            </dl>
          </>
        )}
        <div className="flex items-baseline justify-between">
          <span className="font-serif text-3xl">Total</span>
          <motion.span key={t.total} initial={reduce ? false : { scale: 1.08 }} animate={{ scale: 1 }} className="tnum font-serif text-5xl">
            {formatMoney(t.total)}
          </motion.span>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button size="lg" variant="ghost" disabled={cart.lines.length === 0 || !!discountError} onClick={onLayaway} title="Apartar con anticipo">
            <CalendarClock className="size-5" aria-hidden /> Apartar
          </Button>
          <Button size="lg" variant="wine" disabled={cart.lines.length === 0 || !!discountError} onClick={onCharge}>
            Cobrar {formatMoney(t.total)}
          </Button>
        </div>
      </div>
    </section>
  );
}
