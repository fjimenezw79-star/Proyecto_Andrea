import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { api, ApiError } from "../lib/api";
import { compressImage } from "../lib/images";
import { formatMoney, parsePesos } from "../lib/money";
import type { Category, Product } from "../lib/types";
import { Button } from "../ui/Button";
import { Field } from "../ui/Input";
import { useToast } from "../ui/Toast";
import { CameraCapture } from "./CameraCapture";

const STEPS = ["Datos", "Precio", "Fotos", "Revisar"];
type Opt = { value: string; price: string; cost: string; barcode: string };

function flatten(cats: Category[], depth = 0): { id: number; name: string; depth: number }[] {
  return cats.flatMap((c) => [{ id: c.id, name: c.name, depth }, ...flatten(c.children, depth + 1)]);
}

export function NewProductWizard() {
  const toast = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [barcode, setBarcode] = useState("");
  const [hasVariants, setHasVariants] = useState(false);
  const [attr, setAttr] = useState("");
  const [opts, setOpts] = useState<Opt[]>([{ value: "", price: "", cost: "", barcode: "" }]);
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api<{ categories: Category[] }>("/api/categories") });
  const flat = flatten(categories.data?.categories ?? []);
  const urls = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  function validate(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!name.trim()) e.name = "Escribe el nombre del producto.";
      if (!categoryId) e.category = "Elige una categoría.";
    }
    if (s === 1) {
      if (!hasVariants) {
        if (parsePesos(price) === null) e.price = "Escribe el precio, por ejemplo 350 o 350.50.";
        if (cost.trim() && parsePesos(cost) === null) e.cost = "Escribe un costo válido.";
      } else {
        if (!attr.trim()) e.attr = "Escribe qué cambia: Color, Talla, Capacidad…";
        opts.forEach((o, i) => {
          if (!o.value.trim()) e[`opt${i}`] = "Escribe la opción.";
          if (parsePesos(o.price) === null) e[`price${i}`] = "Escribe el precio.";
          if (o.cost.trim() && parsePesos(o.cost) === null) e[`cost${i}`] = "Escribe un costo válido.";
        });
      }
    }
    return e;
  }

  function next() {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => s + 1);
  }

  async function addPhotos(files: Blob[]) {
    const small = await Promise.all(files.map((f) => compressImage(f)));
    setPhotos((ps) => [...ps, ...small].slice(0, 8));
  }

  async function save() {
    setBusy(true);
    const data: Record<string, unknown> = { name: name.trim(), description: description.trim(), category_id: Number(categoryId) };
    if (hasVariants) {
      data.variants = opts.map((o) => ({ attrs: { [attr.trim()]: o.value.trim() }, price_cents: parsePesos(o.price), cost_cents: o.cost.trim() ? parsePesos(o.cost) : 0, barcode: o.barcode.trim() || null }));
    } else {
      data.price_cents = parsePesos(price);
      data.cost_cents = cost.trim() ? parsePesos(cost) : 0;
      if (barcode.trim()) data.barcode = barcode.trim();
    }
    const fd = new FormData();
    fd.append("data", JSON.stringify(data));
    photos.forEach((p, i) => fd.append("photos", p, `foto-${i + 1}.${p.type === "image/webp" ? "webp" : "jpg"}`));
    try {
      const d = await api<{ product: Product }>("/api/products", { method: "POST", form: fd });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast("Producto creado. Ya aparece en el punto de venta.", "ok");
      navigate(`/inventario/${d.product.id}`);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      toast(err?.message ?? "No se pudo guardar el producto.", "error");
      if (err?.field === "barcode") setStep(1);
      if (err?.field === "photos") setStep(2);
    } finally {
      setBusy(false);
    }
  }

  const priceLabel = hasVariants
    ? opts.map((o) => parsePesos(o.price) ?? 0).reduce((a, b) => (a === b ? a : Math.min(a, b)))
    : parsePesos(price) ?? 0;

  return (
    <section className="mx-auto max-w-3xl px-4 pb-16 pt-6 md:px-8">
      <h1 className="font-serif text-5xl leading-none md:text-6xl">Nuevo producto</h1>
      <ol className="mt-6 grid grid-cols-4 gap-2" aria-label="Pasos">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className="grid gap-2">
            <span className="h-1.5 overflow-hidden rounded-full bg-line">
              <motion.span className="block h-full bg-ink" initial={false} animate={{ width: i <= step ? "100%" : "0%" }} transition={{ duration: reduce ? 0 : 0.4, ease: [0.2, 0.8, 0.2, 1] }} />
            </span>
            <span className={`text-sm font-semibold ${i === step ? "text-ink" : "text-muted"}`}>{i + 1}. {s}</span>
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={reduce ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? undefined : { opacity: 0, x: -24 }} transition={{ duration: 0.28 }} className="mt-8 grid gap-5">
          {step === 0 && (
            <>
              <Field label="Nombre del producto" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoFocus maxLength={120} />
              <div className="grid gap-1.5">
                <label htmlFor="np-cat" className="text-sm font-semibold">Categoría</label>
                <select id="np-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-invalid={errors.category ? true : undefined} className={`min-h-11 rounded-xl border bg-paper px-3 ${errors.category ? "border-danger" : "border-line"}`}>
                  <option value="">Elige…</option>
                  {flat.map((c) => (
                    <option key={c.id} value={c.id}>{c.depth ? `${"· ".repeat(c.depth)}${c.name}` : c.name}</option>
                  ))}
                </select>
                {errors.category && <p className="text-sm text-danger">{errors.category}</p>}
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="np-desc" className="text-sm font-semibold">Descripción (opcional)</label>
                <textarea id="np-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="rounded-xl border border-line bg-paper px-3.5 py-2.5" placeholder="Medidas, material, para qué edad…" />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <label className="flex items-center gap-3 font-semibold">
                <input type="checkbox" checked={hasVariants} onChange={(e) => setHasVariants(e.target.checked)} className="size-5 accent-[var(--ink)]" />
                Tiene variantes
                <span className="font-normal text-muted">(colores, tallas, capacidades…)</span>
              </label>
              {!hasVariants ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Precio de venta" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} error={errors.price} placeholder="350.00" />
                  <Field label="Costo" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} error={errors.cost} hint="Opcional. Solo lo ve el administrador." />
                  <Field label="Código de fábrica (opcional)" value={barcode} onChange={(e) => setBarcode(e.target.value)} className="sm:col-span-2" hint="Si la etiqueta trae código de barras, escanéalo aquí. Si no, el sistema le da uno MA." />
                </div>
              ) : (
                <div className="grid gap-4">
                  <Field label="Tipo de variante" value={attr} onChange={(e) => setAttr(e.target.value)} error={errors.attr} placeholder="Color" />
                  <AnimatePresence initial={false}>
                    {opts.map((o, i) => (
                      <motion.fieldset key={i} layout={!reduce} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid gap-3 rounded-2xl border border-line p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                        <legend className="sr-only">Opción {i + 1}</legend>
                        <Field label={`Opción ${i + 1}`} value={o.value} onChange={(e) => setOpts((xs) => xs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} error={errors[`opt${i}`]} />
                        <Field label={`Precio de la opción ${i + 1}`} inputMode="decimal" value={o.price} onChange={(e) => setOpts((xs) => xs.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} error={errors[`price${i}`]} />
                        <Field label={`Costo de la opción ${i + 1}`} inputMode="decimal" value={o.cost} onChange={(e) => setOpts((xs) => xs.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} error={errors[`cost${i}`]} />
                        <button type="button" disabled={opts.length === 1} onClick={() => setOpts((xs) => xs.filter((_, j) => j !== i))} className="grid size-11 place-items-center rounded-full hover:bg-surface disabled:opacity-30" aria-label={`Quitar opción ${i + 1}`}>
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </motion.fieldset>
                    ))}
                  </AnimatePresence>
                  <button type="button" onClick={() => setOpts((xs) => [...xs, { value: "", price: xs[xs.length - 1]?.price ?? "", cost: xs[xs.length - 1]?.cost ?? "", barcode: "" }])} className="inline-flex items-center gap-2 justify-self-start font-semibold underline">
                    <Plus className="size-4" aria-hidden /> Agregar opción
                  </button>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <CameraCapture count={photos.length} onPhotos={addPhotos} />
              {photos.length > 0 ? (
                <ul className="flex flex-wrap gap-3" aria-label="Fotos del producto">
                  {urls.map((u, i) => (
                    <motion.li key={u} initial={reduce ? false : { scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative">
                      <img src={u} alt={`Foto ${i + 1}`} className="size-24 rounded-2xl bg-surface object-cover" />
                      <button type="button" onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))} className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-ink text-paper" aria-label={`Quitar foto ${i + 1}`}>
                        <X className="size-4" aria-hidden />
                      </button>
                    </motion.li>
                  ))}
                </ul>
              ) : (
                <p className="font-semibold text-wine">Agrega al menos una foto.</p>
              )}
            </>
          )}

          {step === 3 && (
            <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
              <img src={urls[0]} alt="" className="aspect-square w-full rounded-3xl bg-surface object-cover" />
              <dl className="grid content-start gap-3">
                <div><dt className="text-sm text-muted">Nombre</dt><dd className="font-serif text-3xl leading-tight">{name}</dd></div>
                <div><dt className="text-sm text-muted">Categoría</dt><dd>{flat.find((c) => String(c.id) === categoryId)?.name}</dd></div>
                <div>
                  <dt className="text-sm text-muted">{hasVariants ? `${opts.length} variantes de ${attr}` : "Precio"}</dt>
                  <dd className="tnum text-2xl font-bold">{hasVariants ? opts.map((o) => `${o.value} ${formatMoney(parsePesos(o.price) ?? 0)}`).join(" · ") : formatMoney(priceLabel)}</dd>
                </div>
                <div><dt className="text-sm text-muted">Fotos</dt><dd>{photos.length}</dd></div>
                <p className="text-sm text-muted">Al guardar se le asigna su código MA y aparece en el punto de venta. Las existencias se cargan con una Entrada desde su ficha.</p>
              </dl>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-10 flex justify-between gap-3">
        <Button type="button" variant="quiet" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>
          Atrás
        </Button>
        {step < 3 ? (
          <Button type="button" onClick={next} disabled={step === 2 && photos.length === 0}>
            Siguiente
          </Button>
        ) : (
          <Button type="button" variant="wine" size="lg" onClick={save} disabled={busy}>
            {busy ? "Guardando…" : "Guardar producto"}
          </Button>
        )}
      </div>
    </section>
  );
}
