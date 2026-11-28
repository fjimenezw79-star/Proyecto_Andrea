import { useQuery } from "@tanstack/react-query";
import { Search, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../lib/api";
import { formatMoney } from "../lib/money";
import type { Client } from "../lib/opTypes";
import { Button } from "../ui/Button";
import { ClientPicker } from "./ClientPicker";

export function ClientsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [adding, setAdding] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 180); return () => clearTimeout(t); }, [q]);
  const list = useQuery({ queryKey: ["clients", dq], queryFn: () => api<{ clients: Client[] }>(`/api/clients?q=${encodeURIComponent(dq)}`) });
  return (
    <section className="px-4 pb-12 pt-6 md:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-5xl leading-none md:text-6xl">Clientes</h1>
        <Button onClick={() => setAdding(true)}><UserPlus className="size-5" aria-hidden /> Nuevo cliente</Button>
      </div>
      <label className="relative mb-6 block max-w-md">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input type="search" aria-label="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o teléfono" className="min-h-12 w-full rounded-full border border-line bg-paper pl-12 pr-4" />
      </label>
      <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
        {(list.data?.clients ?? []).map((c) => (
          <li key={c.id} className="bg-paper">
            <Link to={`/clientes/${c.id}`} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 hover:bg-surface">
              <span><span className="block font-semibold">{c.name}</span><span className="text-sm text-muted">{c.phone || "Sin teléfono"}</span></span>
              <span className="text-right text-sm"><span className="tnum block">{c.points} puntos</span>{c.credit_cents > 0 && <span className="tnum font-semibold text-ok">Saldo {formatMoney(c.credit_cents)}</span>}</span>
            </Link>
          </li>
        ))}
        {list.data?.clients.length === 0 && <li className="bg-paper px-4 py-10 text-center text-muted">{dq ? "Sin resultados." : "Todavía no hay clientes. Regístralos al vender para que junten puntos."}</li>}
      </ul>
      <ClientPicker open={adding} onOpenChange={setAdding} onPick={(c) => c && navigate(`/clientes/${c.id}`)} />
    </section>
  );
}
