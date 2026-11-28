import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Camera, CloudOff, ScanLine, Search, ShoppingBag } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { api, ApiError } from "../lib/api";
import { cartReducer, loadCart, salePayload, saveCart, totals, type Payment } from "../lib/cart";
import { useLiveStock } from "../lib/liveStock";
import { formatMoney } from "../lib/money";
import { createScanDetector } from "../lib/scanner";
import type { Category, Product, Variant } from "../lib/types";
import { ADD_PRODUCT_EVENT } from "../shell/CommandPalette";
import { useToast } from "../ui/Toast";
import { CartPanel } from "./CartPanel";
import { PaymentSheet, type SaleResult } from "./PaymentSheet";
import { ClientPicker } from "../clients/ClientPicker";
import { NewLayawaySheet } from "../layaways/NewLayawaySheet";
import { ProductGrid } from "./ProductGrid";
import { filterCatalog, findByCode, loadCatalog, provisionalFolio, type Catalog } from "../offline/cache";
import { ScanSheet } from "../scan/ScanSheet";
import { isNetworkError, queueAction } from "../offline/offlineAction";
import { useOffline } from "../offline/OfflineProvider";
import { clientHeaders, nowLocalIso } from "../offline/queue";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Dialog";
import { cartTicket, saleTicket, type SaleForTicket } from "../lib/ticket";

function seenAgo(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `el ${new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}`;
}

