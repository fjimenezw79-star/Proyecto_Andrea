import * as Switch from "@radix-ui/react-switch";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "../auth/AuthProvider";
import { api, ApiError } from "../lib/api";
import { compressImage } from "../lib/images";
import { centsToInput, formatMoney, parsePesos } from "../lib/money";
import type { Product, Variant } from "../lib/types";
import { variantLabel } from "../pos/ProductGrid";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";
import { AdjustDialog, EntryDialog } from "./StockDialogs";

type Movement = { id: number; variant_id: number; qty_delta: number; reason: string; note: string; created_at: string };
const REASON: Record<string, string> = { sale: "Venta", sale_cancel: "Venta cancelada", purchase: "Entrada", adjustment: "Ajuste", import: "Carga inicial" };

function MoneyCell({ label, cents, onSave }: { label: string; cents: number; onSave: (c: number) => Promise<void> }) {
  const [text, setText] = useState(centsToInput(cents));
  const [err, setErr] = useState(false);
  async function commit() {
    const c = parsePesos(text);
    if (c === null) return setErr(true);
    setErr(false);
    if (c !== cents) await onSave(c);
    setText(centsToInput(c));
  }
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={text}
      aria-invalid={err || undefined}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={`tnum min-h-10 w-28 rounded-lg border bg-paper px-2.5 text-right ${err ? "border-danger" : "border-line"}`}
    />
  );
}

