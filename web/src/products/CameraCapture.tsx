import { Camera, ImagePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";

const GUIDE = ["Frente", "Lado", "Detalle o etiqueta"];

/** Cámara trasera con guía de tomas. Si no hay cámara o no hay permiso, queda el botón "Elegir foto". */
export function CameraCapture({ count, onPhotos }: { count: number; onPhotos: (files: Blob[]) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "live" | "unavailable">("idle");
  const fileRef = useRef<HTMLInputElement>(null);

  async function start() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      return;
    }
    setStatus("starting");
    try {
      const s = await Promise.race([
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } }, audio: false }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("tiempo")), 8000)),
      ]);
      setStream(s);
      setStatus("live");
    } catch {
      setStatus("unavailable");
    }
  }

  useEffect(() => {
    if (video.current && stream) video.current.srcObject = stream;
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [stream]);

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
              ? "No se pudo usar la cámara aquí. Elige fotos de la galería o de la computadora."
              : "Toma la foto con la cámara del dispositivo o elige una de la galería."}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {status !== "unavailable" && (
              <Button type="button" onClick={start} disabled={status === "starting"}>
                <Camera className="size-5" aria-hidden /> {status === "starting" ? "Abriendo cámara…" : "Usar cámara"}
              </Button>
            )}
          </div>
        </div>
      )}
      <div>
        <label htmlFor="pick-photo" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-ink px-5 font-semibold hover:bg-surface">
          <ImagePlus className="size-5" aria-hidden /> Elegir foto
        </label>
        <input
          id="pick-photo"
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) onPhotos(files);
          }}
        />
      </div>
    </div>
  );
}