/** En línea consulta al servidor; sin señal usa la copia del catálogo guardada en el dispositivo. */
async function withOffline<T>(online: () => Promise<T>, offline: (c: Catalog) => T): Promise<T> {
  try {
    return await online();
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 0) throw e;
    const c = await loadCatalog();
    if (!c) throw e;
    return offline(c);
  }
}

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
  const [picking, setPicking] = useState(false);
  const [laying, setLaying] = useState(false);
  const [pendingLayaway, setPendingLayaway] = useState(false);
  const [mobileCart, setMobileCart] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { markOffline } = useOffline();
  const [scanning, setScanning] = useState(false);
  const [lowAsk, setLowAsk] = useState<{ names: string[]; resolve: (ok: boolean) => void } | null>(null);

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => withOffline(() => api<{ categories: Category[] }>("/api/categories"), (c) => ({ categories: c.categories })),
  });
  const products = useQuery({
    queryKey: ["products", "pos", dq, category],
    queryFn: () =>
      withOffline(
        () => api<{ products: Product[]; total: number; cachedAt?: string }>(`/api/products?q=${encodeURIComponent(dq)}${category ? `&category=${category}` : ""}`),
        (c) => ({ ...filterCatalog(c, dq, category), cachedAt: c.saved_at }),
      ),
    placeholderData: (prev) => prev,
  });

  useLiveStock(useCallback((stock: Record<number, number>) => dispatch({ type: "refreshStock", stock }), []));

  useEffect(() => {
    if (cart.error) toast(cart.error, "error");
  }, [cart, toast]);

  const addVariant = useCallback(
    (p: Product, v: Variant) => {
      dispatch({ type: "add", line: { variantId: v.id, name: p.name, attrs: v.attrs, priceCents: v.price_cents, qty: 1, stock: v.stock, discountCents: 0, photo: p.photos[0]?.thumb_url ?? "" } });
    },
    [],
  );

  /** Busca un código (lector USB o cámara) y agrega la pieza; sin señal busca en la copia del catálogo. */
  const addByCode = useCallback(
    async (code: string, quiet = false): Promise<boolean> => {
      try {
        const d = await withOffline(
          () => api<{ product: Product; variant: Variant }>(`/api/variants/lookup?code=${encodeURIComponent(code)}`),
          (c) => {
            const hit = findByCode(c, code);
            if (!hit) throw new ApiError(404, "No encontramos ese código.");
            return hit;
          },
        );
        addVariant(d.product, d.variant);
        toast(`${d.product.name} agregado.`, "ok");
        return true;
      } catch (e) {
        if (!quiet) toast(e instanceof ApiError ? e.message : "No se pudo leer el código.", "error");
        return false;
      }
    },
    [addVariant, toast],
  );

  // Lector de códigos USB (y Ctrl+K desde la paleta)
  useEffect(() => {
    const detector = createScanDetector(async (code) => {
      if (document.activeElement === searchRef.current) setQ("");
      await addByCode(code);
    });
    const onKey = (e: KeyboardEvent) => {
      if (paying || picking || laying || scanning) return;
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
  }, [addVariant, addByCode, paying, picking, laying, scanning]);

  const inCart = useMemo(() => Object.fromEntries(cart.lines.map((l) => [l.variantId, l.qty])), [cart.lines]);
  const t = totals(cart);

  async function saveOffline(body: ReturnType<typeof salePayload>, payments: Payment[], clientTime: string): Promise<SaleResult> {
    markOffline();
    if (payments.some((p) => p.method === "credit"))
      throw new Error("El saldo a favor solo se puede usar con señal. Cobra con otra forma de pago.");
    const low = cart.lines.filter((l) => l.stock <= 2);
    if (low.length && !(await new Promise<boolean>((resolve) => setLowAsk({ names: low.map((l) => l.name), resolve }))))
      throw new Error("No se registró la venta. Revisa las piezas cuando vuelva la señal.");
    const folio = provisionalFolio(cart.id);
    await queueAction(
      qc,
      { uid: cart.id, user: user!.id, kind: "sale", label: `Venta ${folio} · ${formatMoney(t.total)}`, path: "/api/sales", json: body, clientTime, stock: Object.fromEntries(cart.lines.map((l) => [l.variantId, l.qty])) },
      Object.fromEntries(cart.lines.map((l) => [l.variantId, l.stock])),
    );
    const change = payments.reduce((s, p) => s + (p.method === "cash" ? (p.receivedCents ?? p.amountCents) - p.amountCents : 0), 0);
    const r = { folio, total_cents: t.total, change_cents: change, offline: true };
    return { ...r, ticket: cartTicket(cart, payments, r, user!.full_name || user!.username, clientTime) };
  }

  async function confirm(payments: Payment[]): Promise<SaleResult> {
    const body = salePayload(cart, payments);
    const clientTime = nowLocalIso();
    try {
      const d = await api<{ sale: SaleResult & SaleForTicket }>("/api/sales", { method: "POST", json: body, headers: clientHeaders(cart.id, clientTime) });
      if (d.sale.total_cents !== t.total)
        toast(`Esta venta ya se había registrado como #${d.sale.folio} por ${formatMoney(d.sale.total_cents)}. Revisa el carrito antes de cobrar otra vez.`, "error");
      return { ...d.sale, ticket: saleTicket(d.sale) };
    } catch (e) {
      if (isNetworkError(e)) return saveOffline(body, payments, clientTime);
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

  const panel = <CartPanel key={cart.id} cart={cart} dispatch={dispatch} role={user!.role} onCharge={() => setPaying(true)} onPickClient={() => setPicking(true)} onLayaway={() => (cart.client ? setLaying(true) : (setPendingLayaway(true), setPicking(true)))} />;

  return (
    <div className="grid h-full lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="min-w-0 px-4 pb-28 pt-6 md:px-8 lg:pb-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-serif text-5xl leading-none md:text-6xl">Vender</h1>
          <div className="flex w-full max-w-xl gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
            <span className="sr-only">Buscar producto</span>
            <input ref={searchRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca por nombre o código" className="min-h-12 w-full rounded-full border border-line bg-paper pl-12 pr-12" />
            <ScanLine className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-label="Acepta lector de códigos" />
          </label>
          <Button variant="ghost" className="min-h-12 shrink-0 px-4" onClick={() => setScanning(true)} aria-label="Escanear con la cámara">
            <Camera className="size-5" aria-hidden /> <span className="hidden sm:inline">Escanear</span>
          </Button>
          </div>
        </div>
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label="Categorías">
          {[{ id: null as number | null, name: "Todo" }, ...(categories.data?.categories ?? [])].map((c) => (
            <button key={c.id ?? "all"} aria-pressed={category === c.id} onClick={() => setCategory(c.id)} className={`shrink-0 rounded-full border px-4 py-2 font-semibold transition-colors ${category === c.id ? "border-ink bg-ink text-paper" : "border-line hover:bg-surface"}`}>
              {c.name}
            </button>
          ))}
        </div>
        {products.data?.cachedAt && (
          <p role="status" className="mb-4 flex items-center gap-2 rounded-2xl bg-wine/10 px-4 py-2.5 text-sm font-semibold text-wine">
            <CloudOff className="size-4 shrink-0" aria-hidden /> Sin señal · existencias vistas {seenAgo(products.data.cachedAt)}. Otro dispositivo pudo vender alguna pieza.
          </p>
        )}
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

      <ClientPicker open={picking} current={cart.client} onOpenChange={(o) => { setPicking(o); if (!o) setPendingLayaway(false); }} onPick={(c) => { dispatch({ type: "setClient", client: c }); if (c && pendingLayaway) setTimeout(() => setLaying(true), 50); }} />
      <NewLayawaySheet open={laying} cart={cart} onClose={() => setLaying(false)} onDone={() => { setLaying(false); newSale(); }} />
      <ScanSheet open={scanning} onOpenChange={setScanning} onCode={(c) => addByCode(c, true)} onPick={(p, v) => { addVariant(p, v); toast(`${p.name} agregado.`, "ok"); }} />
      <PaymentSheet open={paying} total={t.total} creditCents={cart.client?.creditCents ?? 0} onClose={() => setPaying(false)} onConfirm={confirm} onNewSale={newSale} />
      <Modal open={!!lowAsk} onOpenChange={(o) => { if (!o) { lowAsk?.resolve(false); setLowAsk(null); } }} title="Quedan pocas piezas">
        <p className="mb-5 text-muted">
          Sin señal no se puede revisar si otro dispositivo ya vendió <strong className="text-ink">{lowAsk?.names.join(", ")}</strong>. Si la pieza está en tu mano, registra la venta; se avisará al administrador si el stock no alcanza.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="ghost" onClick={() => { lowAsk?.resolve(false); setLowAsk(null); }}>No registrar</Button>
          <Button onClick={() => { lowAsk?.resolve(true); setLowAsk(null); }} autoFocus>Registrar venta</Button>
        </div>
      </Modal>
    </div>
  );
}
