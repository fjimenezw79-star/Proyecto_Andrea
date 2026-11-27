import * as Dialog from "@radix-ui/react-dialog";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { validatePayments, type Payment } from "../lib/cart";
import { formatMoney, parsePesos } from "../lib/money";
import { Button } from "../ui/Button";

type Mode = "cash" | "card" | "transfer" | "mixed";
const MODES: { id: Mode; label: string }[] = [
  { id: "cash", label: "Efectivo" },
  { id: "card", label: "Tarjeta" },
  { id: "transfer", label: "Transferencia" },
  { id: "mixed", label: "Mixto" },
];
const METHOD_LABEL = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia" } as const;

export type SaleResult = { folio: number; total_cents: number; change_cents: number };

type MixedRow = { method: Payment["method"]; amount: string; received: string };

export function PaymentSheet({
  open, total, onClose, onConfirm, onNewSale,
}: {
  open: boolean;
  total: number;
  onClose: () => void;
  onConfirm: (payments: Payment[]) => Promise<SaleResult>;
  onNewSale: () => void;
}) {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<Mode>("cash");
  const [received, setReceived] = useState("");
  const [rows, setRows] = useState<MixedRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<SaleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);

  useEffect(() => {
    if (open) {
      setMode(total === 0 ? "card" : "cash");
      setReceived("");
      setRows([{ method: "card", amount: "", received: "" }, { method: "cash", amount: "", received: "" }]);
      setDone(null);
      setError(null);
      sending.current = false;
    }
  }, [open, total]);

  const payments: Payment[] | null = (() => {
    if (total === 0) return [];
    if (mode === "card" || mode === "transfer") return [{ method: mode, amountCents: total }];
    if (mode === "cash") {
      const r = received.trim() ? parsePesos(received) : total;
      return r === null ? null : [{ method: "cash", amountCents: total, receivedCents: r }];
    }
    const out: Payment[] = [];
    for (const row of rows) {
      const a = parsePesos(row.amount);
      if (a === null) return null;
      const rc = row.method === "cash" && row.received.trim() ? parsePesos(row.received) : a;
      if (rc === null) return null;
      out.push({ method: row.method, amountCents: a, ...(row.method === "cash" ? { receivedCents: rc } : {}) });
    }
    return out;
  })();
  const check = payments ? validatePayments(total, payments) : { ok: false as const, message: "Escribe cantidades válidas." };
  const mixedSum = rows.reduce((s, r) => s + (parsePesos(r.amount) ?? 0), 0);

  async function confirm() {
    if (!payments || !check.ok || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      setDone(await onConfirm(payments));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar la venta.");
      sending.current = false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && !busy && (done ? onNewSale() : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 data-[state=open]:animate-[fade_.2s_ease-out]" />
        <Dialog.Content
          aria-label="Cobrar"
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-paper px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-5 shadow-2xl md:inset-auto md:left-1/2 md:top-1/2 md:w-[min(560px,calc(100vw-48px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:px-8 md:pb-8"
        >
          <Dialog.Title className="sr-only">Cobrar</Dialog.Title>
          {done ? (
            <motion.div initial={reduce ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="grid justify-items-center gap-3 py-6 text-center">
              <motion.span initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 320, damping: 18 }}>
                <CheckCircle2 className="size-16 text-ok" aria-hidden />
              </motion.span>
              <h2 className="font-serif text-5xl">Venta #{done.folio}</h2>
              <p className="text-muted">Total {formatMoney(done.total_cents)}</p>
              {done.change_cents > 0 && (
                <p className="mt-2 rounded-3xl bg-surface px-8 py-4">
                  <span className="block text-sm text-muted">Cambio</span>
                  <span className="tnum font-serif text-6xl">{formatMoney(done.change_cents)}</span>
                </p>
              )}
              <Button size="lg" className="mt-4 w-full" onClick={onNewSale} autoFocus>
                Nueva venta
              </Button>
            </motion.div>
          ) : (
            <div className="grid gap-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted">Total a cobrar</p>
                  <p className="tnum font-serif text-6xl leading-none">{formatMoney(total)}</p>
                </div>
                <Dialog.Close className="grid size-11 place-items-center rounded-full bg-surface" aria-label="Cerrar">
                  <X className="size-5" aria-hidden />
                </Dialog.Close>
              </div>
              {total > 0 && (
                <div role="tablist" aria-label="Forma de pago" className="grid grid-cols-4 gap-1 rounded-full bg-surface p-1">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      role="tab"
                      aria-selected={mode === m.id}
                      onClick={() => setMode(m.id)}
                      className={`relative min-h-11 rounded-full text-sm font-semibold ${mode === m.id ? "text-paper" : "text-ink"}`}
                    >
                      {mode === m.id && <motion.span layoutId="pay-tab" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                      <span className="relative">{m.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {mode === "cash" && total > 0 && (
                <div className="grid gap-3">
                  <label htmlFor="pay-received" className="text-sm font-semibold">Recibido</label>
                  <input id="pay-received" inputMode="decimal" autoFocus value={received} onChange={(e) => setReceived(e.target.value)} placeholder={(total / 100).toFixed(2)} aria-invalid={!check.ok && received.trim() ? true : undefined} className={`min-h-14 rounded-2xl border bg-paper px-4 text-2xl tnum ${!check.ok && received.trim() ? "border-danger" : "border-line"}`} />
                  <div className="flex flex-wrap gap-2">
                    {[total, 20000, 50000, 100000].filter((v, i, a) => v >= total && a.indexOf(v) === i).map((v) => (
                      <button key={v} className="rounded-full border border-line px-4 py-2 font-semibold tnum hover:bg-surface" onClick={() => setReceived((v / 100).toFixed(2))}>
                        {v === total ? "Exacto" : formatMoney(v)}
                      </button>
                    ))}
                  </div>
                  {check.ok && (
                    <p className="flex items-baseline justify-between rounded-2xl bg-surface px-4 py-3">
                      <span className="text-muted">Cambio</span>
                      <span className="tnum font-serif text-4xl">{formatMoney(check.changeCents)}</span>
                    </p>
                  )}
                </div>
              )}
              {(mode === "card" || mode === "transfer") && (
                <p className="rounded-2xl bg-surface px-4 py-3 text-muted">
                  {mode === "card" ? "Cobra con la terminal y confirma cuando salga aprobado." : "Confirma cuando veas la transferencia en la cuenta."}
                </p>
              )}
              {mode === "mixed" && (
                <div className="grid gap-3">
                  {rows.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                      <label className="grid gap-1 text-sm font-semibold">
                        Forma
                        <select value={r.method} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, method: e.target.value as Payment["method"] } : x)))} className="min-h-11 rounded-xl border border-line bg-paper px-3">
                          {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </label>
                      <label className="grid gap-1 text-sm font-semibold">
                        Monto
                        <input inputMode="decimal" value={r.amount} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} className="min-h-11 rounded-xl border border-line bg-paper px-3 tnum" />
                      </label>
                      <button className="grid size-11 place-items-center rounded-full hover:bg-surface" aria-label="Quitar forma de pago" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  ))}
                  <button className="inline-flex items-center gap-2 justify-self-start text-sm font-semibold underline" onClick={() => setRows((rs) => [...rs, { method: "cash", amount: "", received: "" }])}>
                    <Plus className="size-4" aria-hidden /> Agregar forma de pago
                  </button>
                  <p className="text-sm text-muted tnum">Faltan {formatMoney(Math.max(0, total - mixedSum))}</p>
                </div>
              )}
              {!check.ok && (mode === "mixed" || received.trim()) && <p className="text-sm font-semibold text-danger">{check.message}</p>}
              {error && <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">{error}</p>}
              <Button size="lg" variant="wine" disabled={!check.ok || busy} onClick={confirm}>
                {busy ? "Registrando…" : "Confirmar cobro"}
              </Button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
