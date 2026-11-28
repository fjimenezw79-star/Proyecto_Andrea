import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { newId, type CartClient } from "../lib/cart";
import { useAuth } from "../auth/AuthProvider";
import { saveClients, searchClientsOffline } from "../offline/cache";
import { isNetworkError, queueAction } from "../offline/offlineAction";
import { useOffline } from "../offline/OfflineProvider";
import { clientHeaders, nowLocalIso } from "../offline/queue";
import { useToast } from "../ui/Toast";
import { formatMoney } from "../lib/money";
import type { Client } from "../lib/opTypes";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Dialog";
import { Field } from "../ui/Input";

export const toCartClient = (c: Client): CartClient => ({ id: c.id, name: c.name, points: c.points, creditCents: c.credit_cents, phone: c.phone });

export function ClientPicker({ open, onOpenChange, onPick, current }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (c: CartClient | null) => void; current?: CartClient }) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 180); return () => clearTimeout(t); }, [q]);
  useEffect(() => { if (open) { setQ(""); setCreating(false); setErrors({}); } }, [open]);
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { markOffline } = useOffline();
  const list = useQuery({
    queryKey: ["clients", dq],
    enabled: open,
    queryFn: async () => {
      try {
        const d = await api<{ clients: Client[] }>(`/api/clients?q=${encodeURIComponent(dq)}`);
        saveClients(d.clients.map((c) => ({ id: c.id, name: c.name, phone: c.phone, points: c.points, credit_cents: c.credit_cents })));
        return d;
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        // sin señal: clientes guardados en el dispositivo (sin saldo a favor, que solo se usa en línea)
        return { clients: (await searchClientsOffline(dq)).map((c) => ({ ...c, credit_cents: 0 }) as Client) };
      }
    },
  });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErrors({ name: "Escribe el nombre del cliente." });
    const id = newId();
    const clientTime = nowLocalIso();
    const json = { id, name: name.trim(), phone: phone.trim() };
    try {
      const d = await api<{ client: Client }>("/api/clients", { method: "POST", json, headers: clientHeaders(id, clientTime) });
      onPick(toCartClient(d.client));
      onOpenChange(false);
    } catch (err) {
      if (isNetworkError(err)) {
        markOffline();
        await queueAction(qc, { uid: id, user: user!.id, kind: "client", label: `Cliente ${json.name}`, path: "/api/clients", json, clientTime });
        await saveClients([{ id, name: json.name, phone: json.phone, points: 0, credit_cents: 0 }]);
        onPick({ id, name: json.name, points: 0, creditCents: 0, phone: json.phone });
        onOpenChange(false);
        toast("Cliente guardado en este dispositivo. Se enviará al volver la señal.");
        return;
      }
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
