import { useId } from "react";
import type { Method } from "../lib/cart";
import { formatMoney, parsePesos } from "../lib/money";
import { METHOD_LABEL } from "../lib/opTypes";

export type PayValue = { method: Method; amount: string; received: string };

/** Un pago: forma, monto y (en efectivo) lo recibido con el cambio en vivo. */
export function PayFields({ value, onChange, amountLabel = "Monto", creditCents = 0, error }: { value: PayValue; onChange: (v: PayValue) => void; amountLabel?: string; creditCents?: number; error?: string | null }) {
  const id = useId();
  const amount = parsePesos(value.amount);
  const received = value.received.trim() ? parsePesos(value.received) : amount;
  const methods = (["cash", "card", "transfer", ...(creditCents > 0 ? ["credit"] : [])] as Method[]);
  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label="Forma de pago" className="flex flex-wrap gap-2">
        {methods.map((m) => (
          <label key={m} className={`cursor-pointer rounded-full border px-4 py-2 font-semibold ${value.method === m ? "border-ink bg-ink text-paper" : "border-line hover:bg-surface"}`}>
            <input type="radio" name={`${id}-m`} className="sr-only" checked={value.method === m} onChange={() => onChange({ ...value, method: m })} />
            {METHOD_LABEL[m]}{m === "credit" ? ` (${formatMoney(creditCents)})` : ""}
          </label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold">
          {amountLabel}
          <input inputMode="decimal" value={value.amount} onChange={(e) => onChange({ ...value, amount: e.target.value })} aria-invalid={error || (value.amount && amount === null) ? true : undefined} className={`tnum min-h-12 rounded-xl border bg-paper px-3.5 text-lg font-normal ${error || (value.amount && amount === null) ? "border-danger" : "border-line"}`} />
        </label>
        {value.method === "cash" && (
          <label className="grid gap-1.5 text-sm font-semibold">
            Recibido
            <input inputMode="decimal" value={value.received} onChange={(e) => onChange({ ...value, received: e.target.value })} placeholder={amount !== null ? (amount / 100).toFixed(2) : ""} className="tnum min-h-12 rounded-xl border border-line bg-paper px-3.5 text-lg font-normal" />
          </label>
        )}
      </div>
      {value.method === "cash" && amount !== null && received !== null && received >= amount && received > amount && (
        <p className="flex justify-between rounded-xl bg-surface px-4 py-2"><span className="text-muted">Cambio</span><span className="tnum font-serif text-2xl">{formatMoney(received - amount)}</span></p>
      )}
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}

export function payToApi(v: PayValue) {
  const amount = parsePesos(v.amount);
  if (amount === null || amount <= 0) return null;
  const received = v.method === "cash" ? (v.received.trim() ? parsePesos(v.received) : amount) : undefined;
  if (v.method === "cash" && (received === null || received! < amount)) return null;
  return { method: v.method, amount_cents: amount, ...(v.method === "cash" ? { received_cents: received } : {}) };
}
