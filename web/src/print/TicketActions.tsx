import { MessageCircle, Printer } from "lucide-react";
import { useBusinessSettings, DEFAULT_SETTINGS } from "../lib/settings";
import { ticketText, whatsappUrl, type TicketData } from "../lib/ticket";
import { Button } from "../ui/Button";
import { printTicket } from "./Ticket";

/** Botones "Imprimir ticket" y "Enviar por WhatsApp" (al teléfono del cliente si se conoce). */
export function TicketActions({ ticket, className = "" }: { ticket: TicketData | null; className?: string }) {
  const settings = useBusinessSettings();
  const s = settings.data ?? DEFAULT_SETTINGS;
  if (!ticket) return null;
  return (
    <div className={`grid gap-2 sm:grid-cols-2 ${className}`}>
      <Button variant="ghost" onClick={() => printTicket(ticket, s)}>
        <Printer className="size-5" aria-hidden /> Imprimir ticket
      </Button>
      <a
        href={whatsappUrl(ticketText(ticket, s), ticket.clientPhone)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line px-5 font-semibold hover:bg-surface"
      >
        <MessageCircle className="size-5" aria-hidden /> Enviar por WhatsApp
      </a>
    </div>
  );
}
