import { motion, useReducedMotion } from "motion/react";
import { Sparkles } from "lucide-react";
import { formatMoney } from "../lib/money";
import type { Product, Variant } from "../lib/types";
import { variantLabel } from "../pos/ProductGrid";

export type Candidate = { product: Product; score: number; ai?: string };

/** Los productos más parecidos: el vendedor toca el correcto (nunca se agrega solo). */
export function PhotoMatches({ list, onPick }: { list: Candidate[]; onPick: (p: Product, v: Variant) => void }) {
  const reduce = useReducedMotion();
  return (
    <ul aria-label="Productos parecidos" className="grid gap-3">
      {list.map((c, i) => {
        const vs = c.product.variants.filter((v) => v.active);
        const photo = c.product.photos[0]?.thumb_url;
        return (
          <motion.li key={c.product.id} layout={!reduce} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : i * 0.06 }}
            className={`overflow-hidden rounded-3xl border ${c.ai !== undefined ? "border-wine ring-2 ring-wine/30" : "border-line"} bg-paper`}>
            <div className="flex gap-3 p-3">
              {photo ? <img src={photo} alt="" className="size-20 shrink-0 rounded-2xl object-cover" /> : <span className="size-20 shrink-0 rounded-2xl bg-surface" />}
              <div className="min-w-0 flex-1">
                {c.ai !== undefined && (
                  <p className="mb-1 inline-flex items-center gap-1 rounded-full bg-wine px-2.5 py-0.5 text-xs font-semibold text-wine-ink"><Sparkles className="size-3.5" aria-hidden /> Sugerido por IA</p>
                )}
                <p className="truncate font-semibold">{c.product.name}</p>
                <p className="text-sm text-muted">{c.product.category}{vs.length === 1 ? ` · ${vs[0].stock} pzas` : ""}</p>
                {c.ai && <p className="mt-1 text-sm text-muted">{c.ai}</p>}
              </div>
              {vs.length === 1 && (
                <button onClick={() => onPick(c.product, vs[0])} className="self-center rounded-full bg-ink px-4 py-2.5 font-semibold text-paper" aria-label={`Agregar ${c.product.name}`}>
                  <span className="tnum">{formatMoney(vs[0].price_cents)}</span>
                </button>
              )}
            </div>
            {vs.length > 1 && (
              <div className="flex flex-wrap gap-2 border-t border-line px-3 py-2.5">
                {vs.map((v) => (
                  <button key={v.id} onClick={() => onPick(c.product, v)} disabled={v.stock <= 0} aria-label={`Agregar ${c.product.name} ${variantLabel(v.attrs)}`}
                    className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold hover:bg-surface disabled:opacity-40">
                    {variantLabel(v.attrs) || v.sku} · <span className="tnum">{formatMoney(v.price_cents)}</span>
                  </button>
                ))}
              </div>
            )}
          </motion.li>
        );
      })}
    </ul>
  );
}
