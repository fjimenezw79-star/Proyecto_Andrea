import type { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../lib/api";
import { applyStock } from "../lib/liveStock";
import { adjustCatalogStock } from "./cache";
import { enqueue, type QueueItem } from "./queue";

export const isNetworkError = (e: unknown) => e instanceof ApiError && e.status === 0;

/** Guarda la acción en la cola del dispositivo y descuenta del stock mostrado las piezas que aparta o vende. */
export async function queueAction(
  qc: QueryClient,
  item: Omit<QueueItem, "seq" | "status" | "tries" | "nextAt" | "createdAt" | "method">,
  current?: Record<number, number>,
) {
  await enqueue(item);
  if (item.stock && current) {
    applyStock(qc, Object.fromEntries(Object.entries(item.stock).map(([vid, qty]) => [vid, (current[Number(vid)] ?? 0) - qty])));
    await adjustCatalogStock(Object.fromEntries(Object.entries(item.stock).map(([vid, qty]) => [vid, -qty])));
  }
}
