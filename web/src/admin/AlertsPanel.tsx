import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../lib/api";
import { dateTimeMx } from "../lib/opTypes";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";

type Alert = { id: number; variant_id: number; sku: string; product: string; product_id: number; stock_after: number; stock_now: number; created_at: string };

/** Ventas hechas sin señal que dejaron el stock en negativo: hay que contar las piezas y ajustar. */
export function AlertsPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const reduce = useReducedMotion();
  const q = useQuery({ queryKey: ["stock-alerts"], queryFn: () => api<{ alerts: Alert[] }>("/api/stock-alerts"), refetchInterval: 60_000 });
  const [busy, setBusy] = useState<number | null>(null);
  const alerts = q.data?.alerts ?? [];
  if (!alerts.length) return null;

  async function review(id: number) {
    setBusy(id);
    try {
      await api(`/api/stock-alerts/${id}/review`, { method: "POST" });
      await qc.invalidateQueries({ queryKey: ["stock-alerts"] });
      toast("Alerta marcada como revisada.", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo marcar.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="alerts-title" className="mt-8 rounded-3xl border border-wine/40 bg-wine/5 p-5 md:p-6">
      <h2 id="alerts-title" className="mb-1 flex items-center gap-2 font-serif text-3xl">
        <AlertTriangle className="size-6 text-wine" aria-hidden /> Stock negativo por ventas sin señal
      </h2>
      <p className="mb-4 text-muted">Se vendieron más piezas de las registradas mientras un dispositivo no tenía señal. Cuenta las piezas, corrige con Ajustar existencias y marca la alerta.</p>
      <ul className="grid gap-2">
        <AnimatePresence initial={false}>
          {alerts.map((a) => (
            <motion.li key={a.id} layout={!reduce} exit={reduce ? undefined : { opacity: 0, x: 24 }} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-3">
              <div className="min-w-0">
                <Link to={`/inventario/${a.product_id}`} className="font-semibold underline-offset-2 hover:underline">{a.product}</Link>
                <p className="text-sm text-muted">{a.sku} · quedó en {a.stock_after} · hoy {a.stock_now} · {dateTimeMx(a.created_at)}</p>
              </div>
              <Button variant="ghost" disabled={busy === a.id} onClick={() => review(a.id)}>Marcar como revisada</Button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
