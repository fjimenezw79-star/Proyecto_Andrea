import { useEffect } from "react";
import { api } from "../lib/api";
import type { Category, Product } from "../lib/types";
import { saveCatalog } from "./cache";

const EVERY_MS = 5 * 60 * 1000;
export const CATALOG_SYNC_EVENT = "ma:catalog-sync";

/** Mantiene en el dispositivo una copia del catálogo completo (al entrar, cada 5 min y al volver la señal). */
export function useCatalogSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let busy = false;
    async function sync() {
      if (busy || !navigator.onLine) return;
      busy = true;
      try {
        const d = await api<{ version: number; products: Product[]; categories: Category[] }>("/api/catalog/snapshot");
        await saveCatalog({ version: d.version, products: d.products, categories: d.categories });
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
  }, [enabled]);
}
