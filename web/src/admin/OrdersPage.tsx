import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ExternalLink, MessageCircle, PackageCheck, Truck } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { formatMoney, parsePesos } from "../lib/money";
import { dateTimeMx } from "../lib/opTypes";
import { saleTicket, whatsappUrl, type SaleForTicket } from "../lib/ticket";
import { TicketActions } from "../print/TicketActions";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Dialog";
import { Field } from "../ui/Input";
import { PayFields, payToApi, type PayValue } from "../ui/PayFields";
import { useToast } from "../ui/Toast";

export type OrderStatus = "pending" | "confirmed" | "paid" | "rejected";
export type OnlineOrder = {
  id: string; folio: string; created_at: string; source: string; customer_name: string; phone: string;
  delivery: "pickup" | "shipping"; address: string; note: string; status: OrderStatus; reason: string | null;
  items: { variant_id: number; sku: string; name: string; variant: string; qty: number; unit_price_cents: number; available: boolean }[];
  subtotal_cents: number; shipping_cents: number; total_cents: number; sale_id: string | null;
};
type Counts = Record<OrderStatus, number>;

const TABS: { id: OrderStatus; label: string }[] = [
  { id: "pending", label: "Pendientes" },
  { id: "confirmed", label: "Confirmados" },
  { id: "paid", label: "Cobrados" },
  { id: "rejected", label: "Rechazados" },
];
const STATUS_LABEL: Record<OrderStatus, string> = { pending: "Pendiente", confirmed: "Confirmado · piezas apartadas", paid: "Cobrado", rejected: "Rechazado" };

/** Pedidos de la tienda en línea: confirmar (aparta piezas), cobrar (venta) o rechazar. */
export function OrdersPage() {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<OrderStatus>("pending");
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["online-orders", tab],
    queryFn: () => api<{ orders: OnlineOrder[]; counts: Counts }>(`/api/online-orders?status=${tab}`),
    refetchInterval: 30_000,
  });
  const list = q.data?.orders ?? [];
  const open = list.find((o) => o.id === openId) ?? null;

  return (
    <section className="px-4 pb-16 pt-6 md:px-8">
      <h1 className="font-serif text-5xl leading-none md:text-6xl">Pedidos en línea</h1>
      <p className="mt-2 max-w-prose text-muted">Llegan de la tienda en línea. Confírmalos para apartar las piezas, cóbralos cuando el cliente pague o recoja, o recházalos.</p>
      <div role="tablist" aria-label="Estado" className="my-6 flex gap-1 overflow-x-auto rounded-full bg-surface p-1 [scrollbar-width:none] sm:inline-flex">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`relative min-h-10 shrink-0 rounded-full px-4 font-semibold ${tab === t.id ? "text-paper" : ""}`}>
            {tab === t.id && <motion.span layoutId="orders-tab" className="absolute inset-0 rounded-full bg-ink" />}
            <span className="relative">{t.label}{q.data?.counts[t.id] ? ` · ${q.data.counts[t.id]}` : ""}</span>
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <p className="text-muted">Cargando…</p>
      ) : list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-muted">{tab === "pending" ? "No hay pedidos nuevos. Comparte la tienda desde Configuración." : "Nada por aquí."}</p>
      ) : (
        <ul aria-label="Pedidos" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {list.map((o, i) => (
              <motion.li key={o.id} layout={!reduce} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : Math.min(i, 8) * 0.03 }}>
                <button onClick={() => setOpenId(o.id)} className="grid w-full gap-2 rounded-3xl border border-line p-5 text-left hover:bg-surface" aria-label={`Pedido ${o.folio} de ${o.customer_name}`}>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-serif text-3xl">{o.folio}</span>
                    <span className="tnum text-lg font-bold">{formatMoney(o.total_cents)}</span>
                  </span>
                  <span className="font-semibold">{o.customer_name}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                    <span>{dateTimeMx(o.created_at)}</span>
                    <span className="inline-flex items-center gap-1">{o.delivery === "shipping" ? <><Truck className="size-4" aria-hidden /> Envío</> : <><PackageCheck className="size-4" aria-hidden /> Recoge</>}</span>
                    <span>{o.items.reduce((s, it) => s + it.qty, 0)} pzas</span>
                  </span>
                  {o.items.some((it) => !it.available) && o.status === "pending" && <span className="text-sm font-semibold text-wine">Alguna pieza no alcanzaba al pedir</span>}
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      <OrderDialog order={open} onClose={() => setOpenId(null)} />
    </section>
  );
}

