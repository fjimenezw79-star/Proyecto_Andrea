import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../lib/api";
import { formatMoney } from "../lib/money";
import { dateMx } from "../lib/opTypes";
import { CountUp } from "../ui/CountUp";

type Dash = {
  today_cents: number; today_tickets: number; month_cents: number; month_profit_cents?: number; month_net_profit_cents?: number;
  layaways_due: { id: string; folio: number; client_name: string; deadline: string; days_left: number; balance_cents: number }[];
  low_stock: { variant_id: number; product_id: number; sku: string; name: string; stock: number }[];
  depletion: { variant_id: number; sku: string; name: string; stock: number; sold_30d: number; days_left: number }[];
};

export function DashboardPage() {
  const { user } = useAuth();
  const reduce = useReducedMotion();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dash>("/api/dashboard"), refetchInterval: 60_000 });
  const d = q.data;
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const card = (i: number) => ({ initial: reduce ? false : { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: i * 0.06, duration: 0.4 } });
  return (
    <section className="px-4 pb-12 pt-6 md:px-8">
      <h1 className="font-serif text-5xl leading-none md:text-6xl">{hello}, {user?.full_name || user?.username}</h1>
      {d && (
        <>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <motion.div {...card(0)} className="rounded-3xl bg-ink p-6 text-paper"><p className="opacity-80">Ventas de hoy</p><CountUp cents={d.today_cents} className="block font-serif text-6xl leading-none" /><p className="mt-2 opacity-80">{d.today_tickets} ventas</p></motion.div>
            <motion.div {...card(1)} className="rounded-3xl bg-surface p-6"><p className="text-muted">Ventas del mes</p><CountUp cents={d.month_cents} className="block font-serif text-5xl leading-none" /></motion.div>
            {d.month_profit_cents !== undefined && (
              <motion.div {...card(2)} className="rounded-3xl bg-surface p-6"><p className="text-muted">Utilidad del mes</p><CountUp cents={d.month_profit_cents} className="block font-serif text-5xl leading-none" /><p className="mt-2 text-sm text-muted">Después de gastos: {formatMoney(d.month_net_profit_cents ?? 0)}</p></motion.div>
            )}
          </div>
          <div className="mt-10 grid gap-10 lg:grid-cols-3">
            <section aria-label="Apartados por vencer">
              <h2 className="mb-3 font-serif text-3xl">Apartados por vencer</h2>
              {d.layaways_due.length === 0 ? <p className="text-muted">Ninguno en los próximos 7 días.</p> : (
                <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
                  {d.layaways_due.map((l) => (
                    <li key={l.id} className="bg-paper"><Link to={`/apartados/${l.id}`} className="flex justify-between gap-3 px-4 py-3 hover:bg-surface"><span><span className="font-semibold">#{l.folio} {l.client_name}</span><span className={`block text-sm ${l.days_left < 0 ? "font-semibold text-danger" : "text-muted"}`}>{l.days_left < 0 ? `Venció el ${dateMx(l.deadline)}` : l.days_left === 0 ? "Vence hoy" : `Vence en ${l.days_left} días`}</span></span><span className="tnum font-bold">{formatMoney(l.balance_cents)}</span></Link></li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-label="Se agota pronto">
              <h2 className="mb-3 font-serif text-3xl">Se agota pronto</h2>
              {d.depletion.length === 0 ? <p className="text-muted">Al ritmo de venta actual, nada se agota en las próximas dos semanas.</p> : (
                <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
                  {d.depletion.map((x) => (
                    <li key={x.variant_id} className="flex justify-between gap-3 bg-paper px-4 py-3"><span><span className="font-semibold">{x.name}</span><span className="block text-sm text-muted">{x.stock} piezas · vendió {x.sold_30d} en 30 días</span></span><span className="text-right font-semibold text-wine">~{x.days_left} días</span></li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-label="Stock bajo">
              <h2 className="mb-3 font-serif text-3xl">Stock bajo</h2>
              {d.low_stock.length === 0 ? <p className="text-muted">Todo con existencias suficientes.</p> : (
                <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
                  {d.low_stock.map((x) => (
                    <li key={x.variant_id} className="bg-paper"><Link to={`/inventario/${x.product_id}`} className="flex justify-between gap-3 px-4 py-3 hover:bg-surface"><span className="font-semibold">{x.name}</span><span className="tnum">{x.stock === 0 ? "Agotado" : `${x.stock} piezas`}</span></Link></li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  );
}
