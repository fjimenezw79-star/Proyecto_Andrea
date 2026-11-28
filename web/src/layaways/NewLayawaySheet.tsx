import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { api, ApiError } from "../lib/api";
import { provisionalFolio } from "../offline/cache";
import { isNetworkError, queueAction } from "../offline/offlineAction";
import { useOffline } from "../offline/OfflineProvider";
import { clientHeaders, nowLocalIso } from "../offline/queue";
import type { Cart } from "../lib/cart";
import { totals } from "../lib/cart";
import { formatMoney } from "../lib/money";
import type { Layaway } from "../lib/opTypes";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Dialog";
import { PayFields, payToApi, type PayValue } from "../ui/PayFields";

function plusDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function NewLayawaySheet({ open, cart, onClose, onDone }: { open: boolean; cart: Cart; onClose: () => void; onDone: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { markOffline } = useOffline();
  const t = totals(cart);
  const [pay, setPay] = useState<PayValue>({ method: "cash", amount: "", received: "" });
  const [deadline, setDeadline] = useState(plusDays(30));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Layaway | null>(null);
  useEffect(() => { if (open) { setPay({ method: "cash", amount: "", received: "" }); setDeadline(plusDays(30)); setError(null); setDone(null); } }, [open]);

  async function save() {
    const p = payToApi(pay);
    if (!p) return setError("Escribe el anticipo.");
    setBusy(true);
    setError(null);
    const json = { id: cart.id, client_id: cart.clientId, items: cart.lines.map((l) => ({ variant_id: l.variantId, qty: l.qty, discount_cents: l.discountCents })), discount_cents: cart.discountCents, deadline, payments: [p] };
    const clientTime = nowLocalIso();
    try {
      const d = await api<{ layaway: Layaway }>("/api/layaways", { method: "POST", json, headers: clientHeaders(cart.id, clientTime) });
      setDone(d.layaway);
    } catch (e) {
      if (isNetworkError(e)) {
        markOffline();
        const folio = provisionalFolio(cart.id);
        await queueAction(
          qc,
          { uid: cart.id, user: user!.id, kind: "layaway", label: `Apartado ${folio} · ${cart.client?.name ?? ""}`, path: "/api/layaways", json, clientTime, stock: Object.fromEntries(cart.lines.map((l) => [l.variantId, l.qty])) },
          Object.fromEntries(cart.lines.map((l) => [l.variantId, l.stock])),
        );
        setDone({ id: cart.id, folio, client_name: cart.client?.name ?? "", deadline, balance_cents: Math.max(0, t.total - p.amount_cents), offline: true } as unknown as Layaway);
        return;
      }
      setError(e instanceof ApiError ? e.message : "No se pudo guardar el apartado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={(o) => !o && !busy && (done ? onDone() : onClose())} title="Apartar">
      {done ? (
        <div className="grid justify-items-center gap-3 py-4 text-center">
          <CheckCircle2 className="size-14 text-ok" aria-hidden />
          <h2 className="font-serif text-5xl">Apartado #{done.folio}</h2>
          {(done as Layaway & { offline?: boolean }).offline && (
            <p role="status" className="rounded-2xl bg-wine/10 px-4 py-2 text-sm font-semibold text-wine">Apartado guardado en este dispositivo. Se enviará al volver la señal.</p>
          )}
          <p className="text-muted">{done.client_name} · vence el {new Date(`${done.deadline}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}</p>
          <p className="tnum rounded-2xl bg-surface px-6 py-3 font-serif text-3xl">Saldo {formatMoney(done.balance_cents)}</p>
          <div className="mt-2 grid w-full gap-2 sm:grid-cols-2">
            {!(done as Layaway & { offline?: boolean }).offline && <Button variant="ghost" onClick={() => { onDone(); navigate(`/apartados/${done.id}`); }}>Ver apartado</Button>}
            <Button onClick={onDone} autoFocus>Nueva venta</Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-5">
          <p className="flex items-baseline justify-between"><span className="text-muted">{cart.client?.name} · {t.pieces} {t.pieces === 1 ? "pieza" : "piezas"}</span><span className="tnum font-serif text-4xl">{formatMoney(t.total)}</span></p>
          <PayFields value={pay} onChange={setPay} amountLabel="Anticipo" creditCents={cart.client?.creditCents ?? 0} />
          <label className="grid gap-1.5 text-sm font-semibold">
            Fecha límite
            <input type="date" value={deadline} min={plusDays(0)} onChange={(e) => setDeadline(e.target.value)} className="min-h-11 rounded-xl border border-line bg-paper px-3 font-normal" />
          </label>
          {error && <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">{error}</p>}
          <Button size="lg" variant="wine" onClick={save} disabled={busy}>{busy ? "Guardando…" : "Guardar apartado"}</Button>
        </div>
      )}
    </Modal>
  );
}
