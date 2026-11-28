import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { api, ApiError } from "../lib/api";
import { formatMoney, parsePesos } from "../lib/money";
import { dateTimeMx } from "../lib/opTypes";
import { Button } from "../ui/Button";
import { CountUp } from "../ui/CountUp";
import { Modal } from "../ui/Dialog";
import { Field } from "../ui/Input";
import { useToast } from "../ui/Toast";

type Summary = { opening_cents: number; cash_sales_cents: number; layaway_cash_cents: number; refunds_cash_cents: number; expenses_cash_cents: number; expected_cents: number; card_cents: number; transfer_cents: number; credit_cents: number; movements: { at: string; kind: string; ref: string; amount_cents: number }[] };
type Session = { id: number; opened_by: string; opened_at: string; opening_cents: number; auto: boolean; closed_by: string | null; closed_at: string | null; counted_cents: number | null; expected_cents: number | null; difference_cents: number | null; notes: string };

export function CashPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const cur = useQuery({ queryKey: ["cash"], queryFn: () => api<{ session: Session | null; summary: Summary | null }>("/api/cash/current"), refetchInterval: 20_000 });
  const hist = useQuery({ queryKey: ["cash-history"], queryFn: () => api<{ sessions: Session[] }>("/api/cash/sessions"), enabled: isAdmin });
  const [opening, setOpening] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const s = cur.data?.summary;
  const session = cur.data?.session;
  const countedCents = counted.trim() ? parsePesos(counted) : null;
  const diff = countedCents !== null && s ? countedCents - s.expected_cents : null;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["cash"] }); qc.invalidateQueries({ queryKey: ["cash-history"] }); };

  async function open(e: FormEvent) {
    e.preventDefault();
    const c = opening.trim() ? parsePesos(opening) : 0;
    if (c === null) return setErr("Escribe el fondo inicial, por ejemplo 500.");
    if (busy) return;
    setBusy(true);
    try {
      await api("/api/cash/open", { method: "POST", json: { opening_cents: c } });
      toast("Caja abierta.", "ok");
      setOpening("");
      setErr(null);
      refresh();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "No se pudo abrir la caja.");
    } finally {
      setBusy(false);
    }
  }
  async function close() {
    if (countedCents === null) return setErr("Escribe el efectivo que contaste.");
    setBusy(true);
    try {
      await api("/api/cash/close", { method: "POST", json: { counted_cents: countedCents, notes } });
      toast("Corte registrado.", "ok");
      setClosing(false);
      setCounted("");
      setNotes("");
      refresh();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "No se pudo guardar el corte.");
    } finally {
      setBusy(false);
    }
  }

  const tiles = s ? [
    ["Fondo inicial", s.opening_cents, 1], ["Ventas en efectivo", s.cash_sales_cents, 1], ["Abonos de apartados", s.layaway_cash_cents, 1],
    ["Reembolsos", s.refunds_cash_cents, -1], ["Gastos de caja", s.expenses_cash_cents, -1],
  ] as const : [];

  return (
    <section className="px-4 pb-12 pt-6 md:px-8">
      <h1 className="font-serif text-5xl leading-none md:text-6xl">Caja</h1>
      {cur.isLoading ? <p className="mt-6 text-muted">Cargando…</p> : !session ? (
        <form onSubmit={open} className="mt-8 grid max-w-md gap-4 rounded-3xl bg-surface p-6" noValidate>
          <p>No hay caja abierta. Cuenta el dinero con el que empiezas el turno.</p>
          <Field label="Fondo inicial" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} error={err} placeholder="500.00" />
          <Button type="submit" size="lg" disabled={busy}>Abrir caja</Button>
        </form>
      ) : s && (
        <>
          <p className="mt-2 text-muted">Abierta por {session.opened_by} · {dateTimeMx(session.opened_at)}{session.auto ? " · se abrió sola al cobrar en efectivo" : ""}</p>
          <div className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <div className="rounded-3xl bg-ink p-7 text-paper">
              <p className="opacity-80">Efectivo que debe haber en la caja</p>
              <CountUp cents={s.expected_cents} testId="expected" className="block font-serif text-7xl leading-none" />
              <Button variant="wine" size="lg" className="mt-6" onClick={() => { setClosing(true); setErr(null); }}>Hacer corte</Button>
            </div>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-line bg-line">
              {tiles.map(([label, v, sign]) => (
                <div key={label} className="bg-paper px-5 py-4"><dt className="text-sm text-muted">{label}</dt><dd className="tnum font-serif text-3xl">{sign < 0 && v > 0 ? "−" : ""}{formatMoney(v)}</dd></div>
              ))}
              <div className="bg-paper px-5 py-4"><dt className="text-sm text-muted">Tarjeta y transferencia</dt><dd className="tnum font-serif text-3xl">{formatMoney(s.card_cents + s.transfer_cents)}</dd></div>
            </dl>
          </div>
          <h2 className="mb-3 mt-10 font-serif text-3xl">Movimientos de efectivo</h2>
          {s.movements.length === 0 ? <p className="text-muted">Todavía no hay movimientos en efectivo.</p> : (
            <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
              <AnimatePresence initial={false}>
                {[...s.movements].reverse().map((m, i) => (
                  <motion.li key={`${m.at}-${i}`} initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between gap-3 bg-paper px-4 py-3">
                    <span><span className="font-semibold">{m.kind}</span> <span className="text-muted">· {m.ref} · {new Date(m.at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span></span>
                    <span className={`tnum font-bold ${m.amount_cents < 0 ? "text-danger" : ""}`}>{m.amount_cents < 0 ? "−" : "+"}{formatMoney(Math.abs(m.amount_cents))}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </>
      )}

      {isAdmin && (hist.data?.sessions.length ?? 0) > 0 && (
        <>
          <h2 className="mb-3 mt-12 font-serif text-3xl">Cortes anteriores</h2>
          <div tabIndex={0} className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[640px] text-left">
              <caption className="sr-only">Cortes anteriores</caption>
              <thead className="bg-surface text-sm text-muted"><tr><th className="px-4 py-2.5">Cierre</th><th className="px-4 py-2.5">Quién</th><th className="px-4 py-2.5 text-right">Esperado</th><th className="px-4 py-2.5 text-right">Contado</th><th className="px-4 py-2.5 text-right">Diferencia</th></tr></thead>
              <tbody>
                {hist.data!.sessions.map((h) => (
                  <tr key={h.id} className="border-t border-line">
                    <td className="px-4 py-2.5">{dateTimeMx(h.closed_at!)}</td>
                    <td className="px-4 py-2.5">{h.closed_by}</td>
                    <td className="tnum px-4 py-2.5 text-right">{formatMoney(h.expected_cents ?? 0)}</td>
                    <td className="tnum px-4 py-2.5 text-right">{formatMoney(h.counted_cents ?? 0)}</td>
                    <td className={`tnum px-4 py-2.5 text-right font-semibold ${(h.difference_cents ?? 0) < 0 ? "text-danger" : (h.difference_cents ?? 0) > 0 ? "text-ok" : ""}`}>{(h.difference_cents ?? 0) === 0 ? "Cuadró" : `${(h.difference_cents ?? 0) > 0 ? "+" : "−"}${formatMoney(Math.abs(h.difference_cents ?? 0))}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal open={closing} onOpenChange={setClosing} title="Corte de caja">
        {s && (
          <div className="grid gap-4">
            <p className="flex justify-between rounded-2xl bg-surface px-4 py-3"><span className="text-muted">Debe haber</span><span className="tnum font-serif text-3xl">{formatMoney(s.expected_cents)}</span></p>
            <Field label="Efectivo contado" inputMode="decimal" value={counted} onChange={(e) => { setCounted(e.target.value); setErr(null); }} error={err} autoFocus />
            {diff !== null && (
              <motion.p key={Math.sign(diff)} initial={reduce ? false : { scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`rounded-2xl px-4 py-3 text-center font-semibold ${diff === 0 ? "bg-ok/15 text-ok" : "bg-danger/10 text-danger"}`}>
                {diff === 0 ? "Cuadra" : diff < 0 ? `Faltan ${formatMoney(-diff)}` : `Sobran ${formatMoney(diff)}`}
              </motion.p>
            )}
            <Field label="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button size="lg" variant="wine" onClick={close} disabled={busy}>{busy ? "Guardando…" : "Guardar corte"}</Button>
          </div>
        )}
      </Modal>
    </section>
  );
}
