import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { parsePesos } from "../lib/money";
import type { Variant } from "../lib/types";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Dialog";
import { Field } from "../ui/Input";
import { variantLabel } from "../pos/ProductGrid";

function VariantSelect({ variants, value, onChange }: { variants: Variant[]; value: number; onChange: (id: number) => void }) {
  if (variants.length <= 1) return null;
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      Variante
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-h-11 rounded-xl border border-line bg-paper px-3 text-base font-normal">
        {variants.map((v) => (
          <option key={v.id} value={v.id}>
            {v.sku} · {variantLabel(v.attrs) || "Única"} · {v.stock} piezas
          </option>
        ))}
      </select>
    </label>
  );
}

export function EntryDialog({ open, onOpenChange, variants, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; variants: Variant[]; onDone: () => void }) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? 0);
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setVariantId(variants[0]?.id ?? 0); setQty(""); setCost(""); setNote(""); setErrors({}); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(qty);
    const c = cost.trim() ? parsePesos(cost) : undefined;
    const errs: Record<string, string> = {};
    if (!Number.isInteger(n) || n <= 0) errs.qty = "Escribe cuántas piezas llegaron.";
    if (c === null) errs.cost = "Escribe un costo válido.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api("/api/inventory/entries", { method: "POST", json: { items: [{ variant_id: variantId, qty: n, ...(c !== undefined ? { cost_cents: c } : {}) }], note } });
      onDone();
      onOpenChange(false);
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : "No se pudo guardar." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Entrada de mercancía">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <VariantSelect variants={variants} value={variantId} onChange={setVariantId} />
        <Field label="Piezas que llegaron" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} error={errors.qty} autoFocus />
        <Field label="Costo por pieza (opcional)" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} error={errors.cost} hint="Actualiza el costo del producto." />
        <Field label="Nota" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Proveedor, factura…" />
        {errors.form && <p role="alert" className="text-sm font-semibold text-danger">{errors.form}</p>}
        <Button type="submit" size="lg" disabled={busy}>{busy ? "Guardando…" : "Guardar entrada"}</Button>
      </form>
    </Modal>
  );
}

export function AdjustDialog({ open, onOpenChange, variants, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; variants: Variant[]; onDone: () => void }) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? 0);
  const [stock, setStock] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setVariantId(variants[0]?.id ?? 0); setStock(""); setNote(""); setErrors({}); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(stock);
    const errs: Record<string, string> = {};
    if (stock.trim() === "" || !Number.isInteger(n) || n < 0) errs.stock = "Escribe cuántas piezas hay.";
    if (!note.trim()) errs.note = "Escribe el motivo del ajuste.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api("/api/inventory/adjustments", { method: "POST", json: { variant_id: variantId, new_stock: n, note } });
      onDone();
      onOpenChange(false);
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : "No se pudo guardar." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Ajustar existencias">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <VariantSelect variants={variants} value={variantId} onChange={setVariantId} />
        <Field label="Piezas que hay en la tienda" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} error={errors.stock} autoFocus />
        <Field label="Motivo" value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} placeholder="Conteo físico, pieza dañada…" />
        {errors.form && <p role="alert" className="text-sm font-semibold text-danger">{errors.form}</p>}
        <Button type="submit" size="lg" disabled={busy}>{busy ? "Guardando…" : "Guardar ajuste"}</Button>
      </form>
    </Modal>
  );
}
