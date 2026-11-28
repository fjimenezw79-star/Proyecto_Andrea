import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../lib/api";
import { formatMoney } from "../lib/money";
import { dateMx, type Layaway } from "../lib/opTypes";

const TABS = [
  { id: "pending", label: "Pendientes" },
  { id: "overdue", label: "Vencidos" },
  { id: "settled", label: "Liquidados" },
  { id: "cancelled", label: "Cancelados" },
] as const;

export function LayawaysPage() {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("pending");
  const q = useQuery({ queryKey: ["layaways", tab], queryFn: () => api<{ layaways: Layaway[] }>(`/api/layaways?status=${tab}`) });
  const list = q.data?.layaways ?? [];
  return (
    <section className="px-4 pb-12 pt-6 md:px-8">
      <h1 className="font-serif text-5xl leading-none md:text-6xl">Apartados</h1>
      <p className="mt-2 text-muted">Para apartar, agrega los productos en Vender, elige al cliente y toca Apartar.</p>
      <div role="tablist" aria-label="Estado" className="my-6 flex gap-1 overflow-x-auto rounded-full bg-surface p-1 [scrollbar-width:none] sm:inline-flex">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`relative min-h-10 shrink-0 rounded-full px-4 font-semibold ${tab === t.id ? "text-paper" : ""}`}>
            {tab === t.id && <motion.span layoutId="lay-tab" className="absolute inset-0 rounded-full bg-ink" />}
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-muted">{q.isLoading ? "Cargando…" : "No hay apartados aquí."}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((l, i) => {
            const pct = l.total_cents ? Math.round((l.paid_cents / l.total_cents) * 100) : 0;
            return (
              <motion.li key={l.id} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
                <Link to={`/apartados/${l.id}`} className="grid gap-3 rounded-3xl border border-line p-5 hover:bg-surface">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-serif text-3xl">#{l.folio}</span>
                    <span className={`rounded-full px-3 py-1 text-sm font-semibold ${l.overdue ? "bg-wine text-wine-ink" : "bg-surface"}`}>
                      {l.status === "settled" ? "Liquidado" : l.status === "cancelled" ? "Cancelado" : l.overdue ? `Venció ${dateMx(l.deadline)}` : `Vence ${dateMx(l.deadline)}`}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold">{l.client_name}</p>
                    <p className="truncate text-sm text-muted">{l.items.map((it) => it.name).join(", ")}</p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-line" aria-hidden>
                    <motion.div className="h-full bg-ink" initial={reduce ? false : { width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }} />
                  </div>
                  <p className="tnum flex justify-between text-sm"><span>Pagado {formatMoney(l.paid_cents)} de {formatMoney(l.total_cents)}</span><span className="font-bold">Saldo {formatMoney(l.balance_cents)}</span></p>
                </Link>
              </motion.li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
