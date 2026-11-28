import { motion, useReducedMotion } from "motion/react";
import { formatMoney } from "../../lib/money";

/** Barras horizontales de una sola medida: nombre y monto escritos, la barra muestra la proporción. */
export function BarList({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-muted">Sin datos en este periodo.</p>;
  return (
    <ul aria-label={title} className="grid gap-3">
      {rows.map((r, i) => (
        <li key={r.label} className="grid gap-1" title={`${r.label}: ${formatMoney(r.value)}`}>
          <div className="flex justify-between gap-3 text-sm"><span className="truncate">{r.label}</span><span className="tnum font-semibold">{formatMoney(r.value)}</span></div>
          <div className="h-2.5 rounded-full bg-surface" aria-hidden>
            <motion.div className="h-full rounded-full bg-chart" initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.max(1, (r.value / max) * 100)}%` }} transition={{ duration: 0.6, delay: i * 0.04, ease: [0.2, 0.8, 0.2, 1] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
