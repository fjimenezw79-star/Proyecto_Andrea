import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "./api";
import type { Product } from "./types";

type Changes = { version: number; full?: boolean; changes?: { variant_id: number; stock: number }[] };
type ProductsPage = { products: Product[]; total: number };

const POKE = "ma:stock-poke";
export const LIVE_STOCK_MS = 3000;

/** Pide revisar el stock ya (después de una venta, entrada, etc.). */
export function pokeLiveStock() {
  window.dispatchEvent(new Event(POKE));
}

/** Aplica cambios de stock a todas las listas de productos guardadas en caché. */
export function applyStock(qc: QueryClient, stock: Record<number, number>) {
  qc.setQueriesData<ProductsPage>({ queryKey: ["products"] }, (old) => {
    if (!old || !Array.isArray(old.products)) return old;
    let touched = false;
    const products = old.products.map((p) => {
      if (!p.variants.some((v) => v.id in stock)) return p;
      touched = true;
      return { ...p, variants: p.variants.map((v) => (v.id in stock ? { ...v, stock: stock[v.id] } : v)) };
    });
    return touched ? { ...old, products } : old;
  });
}

/** Stock en vivo: consulta cada 3 s con la pestaña visible y en línea. `onStock` recibe los cambios (para el carrito). */
export function useLiveStock(onStock?: (stock: Record<number, number>) => void) {
  const qc = useQueryClient();
  const cb = useRef(onStock);
  cb.current = onStock;
  useEffect(() => {
    let version: number | null = null;
    let busy = false;
    let stopped = false;
    async function tick() {
      if (busy || stopped || document.visibilityState !== "visible" || !navigator.onLine) return;
      busy = true;
      try {
        const d = await api<Changes>(`/api/stock/changes${version === null ? "" : `?since=${version}`}`);
        const first = version === null;
        version = d.version;
        if (d.full) {
          if (!first) qc.invalidateQueries({ queryKey: ["products"] });
        } else if (d.changes && d.changes.length) {
          const stock = Object.fromEntries(d.changes.map((c) => [c.variant_id, c.stock]));
          applyStock(qc, stock);
          cb.current?.(stock);
        }
      } catch {
        /* sin señal o sesión vencida: se reintenta en el siguiente ciclo */
      } finally {
        busy = false;
      }
    }
    tick();
    const id = window.setInterval(tick, LIVE_STOCK_MS);
    const now = () => void tick();
    window.addEventListener(POKE, now);
    document.addEventListener("visibilitychange", now);
    window.addEventListener("online", now);
    return () => {
      stopped = true;
      window.clearInterval(id);
      window.removeEventListener(POKE, now);
      document.removeEventListener("visibilitychange", now);
      window.removeEventListener("online", now);
    };
  }, [qc]);
}
