import { formatMoney } from "../lib/money";
import type { BusinessSettings } from "../lib/settings";
import { shortDate, ticketDate, type TicketData } from "../lib/ticket";
import { printNow } from "./printNow";

const row = "flex justify-between gap-2";

/** Ticket para impresora térmica de 58 u 80 mm: letra grande, sin colores, todo en una columna. */
export function Ticket({ t, s }: { t: TicketData; s: BusinessSettings }) {
  const wide = s.ticket_width_mm >= 70;
  return (
    <div data-ticket={t.folio} style={{ width: `${s.ticket_width_mm}mm`, padding: "3mm 3mm 6mm", boxSizing: "border-box", fontSize: wide ? "12px" : "11px", lineHeight: 1.35, color: "#000", background: "#fff", fontFamily: "var(--font-sans)" }}>
      <div className="text-center">
        <p style={{ fontFamily: "var(--font-serif)", fontSize: wide ? "26px" : "22px", lineHeight: 1 }}>{s.business_name}</p>
        {s.business_subtitle && <p style={{ fontSize: "0.95em", letterSpacing: "0.2em", textTransform: "uppercase" }}>{s.business_subtitle}</p>}
        {s.address && <p>{s.address}</p>}
        {s.whatsapp && <p>WhatsApp {s.whatsapp}</p>}
      </div>
      <hr style={{ border: 0, borderTop: "1px dashed #000", margin: "2mm 0" }} />
      <p className="font-bold">{t.kind === "layaway" ? "Apartado" : "Venta"} {t.folio}</p>
      <p>{ticketDate(t.date)}</p>
      {t.seller && <p>Atendió: {t.seller}</p>}
      {t.client && <p>Cliente: {t.client}</p>}
      {t.status === "cancelled" && <p className="font-bold">*** CANCELADO ***</p>}
      <hr style={{ border: 0, borderTop: "1px dashed #000", margin: "2mm 0" }} />
      {t.lines.map((l, i) => (
        <div key={i} style={{ marginBottom: "1mm" }}>
          <p>{l.name}{l.variant ? ` · ${l.variant}` : ""}</p>
          <p className={row}><span className="tnum">{l.qty} × {formatMoney(l.unitCents)}</span><span className="tnum">{formatMoney(l.unitCents * l.qty)}</span></p>
          {l.discountCents > 0 && <p className={row}><span>Descuento</span><span className="tnum">−{formatMoney(l.discountCents)}</span></p>}
        </div>
      ))}
      <hr style={{ border: 0, borderTop: "1px dashed #000", margin: "2mm 0" }} />
      {t.discountCents > 0 && (
        <>
          <p className={row}><span>Subtotal</span><span className="tnum">{formatMoney(t.subtotalCents)}</span></p>
          <p className={row}><span>Descuento</span><span className="tnum">−{formatMoney(t.discountCents)}</span></p>
        </>
      )}
      {!!t.shippingCents && <p className={row}><span>Envío</span><span className="tnum">{formatMoney(t.shippingCents)}</span></p>}
      <p className={row} style={{ fontSize: "1.45em", fontWeight: 800 }}><span>Total</span><span className="tnum">{formatMoney(t.totalCents)}</span></p>
      {t.layaway ? (
        <>
          <p className="mt-1 font-bold">Abonos</p>
          {t.payments.map((p, i) => (
            <p key={i} className={row}><span>{p.date ? shortDate(p.date) : ""} · {p.label}</span><span className="tnum">{formatMoney(p.amountCents)}</span></p>
          ))}
          <p className={row}><span>Pagado</span><span className="tnum">{formatMoney(t.layaway.paidCents)}</span></p>
          {t.status === "pending" && (
            <>
              <p className={row} style={{ fontSize: "1.2em", fontWeight: 800 }}><span>Resta</span><span className="tnum">{formatMoney(t.layaway.balanceCents)}</span></p>
              <p>Fecha límite: {shortDate(t.layaway.deadline)}</p>
            </>
          )}
          {t.status === "settled" && <p className="font-bold">Liquidado</p>}
        </>
      ) : (
        <>
          {t.payments.map((p, i) => <p key={i} className={row}><span>{p.label}</span><span className="tnum">{formatMoney(p.amountCents)}</span></p>)}
          {t.changeCents > 0 && <p className={row}><span>Cambio</span><span className="tnum">{formatMoney(t.changeCents)}</span></p>}
        </>
      )}
      {t.pending && <p style={{ marginTop: "2mm" }}>Folio provisional: la venta se registró sin señal y se enviará al volver.</p>}
      {s.ticket_footer && <p className="text-center" style={{ marginTop: "3mm" }}>{s.ticket_footer}</p>}
    </div>
  );
}

export function printTicket(t: TicketData, s: BusinessSettings): Promise<void> {
  // el alto del papel lo pone el rollo de la impresora; solo se quitan los márgenes
  return printNow(<Ticket t={t} s={s} />, "@page { margin: 0; }");
}
