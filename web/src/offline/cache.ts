/** Copia local (IndexedDB) del catálogo, categorías, clientes recientes y usuario, para trabajar sin señal. */
import type { User } from "../auth/AuthProvider";
import type { Category, Product } from "../lib/types";

const DB = "ma-cache";
const STORE = "kv";
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => {
        dbp = null;
        reject(r.error);
      };
    });
  }
  return dbp;
}

async function get<T>(key: string): Promise<T | null> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => resolve((r.result as T) ?? null);
      r.onerror = () => reject(r.error);
    });
  } catch {
    return null;
  }
}

async function set(key: string, value: unknown): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      if (value === null) tx.objectStore(STORE).delete(key);
      else tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* sin almacenamiento (modo privado): la app sigue funcionando en línea */
  }
}

export type Catalog = { products: Product[]; categories: Category[]; version: number; saved_at: string };
export type CachedClient = { id: string; name: string; phone: string; points: number; credit_cents: number };

export const saveCatalog = (c: Omit<Catalog, "saved_at">) => set("catalog", { ...c, saved_at: new Date().toISOString() });
export const loadCatalog = () => get<Catalog>("catalog");
export const saveMe = (u: User | null) => set("me", u);
export const loadMe = () => get<User>("me");

export async function saveClients(list: CachedClient[]): Promise<void> {
  const old = (await get<CachedClient[]>("clients")) ?? [];
  const byId = new Map(old.map((c) => [c.id, c]));
  for (const c of list) byId.delete(c.id);
  const merged = [...list, ...byId.values()].slice(0, 500);
  await set("clients", merged);
}

export async function searchClientsOffline(q: string): Promise<CachedClient[]> {
  const all = (await get<CachedClient[]>("clients")) ?? [];
  const t = norm(q);
  return (t ? all.filter((c) => norm(c.name).includes(t) || c.phone.includes(q.trim())) : all).slice(0, 20);
}

export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function descendants(categories: Category[], id: number): Set<number> {
  const out = new Set<number>();
  const walk = (list: Category[], inside: boolean) => {
    for (const c of list) {
      const hit = inside || c.id === id;
      if (hit) out.add(c.id);
      walk(c.children ?? [], hit);
    }
  };
  walk(categories, false);
  return out;
}

/** Misma búsqueda que /api/products pero sobre la copia local. */
export function filterCatalog(c: Catalog, q: string, category: number | null): { products: Product[]; total: number } {
  const t = norm(q);
  const cats = category ? descendants(c.categories, category) : null;
  const products = c.products.filter(
    (p) =>
      (!cats || cats.has(p.category_id)) &&
      (!t || norm(p.name).includes(t) || p.variants.some((v) => norm(v.sku).includes(t) || v.barcode === q.trim())),
  );
  return { products: products.slice(0, 60), total: products.length };
}