export function ProductDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const fileRef = useRef<HTMLInputElement>(null);
  const [entry, setEntry] = useState(false);
  const [adjust, setAdjust] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const key = ["product", id];
  const product = useQuery({ queryKey: key, queryFn: () => api<{ product: Product }>(`/api/products/${id}`) });
  const p = product.data?.product;
  const moves = useQueries({
    queries: (p?.variants ?? []).map((v) => ({ queryKey: ["movements", v.id], queryFn: () => api<{ movements: Movement[] }>(`/api/inventory/movements?variant_id=${v.id}`) })),
  });
  const log = moves.flatMap((m) => m.data?.movements ?? []).sort((a, b) => b.id - a.id).slice(0, 40);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["movements"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast(ok, "ok");
      refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo guardar.", "error");
    }
  }

  if (product.isLoading) return <p className="p-8 text-muted">Cargando…</p>;
  if (!p) return <p className="p-8 text-muted">No encontramos ese producto.</p>;
  const photo = p.photos[Math.min(photoIdx, p.photos.length - 1)];
  const sku = (v: Variant) => v.sku;

  return (
    <section className="px-4 pb-12 pt-6 md:px-8">
      <Link to="/inventario" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Inventario
      </Link>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div>
          <div className="relative aspect-square overflow-hidden rounded-3xl bg-surface">
            <AnimatePresence mode="wait">
              {photo && <motion.img key={photo.id} src={photo.url} alt={p.name} initial={reduce ? false : { opacity: 0, scale: 1.03 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="absolute inset-0 size-full object-cover" />}
            </AnimatePresence>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Fotos">
            {p.photos.map((ph, i) => (
              <li key={ph.id} className="relative">
                <button onClick={() => setPhotoIdx(i)} className={`block size-16 overflow-hidden rounded-xl border-2 ${i === photoIdx ? "border-ink" : "border-transparent"}`} aria-label={`Ver foto ${i + 1}`}>
                  <img src={ph.thumb_url} alt="" className="size-full object-cover" />
                </button>
                {isAdmin && p.photos.length > 1 && (
                  <button onClick={() => run(() => api(`/api/products/${p.id}/photos/${ph.id}`, { method: "DELETE" }), "Foto eliminada.")} className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-ink text-paper" aria-label={`Quitar foto ${i + 1}`}>
                    <Trash2 className="size-3" aria-hidden />
                  </button>
                )}
              </li>
            ))}
            {isAdmin && (
              <li>
                <button onClick={() => fileRef.current?.click()} className="grid size-16 place-items-center rounded-xl border-2 border-dashed border-line text-muted hover:bg-surface" aria-label="Agregar foto">
                  <ImagePlus className="size-5" aria-hidden />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const fd = new FormData();
                    fd.append("photos", await compressImage(f), "foto.webp");
                    run(() => api(`/api/products/${p.id}/photos`, { method: "POST", form: fd }), "Foto agregada.");
                  }}
                />
              </li>
            )}
          </ul>
        </div>

        <div className="min-w-0">
          <p className="text-muted">{p.category}</p>
          <h1 className="font-serif text-5xl leading-[1.02] md:text-6xl">{p.name}</h1>
          {p.description && <p className="mt-3 max-w-prose text-muted">{p.description}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <p data-testid="stock-total" className={`tnum rounded-full px-4 py-2 font-semibold ${p.stock_total <= 2 ? "bg-wine text-wine-ink" : "bg-surface"}`}>
              {p.stock_total} {p.stock_total === 1 ? "pieza" : "piezas"}
            </p>
            {isAdmin && (
              <>
                <Button onClick={() => setEntry(true)}>Entrada</Button>
                <Button variant="ghost" onClick={() => setAdjust(true)}>Ajustar existencias</Button>
              </>
            )}
          </div>
          {isAdmin && (
            <label className="mt-5 flex items-center gap-3 font-semibold">
              <Switch.Root
                checked={p.online}
                onCheckedChange={(v) => run(() => api(`/api/products/${p.id}`, { method: "PATCH", json: { online: v } }), v ? "Se mostrará en la tienda en línea." : "Ya no aparece en la tienda en línea.")}
                className="relative h-7 w-12 rounded-full bg-line transition-colors data-[state=checked]:bg-ink"
              >
                <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-paper shadow transition-transform data-[state=checked]:translate-x-[22px]" />
              </Switch.Root>
              Mostrar en tienda en línea
            </label>
          )}

          <h2 className="mb-3 mt-10 font-serif text-3xl">Variantes</h2>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[560px] text-left">
              <thead className="bg-surface text-sm text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Código</th>
                  <th className="px-4 py-2.5 font-semibold">De fábrica</th>
                  <th className="px-4 py-2.5 font-semibold">Variante</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Precio</th>
                  {isAdmin && <th className="px-4 py-2.5 text-right font-semibold">Costo</th>}
                  <th className="px-4 py-2.5 text-right font-semibold">Piezas</th>
                </tr>
              </thead>
              <tbody>
                {p.variants.map((v) => (
                  <tr key={v.id} className="border-t border-line">
                    <td className="tnum px-4 py-2.5 font-semibold">{sku(v)}</td>
                    <td className="px-4 py-2.5">
                      {isAdmin ? (
                        <input
                          aria-label={`Código de fábrica de ${v.sku}`}
                          defaultValue={v.barcode ?? ""}
                          placeholder="Escanea o escribe"
                          onBlur={(e) => e.target.value !== (v.barcode ?? "") && run(() => api(`/api/variants/${v.id}`, { method: "PATCH", json: { barcode: e.target.value } }), "Código guardado.")}
                          className="min-h-10 w-40 rounded-lg border border-line bg-paper px-2.5"
                        />
                      ) : (v.barcode ?? "—")}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{variantLabel(v.attrs) || "Única"}</td>
                    <td className="px-4 py-2.5 text-right">
                      {isAdmin ? <MoneyCell key={`p${v.price_cents}`} label={`Precio de ${v.sku}`} cents={v.price_cents} onSave={(c) => run(() => api(`/api/variants/${v.id}`, { method: "PATCH", json: { price_cents: c } }), "Precio actualizado.")} /> : <span className="tnum font-bold">{formatMoney(v.price_cents)}</span>}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2.5 text-right">
                        <MoneyCell key={`c${v.cost_cents}`} label={`Costo de ${v.sku}`} cents={v.cost_cents ?? 0} onSave={(c) => run(() => api(`/api/variants/${v.id}`, { method: "PATCH", json: { cost_cents: c } }), "Costo actualizado.")} />
                      </td>
                    )}
                    <td className="tnum px-4 py-2.5 text-right font-semibold">{v.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mb-3 mt-10 font-serif text-3xl">Bitácora</h2>
          {log.length === 0 ? (
            <p className="text-muted">Sin movimientos todavía.</p>
          ) : (
            <ul aria-label="Bitácora" className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
              {log.map((m) => (
                <li key={m.id} className="grid grid-cols-[1fr_auto] gap-2 bg-paper px-4 py-2.5">
                  <span>
                    <span className="font-semibold">{REASON[m.reason] ?? m.reason}</span>
                    {p.variants.length > 1 && <span className="text-muted"> · {p.variants.find((v) => v.id === m.variant_id)?.sku}</span>}
                    {m.note && <span className="block text-sm text-muted">{m.note}</span>}
                  </span>
                  <span className="text-right">
                    <span className={`tnum block font-bold ${m.qty_delta > 0 ? "text-ok" : "text-danger"}`}>{m.qty_delta > 0 ? `+${m.qty_delta}` : `−${-m.qty_delta}`}</span>
                    <span className="block text-xs text-muted">{new Date(m.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {isAdmin && (
        <>
          <EntryDialog open={entry} onOpenChange={setEntry} variants={p.variants} onDone={() => { toast("Entrada registrada.", "ok"); refresh(); }} />
          <AdjustDialog open={adjust} onOpenChange={setAdjust} variants={p.variants} onDone={() => { toast("Ajuste registrado.", "ok"); refresh(); }} />
        </>
      )}
    </section>
  );
}
