/** Huellas de imagen: vector normalizado guardado en int8 (1 byte por valor) y comparación por similitud. */

export const MODEL = "mobilenet_v3_small";
export const DIM = 1024;

export function quantize(v: ArrayLike<number>): Int8Array {
  const out = new Int8Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = Math.max(-127, Math.min(127, Math.round(v[i] * 127)));
  return out;
}

export function toBase64(v: Int8Array): string {
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function fromBase64(b64: string): Int8Array {
  const s = atob(b64);
  const out = new Int8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = (s.charCodeAt(i) << 24) >> 24;
  return out;
}

/** Similitud coseno entre dos vectores int8 (de -1 a 1). */
export function similarity(a: Int8Array, b: Int8Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export type IndexItem = { photo_id: number; product_id: number; vec: Int8Array };
export type Match = { product_id: number; score: number };

/** Los `k` productos más parecidos: cada producto cuenta con su foto más parecida. */
export function topProducts(items: IndexItem[], query: Int8Array, k = 3): Match[] {
  const best = new Map<number, number>();
  for (const it of items) {
    if (it.vec.length !== query.length) continue;
    const s = similarity(it.vec, query);
    if (s > (best.get(it.product_id) ?? -2)) best.set(it.product_id, s);
  }
  return [...best.entries()].map(([product_id, score]) => ({ product_id, score })).sort((a, b) => b.score - a.score).slice(0, k);
}
