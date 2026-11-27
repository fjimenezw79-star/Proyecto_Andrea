import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { api, ApiError } from "../lib/api";
import { formatMoney } from "../lib/money";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Dialog";
import { Field } from "../ui/Input";
import { useToast } from "../ui/Toast";

type Sale = {
  id: string; folio: number; status: "paid" | "cancelled"; user_name: string; client_name: string | null;
  subtotal_cents: number; discount_cents: number; total_cents: number; change_cents: number; created_at: string; cancel_reason: string | null;
  items: { sku: string; name: string; attrs: Record<string, string>; qty: number; unit_price_cents: number; discount_cents: number }[];
  payments: { method: "cash" | "card" | "transfer"; amount_cents: number; received_cents: number | null }[];
};
const METHOD = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia" } as const;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const time = (iso: string) => new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

export function SalesTodayPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const [date, setDate] = useState(today());
  const [open, setOpen] = useState<Sale | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonErr, setReasonErr] = useState<string | null>(null);
  const sales = useQuery({ queryKey: ["sales", date], queryFn: () => api<{ sales: Sale[] }>(`/api/sales?date=${date}`) });
  const list = sales.data?.sales ?? [];
  const paid = list.filter((s) => s.status === "paid");
  const byMethod = { cash: 0, card: 0, transfer: 0 };
  paid.forEach((s) => s.payments.forEach((p) => (byMethod[p.method] += p.amount_cents)));
  const total = paid.reduce((a, s) => a + s.total_cents, 0);

  async function cancel() {
    if (!open) return;
    if (!reason.trim()) return setReasonErr("Escribe el motivo de la cancelación.");
    try {
      await api(`/api/sales/${open.id}/cancel`, { method: "POST", json: { reason } });
      toast(`Venta #${open.folio} cancelada. Las piezas regresaron al inventario.`, "ok");
      setOpen(null);
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) {
      setReasonErr(e instanceof ApiError ? e.message : "No se pudo cancelar.");
    }
  }

  return (
    <section className="px-4 pb-12 pt-6 md:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-5xl leading-none md:text-6xl">{date === today() ? "Ventas de hoy" : "Ventas"}</h1>
        <label className="grid gap-1 text-sm font-semibold">
          Fecha
          <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} className="min-h-11 rounded-xl border border-line bg-paper px-3" />
        </label>
      </div>
      <dl className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4">
        {[["Total del día", total], ["Efectivo", byMethod.cash], ["Tarjeta", byMethod.card], ["Transferencia", byMethod.transfer]].map(([label, v], i) => (
          <div key={label as string} className="bg-paper px-5 py-4">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className={`tnum font-serif ${i === 0 ? "text-5xl" : "text-3xl"}`}>{formatMoney(v as number)}</dd>
          </div>
        ))}
      </dl>
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-muted">{sales.isLoading ? "Cargando…" : "Todavía no hay ventas este día."}</p>
      ) : (
        <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
          {list.map((s, i) => {
            const pieces = s.items.reduce((a, it) => a + it.qty, 0);
            const methods = [...new Set(s.payments.map((p) => METHOD[p.method]))].join(" + ") || "Sin cobro";
            return (
              <motion.li key={s.id} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 10) * 0.02 }} className="bg-paper">
                <button
                  onClick={() => { setOpen(s); setCancelling(false); setReason(""); setReasonErr(null); }}
                  aria-label={`Venta ${s.folio}, ${formatMoney(s.total_cents)}${s.status === "cancelled" ? ", Cancelada" : ""}`}
                  className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 text-left hover:bg-surface md:grid-cols-[80px_80px_1fr_160px_140px] ${s.status === "cancelled" ? "text-muted" : ""}`}
                >
                  <span className="tnum font-serif text-2xl">#{s.folio}</span>
                  <span className="tnum hidden text-muted md:block">{time(s.created_at)}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{s.items.map((it) => it.name).join(", ")}</span>
                    <span className="block truncate text-sm text-muted">{pieces} {pieces === 1 ? "pieza" : "piezas"} · {s.user_name}{s.client_name ? ` · ${s.client_name}` : ""}</span>
                  </span>
                  <span className="hidden text-sm md:block">{s.status === "cancelled" ? <span className="rounded-full bg-surface px-3 py-1 font-semibold">Cancelada</span> : methods}</span>
                  <span className={`tnum text-right font-bold ${s.status === "cancelled" ? "line-through" : ""}`}>
                    {formatMoney(s.total_cents)}
                    {s.status === "cancelled" && <span className="ml-2 no-underline md:hidden">Cancelada</span>}
                  </span>
                </button>
              </motion.li>
            );
          })}
        </ul>
      )}

      <Modal open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open ? `Venta #${open.folio}` : ""} wide>
        {open && (
          <div className="grid gap-5">
            <p className="text-muted">
              {new Date(open.created_at).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })} · {open.user_name}
              {open.client_name ? ` · ${open.client_name}` : ""}
            </p>
            {open.status === "cancelled" && <p className="rounded-xl bg-surface px-4 py-3 font-semibold">Cancelada: {open.cancel_reason}</p>}
            <ul className="grid gap-2">
              {open.items.map((it, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{it.qty} × {it.name} <span className="text-muted">({it.sku})</span></span>
                  <span className="tnum">{formatMoney(it.unit_price_cents * it.qty - it.discount_cents)}</span>
                </li>
              ))}
            </ul>
            <dl className="grid gap-1 border-t border-line pt-3">
              {open.discount_cents > 0 && <div className="flex justify-between"><dt className="text-muted">Descuento</dt><dd className="tnum">−{formatMoney(open.discount_cents)}</dd></div>}
              <div className="flex justify-between text-xl font-bold"><dt>Total</dt><dd className="tnum">{formatMoney(open.total_cents)}</dd></div>
              {open.payments.map((p, i) => (
                <div key={i} className="flex justify-between text-muted"><dt>{METHOD[p.method]}</dt><dd className="tnum">{formatMoney(p.amount_cents)}{p.method === "cash" && p.received_cents ? ` (recibido ${formatMoney(p.received_cents)})` : ""}</dd></div>
              ))}
            </dl>
            {isAdmin && open.status === "paid" && (
              cancelling ? (
                <div className="grid gap-3 rounded-2xl border border-danger/40 p-4">
                  <Field label="Motivo de la cancelación" value={reason} onChange={(e) => { setReason(e.target.value); setReasonErr(null); }} error={reasonErr} autoFocus />
                  <Button variant="danger" onClick={cancel}>Confirmar cancelación</Button>
                </div>
              ) : (
                <Button variant="ghost" onClick={() => setCancelling(true)}>Cancelar venta</Button>
              )
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