function OrderDialog({ order: o, onClose }: { order: OnlineOrder | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState<"view" | "confirm" | "charge" | "reject">("view");
  const [shipping, setShipping] = useState("");
  const [pay, setPay] = useState<PayValue>({ method: "cash", amount: "", received: "" });
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sale, setSale] = useState<SaleForTicket | null>(null);
  const close = () => { setStep("view"); setError(null); setSale(null); setReason(""); setShipping(""); onClose(); };

  async function run(path: string, json: unknown, after?: (d: { sale?: SaleForTicket }) => void) {
    setBusy(true);
    setError(null);
    try {
      const d = await api<{ message: string; sale?: SaleForTicket }>(path, { method: "POST", json });
      toast(d.message, "ok");
      qc.invalidateQueries({ queryKey: ["online-orders"] });
      qc.invalidateQueries({ queryKey: ["online-counts"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      if (after) after(d);
      else close();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  if (!o && !sale) return <Modal open={false} onOpenChange={() => undefined} title="">{null}</Modal>;
  const greet = o ? `Hola ${o.customer_name}, te escribimos de la tienda por tu pedido ${o.folio}.` : "";

  return (
    <Modal open={!!o || !!sale} onOpenChange={(v) => !v && close()} title={o ? `Pedido ${o.folio}` : "Pedido cobrado"} wide>
      {sale ? (
        <div className="grid gap-4">
          <p className="text-muted">Quedó registrado como venta #{sale.folio}.</p>
          <TicketActions ticket={saleTicket(sale)} />
          <Button onClick={close}>Listo</Button>
        </div>
      ) : o && (
        <div className="grid gap-5">
          <p className="rounded-full bg-surface px-4 py-1.5 text-sm font-semibold justify-self-start">{STATUS_LABEL[o.status]}{o.reason ? ` · ${o.reason}` : ""}</p>
          <div className="grid gap-1">
            <p className="text-lg font-semibold">{o.customer_name}</p>
            <p className="text-muted">WhatsApp {o.phone} · {dateTimeMx(o.created_at)}</p>
            <p className="text-muted">{o.delivery === "shipping" ? `Envío a: ${o.address}` : "Recoge en tienda"}</p>
            {o.note && <p className="text-muted">Nota: {o.note}</p>}
            <a href={whatsappUrl(greet, o.phone)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 justify-self-start font-semibold underline">
              <MessageCircle className="size-4" aria-hidden /> Escribirle por WhatsApp <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line" aria-label="Artículos del pedido">
            {o.items.map((it) => (
              <li key={it.variant_id} className="flex justify-between gap-3 bg-paper px-4 py-2.5">
                <span>{it.qty} × {it.name}{it.variant && it.variant !== "Única" ? ` · ${it.variant}` : ""} <span className="text-sm text-muted">{it.sku}</span></span>
                <span className="tnum font-semibold">{formatMoney(it.qty * it.unit_price_cents)}</span>
              </li>
            ))}
          </ul>
          <dl className="grid gap-1">
            {o.shipping_cents > 0 && <div className="flex justify-between text-muted"><dt>Envío</dt><dd className="tnum">{formatMoney(o.shipping_cents)}</dd></div>}
            <div className="flex justify-between text-xl font-bold"><dt>Total</dt><dd className="tnum">{formatMoney(o.total_cents)}</dd></div>
          </dl>

          {step === "confirm" && (
            <div className="grid gap-3 rounded-2xl bg-surface p-4">
              <p>Se apartan las piezas del inventario.</p>
              {o.delivery === "shipping" && <Field label="Costo de envío" inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0" hint="Avísale al cliente el total con envío." />}
              <Button disabled={busy} onClick={() => { const c = shipping.trim() ? parsePesos(shipping) : 0; if (c === null) return setError("Escribe un costo válido."); run(`/api/online-orders/${o.id}/confirm`, { shipping_cents: c }); }}>Confirmar y apartar</Button>
            </div>
          )}
          {step === "charge" && (
            <div className="grid gap-3 rounded-2xl bg-surface p-4">
              <PayFields value={pay} onChange={setPay} amountLabel="Monto a cobrar" />
              <Button variant="wine" disabled={busy} onClick={() => { const p = payToApi(pay); if (!p) return setError("Escribe el monto."); run(`/api/online-orders/${o.id}/charge`, { payments: [p] }, (d) => d.sale && setSale(d.sale)); }}>Registrar cobro</Button>
            </div>
          )}
          {step === "reject" && (
            <div className="grid gap-3 rounded-2xl bg-surface p-4">
              <Field label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. el cliente ya no lo quiere" />
              <Button variant="danger" disabled={busy} onClick={() => run(`/api/online-orders/${o.id}/reject`, { reason })}>Rechazar pedido</Button>
            </div>
          )}
          {error && <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">{error}</p>}
          {step === "view" && (o.status === "pending" || o.status === "confirmed") && (
            <div className="grid gap-2 sm:grid-cols-2">
              {o.status === "pending" && <Button onClick={() => setStep("confirm")}>Confirmar</Button>}
              {o.status === "confirmed" && <Button variant="wine" onClick={() => { setPay({ method: "cash", amount: (o.total_cents / 100).toFixed(2), received: "" }); setStep("charge"); }}>Cobrar</Button>}
              <Button variant="ghost" onClick={() => setStep("reject")}>Rechazar</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
