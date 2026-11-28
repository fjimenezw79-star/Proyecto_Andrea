import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Minus, Plus, Printer, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { api } from "../lib/api";
import { formatMoney } from "../lib/money";
import { useBusinessSettings, type LabelSize } from "../lib/settings";
import type { Product, Variant } from "../lib/types";
import { variantLabel } from "../pos/ProductGrid";
import { LABEL_SIZES, LabelSheets, labelPageCss, perPage, type LabelItem } from "../print/Labels";
import { printNow } from "../print/printNow";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";

const MAX_LABELS = 1000;
type Row = { variantId: number; item: LabelItem; qty: number };

function toRow(p: Product, v: Variant): Row {
  return { variantId: v.id, item: { sku: v.sku, name: p.name, variant: variantLabel(v.attrs), priceCents: v.price_cents }, qty: Math.max(1, v.stock) };
}

/** Etiquetas con código de barras: una por pieza en stock o las que se elijan, en térmica o en hoja carta. */
export function LabelsPage() {
  const toast = useToast();
  const reduce = useReducedMotion();
  const [params] = useSearchParams();
  const settings = useBusinessSettings();
  const [size, setSize] = useState<LabelSize | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const sz: LabelSize = size ?? settings.data?.label_size ?? "50x25";

  const preset = params.get("producto");
  const presetQ = useQuery({ queryKey: ["product", preset], queryFn: () => api<{ product: Product }>(`/api/products/${preset}`), enabled: !!preset });
  useEffect(() => {
    const p = presetQ.data?.product;
    if (p) setRows(p.variants.filter((v) => v.active).map((v) => toRow(p, v)));
  }, [presetQ.data]);

  const results = useQuery({
    queryKey: ["products", "labels", dq],
    queryFn: () => api<{ products: Product[] }>(`/api/products?q=${encodeURIComponent(dq)}`),
    enabled: dq.length > 0,
  });

  const items = useMemo(() => rows.flatMap((r) => Array.from({ length: r.qty }, () => r.item)), [rows]);
  const total = items.length;
  const pages = Math.ceil(total / perPage(sz));

  function add(p: Product, v: Variant) {
    setRows((rs) => (rs.some((r) => r.variantId === v.id) ? rs : [...rs, toRow(p, v)]));
    setQ("");
  }
  const setQty = (id: number, qty: number) => setRows((rs) => rs.map((r) => (r.variantId === id ? { ...r, qty: Math.max(1, Math.min(500, qty || 1)) } : r)));

  async function print() {
    if (total > MAX_LABELS) return toast(`Imprime máximo ${MAX_LABELS} etiquetas a la vez.`, "error");
    await printNow(<LabelSheets items={items} size={sz} business={settings.data?.business_name ?? ""} />, labelPageCss(sz));
  }

  return (
    <section className="px-4 pb-16 pt-6 md:px-8">
      <h1 className="font-serif text-5xl leading-none md:text-6xl">Etiquetas</h1>
      <p className="mt-2 max-w-prose text-muted">Elige los productos; por cada uno se propone una etiqueta por pieza en existencia.</p>

      <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
            <span className="sr-only">Buscar producto para etiquetar</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca por nombre o código" className="min-h-12 w-full rounded-full border border-line bg-paper pl-12 pr-4" />
          </label>
          {dq && (
            <ul aria-label="Resultados" className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
              {(results.data?.products ?? []).flatMap((p) => p.variants.filter((v) => v.active).map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 bg-paper px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="text-sm text-muted">{[variantLabel(v.attrs), v.sku, `${v.stock} pzas`].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => add(p, v)} aria-label={`Agregar ${p.name} ${variantLabel(v.attrs)}`.trim()}>
                    <Plus className="size-4" aria-hidden /> Agregar
                  </Button>
                </li>
              )))}
              {results.data && results.data.products.length === 0 && <li className="bg-paper px-4 py-3 text-muted">Sin resultados.</li>}
            </ul>
          )}

          {rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-muted">Todavía no hay etiquetas. Busca un producto para agregarlo.</p>
          ) : (
            <ul aria-label="Etiquetas a imprimir" className="grid gap-2">
              <AnimatePresence initial={false}>
                {rows.map((r) => (
                  <motion.li key={r.variantId} layout={!reduce} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, x: -16 }} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{r.item.name}</span>
                      <span className="text-sm text-muted">{[r.item.variant, r.item.sku, formatMoney(r.item.priceCents)].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <button className="grid size-9 place-items-center rounded-full hover:bg-paper" aria-label={`Una etiqueta menos de ${r.item.sku}`} onClick={() => setQty(r.variantId, r.qty - 1)}><Minus className="size-4" aria-hidden /></button>
                      <input aria-label={`Etiquetas de ${r.item.sku}`} inputMode="numeric" value={r.qty} onChange={(e) => setQty(r.variantId, Number(e.target.value.replace(/\D/g, "")))} className="tnum h-9 w-14 rounded-lg border border-line bg-paper text-center" />
                      <button className="grid size-9 place-items-center rounded-full hover:bg-paper" aria-label={`Una etiqueta más de ${r.item.sku}`} onClick={() => setQty(r.variantId, r.qty + 1)}><Plus className="size-4" aria-hidden /></button>
                    </span>
                    <button className="grid size-9 place-items-center rounded-full hover:bg-paper" aria-label={`Quitar ${r.item.sku}`} onClick={() => setRows((rs) => rs.filter((x) => x.variantId !== r.variantId))}><Trash2 className="size-4" aria-hidden /></button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <div className="grid content-start gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="label-size" className="text-sm font-semibold">Tipo de etiqueta</label>
            <select id="label-size" value={sz} onChange={(e) => setSize(e.target.value as LabelSize)} className="min-h-11 rounded-xl border border-line bg-paper px-3">
              {(Object.keys(LABEL_SIZES) as LabelSize[]).map((k) => <option key={k} value={k}>{LABEL_SIZES[k].name}</option>)}
            </select>
          </div>
          <div className="overflow-auto rounded-3xl border border-line bg-surface p-4" aria-label="Vista previa">
            {total === 0 ? (
              <p className="py-10 text-center text-muted">Aquí verás cómo quedan.</p>
            ) : (
              <div className="w-max bg-white shadow-sm">
                <LabelSheets items={items.slice(0, perPage(sz))} size={sz} business={settings.data?.business_name ?? ""} pages={1} />
              </div>
            )}
          </div>
          <p className="text-sm text-muted tnum" role="status">
            {total} {total === 1 ? "etiqueta" : "etiquetas"}{sz !== "50x25" && total > 0 ? ` · ${pages} ${pages === 1 ? "hoja" : "hojas"}` : ""}
          </p>
          <Button size="lg" disabled={total === 0} onClick={print}>
            <Printer className="size-5" aria-hidden /> Imprimir {total} {total === 1 ? "etiqueta" : "etiquetas"}
          </Button>
          <p className="text-sm text-muted">En la impresora térmica elige el papel de 50 × 25 mm y márgenes en “Ninguno”. En hoja carta usa escala 100 %.</p>
        </div>
      </div>
    </section>
  );
}
