import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { Check, Copy, Globe, Info, MessageCircle, Smartphone, Wifi } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { Button } from "../ui/Button";

type Conn = { url: string; kind: "fixed" | "tunnel" | "lan"; lan_url: string; offline_capable: boolean; temporary: boolean };

const NOTICE: Record<Conn["kind"], { icon: typeof Wifi; title: string; text: string }> = {
  lan: {
    icon: Wifi,
    title: "Solo en la red del negocio",
    text: "Este enlace funciona con los dispositivos conectados al mismo Wi-Fi. Así la app no se guarda en el celular ni trabaja sin señal. Para conectarse desde cualquier lugar, inicia el sistema con acceso_remoto.bat.",
  },
  tunnel: {
    icon: Globe,
    title: "Enlace temporal por internet",
    text: "Funciona desde cualquier lugar con conexión segura, pero cambia cada vez que se inicia acceso_remoto.bat. Después de reiniciar, comparte el enlace nuevo.",
  },
  fixed: { icon: Globe, title: "Enlace fijo del negocio", text: "Funciona desde cualquier lugar con conexión segura y no cambia." },
};

export function ConnectPage() {
  const reduce = useReducedMotion();
  const q = useQuery({ queryKey: ["connect"], queryFn: () => api<Conn>("/api/connect"), refetchInterval: 15_000 });
  const [copied, setCopied] = useState(false);
  const c = q.data;

  async function copy() {
    if (!c) return;
    try {
      await navigator.clipboard.writeText(c.url);
    } catch {
      const t = document.createElement("textarea");
      t.value = c.url;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (q.isLoading || !c) return <p className="p-8 text-muted">Cargando…</p>;
  const n = NOTICE[c.kind];
  const wa = `https://wa.me/?text=${encodeURIComponent(`Entra al sistema de Modas Andrea desde tu celular: ${c.url}`)}`;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 md:px-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">Administrador</p>
      <h1 className="mb-8 font-serif text-5xl leading-none md:text-6xl">Conectar dispositivo</h1>
      <div className="grid gap-8 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <motion.figure
          initial={reduce ? false : { opacity: 0, y: 12, rotate: -1.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          className="grid justify-items-center gap-3 self-start rounded-[2rem] border border-line bg-white p-6 shadow-[0_30px_60px_-30px_rgba(23,20,15,0.35)]"
        >
          <img key={c.url} src={`/api/connect/qr.svg?u=${encodeURIComponent(c.url)}`} alt={`Código QR del enlace ${c.url}`} className="aspect-square w-full max-w-[280px]" />
          <figcaption className="text-center text-sm text-[#6B665E]">Escanéalo con la cámara del celular o tablet</figcaption>
        </motion.figure>

        <div className="grid content-start gap-6">
          <div className="grid gap-2">
            <label htmlFor="connect-url" className="text-sm font-semibold">Enlace</label>
            <div className="flex flex-wrap gap-2">
              <input id="connect-url" readOnly value={c.url} onFocus={(e) => e.target.select()} className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 font-mono text-sm" />
              <Button variant="ghost" onClick={copy} aria-live="polite">
                {copied ? <Check className="size-5" aria-hidden /> : <Copy className="size-5" aria-hidden />} {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <a href={wa} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 font-semibold text-paper hover:opacity-90">
              <MessageCircle className="size-5" aria-hidden /> Enviar por WhatsApp
            </a>
          </div>

          <div className={`flex gap-3 rounded-2xl p-4 ${c.kind === "fixed" ? "bg-surface" : "bg-wine/10"}`}>
            <n.icon className={`mt-0.5 size-5 shrink-0 ${c.kind === "fixed" ? "text-ink" : "text-wine"}`} aria-hidden />
            <div>
              <p className="font-semibold">{n.title}</p>
              <p className="text-muted">{n.text}</p>
              {c.kind !== "lan" && <p className="mt-1 text-sm text-muted">En la red del negocio también sirve: <span className="font-mono">{c.lan_url}</span></p>}
            </div>
          </div>

          <section aria-labelledby="install-title" className="grid gap-4">
            <h2 id="install-title" className="font-serif text-3xl">Instalar la app en el celular</h2>
            {!c.offline_capable && (
              <p className="flex gap-2 text-sm text-muted"><Info className="mt-0.5 size-4 shrink-0" aria-hidden /> Instalarla y trabajar sin señal requiere el enlace por internet (https).</p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Steps title="Android (Chrome)" steps={["Abre el enlace o escanea el código.", "Inicia sesión con tu usuario.", "Toca el menú ⋮ y elige Instalar app (o Agregar a la pantalla principal).", "Abre Modas Andrea desde el ícono."]} />
              <Steps title="iPhone (Safari)" steps={["Abre el enlace en Safari.", "Inicia sesión con tu usuario.", "Toca Compartir y elige Agregar a inicio.", "Abre Modas Andrea desde el ícono."]} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Steps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="mb-2 flex items-center gap-2 font-semibold"><Smartphone className="size-5" aria-hidden /> {title}</p>
      <ol className="grid list-decimal gap-1 pl-5 text-muted">
        {steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
    </div>
  );
}
