import { useInfiniteQuery } from "@tanstack/react-query";
import { CloudOff } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "../ui/Button";

type Entry = { id: number; at: string; user: string | null; action: string; entity_id: string | null; detail: string; offline: boolean; client_time: string | null };

const fmt = (iso: string) => new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

export function AuditPage() {
  const q = useInfiniteQuery({
    queryKey: ["audit"],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<{ entries: Entry[] }>(`/api/audit?page=${pageParam}`),
    getNextPageParam: (last, pages) => (last.entries.length === 100 ? pages.length + 1 : undefined),
  });
  const entries = q.data?.pages.flatMap((p) => p.entries) ?? [];
  const groups: [string, Entry[]][] = [];
  for (const e of entries) {
    const k = dayKey(e.at);
    if (groups.at(-1)?.[0] === k) groups.at(-1)![1].push(e);
    else groups.push([k, [e]]);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-6 md:px-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">Administrador</p>
      <h1 className="font-serif text-5xl leading-none md:text-6xl">Bitácora</h1>
      <p className="mb-8 mt-3 text-muted">Quién hizo qué y cuándo. Lo que se hizo sin señal muestra la hora real en que ocurrió.</p>
      {q.isLoading && <p className="text-muted">Cargando…</p>}
      {!q.isLoading && entries.length === 0 && <p className="rounded-2xl bg-surface px-4 py-6 text-center text-muted">Todavía no hay movimientos.</p>}
      {groups.map(([day, list]) => (
        <section key={day} aria-label={day} className="mb-8">
          <h2 className="mb-2 font-serif text-2xl first-letter:uppercase">{day}</h2>
          <ol className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
            {list.map((e) => (
              <li key={e.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 bg-paper px-4 py-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto]">
                <time dateTime={e.at} className="tnum text-sm text-muted">{new Date(e.at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</time>
                <div className="min-w-0">
                  <p><span className="font-semibold">{e.user ?? "—"}</span> · {e.action}{e.detail ? <span className="text-muted"> · {e.detail}</span> : null}</p>
                  {e.offline && e.client_time && <p className="text-sm text-muted">Hecha a las {fmt(e.client_time)}, recibida a las {fmt(e.at)}</p>}
                </div>
                {e.offline && (
                  <span className="col-start-2 inline-flex items-center gap-1 self-start justify-self-start rounded-full bg-wine/10 px-2.5 py-1 text-xs font-semibold text-wine sm:col-start-3">
                    <CloudOff className="size-3.5" aria-hidden /> Sin señal
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
      {q.hasNextPage && <Button variant="ghost" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>{q.isFetchingNextPage ? "Cargando…" : "Ver más"}</Button>}
    </div>
  );
}
