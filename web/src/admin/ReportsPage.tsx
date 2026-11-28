import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Download } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { formatMoney } from "../lib/money";
import { METHOD_LABEL } from "../lib/opTypes";
import { BarList } from "../ui/charts/BarList";
import { LineChart } from "../ui/charts/LineChart";
import { CountUp } from "../ui/CountUp";

type Report = {
  summary: { sales_cents: number; returns_cents: number; net_cents: number; cost_cents: number; gross_profit_cents: number; expenses_cents: number; net_profit_cents: number; tickets: number; avg_ticket_cents: number };
  by_method: Record<keyof typeof METHOD_LABEL, number>;
  by_category: { category: string; net_cents: number }[];
  by_seller: { name: string; sales_cents: number }[];
  top_products: { sku: string; name: string; qty: number; amount_cents: number }[];
  daily: { date: string; net_cents: number }[];
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function preset(p: "hoy" | "semana" | "mes"): [string, string] {
  const t = new Date();
  if (p === "hoy") return [iso(t), iso(t)];
  if (p === "semana") { const s = new Date(t); s.setDate(t.getDate() - 6); return [iso(s), iso(t)]; }
  return [iso(new Date(t.getFullYear(), t.getMonth(), 1)), iso(t)];
}

export function ReportsPage() {
  const [range, setRange] = useState<[string, string]>(preset("mes"));
  const [active, setActive] = useState<"hoy" | "semana" | "mes" | "rango">("mes");
  const [table, setTable] = useState(false);
  const q = useQuery({ queryKey: ["report", ...range], queryFn: () => api<Report>(`/api/reports/summary?from=${range[0]}&to=${range[1]}`), placeholderData: (p) => p });
  const r = q.data;
  const s = r?.summary;
  const kpis = s ? [["Ventas netas", s.net_cents, "kpi-net"], ["Utilidad bruta", s.gross_profit_cents, ""], ["Gastos", s.expenses_cents, ""], ["Utilidad neta", s.net_profit_cents, ""]] as const : [];
  const short = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" });

  return (
    <section className="px-4 pb-12 pt-6 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-5xl leading-none md:text-6xl">Reportes</h1>
        <a href={`/api/reports/sales.csv?from=${range[0]}&to=${range[1]}`} download className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ink px-5 font-semibold hover:bg-surface">
          <Download className="size-5" aria-hidden /> Descargar Excel (CSV)
        </a>
      </div>
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Periodo" className="inline-flex gap-1 rounded-full bg-surface p-1">
          {(["hoy", "semana", "mes"] as const).map((p) => (
            <button key={p} aria-pressed={active === p} onClick={() => { setActive(p); setRange(preset(p)); }} className={`relative min-h-10 rounded-full px-4 font-semibold capitalize ${active === p ? "text-paper" : ""}`}>
              {active === p && <motion.span layoutId="rep-tab" className="absolute inset-0 rounded-full bg-ink" />}
              <span className="relative">{p === "hoy" ? "Hoy" : p === "semana" ? "Semana" : "Mes"}</span>
            </button>
          ))}
        </div>
        <label className="grid gap-1 text-sm font-semibold">Desde<input type="date" value={range[0]} max={range[1]} onChange={(e) => { setActive("rango"); setRange([e.target.value, range[1]]); }} className="min-h-10 rounded-xl border border-line bg-paper px-3 font-normal" /></label>
        <label className="grid gap-1 text-sm font-semibold">Hasta<input type="date" value={range[1]} min={range[0]} onChange={(e) => { setActive("rango"); setRange([range[0], e.target.value]); }} className="min-h-10 rounded-xl border border-line bg-paper px-3 font-normal" /></label>
      </div>
      {s && (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-line bg-line lg:grid-cols-4">
            {kpis.map(([label, v, id]) => (
              <div key={label} className="bg-paper px-5 py-5"><dt className="text-sm text-muted">{label}</dt><dd><CountUp cents={v} testId={id || undefined} className="font-serif text-4xl" /></dd></div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-muted">{s.tickets} ventas · ticket promedio {formatMoney(s.avg_ticket_cents)} · devoluciones {formatMoney(s.returns_cents)}. La utilidad usa el costo de cada pieza al momento de venderla.</p>
          <div className="mt-10 grid gap-10 xl:grid-cols-[1.4fr_1fr]">
            <section aria-labelledby="h-daily">
              <div className="mb-3 flex items-baseline justify-between"><h2 id="h-daily" className="font-serif text-3xl">Ventas netas por día</h2><button className="text-sm underline" onClick={() => setTable((t) => !t)}>{table ? "Ver gráfica" : "Ver tabla"}</button></div>
              {table ? (
                <div tabIndex={0} className="max-h-80 overflow-y-auto rounded-2xl border border-line"><table className="w-full text-left"><caption className="sr-only">Ventas netas por día</caption><thead className="bg-surface text-sm text-muted"><tr><th className="px-4 py-2">Día</th><th className="px-4 py-2 text-right">Ventas netas</th></tr></thead><tbody>{r!.daily.map((d) => <tr key={d.date} className="border-t border-line"><td className="px-4 py-2">{short(d.date)}</td><td className="tnum px-4 py-2 text-right">{formatMoney(d.net_cents)}</td></tr>)}</tbody></table></div>
              ) : (
                <LineChart title="Ventas netas por día" points={r!.daily.map((d) => ({ label: short(d.date), value: d.net_cents }))} />
              )}
            </section>
            <section aria-labelledby="h-cat"><h2 id="h-cat" className="mb-4 font-serif text-3xl">Por categoría</h2><BarList title="Ventas netas por categoría" rows={r!.by_category.map((c) => ({ label: c.category, value: c.net_cents }))} /></section>
            <section aria-labelledby="h-method"><h2 id="h-method" className="mb-4 font-serif text-3xl">Dinero recibido</h2><BarList title="Dinero recibido por forma de pago" rows={Object.entries(r!.by_method).filter(([, v]) => v > 0).map(([k, v]) => ({ label: METHOD_LABEL[k as keyof typeof METHOD_LABEL], value: v }))} /></section>
            <section aria-labelledby="h-seller"><h2 id="h-seller" className="mb-4 font-serif text-3xl">Por vendedor</h2><BarList title="Ventas por vendedor" rows={r!.by_seller.map((x) => ({ label: x.name, value: x.sales_cents }))} /></section>
          </div>
          <h2 className="mb-3 mt-10 font-serif text-3xl">Más vendidos</h2>
          <div tabIndex={0} className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[520px] text-left">
              <caption className="sr-only">Más vendidos</caption>
              <thead className="bg-surface text-sm text-muted"><tr><th className="px-4 py-2.5">Producto</th><th className="px-4 py-2.5">Código</th><th className="px-4 py-2.5 text-right">Piezas</th><th className="px-4 py-2.5 text-right">Importe</th></tr></thead>
              <tbody>
                {r!.top_products.map((t) => <tr key={t.sku} className="border-t border-line"><td className="px-4 py-2.5 font-semibold">{t.name}</td><td className="px-4 py-2.5 text-muted">{t.sku}</td><td className="tnum px-4 py-2.5 text-right">{t.qty}</td><td className="tnum px-4 py-2.5 text-right">{formatMoney(t.amount_cents)}</td></tr>)}
                {r!.top_products.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">Sin ventas en este periodo.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
