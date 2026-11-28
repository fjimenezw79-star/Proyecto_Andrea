/** Calcula en este dispositivo las huellas de las fotos que aún no la tienen y las guarda en el servidor. */
import type { QueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { embed } from "./embedder";
import { MODEL, toBase64 } from "./vector";

type Missing = { photo_id: number; product_id: number; thumb_url: string };
const BATCH = 20;

async function loadImage(url: string): Promise<ImageBitmap> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error("No se pudo abrir la foto.");
  return createImageBitmap(await r.blob());
}

export async function prepareMissing(productId?: number, onProgress?: (done: number, total: number) => void): Promise<number> {
  const d = await api<{ model: string; photos: Missing[] }>(`/api/vision/missing${productId ? `?product=${productId}` : ""}`);
  if (d.model !== MODEL) throw new Error("La app está desactualizada. Recarga la página.");
  let done = 0;
  let batch: { photo_id: number; v: string }[] = [];
  const flush = async () => {
    if (!batch.length) return;
    await api("/api/vision/embeddings", { method: "PUT", json: { model: MODEL, items: batch } });
    batch = [];
  };
  onProgress?.(0, d.photos.length);
  for (const p of d.photos) {
    try {
      const img = await loadImage(p.thumb_url);
      batch.push({ photo_id: p.photo_id, v: toBase64(await embed(img)) });
      img.close();
    } catch {
      /* una foto que no abre no detiene a las demás */
    }
    done++;
    onProgress?.(done, d.photos.length);
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  return done;
}

/** Tras subir fotos: prepara sus huellas sin detener la pantalla (si falla, quedan para Configuración). */
export function prepareInBackground(productId: number, qc?: QueryClient): void {
  prepareMissing(productId)
    .then(() => qc?.invalidateQueries({ queryKey: ["vision-index"] }))
    .catch(() => undefined);
}
