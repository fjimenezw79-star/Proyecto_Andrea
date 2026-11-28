import { AlertTriangle, CloudUpload, Download, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Dialog";
import { useOffline } from "./OfflineProvider";
import { discard, retry } from "./queue";

const when = (iso: string) => new Date(iso).toLocaleString("es-MX", { weekday: "short", hour: "2-digit", minute: "2-digit" });

export function PendingSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { items, online, flush } = useOffline();
  const [busy, setBusy] = useState(false);
  const [discarding, setDiscarding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [discardError, setDiscardError] = useState<string | null>(null);

  function backup() {
    const blob = new Blob([JSON.stringify({ exportado: new Date().toISOString(), pendientes: items }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pendientes-modas-andrea-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function sendNow() {
    setBusy(true);
    try {
      await flush();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Pendientes de enviar">
      <p className="mb-4 text-muted">
        {online ? "Se envían solos en orden. Si alguno tiene un problema, revísalo aquí." : "Están guardados en este dispositivo y se enviarán solos al volver la señal."}
      </p>
      {items.length === 0 ? (
        <p className="rounded-2xl bg-surface px-4 py-6 text-center text-muted">No hay nada pendiente.</p>
      ) : (
        <ul className="grid max-h-[50vh] gap-2 overflow-y-auto">
          {items.map((i) => (
            <li key={i.uid} className={`rounded-2xl border px-4 py-3 ${i.status === "problem" ? "border-danger/40 bg-danger/5" : "border-line"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{i.label}</p>
                  <p className="text-sm text-muted">{when(i.createdAt)}{i.tries > 0 && i.status === "pending" ? ` · ${i.tries} ${i.tries === 1 ? "intento" : "intentos"}` : ""}</p>
                </div>
                {i.status === "problem" ? <AlertTriangle className="size-5 shrink-0 text-danger" aria-label="Con problema" /> : <CloudUpload className="size-5 shrink-0 text-muted" aria-label="En espera" />}
              </div>
              {i.status === "problem" && (
                <div className="mt-2 grid gap-2">
                  <p role="alert" className="text-sm font-semibold text-danger">{i.message}</p>
                  {discarding === i.uid ? (
                    <form
                      className="grid gap-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!reason.trim()) return;
                        setDiscardError(null);
                        try {
                          // queda constancia en la bitácora del servidor antes de borrarla del dispositivo
                          await api("/api/audit/discard", { method: "POST", json: { label: i.label, reason: reason.trim(), kind: i.kind, payload: i.json } });
                        } catch (err) {
                          return setDiscardError(err instanceof ApiError ? err.message : "No se pudo descartar.");
                        }
                        await discard(i.uid, reason.trim());
                        setDiscarding(null);
                        setReason("");
                      }}
                    >
                      <label className="grid gap-1 text-sm font-semibold">
                        ¿Por qué se descarta?
                        <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus className="min-h-11 rounded-xl border border-line bg-paper px-3 font-normal" />
                      </label>
                      {discardError && <p role="alert" className="text-sm font-semibold text-danger">{discardError}</p>}
                      <div className="flex gap-2">
                        <Button type="button" variant="quiet" onClick={() => setDiscarding(null)}>Cancelar</Button>
                        <Button type="submit" variant="wine" disabled={!reason.trim()}>Descartar</Button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => retry(i.uid)}><RotateCcw className="size-4" aria-hidden /> Reintentar</Button>
                      <Button variant="quiet" onClick={() => setDiscarding(i.uid)}><Trash2 className="size-4" aria-hidden /> Descartar</Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <Button className="mt-4 w-full" variant="ghost" onClick={backup}>
          <Download className="size-4" aria-hidden /> Guardar respaldo de pendientes
        </Button>
      )}
      {items.some((i) => i.status === "pending") && (
        <Button className="mt-4 w-full" size="lg" disabled={busy || !online} onClick={sendNow}>
          {busy ? "Enviando…" : online ? "Enviar ahora" : "Sin señal"}
        </Button>
      )}
    </Modal>
  );
}
