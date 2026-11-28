import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import { pokeLiveStock } from "../lib/liveStock";
import { useToast } from "../ui/Toast";
import { flush as flushQueue, pending, QUEUE_EVENT, type QueueItem } from "./queue";

type Ctx = {
  online: boolean;
  items: QueueItem[];
  pendingCount: number;
  problems: number;
  flush: () => Promise<void>;
  /** La app detectó un error de red: se marca sin señal de inmediato. */
  markOffline: () => void;
};

const OfflineCtx = createContext<Ctx>({ online: true, items: [], pendingCount: 0, problems: 0, flush: async () => {}, markOffline: () => {} });

export const useOffline = () => useContext(OfflineCtx);

const HEALTH_MS = 10_000;
const FLUSH_MS = 5_000;

async function ping(): Promise<boolean> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch("/api/health", { cache: "no-store", signal: ctl.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [items, setItems] = useState<QueueItem[]>([]);
  const flushing = useRef(false);
  const wasOffline = useRef(!navigator.onLine);

  const refresh = useCallback(async () => {
    setItems(user ? await pending(user.id) : []);
  }, [user]);

  useEffect(() => {
    refresh();
    window.addEventListener(QUEUE_EVENT, refresh);
    return () => window.removeEventListener(QUEUE_EVENT, refresh);
  }, [refresh]);

  // Señal: navigator.onLine + respuesta real del servidor cada 10 s.
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const ok = navigator.onLine && (await ping());
      if (alive) setOnline(ok);
    };
    const goOffline = () => setOnline(false);
    check();
    const id = window.setInterval(check, HEALTH_MS);
    window.addEventListener("online", check);
    window.addEventListener("offline", goOffline);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const flush = useCallback(async () => {
    if (!user || flushing.current) return;
    flushing.current = true;
    try {
      const r = await flushQueue(user.id);
      if (r.sent > 0) {
        qc.invalidateQueries();
        pokeLiveStock();
        if (r.remaining === 0) toast("Todo enviado.", "ok");
      }
      if (r.stopped === "network") setOnline(navigator.onLine && (await ping()));
    } finally {
      flushing.current = false;
      refresh();
    }
  }, [user, qc, toast, refresh]);

  const sendable = items.filter((i) => i.status === "pending").length;

  // Al volver la señal se envía solo; mientras haya pendientes se reintenta cada 5 s.
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!sendable) {
      wasOffline.current = false;
      return;
    }
    if (wasOffline.current) {
      toast(`Volvió la señal. Enviando ${sendable} ${sendable === 1 ? "pendiente" : "pendientes"}…`);
      wasOffline.current = false;
    }
    flush();
    const id = window.setInterval(flush, FLUSH_MS);
    return () => window.clearInterval(id);
  }, [online, sendable, flush, toast]);

  const markOffline = useCallback(() => setOnline(false), []);

  return (
    <OfflineCtx.Provider value={{ online, items, pendingCount: items.length, problems: items.length - sendable, flush, markOffline }}>
      {children}
    </OfflineCtx.Provider>
  );
}
