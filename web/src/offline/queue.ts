/** Cola de acciones hechas sin señal (ventas, apartados, abonos y clientes), guardada en IndexedDB.
 * Adaptado de AcuaGest DEMO 3.0 (offline.js). Cada acción conserva su identificador (X-Client-Uid) y la hora real
 * (X-Client-Time); el servidor no la repite si ya la recibió. */
import { api, ApiError, AuthError } from "../lib/api";

export type QueueItem = {
  seq?: number;
  uid: string;
  user: number;
  label: string;
  kind: "sale" | "layaway" | "payment" | "client";
  method: "POST";
  path: string;
  json: unknown;
  clientTime: string;
  status: "pending" | "problem";
  message?: string;
  tries: number;
  nextAt: number;
  createdAt: string;
  /** piezas que descuenta (para mostrar el stock sin señal) */
  stock?: Record<number, number>;
};

export type Sender = (item: QueueItem) => Promise<unknown>;
export type FlushResult = { sent: number; problems: number; remaining: number; stopped?: "auth" | "network" | "busy" };

const DB = "ma-offline";
const STORE = "queue";
export const BACKOFF_MS = [5_000, 15_000, 60_000];
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => {
        const s = r.result.createObjectStore(STORE, { keyPath: "seq", autoIncrement: true });
        s.createIndex("uid", "uid", { unique: true });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => {
        dbp = null;
        reject(r.error);
      };
    });
  }
  return dbp;
}

/** Solo para pruebas: cierra la conexión para empezar de cero. */
export async function _reset() {
  if (dbp) (await dbp).close();
  dbp = null;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(r ? r.result : undefined);
        t.onerror = () => reject(t.error);
      }),
  );
}

export function nowLocalIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export async function enqueue(item: Omit<QueueItem, "seq" | "status" | "tries" | "nextAt" | "createdAt" | "method"> & { method?: "POST" }) {
  const existing = await byUid(item.uid);
  if (existing) return existing;
  const full: QueueItem = { method: "POST", ...item, status: "pending", tries: 0, nextAt: 0, createdAt: new Date().toISOString() };
  await tx("readwrite", (s) => s.add(full));
  emit();
  return full;
}

async function all(): Promise<QueueItem[]> {
  return ((await tx<QueueItem[]>("readonly", (s) => s.getAll())) ?? []).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

async function byUid(uid: string): Promise<QueueItem | undefined> {
  return tx<QueueItem>("readonly", (s) => s.index("uid").get(uid) as IDBRequest<QueueItem>);
}

async function put(item: QueueItem) {
  await tx("readwrite", (s) => s.put(item));
}

async function remove(item: QueueItem) {
  await tx("readwrite", (s) => s.delete(item.seq!));
}

export async function pending(user: number): Promise<QueueItem[]> {
  try {
    return (await all()).filter((i) => i.user === user);
  } catch {
    return [];
  }
}

export async function discard(uid: string, reason: string) {
  const i = await byUid(uid);
  if (!i) return;
  await remove(i);
  try {
    const log = JSON.parse(localStorage.getItem("ma-descartados") || "[]") as unknown[];
    log.unshift({ uid, label: i.label, reason, at: new Date().toISOString() });
    localStorage.setItem("ma-descartados", JSON.stringify(log.slice(0, 50)));
  } catch {
    /* sin almacenamiento */
  }
  emit();
}

export async function retry(uid: string) {
  const i = await byUid(uid);
  if (!i) return;
  await put({ ...i, status: "pending", message: undefined, tries: 0, nextAt: 0 });
  emit();
}

/** Encabezados para que el servidor no repita la acción y use la hora real. */
export function clientHeaders(uid: string, clientTime: string, offline = false): Record<string, string> {
  return { "X-Client-Uid": uid, "X-Client-Time": clientTime, ...(offline ? { "X-Offline": "1" } : {}) };
}

export const sendItem: Sender = (i) => api(i.path, { method: i.method, json: i.json, headers: clientHeaders(i.uid, i.clientTime, true) });

/** Envía en orden las acciones del usuario. Se detiene ante sesión vencida o falta de señal para no alterar el orden. */
export async function flush(user: number, send: Sender = sendItem, now = Date.now()): Promise<FlushResult> {
  let sent = 0;
  let stopped: FlushResult["stopped"];
  for (const item of await pending(user)) {
    if (item.status === "problem") continue;
    if (item.nextAt > now) {
      stopped = "network";
      break;
    }
    try {
      await send(item);
      await remove(item);
      sent++;
    } catch (e) {
      if (e instanceof AuthError) {
        stopped = "auth";
        break;
      }
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 409 && /procesando/i.test((e as Error).message)) {
        await put({ ...item, nextAt: now + BACKOFF_MS[0] });
        stopped = "busy";
        break;
      }
      if (status === 0 || status >= 500) {
        const tries = item.tries + 1;
        await put({ ...item, tries, nextAt: now + BACKOFF_MS[Math.min(tries - 1, BACKOFF_MS.length - 1)] });
        stopped = "network";
        break;
      }
      await put({ ...item, status: "problem", message: (e as Error).message });
    }
  }
  const rest = await pending(user);
  emit();
  return { sent, problems: rest.filter((i) => i.status === "problem").length, remaining: rest.length, stopped };
}

export const QUEUE_EVENT = "ma:queue";
function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(QUEUE_EVENT));
}
