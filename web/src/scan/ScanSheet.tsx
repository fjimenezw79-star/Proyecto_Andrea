import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { Camera, ImagePlus, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { Product, Variant } from "../lib/types";
import { loadCatalog } from "../offline/cache";
import { Button } from "../ui/Button";
import { embed } from "../vision/embedder";
import { topProducts } from "../vision/vector";
import { useVisionIndex } from "../vision/visionIndex";
import { getFrameReader } from "./barcode";
import { PhotoMatches, type Candidate } from "./PhotoMatches";
import { useCamera } from "./useCamera";

export type ScanMode = "code" | "photo";
type AiStatus = { enabled: boolean; used: number; limit: number };
const SHOWN = 3;
const SENT_TO_AI = 8;

async function productsById(ids: number[]): Promise<Map<number, Product>> {
  const c = await loadCatalog();
  const map = new Map((c?.products ?? []).filter((p) => ids.includes(p.id)).map((p) => [p.id, p]));
  await Promise.all(ids.filter((id) => !map.has(id)).map(async (id) => {
    try {
      map.set(id, (await api<{ product: Product }>(`/api/products/${id}`)).product);
    } catch {
      /* producto borrado o sin señal: se omite */
    }
  }));
  return map;
}

function toDataUrl(src: HTMLCanvasElement | ImageBitmap | HTMLVideoElement): string {
  const [w, h] = src instanceof HTMLVideoElement ? [src.videoWidth, src.videoHeight] : [src.width, src.height];
  const k = Math.min(1, 1024 / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

function snapshot(v: HTMLVideoElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext("2d")!.drawImage(v, 0, 0);
  return c;
}

/**
 * Escáner con la cámara.
 * - "Código": lee códigos de barras; `onCode` devuelve true si lo encontró (y se cierra).
 * - "Por foto": muestra los 3 productos más parecidos y, si se pide, la sugerencia de la IA.
 */
export function ScanSheet({ open, onOpenChange, onCode, onPick, modes = ["code", "photo"] }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCode: (code: string) => Promise<boolean>;
  onPick?: (p: Product, v: Variant) => void;
  modes?: ScanMode[];
}) {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<ScanMode>(modes[0]);
  const { videoRef, status } = useCamera(open);
  const bounce = useAnimationControls();
  const [hint, setHint] = useState<string | null>(null);
  const busy = useRef(false);
  const lastCode = useRef<{ code: string; at: number } | null>(null);

  // modo "por foto"
  const index = useVisionIndex(open && modes.includes("photo"));
  const [phase, setPhase] = useState<"idle" | "thinking" | "results">("idle");
  const [matches, setMatches] = useState<Candidate[]>([]);
  const [pool, setPool] = useState<number[]>([]);
  const frame = useRef<HTMLCanvasElement | ImageBitmap | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const ai = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => api<AiStatus>("/api/vision/ai"),
    enabled: open && mode === "photo",
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (open) {
      setMode(modes[0]);
      setPhase("idle");
      setMatches([]);
      setHint(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // lectura continua de códigos
  useEffect(() => {
    if (!open || mode !== "code" || status !== "live") return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const v = videoRef.current;
      if (v && !busy.current) {
        busy.current = true;
        try {
          const reader = await getFrameReader();
          const code = await reader.read(v);
          const now = Date.now();
          if (code && !(lastCode.current?.code === code && now - lastCode.current.at < 2500)) {
            lastCode.current = { code, at: now };
            navigator.vibrate?.(40);
            bounce.start({ scale: [1, 1.06, 1], transition: { duration: reduce ? 0 : 0.35 } });
            const found = await onCode(code);
            if (found) onOpenChange(false);
            else setHint(`No encontramos el código ${code}.`);
          }
        } catch {
          /* cuadro ilegible: se intenta con el siguiente */
        } finally {
          busy.current = false;
        }
      }
      if (!stop) setTimeout(tick, 160);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [open, mode, status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function identify(src: HTMLCanvasElement | ImageBitmap) {
    frame.current = src;
    setPhase("thinking");
    setHint(null);
    try {
      const items = index.data ?? [];
      if (!items.length) throw new Error("Todavía no hay fotos preparadas para reconocer. El administrador las prepara en Configuración.");
      const q = await embed(src, 0.85);
      const top = topProducts(items, q, SENT_TO_AI);
      const byId = await productsById(top.map((t) => t.product_id));
      const list = top.filter((t) => byId.has(t.product_id)).map((t) => ({ product: byId.get(t.product_id)!, score: t.score }));
      setPool(list.map((c) => c.product.id));
      setMatches(list);
      setPhase("results");
    } catch (e) {
      setHint(e instanceof Error ? e.message : "No se pudo revisar la foto.");
      setPhase("idle");
    }
  }

  async function askAi() {
    if (!frame.current) return;
    setAiBusy(true);
    setHint(null);
    try {
      const d = await api<{ match: number | null; reason: string }>("/api/vision/ai", { method: "POST", json: { image: toDataUrl(frame.current), candidates: pool } });
      ai.refetch();
      if (d.match === null) {
        setHint(`La IA no encontró el producto entre los parecidos. ${d.reason}`.trim());
        return;
      }
      setMatches((ms) => {
        const hit = ms.find((m) => m.product.id === d.match);
        return hit ? [{ ...hit, ai: d.reason }, ...ms.filter((m) => m !== hit)] : ms;
      });
    } catch (e) {
      setHint(e instanceof ApiError ? e.message : "La IA no respondió.");
    } finally {
      setAiBusy(false);
    }
  }

  const shown = matches.slice(0, SHOWN).concat(matches.slice(SHOWN).filter((m) => m.ai !== undefined));
  const canAi = !!ai.data?.enabled && navigator.onLine && phase === "results" && pool.length > 0 && !matches.some((m) => m.ai !== undefined);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content aria-describedby={undefined} className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-paper md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[92dvh] md:w-[min(620px,calc(100vw-48px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl">
          <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-[calc(env(safe-area-inset-top,0px)+16px)]">
            <Dialog.Title className="font-serif text-4xl">Escanear</Dialog.Title>
            <Dialog.Close className="grid size-11 place-items-center rounded-full bg-surface" aria-label="Cerrar escáner"><X className="size-5" aria-hidden /></Dialog.Close>
          </div>
          {modes.length > 1 && (
            <div role="tablist" aria-label="Cómo buscar" className="mx-5 mb-3 grid grid-cols-2 gap-1 rounded-full bg-surface p-1">
              {modes.map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setHint(null); }} className={`relative min-h-11 rounded-full font-semibold ${mode === m ? "text-paper" : ""}`}>
                  {mode === m && <motion.span layoutId="scan-tab" className="absolute inset-0 rounded-full bg-ink" />}
                  <span className="relative">{m === "code" ? "Código de barras" : "Por foto"}</span>
                </button>
              ))}
            </div>
          )}

          <div className="px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
            {(
              <motion.div animate={bounce} className={`relative overflow-hidden rounded-3xl bg-night ${status === "unavailable" || (mode === "photo" && phase === "results") ? "hidden" : ""}`}>
                <video ref={videoRef} playsInline muted autoPlay className="aspect-[4/3] w-full object-cover" aria-label="Vista de la cámara" />
                {mode === "code" ? (
                  <div className="pointer-events-none absolute inset-x-8 top-1/2 h-28 -translate-y-1/2 rounded-2xl border-2 border-white/80" aria-hidden>
                    <motion.span className="absolute inset-x-3 h-0.5 bg-wine" animate={reduce ? undefined : { top: ["10%", "90%", "10%"] }} transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }} />
                  </div>
                ) : (
                  <div className="pointer-events-none absolute inset-[12%] rounded-3xl border-2 border-dashed border-white/70" aria-hidden />
                )}
                {status === "starting" && <p className="absolute inset-0 grid place-items-center text-white">Abriendo la cámara…</p>}
              </motion.div>
            )}
            {status === "unavailable" && (
              <p className="rounded-3xl border border-dashed border-line px-5 py-6 text-center text-muted">
                No se pudo abrir la cámara aquí (permiso negado o enlace sin candado). {mode === "code" ? "Usa el lector USB o escribe el código." : "Puedes elegir una foto."}
              </p>
            )}

            {mode === "code" && <p className="mt-3 text-center text-muted">Apunta al código de barras dentro del recuadro.</p>}

            {mode === "photo" && phase !== "results" && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Button size="lg" disabled={status !== "live" || phase === "thinking" || index.isLoading} onClick={() => videoRef.current && identify(snapshot(videoRef.current))}>
                  {phase === "thinking" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Camera className="size-5" aria-hidden />}
                  {phase === "thinking" ? "Buscando…" : "Identificar producto"}
                </Button>
                <label className="inline-flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-full border border-ink px-6 text-lg font-semibold hover:bg-surface">
                  <ImagePlus className="size-5" aria-hidden /> Elegir foto
                  <input type="file" accept="image/*" className="sr-only" aria-label="Elegir foto del producto" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) identify(await createImageBitmap(f)); }} />
                </label>
                <p className="text-sm text-muted sm:col-span-2">Centra el producto, con buena luz. Se compara en este dispositivo, sin gastar internet.</p>
              </div>
            )}

            {mode === "photo" && phase === "results" && (
              <div className="grid gap-4">
                <p className="text-muted">{matches.length ? "Toca el producto correcto para agregarlo." : "No encontramos productos parecidos."}</p>
                <PhotoMatches list={shown} onPick={(p, v) => { onPick?.(p, v); onOpenChange(false); }} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant="ghost" onClick={() => { setPhase("idle"); setMatches([]); setHint(null); }}><RotateCcw className="size-5" aria-hidden /> Otra foto</Button>
                  {canAi && (
                    <Button variant="wine" disabled={aiBusy} onClick={askAi}>
                      {aiBusy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Sparkles className="size-5" aria-hidden />} {aiBusy ? "Consultando…" : "Buscar con IA"}
                    </Button>
                  )}
                </div>
                {ai.data?.enabled && <p className="text-xs text-muted tnum">IA: {ai.data.used} de {ai.data.limit} consultas este mes.</p>}
              </div>
            )}
            {hint && <p role="alert" className="mt-3 rounded-2xl bg-wine/10 px-4 py-3 text-sm font-semibold text-wine">{hint}</p>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
