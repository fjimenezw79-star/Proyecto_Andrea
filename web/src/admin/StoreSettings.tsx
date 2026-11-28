import * as Switch from "@radix-ui/react-switch";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, MessageCircle, UploadCloud } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { dateTimeMx } from "../lib/opTypes";
import { useStoreStatus, type BusinessSettings } from "../lib/settings";
import { Button } from "../ui/Button";
import { Field } from "../ui/Input";
import { useToast } from "../ui/Toast";

type Props = { form: BusinessSettings; set: (k: keyof BusinessSettings, v: string | number | boolean) => void; errors: Record<string, string> };

/** Enlace de la tienda en línea, su publicación en Cloudflare y los textos que muestra. */
export function StoreSettings({ form, set, errors }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const st = useStoreStatus();
  const [busy, setBusy] = useState(false);
  const url = st.data?.public_url ?? "";
  const cloud = st.data?.cloud;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast("Enlace copiado.", "ok");
    } catch {
      window.prompt("Copia el enlace:", url);
    }
  }
  async function publish() {
    setBusy(true);
    try {
      const d = await api<{ message: string }>("/api/store/publish", { method: "POST" });
      toast(d.message, "ok");
      setTimeout(() => qc.invalidateQueries({ queryKey: ["store-status"] }), 5000);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo publicar.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-3xl bg-surface p-5">
        <p className="text-sm text-muted">Dirección de la tienda</p>
        <p className="break-all font-serif text-2xl leading-tight" data-testid="store-url">{url || "…"}</p>
        <div className="flex flex-wrap gap-2">
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 font-semibold text-paper"><ExternalLink className="size-4" aria-hidden /> Abrir tienda</a>
          <Button type="button" variant="ghost" onClick={copy}><Copy className="size-4" aria-hidden /> Copiar enlace</Button>
          <a href={`https://wa.me/?text=${encodeURIComponent(`Mira nuestro catálogo y pide por WhatsApp: ${url}`)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-5 font-semibold hover:bg-paper"><MessageCircle className="size-4" aria-hidden /> Enviar por WhatsApp</a>
        </div>
        {cloud?.configured ? (
          <div className="grid gap-2 text-sm">
            <p className="text-muted">Publicada en Cloudflare: funciona aunque esta computadora esté apagada. Se actualiza sola al cambiar productos, precios, fotos o existencias.</p>
            <p className="tnum">{cloud.publishing ? "Publicando…" : cloud.last_publish ? `Última publicación: ${dateTimeMx(cloud.last_publish)}` : "Todavía no se publica."}</p>
            {cloud.last_error && <p role="alert" className="font-semibold text-danger">Último error: {cloud.last_error}</p>}
            <Button type="button" variant="ghost" className="justify-self-start" disabled={busy || cloud.publishing} onClick={publish}><UploadCloud className="size-4" aria-hidden /> Publicar ahora</Button>
          </div>
        ) : (
          <p className="text-sm text-muted">
            La tienda se sirve desde esta computadora: solo funciona mientras el sistema está abierto, y desde internet con <code>acceso_remoto.bat</code> (en modo prueba el enlace cambia en cada inicio).
            Para que funcione con la PC apagada, configura Cloudflare Pages en <code>.env</code> (ver el manual).
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid content-start gap-1.5 text-sm font-semibold">
          Frase de portada
          <textarea value={form.store_tagline} maxLength={120} rows={3} onChange={(e) => set("store_tagline", e.target.value)} className="rounded-xl border border-line bg-paper px-3.5 py-2.5 text-base font-normal" />
          <span className="font-normal text-muted">Cada renglón es una línea; la última sale en cursiva.</span>
        </label>
        <label className="grid content-start gap-1.5 text-sm font-semibold">
          Texto de presentación
          <textarea value={form.store_intro} maxLength={300} rows={3} onChange={(e) => set("store_intro", e.target.value)} className="rounded-xl border border-line bg-paper px-3.5 py-2.5 text-base font-normal" />
        </label>
        <Field label="Horario" value={form.business_hours} maxLength={120} onChange={(e) => set("business_hours", e.target.value)} error={errors.business_hours} placeholder="Lunes a sábado de 10 a 20 h" />
        <label className="flex items-center gap-3 self-end pb-2 font-semibold">
          <Switch.Root checked={form.store_hide_sold_out} onCheckedChange={(v) => set("store_hide_sold_out", v)} className="relative h-7 w-12 shrink-0 rounded-full bg-line transition-colors data-[state=checked]:bg-ink">
            <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-paper shadow transition-transform data-[state=checked]:translate-x-[22px]" />
          </Switch.Root>
          Ocultar los productos agotados
        </label>
      </div>
      <p className="text-sm text-muted">Pago con tarjeta en línea: preparado para activarse más adelante (por ejemplo con Mercado Pago). Por ahora el cliente paga al recoger o al recibir.</p>
    </div>
  );
}
