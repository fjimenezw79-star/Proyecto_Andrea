import { motion, useReducedMotion } from "motion/react";
import { formatMoney } from "../lib/money";
import type { Product } from "../lib/types";

export function variantLabel(attrs: Record<string, string>) {
  return Object.values(attrs).join(" · ");
}

export function ProductGrid({ products, onAdd, inCart }: { products: Product[]; onAdd: (p: Product, variantIndex: number) => void; inCart: Record<number, number> }) {
  const reduce = useReducedMotion();
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {products.flatMap((p) =>
        p.variants
          .filter((v) => v.active)
          .map((v, i) => {
            const left = v.stock - (inCart[v.id] ?? 0);
            const label = variantLabel(v.attrs);
            return (
              <motion.li key={v.id} layout={!reduce} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <button
                  type="button"
                  disabled={v.stock <= 0}
                  onClick={() => onAdd(p, i)}
                  className="group flex w-full flex-col gap-2 text-left disabled:opacity-60"
                >
                  <span className="sr-only">Agregar </span>
                  <span className="relative block aspect-[4/5] overflow-hidden rounded-2xl bg-surface" aria-hidden>
                    {p.photos[0] && (
                      <img src={p.photos[0].thumb_url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105" />
                    )}
                    <span
                      className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        v.stock <= 0 ? "bg-ink text-paper" : v.stock <= 2 ? "bg-wine text-wine-ink" : "bg-paper text-ink"
                      }`}
                    >
                      {v.stock <= 0 ? "Agotado" : `Quedan ${v.stock}`}
                    </span>
                    {(inCart[v.id] ?? 0) > 0 && (
                      <motion.span
                        key={inCart[v.id]}
                        initial={reduce ? false : { scale: 0.6 }}
                        animate={{ scale: [1.15, 1] }}
                        className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-ink font-bold text-paper tnum"
                        aria-hidden
                      >
                        {inCart[v.id]}
                      </motion.span>
                    )}
                    {left <= 0 && v.stock > 0 && <span className="absolute inset-x-0 bottom-0 bg-ink/75 py-1 text-center text-xs font-semibold text-paper">Todo en el carrito</span>}
                  </span>
                  <span className="grid gap-0.5 px-0.5">
                    <span className="line-clamp-2 font-serif text-xl leading-tight">{p.name}</span>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm text-muted">{label || p.category}</span>
                      <span className="tnum shrink-0 font-bold">{formatMoney(v.price_cents)}</span>
                    </span>
                    <span className="sr-only">{v.stock <= 0 ? "Agotado" : `Quedan ${v.stock}`}</span>
                  </span>
                </button>
              </motion.li>
            );
          }),
      )}
    </ul>
  );
}
