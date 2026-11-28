import { useEffect } from "react";
import { api } from "../lib/api";
import type { Category, Product } from "../lib/types";
import { adjustCatalogStock, saveCatalog } from "./cache";
import { pending } from "./queue";

const EVERY_MS = 5 * 60 * 1000;
export const CATALOG_SYNC_EVENT = "ma:catalog-sync";

/** Mantiene en el dispositivo una copia del catálogo completo (al entrar, cada 5 min y al volver la señal). */
export function useCatalogSync(userId: number | null) {
  const enabled = userId !== null;
  useEffect(() => {
    if (!enabled) return;
    let busy = false;
    async function sync() {
      if (busy || !navigator.onLine) return;
      busy = true;
      try {
        const d = await api<{ version: number; products: Product[]; categories: Category[] }>("/api/catalog/snapshot");
        await saveCatalog({ version: d.version, products: d.products, categories: d.categories });
        // lo que este dispositivo vendió o apartó y aún no se envía sigue descontado
        const delta: Record<number, number> = {};
        for (const i of await pending(userId!)) {
          if (i.status !== "pending" || !i.stock) continue;
          for (const [vid, qty] of Object.entries(i.stock)) delta[Number(vid)] = (delta[Number(vid)] ?? 0) - qty;
        }
        if (Object.keys(delta).length) await adjustCatalogStock(delta);
        window.dispatchEvent(new Event(CATALOG_SYNC_EVENT));
      } catch {
        /* se intenta en el siguiente ciclo */
      } finally {
        busy = false;
      }
    }
    sync();
    const id = window.setInterval(sync, EVERY_MS);
    window.addEventListener("online", sync);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", sync);
    };
  }, [enabled, userId]);
}
