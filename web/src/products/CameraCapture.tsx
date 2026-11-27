import { Camera, ImagePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";

const GUIDE = ["Frente", "Lado", "Detalle o etiqueta"];

/** Cámara trasera con guía de tomas. Si no hay cámara o no hay permiso, quedan "Elegir foto" y "Tomar foto con el celular". */
export function CameraCapture({ count, onPhotos }: { count: number; onPhotos: (files: Blob[]) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const [live, setLive] = useState(false);
  const [status, setStatus] = useState<"idle" | "starting" | "live" | "unavailable">("idle");

  const stopAll = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopAll();
    };
  }, []);

  useEffect(() => {
    if (live && video.current && streamRef.current) video.current.srcObject = streamRef.current;
  }, [live]);

  async function start() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      return;
    }
    setStatus("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } }, audio: false });
      if (!mounted.current) {
        s.getTracks().forEach((t) => t.stop()); // se salió del paso mientras se pedía el permiso
        return;
      }
      streamRef.current = s;
      setLive(true);
      setStatus("live");
    } catch {
      if (mounted.current) setStatus("unavailable");
    }
  }

  function shoot() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => b && onPhotos([b]), "image/jpeg", 0.92);
  }

  const next = GUIDE[Math.min(count, GUIDE.length - 1)];
  const pick = (files: FileList | null) => {
    const list = [...(files ?? [])];
    if (list.length) onPhotos(list);
  };

  return (
    <div className="grid gap-4">
      <ol className="flex flex-wrap gap-2" aria-label="Tomas sugeridas">
        {GUIDE.map((g, i) => (
          <li key={g} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${i < count ? "bg-ink text-paper" : i === count ? "border-2 border-wine text-wine" : "border border-line text-muted"}`}>
            {i + 1}. {g}
          </li>
        ))}
      </ol>
      {status === "live" ? (
        <div className="relative overflow-hidden rounded-3xl bg-night">
          <video ref={video} autoPlay playsInline muted className="aspect-[4/3] w-full object-cover" />
          <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-white/60" aria-hidden />
          <p className="absolute left-4 top-4 rounded-full bg-black/50 px-3 py-1 text-sm font-semibold text-white">Toma: {next}</p>
          <button onClick={shoot} className="absolute bottom-4 left-1/2 grid size-16 -translate-x-1/2 place-items-center rounded-full border-4 border-white bg-white/25 active:scale-95" aria-label={`Tomar foto: ${next}`}>
            <span className="size-11 rounded-full bg-white" />
          </button>
        </div>
      ) : (
        <div className="grid gap-3 rounded-3xl border border-dashed border-line px-5 py-8 text-center">
          <p className="text-muted">
            {status === "unavailable"
              ? "No se pudo abrir la cámara aquí. Toma la foto con el celular o elige una de la galería."
              : "Usa la cámara de este dispositivo, toma la foto con el celular o elige una de la galería."}
          </p>
          {status !== "unavailable" && (
            <div className="flex justify-center">
              <Button type="button" onClick={start} disabled={status === "starting"}>
                <Camera className="size-5" aria-hidden /> {status === "starting" ? "Esperando permiso de la cámara…" : "Usar cámara"}
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <label htmlFor="pick-photo" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-ink px-5 font-semibold hover:bg-surface">
          <ImagePlus className="size-5" aria-hidden /> Elegir foto
        </label>
        <input id="pick-photo" type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        <label htmlFor="shoot-photo" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-5 font-semibold hover:bg-surface">
          <Camera className="size-5" aria-hidden /> Tomar foto con el celular
        </label>
        <input id="shoot-photo" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      </div>
    </div>
  );
}
