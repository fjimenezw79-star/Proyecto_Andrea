import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanSearch, Sparkles } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";
import { prepareMissing } from "../vision/prepare";
import { useVisionIndex } from "../vision/visionIndex";

type AiStatus = { enabled: boolean; configured: boolean; used: number; limit: number; model: string };

/** Fotos listas para reconocer con la cámara y consumo de la IA del mes. */
export function VisionSettings() {
  const toast = useToast();
  const qc = useQueryClient();
  const index = useVisionIndex();
  const missing = useQuery({ queryKey: ["vision-missing"], queryFn: () => api<{ photos: unknown[] }>("/api/vision/missing") });
  const ai = useQuery({ queryKey: ["ai-status"], queryFn: () => api<AiStatus>("/api/vision/ai") });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const pending = missing.data?.photos.length ?? 0;
  const ready = index.data?.length ?? 0;

  async function prepare() {
    setProgress({ done: 0, total: pending });
    try {
      const n = await prepareMissing(undefined, (done, total) => setProgress({ done, total }));
      toast(n ? `Listo: ${n} ${n === 1 ? "foto preparada" : "fotos preparadas"}.` : "No había fotos pendientes.", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudieron preparar las fotos.", "error");
    } finally {
      setProgress(null);
      qc.invalidateQueries({ queryKey: ["vision-index"] });
      qc.invalidateQueries({ queryKey: ["vision-missing"] });
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid content-start gap-3 rounded-3xl bg-surface p-5">
        <p className="flex items-center gap-2 font-semibold"><ScanSearch className="size-5" aria-hidden /> Reconocer por foto</p>
        <p className="text-sm text-muted" data-testid="vision-count">
          {missing.isLoading || index.isLoading ? "Revisando…" : `${ready} ${ready === 1 ? "foto lista" : "fotos listas"} · ${pending} sin preparar`}
        </p>
        {progress ? (
          <div role="status" className="grid gap-1.5">
            <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-ink transition-[width]" style={{ width: `${progress.total ? (100 * progress.done) / progress.total : 0}%` }} /></div>
            <p className="text-sm tnum">Preparando {progress.done} de {progress.total}…</p>
          </div>
        ) : (
          <Button type="button" variant="ghost" disabled={!pending} onClick={prepare} className="justify-self-start">Preparar fotos ahora</Button>
        )}
        <p className="text-xs text-muted">Las fotos nuevas se preparan solas al guardarlas. Este paso hace falta solo con fotos de antes.</p>
      </div>
      <div className="grid content-start gap-3 rounded-3xl bg-surface p-5">
        <p className="flex items-center gap-2 font-semibold"><Sparkles className="size-5" aria-hidden /> Buscar con IA</p>
        {ai.data?.configured ? (
          <p className="text-sm text-muted tnum" data-testid="ai-usage">{ai.data.used} de {ai.data.limit} consultas este mes · {ai.data.model}</p>
        ) : (
          <p className="text-sm text-muted">Apagado. Para activarlo, pon la clave <code>ANTHROPIC_API_KEY</code> en el archivo <code>.env</code> de la PC y reinicia el sistema.</p>
        )}
      </div>
    </div>
  );
}
