import { useQuery } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { CartClient } from "../lib/cart";
import { formatMoney } from "../lib/money";
import type { Client } from "../lib/opTypes";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Dialog";
import { Field } from "../ui/Input";

export const toCartClient = (c: Client): CartClient => ({ id: c.id, name: c.name, points: c.points, creditCents: c.credit_cents });

export function ClientPicker({ open, onOpenChange, onPick, current }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (c: CartClient | null) => void; current?: CartClient }) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 180); return () => clearTimeout(t); }, [q]);
  useEffect(() => { if (open) { setQ(""); setCreating(false); setErrors({}); } }, [open]);
  const list = useQuery({ queryKey: ["clients", dq], queryFn: () => api<{ clients: Client[] }>(`/api/clients?q=${encodeURIComponent(dq)}`), enabled: open });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErrors({ name: "Escribe el nombre del cliente." });
    try {
      const d = await api<{ client: Client }>("/api/clients", { method: "POST", json: { name, phone } });
      onPick(toCartClient(d.client));
      onOpenChange(false);
    } catch (err) {
      const a = err instanceof ApiError ? err : null;
      setErrors({ [a?.field ?? "form"]: a?.message ?? "No se pudo guardar." });
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Cliente">
      {creating ? (
        <form onSubmit={save} className="grid gap-4" noValidate>
          <Field label="Nombre" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoFocus />
          <Field label="Teléfono" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} hint="10 dígitos, opcional. Sirve para avisarle por WhatsApp." />
          {errors.form && <p role="alert" className="text-sm font-semibold text-danger">{errors.form}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="quiet" onClick={() => setCreating(false)}>Atrás</Button>
            <Button type="submit" className="flex-1">Guardar cliente</Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-semibold">
            Buscar cliente
            <input value={q} onChange={(e) => { setQ(e.target.value); setName(e.target.value); }} autoFocus placeholder="Nombre o teléfono" className="min-h-12 rounded-xl border border-line bg-paper px-3.5 text-base font-normal" />
          </label>
          <ul className="grid max-h-[40vh] gap-1 overflow-y-auto">
            {(list.data?.clients ?? []).map((c) => (
              <li key={c.id}>
                <button onClick={() => { onPick(toCartClient(c)); onOpenChange(false); }} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface">
                  <span><span className="block font-semibold">{c.name}</span><span className="text-sm text-muted">{c.phone || "Sin teléfono"}</span></span>
                  <span className="text-right text-sm text-muted">{c.points} pts{c.credit_cents > 0 ? <span className="block font-semibold text-ok">Saldo {formatMoney(c.credit_cents)}</span> : null}</span>
                </button>
              </li>
            ))}
            {list.data && list.data.clients.length === 0 && <li className="px-3 py-4 text-center text-muted">Sin resultados.</li>}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={() => { setCreating(true); setErrors({}); setPhone(/^\d+$/.test(q.trim()) ? q.trim() : ""); if (/^\d+$/.test(q.trim())) setName(""); }}>
              <UserPlus className="size-5" aria-hidden /> Registrar cliente nuevo
            </Button>
            {current && <Button type="button" variant="quiet" onClick={() => { onPick(null); onOpenChange(false); }}>Quitar cliente</Button>}
          </div>
        </div>
      )}
    </Modal>
  );
}
