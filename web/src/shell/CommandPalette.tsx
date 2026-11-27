import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../lib/api";
import { formatMoney } from "../lib/money";
import type { Product } from "../lib/types";
import { navItems, normalize } from "./nav";

export const ADD_PRODUCT_EVENT = "ma:add-product";

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 180);
  const products = useQuery({
    queryKey: ["palette", dq],
    queryFn: () => api<{ products: Product[] }>(`/api/products?q=${encodeURIComponent(dq)}`),
    enabled: open && dq.length >= 2,
  });

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const sections = navItems(user?.role ?? "seller").filter((i) => !q || normalize(`${i.label} ${i.keywords ?? ""}`).includes(normalize(q)));
  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };
  const pick = (p: Product) => {
    onOpenChange(false);
    if (loc.pathname.startsWith("/vender")) window.dispatchEvent(new CustomEvent(ADD_PRODUCT_EVENT, { detail: p }));
    else navigate(`/inventario/${p.id}`);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-[fade_.18s_ease-out]" />
        <Dialog.Content
          aria-label="Buscar"
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-3xl border border-line bg-paper shadow-2xl data-[state=open]:animate-[pop_.22s_cubic-bezier(.2,.8,.2,1)]"
        >
          <Dialog.Title className="sr-only">Buscar</Dialog.Title>
          <Command shouldFilter={false} label="Buscar productos y secciones">
            <div className="flex items-center gap-3 border-b border-line px-5">
              <Search className="size-5 text-muted" aria-hidden />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Busca un producto, código o sección"
                className="h-14 w-full bg-transparent text-lg outline-none placeholder:text-muted"
              />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="px-4 py-8 text-center text-muted">
                {dq.length >= 2 && products.isFetching ? "Buscando…" : "Sin resultados."}
              </Command.Empty>
              {sections.length > 0 && (
                <Command.Group heading="Secciones" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-sm [&_[cmdk-group-heading]]:text-muted">
                  {sections.map((s) => (
                    <Command.Item key={s.to} value={`s:${s.to}`} onSelect={() => go(s.to)} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 data-[selected=true]:bg-surface">
                      <s.icon className="size-5" aria-hidden />
                      {s.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {(products.data?.products.length ?? 0) > 0 && dq.length >= 2 && (
                <Command.Group heading="Productos" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-sm [&_[cmdk-group-heading]]:text-muted">
                  {products.data!.products.slice(0, 8).map((p) => (
                    <Command.Item key={p.id} value={`p:${p.id}`} onSelect={() => pick(p)} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 data-[selected=true]:bg-surface">
                      <img src={p.photos[0]?.thumb_url} alt="" className="size-10 rounded-lg bg-surface object-cover" />
                      <span className="flex-1">
                        <span className="block font-semibold">{p.name}</span>
                        <span className="text-sm text-muted">
                          {p.variants[0]?.sku} · {p.stock_total} disponibles
                        </span>
                      </span>
                      <span className="tnum font-semibold">{formatMoney(p.variants[0]?.price_cents ?? 0)}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
