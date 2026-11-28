import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { loadVisionCache, saveVisionCache } from "../offline/cache";
import { fromBase64, MODEL, type IndexItem } from "./vector";

type Raw = { model: string; items: { photo_id: number; product_id: number; v: string }[] };

/** Índice de huellas del catálogo; sin señal usa la copia guardada en el dispositivo. */
export async function fetchVisionIndex(): Promise<IndexItem[]> {
  let raw: Raw | null;
  try {
    raw = await api<Raw>("/api/vision/index");
    await saveVisionCache(raw);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 0) throw e;
    raw = await loadVisionCache<Raw>();
  }
  if (!raw || raw.model !== MODEL) return [];
  return raw.items.map((i) => ({ photo_id: i.photo_id, product_id: i.product_id, vec: fromBase64(i.v) }));
}

export function useVisionIndex(enabled = true) {
  return useQuery({ queryKey: ["vision-index"], queryFn: fetchVisionIndex, enabled, staleTime: 60_000 });
}
