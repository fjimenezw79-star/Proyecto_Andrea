import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ScanLine, Search, ShoppingBag } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { api, ApiError } from "../lib/api";
import { cartReducer, loadCart, salePayload, saveCart, totals, type Payment } from "../lib/cart";
import { formatMoney } from "../lib/money";
import { createScanDetector } from "../lib/scanner";
import type { Category, Product, Variant } from "../lib/types";
import { ADD_PRODUCT_EVENT } from "../shell/CommandPalette";
import { useToast } from "../ui/Toast";
import { CartPanel } from "./CartPanel";
import { PaymentSheet, type SaleResult } from "./PaymentSheet";
import { ProductGrid } from "./ProductGrid";

export function PosPage() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const [cart, dispatch] = useReducer(cartReducer, undefined, loadCart);
  useEffect(() => saveCart(cart), [cart]);
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const [category, setCategory] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  const [mobileCart, setMobileCart] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api<{ categories: Category[] }>("/api/categories") });
  const products = useQuery({
    queryKey: ["products", "pos", dq, category],
    queryFn: () => api<{ products: Product[]; total: number }>(`/api/products?q=${encodeURIComponent(dq)}${category ? `&category=${category}` : ""}`),
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (cart.error) toast(cart.error, "error");
  }, [cart, toast]);

  const addVariant = useCallback(
    (p: Product, v: Variant) => {
      dispatch({ type: "add", line: { variantId: v.id, name: p.name, attrs: v.attrs, priceCents: v.price_cents, qty: 1, stock: v.stock, discountCents: 0, photo: p.photos[0]?.thumb_url ?? "" } });
    },
    [],
  );

  // Lector de códigos USB (y Ctrl+K desde la paleta)
  useEffect(() => {
    const detector = createScanDetector(async (code) => {
      if (document.activeElement === searchRef.current) setQ("");
      try {
        const d = await api<{ product: Product; variant: Variant }>(`/api/variants/lookup?code=${encodeURIComponent(code)}`);
        addVariant(d.product, d.variant);
      } catch (e) {
        toast(e instanceof ApiError ? e.message : "No se pudo leer el código.", "error");
      }
    });
    const onKey = (e: KeyboardEvent) => {
      if (paying) return;
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") && el !== searchRef.current;
      if (typing) return;
      if (detector.handleKey(e)) e.preventDefault();
    };
    const onPick = (e: Event) => {
      if (paying) return;
      const p = (e as CustomEvent<Product>).detail;
      const v = p.variants.find((x) => x.active && x.stock > 0) ?? p.variants[0];
      if (v) addVariant(p, v);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(ADD_PRODUCT_EVENT, onPick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(ADD_PRODUCT_EVENT, onPick);
    };
  }, [addVariant, paying, toast]);

  const inCart = useMemo(() => Object.fromEntries(cart.lines.map((l) => [l.variantId, l.qty])), [cart.lines]);
  const t = totals(cart);

  async function confirm(payments: Payment[]): Promise<SaleResult> {
    try {
      const d = await api<{ sale: SaleResult }>("/api/sales", { method: "POST", json: salePayload(cart, payments) });
      if (d.sale.total_cents !== t.total)
        toast(`Esta venta ya se había registrado como #${d.sale.folio} por ${formatMoney(d.sale.total_cents)}. Revisa el carrito antes de cobrar otra vez.`, "error");
      return d.sale;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && typeof e.data.variant_id === "number" && typeof e.data.available === "number")
        dispatch({ type: "refreshStock", stock: { [e.data.variant_id]: e.data.available } });
      throw e;
    }
  }

  function newSale() {
    setPaying(false);
    setMobileCart(false);
    dispatch({ type: "clear" });
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  const panel = <CartPanel key={cart.id} cart={cart} dispatch={dispatch} role={user!.role} onCharge={() => setPaying(true)} />;

  return (
    <div className="grid h-full lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="min-w-0 px-4 pb-28 pt-6 md:px-8 lg:pb-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-serif text-5xl leading-none md:text-6xl">Vender</h1>
          <label className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
            <span className="sr-only">Buscar producto</span>
            <input ref={searchRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca por nombre o código" className="min-h-12 w-full rounded-full border border-line bg-paper pl-12 pr-12" />
            <ScanLine className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-label="Acepta lector de códigos" />
          </label>
        </div>
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label="Categorías">
          {[{ id: null as number | null, name: "Todo" }, ...(categories.data?.categories ?? [])].map((c) => (
            <button key={c.id ?? "all"} aria-pressed={category === c.id} onClick={() => setCategory(c.id)} className={`shrink-0 rounded-full border px-4 py-2 font-semibold transition-colors ${category === c.id ? "border-ink bg-ink text-paper" : "border-line hover:bg-surface"}`}>
              {c.name}
            </button>
          ))}
        </div>
        {products.isLoading ? (
          <p className="text-muted">Cargando productos…</p>
        ) : products.data && products.data.products.length > 0 ? (
          <>
            <ProductGrid products={products.data.products} inCart={inCart} onAdd={(p, i) => addVariant(p, p.variants.filter((v) => v.active)[i])} />
            {products.data.total > products.data.products.length && (
              <p className="mt-6 text-center text-sm text-muted">Mostrando {products.data.products.length} de {products.data.total}. Busca para encontrar los demás.</p>
            )}
          </>
        ) : (
          <p className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-muted">
            {q ? `No encontramos “${q}”. Prueba con otro nombre o código.` : "Todavía no hay productos en esta categoría."}
          </p>
        )}
      </section>

      <aside className="sticky top-0 hidden h-dvh border-l border-line bg-paper lg:block">{panel}</aside>

      {/* Celular y tablet: resumen fijo y hoja con el carrito */}
      <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+76px)] z-30 md:bottom-4 lg:hidden">
        <button onClick={() => setMobileCart(true)} className="flex w-full items-center justify-between rounded-full bg-ink px-5 py-3.5 text-paper shadow-xl">
          <span className="flex items-center gap-2 font-semibold">
            <ShoppingBag className="size-5" aria-hidden /> Ver carrito · {t.pieces} {t.pieces === 1 ? "pieza" : "piezas"}
          </span>
          <span className="tnum font-serif text-2xl">{formatMoney(t.total)}</span>
        </button>
      </div>
      <AnimatePresence>
        {mobileCart && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button aria-label="Cerrar carrito" className="absolute inset-0 bg-black/40" onClick={() => setMobileCart(false)} />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ duration: reduce ? 0 : 0.35, ease: [0.2, 0.8, 0.2, 1] }} className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-hidden rounded-t-3xl bg-paper pb-[env(safe-area-inset-bottom,0px)]">
              <div className="h-[80dvh]">{panel}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <PaymentSheet open={paying} total={t.total} onClose={() => setPaying(false)} onConfirm={confirm} onNewSale={newSale} />
    </div>
  );
}
