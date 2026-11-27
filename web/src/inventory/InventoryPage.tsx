import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { PackagePlus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../lib/api";
import { formatMoney } from "../lib/money";
import type { Category, Product } from "../lib/types";

type LowRow = { id: number; product_id: number };

export function InventoryPage() {
  const { isAdmin } = useAuth();
  const reduce = useReducedMotion();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<number | null>(null);
  const [low, setLow] = useState(false);
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api<{ categories: Category[] }>("/api/categories") });
  const products = useQuery({
    queryKey: ["products", "inv", q.trim(), category],
    queryFn: () => api<{ products: Product[]; total: number }>(`/api/products?q=${encodeURIComponent(q.trim())}${category ? `&category=${category}` : ""}`),
    placeholderData: (p) => p,
  });
  const lowStock = useQuery({ queryKey: ["low-stock"], queryFn: () => api<{ variants: LowRow[] }>("/api/inventory/low-stock"), enabled: low });
  const lowIds = useMemo(() => new Set(lowStock.data?.variants.map((v) => v.product_id)), [lowStock.data]);
  const list = (products.data?.products ?? []).filter((p) => !low || lowIds.has(p.id));

  return (
    <section className="px-4 pb-10 pt-6 md:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-5xl leading-none md:text-6xl">Inventario</h1>
          <p className="mt-2 text-muted">{products.data ? `${products.data.total} productos` : " "}</p>
        </div>
        {isAdmin && (
          <Link to="/productos/nuevo" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 font-semibold text-paper">
            <PackagePlus className="size-5" aria-hidden /> Nuevo producto
          </Link>
        )}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <span className="sr-only">Buscar en inventario</span>
          <input type="search" aria-label="Buscar en inventario" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, código MA o código de fábrica" className="min-h-12 w-full rounded-full border border-line bg-paper pl-12 pr-4" />
        </label>
      </div>
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label="Filtros">
        {[{ id: null as number | null, name: "Todo" }, ...(categories.data?.categories ?? [])].map((c) => (
          <button key={c.id ?? "all"} aria-pressed={category === c.id} onClick={() => setCategory(c.id)} className={`shrink-0 rounded-full border px-4 py-2 font-semibold ${category === c.id ? "border-ink bg-ink text-paper" : "border-line hover:bg-surface"}`}>
            {c.name}
          </button>
        ))}
        <button aria-pressed={low} onClick={() => setLow((v) => !v)} className={`shrink-0 rounded-full border px-4 py-2 font-semibold ${low ? "border-wine bg-wine text-wine-ink" : "border-line hover:bg-surface"}`}>
          Stock bajo
        </button>
      </div>
      {list.length === 0 && !products.isLoading ? (
        <p className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-muted">
          {low ? "Ningún producto con stock bajo. Todo en orden." : q ? `No encontramos “${q}”.` : "Todavía no hay productos. Da de alta el primero con Nuevo producto."}
        </p>
      ) : (
        <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
          {list.map((p, i) => {
            const prices = p.variants.map((v) => v.price_cents);
            const minP = Math.min(...prices);
            const maxP = Math.max(...prices);
            return (
              <motion.li key={p.id} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 12) * 0.02 }} className="bg-paper">
                <Link to={`/inventario/${p.id}`} className="grid grid-cols-[56px_1fr_auto] items-center gap-4 px-4 py-3 hover:bg-surface md:grid-cols-[56px_1fr_160px_120px_120px]">
                  <img src={p.photos[0]?.thumb_url} alt="" className="size-14 rounded-xl bg-surface object-cover" loading="lazy" />
                  <span className="min-w-0">
                    <span className="block truncate font-serif text-xl leading-tight">{p.name}</span>
                    <span className="block truncate text-sm text-muted">
                      {p.variants.length > 1 ? `${p.variants.length} variantes · ` : `${p.variants[0]?.sku} · `}
                      {p.category}
                    </span>
                  </span>
                  <span className="hidden text-sm text-muted md:block">{p.online ? "En tienda en línea" : "Solo en tienda física"}</span>
                  <span className={`tnum text-right font-semibold ${p.stock_total <= 2 ? "text-wine" : ""}`}>{p.stock_total} {p.stock_total === 1 ? "pieza" : "piezas"}</span>
                  <span className="tnum hidden text-right font-bold md:block">{minP === maxP ? formatMoney(minP) : `${formatMoney(minP)}+`}</span>
                </Link>
              </motion.li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
