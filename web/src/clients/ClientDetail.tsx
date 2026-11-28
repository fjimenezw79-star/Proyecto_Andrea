import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { api, ApiError } from "../lib/api";
import { formatMoney } from "../lib/money";
import { dateMx, type Client } from "../lib/opTypes";
import { Button } from "../ui/Button";
import { Field } from "../ui/Input";
import { useToast } from "../ui/Toast";

type Detail = { client: Client; total_spent_cents: number; sales: { id: string; folio: number; total_cents: number; status: string; created_at: string }[]; layaways: { id: string; folio: number; total_cents: number; paid_cents: number; status: string; deadline: string }[] };

export function ClientDetail() {
  const { id } = useParams();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["client", id], queryFn: () => api<Detail>(`/api/clients/${id}`) });
  const [form, setForm] = useState<{ name: string; phone: string; notes: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const d = q.data;
  if (q.isLoading) return <p className="p-8 text-muted">Cargando…</p>;
  if (!d) return <p className="p-8 text-muted">No encontramos ese cliente.</p>;
  const c = d.client;
  const f = form ?? { name: c.name, phone: c.phone, notes: c.notes };

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/clients/${c.id}`, { method: "PATCH", json: f });
      toast("Cliente actualizado.", "ok");
      setErrors({});
      setForm(null);
      qc.invalidateQueries({ queryKey: ["client", id] });
    } catch (err) {
      const a = err instanceof ApiError ? err : null;
      setErrors({ [a?.field ?? "form"]: a?.message ?? "No se pudo guardar." });
    }
  }

  return (
    <section className="mx-auto max-w-4xl px-4 pb-12 pt-6 md:px-8">
      <Link to="/clientes" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="size-4" aria-hidden /> Clientes</Link>
      <h1 className="font-serif text-5xl leading-none md:text-6xl">{c.name}</h1>
      <dl className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line">
        <div className="bg-paper px-5 py-4"><dt className="text-sm text-muted">Puntos</dt><dd className="tnum font-serif text-3xl">{c.points} puntos</dd></div>
        <div className="bg-paper px-5 py-4"><dt className="text-sm text-muted">Saldo a favor</dt><dd className="tnum font-serif text-3xl">{formatMoney(c.credit_cents)}</dd></div>
        <div className="bg-paper px-5 py-4"><dt className="text-sm text-muted">Ha comprado</dt><dd className="tnum font-serif text-3xl">{formatMoney(d.total_spent_cents)}</dd></div>
      </dl>
      <form onSubmit={save} className="mt-8 grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Nombre" value={f.name} onChange={(e) => setForm({ ...f, name: e.target.value })} error={errors.name} />
        <Field label="Teléfono" inputMode="tel" value={f.phone} onChange={(e) => setForm({ ...f, phone: e.target.value })} error={errors.phone} />
        <Field label="Notas" value={f.notes} onChange={(e) => setForm({ ...f, notes: e.target.value })} className="sm:col-span-2" />
        {errors.form && <p role="alert" className="text-sm text-danger">{errors.form}</p>}
        {form && <Button type="submit" className="justify-self-start">Guardar cambios</Button>}
      </form>
      {d.layaways.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 font-serif text-3xl">Apartados</h2>
          <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
            {d.layaways.map((l) => (
              <li key={l.id} className="bg-paper"><Link to={`/apartados/${l.id}`} className="flex justify-between px-4 py-3 hover:bg-surface"><span>#{l.folio} · {l.status === "pending" ? `vence ${dateMx(l.deadline)}` : l.status === "settled" ? "Liquidado" : "Cancelado"}</span><span className="tnum">{formatMoney(l.paid_cents)} / {formatMoney(l.total_cents)}</span></Link></li>
            ))}
          </ul>
        </>
      )}
      <h2 className="mb-3 mt-10 font-serif text-3xl">Compras</h2>
      {d.sales.length === 0 ? <p className="text-muted">Todavía no tiene compras.</p> : (
        <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
          {d.sales.map((s) => (
            <li key={s.id} className={`flex justify-between bg-paper px-4 py-3 ${s.status === "cancelled" ? "text-muted line-through" : ""}`}><span>Venta #{s.folio} · {dateMx(s.created_at)}</span><span className="tnum">{formatMoney(s.total_cents)}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
}
