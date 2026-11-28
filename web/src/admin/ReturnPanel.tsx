import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { newId } from "../lib/cart";
import { formatMoney } from "../lib/money";
import { Button } from "../ui/Button";
import { Field } from "../ui/Input";

type Item = { id: number; name: string; qty: number; returned_qty: number; unit_price_cents: number; discount_cents: number };

/** Lo pagado por un renglón, con el descuento general repartido igual que el servidor. */
export function lineValues(items: Item[], saleDiscount: number): Record<number, number> {
  const nets: Record<number, number> = Object.fromEntries(items.map((it) => [it.id, it.unit_price_cents * it.qty - it.discount_cents]));
  const general = saleDiscount - items.reduce((s, it) => s + it.discount_cents, 0);
  const base = Object.values(nets).reduce((a, b) => a + b, 0);
  if (general <= 0 || base <= 0) return nets;
  return Object.fromEntries(Object.entries(nets).map(([k, v]) => [k, v - Math.floor((general * v) / base)]));
}

export function ReturnPanel({ saleId, items, saleDiscount, hasClient, onDone }: { saleId: string; items: Item[]; saleDiscount: number; hasClient: boolean; onDone: () => void }) {
  const [qty, setQty] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "transfer" | "credit">("cash");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [opId] = useState(newId);
  const values = lineValues(items, saleDiscount);
  const chosen = items.map((it) => ({ it, n: Number(qty[it.id] || 0) })).filter((x) => x.n > 0);
  const invalid = items.some((it) => { const n = Number(qty[it.id] || 0); return !Number.isInteger(n) || n < 0 || n > it.qty - it.returned_qty; });
  const refund = chosen.reduce((s, { it, n }) => s + Math.floor((values[it.id] * n) / it.qty), 0);

  async function submit() {
    if (!chosen.length || invalid) return setError("Escribe cuántas piezas se devuelven.");
    if (!reason.trim()) return setError("Escribe el motivo de la devolución.");
    setBusy(true);
    setError(null);
    try {
      await api(`/api/sales/${saleId}/returns`, { method: "POST", json: { id: opId, items: chosen.map(({ it, n }) => ({ sale_item_id: it.id, qty: n })), refund_method: method, reason } });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo registrar la devolución.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 rounded-2xl border border-line p-4">
      {items.map((it) => {
        const left = it.qty - it.returned_qty;
        return (
          <div key={it.id} className="grid grid-cols-[1fr_96px] items-end gap-3">
            <p>{it.name}<span className="block text-sm text-muted">{left > 0 ? `Puede devolver hasta ${left}` : "Ya se devolvió todo"}</span></p>
            <label className="grid gap-1 text-sm font-semibold">
              <span className="sr-only">Piezas a devolver de {it.name}</span>
              <input aria-label={`Piezas a devolver de ${it.name}`} inputMode="numeric" disabled={left === 0} value={qty[it.id] ?? ""} onChange={(e) => setQty({ ...qty, [it.id]: e.target.value.replace(/\D/g, "") })} placeholder="0" className="tnum min-h-11 rounded-xl border border-line bg-paper px-3 text-center" />
            </label>
          </div>
        );
      })}
      <Field label="Motivo de la devolución" value={reason} onChange={(e) => setReason(e.target.value)} />
      <label className="grid gap-1.5 text-sm font-semibold">
        Se reembolsa en
        <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="min-h-11 rounded-xl border border-line bg-paper px-3 font-normal">
          <option value="cash">Efectivo (sale de la caja)</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option>
          {hasClient && <option value="credit">Saldo a favor del cliente</option>}
        </select>
      </label>
      <p className="tnum font-serif text-3xl">Reembolso {formatMoney(refund)}</p>
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
      <Button variant="danger" onClick={submit} disabled={busy}>{busy ? "Guardando…" : "Confirmar devolución"}</Button>
    </div>
  );
}
