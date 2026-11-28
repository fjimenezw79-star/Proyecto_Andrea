import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "../auth/AuthProvider";
import { api, ApiError } from "../lib/api";
import { formatMoney } from "../lib/money";
import { dateMx, dateTimeMx, METHOD_LABEL, type Client, type Layaway } from "../lib/opTypes";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Dialog";
import { Field } from "../ui/Input";
import { PayFields, payToApi, type PayValue } from "../ui/PayFields";
import { useToast } from "../ui/Toast";

const blank = (amount = ""): PayValue => ({ method: "cash", amount, received: "" });

export function LayawayDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const q = useQuery({ queryKey: ["layaway", id], queryFn: () => api<{ layaway: Layaway }>(`/api/layaways/${id}`) });
  const l = q.data?.layaway;
  const client = useQuery({ queryKey: ["client", l?.client_id], queryFn: () => api<{ client: Client }>(`/api/clients/${l!.client_id}`), enabled: !!l });
  const credit = client.data?.client.credit_cents ?? 0;
  const [dlg, setDlg] = useState<"pay" | "settle" | "cancel" | null>(null);
  const [pay, setPay] = useState<PayValue>(blank());
  const [opId, setOpId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"credit" | "refund">("credit");
  const [refundMethod, setRefundMethod] = useState<"cash" | "card" | "transfer">("cash");
  useEffect(() => {
    if (dlg) { setError(null); setOpId(crypto.randomUUID()); setPay(blank(dlg === "settle" && l ? (l.balance_cents / 100).toFixed(2) : "")); setReason(""); }
  }, [dlg]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => { qc.invalidateQueries({ queryKey: ["layaway", id] }); qc.invalidateQueries({ queryKey: ["layaways"] }); qc.invalidateQueries({ queryKey: ["client"] }); qc.invalidateQueries({ queryKey: ["products"] }); };

  async function run(path: string, json: unknown, ok: string) {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: "POST", json });
      toast(ok, "ok");
      setDlg(null);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) return <p className="p-8 text-muted">Cargando…</p>;
  if (!l) return <p className="p-8 text-muted">No encontramos ese apartado.</p>;
  const pct = l.total_cents ? (l.paid_cents / l.total_cents) * 100 : 0;
  const status = l.status === "settled" ? "Liquidado" : l.status === "cancelled" ? "Cancelado" : l.overdue ? "Vencido" : "Pendiente";

  return (
    <section className="mx-auto max-w-4xl px-4 pb-12 pt-6 md:px-8">
      <Link to="/apartados" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="size-4" aria-hidden /> Apartados</Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-5xl leading-none md:text-6xl">Apartado #{l.folio}</h1>
          <p className="mt-2 text-muted">{l.client_name}{l.client_phone ? ` · ${l.client_phone}` : ""} · vence el {dateMx(l.deadline)}</p>
        </div>
        <span className={`rounded-full px-4 py-1.5 font-semibold ${l.overdue || l.status === "cancelled" ? "bg-wine text-wine-ink" : l.status === "settled" ? "bg-ink text-paper" : "bg-surface"}`}>{status}</span>
      </div>

      <div className="mt-8 grid gap-4 rounded-3xl bg-surface p-6 sm:grid-cols-3">
        <div><p className="text-sm text-muted">Total</p><p className="tnum font-serif text-4xl">{formatMoney(l.total_cents)}</p></div>
        <div><p className="text-sm text-muted">Pagado</p><p className="tnum font-serif text-4xl">{formatMoney(l.paid_cents)}</p></div>
        <div><p className="text-sm text-muted">Saldo</p><p data-testid="balance" className="tnum font-serif text-4xl text-wine">{formatMoney(l.balance_cents)}</p></div>
        <div className="h-2.5 overflow-hidden rounded-full bg-line sm:col-span-3" aria-hidden>
          <motion.div className="h-full bg-ink" initial={reduce ? false : { width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }} />
        </div>
      </div>

      {l.status === "pending" && (
        <div className="mt-6 flex flex-wrap gap-2">
          {l.balance_cents > 0 && <Button onClick={() => setDlg("pay")}>Registrar abono</Button>}
          <Button variant="wine" onClick={() => setDlg("settle")}>Liquidar</Button>
          {isAdmin && <Button variant="ghost" onClick={() => setDlg("cancel")}>Cancelar apartado</Button>}
        </div>
      )}
      {l.status === "cancelled" && <p className="mt-6 rounded-2xl bg-surface px-5 py-3">Cancelado: {l.cancel_reason}. {l.refund_mode === "credit" ? "El dinero quedó como saldo a favor del cliente." : `Se reembolsó en ${METHOD_LABEL[(l.refund_method ?? "cash") as keyof typeof METHOD_LABEL].toLowerCase()}.`}</p>}

      <h2 className="mb-3 mt-10 font-serif text-3xl">Productos</h2>
      <ul className="grid gap-2">
        {l.items.map((it, i) => (
          <li key={i} className="flex items-center gap-3">
            {it.photo && <img src={it.photo} alt="" className="size-12 rounded-xl bg-surface object-cover" />}
            <span className="flex-1">{it.qty} × {it.name} <span className="text-muted">({it.sku})</span></span>
            <span className="tnum">{formatMoney(it.unit_price_cents * it.qty - it.discount_cents)}</span>
          </li>
        ))}
      </ul>

      <h2 className="mb-3 mt-10 font-serif text-3xl">Abonos</h2>
      <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
        {l.payments.map((p, i) => (
          <li key={p.id} className="flex justify-between gap-3 bg-paper px-4 py-3">
            <span><span className="font-semibold">{i === 0 ? "Anticipo" : `Abono ${i}`}</span> <span className="text-muted">· {METHOD_LABEL[p.method]} · {dateTimeMx(p.created_at)} · {p.user_name}</span></span>
            <span className="tnum font-bold">{formatMoney(p.amount_cents)}</span>
          </li>
        ))}
      </ul>

      <Modal open={dlg === "pay"} onOpenChange={(o) => !o && setDlg(null)} title="Registrar abono">
        <div className="grid gap-4">
          <p className="text-muted">Saldo {formatMoney(l.balance_cents)}</p>
          <PayFields value={pay} onChange={setPay} creditCents={credit} error={error} />
          <Button size="lg" disabled={busy} onClick={() => { const p = payToApi(pay); if (!p) return setError("Escribe el monto del abono."); run(`/api/layaways/${l.id}/payments`, { id: opId, payments: [p] }, "Abono registrado."); }}>
            {busy ? "Guardando…" : "Guardar abono"}
          </Button>
        </div>
      </Modal>

      <Modal open={dlg === "settle"} onOpenChange={(o) => !o && setDlg(null)} title="Liquidar">
        <div className="grid gap-4">
          {l.balance_cents > 0 ? <PayFields value={pay} onChange={setPay} amountLabel="Pago final" creditCents={credit} error={error} /> : <p>Ya está pagado completo. Al liquidar se registra la venta y se entregan los productos.</p>}
          {l.balance_cents === 0 && error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
          <Button size="lg" variant="wine" disabled={busy} onClick={() => { const p = l.balance_cents > 0 ? payToApi(pay) : null; if (l.balance_cents > 0 && !p) return setError("Escribe el pago final."); run(`/api/layaways/${l.id}/settle`, { payment_id: opId, payments: p ? [p] : [] }, "Apartado liquidado. Entrega los productos."); }}>
            {busy ? "Guardando…" : "Confirmar y liquidar"}
          </Button>
        </div>
      </Modal>

      <Modal open={dlg === "cancel"} onOpenChange={(o) => !o && setDlg(null)} title="Cancelar apartado">
        <div className="grid gap-4">
          <Field label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold">Qué pasa con los {formatMoney(l.paid_cents)} pagados</legend>
            <label className="flex items-center gap-3"><input type="radio" name="mode" checked={mode === "credit"} onChange={() => setMode("credit")} className="size-5" /> Dejar como saldo a favor</label>
            <label className="flex items-center gap-3"><input type="radio" name="mode" checked={mode === "refund"} onChange={() => setMode("refund")} className="size-5" /> Devolver el dinero</label>
          </fieldset>
          {mode === "refund" && (
            <label className="grid gap-1.5 text-sm font-semibold">
              Se devuelve en
              <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as typeof refundMethod)} className="min-h-11 rounded-xl border border-line bg-paper px-3 font-normal">
                <option value="cash">Efectivo (sale de la caja)</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option>
              </select>
            </label>
          )}
          {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
          <Button size="lg" variant="danger" disabled={busy} onClick={() => { if (!reason.trim()) return setError("Escribe el motivo de la cancelación."); run(`/api/layaways/${l.id}/cancel`, { reason, refund_mode: mode, refund_method: mode === "refund" ? refundMethod : undefined }, "Apartado cancelado. Las piezas regresaron al inventario."); }}>
            Confirmar cancelación
          </Button>
        </div>
      </Modal>
    </section>
  );
}
