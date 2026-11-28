/** Calcula la huella de una imagen en el dispositivo con MediaPipe (MobileNet V3 small), servido desde la PC. */
import type { ImageEmbedder } from "@mediapipe/tasks-vision";
import { quantize } from "./vector";

export const VISION_FILES = ["/vision/mobilenet_v3_small.tflite", "/vision/wasm/vision_wasm_internal.js", "/vision/wasm/vision_wasm_internal.wasm"];
const SIDE = 256;

let loading: Promise<ImageEmbedder> | null = null;

export function loadEmbedder(): Promise<ImageEmbedder> {
  loading ??= (async () => {
    const { FilesetResolver, ImageEmbedder } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks("/vision/wasm");
    return ImageEmbedder.createFromOptions(files, {
      baseOptions: { modelAssetPath: VISION_FILES[0], delegate: "CPU" },
      runningMode: "IMAGE",
      l2Normalize: true,
      quantize: false,
    });
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

type Source = HTMLVideoElement | HTMLImageElement | ImageBitmap | HTMLCanvasElement;
const size = (s: Source) =>
  s instanceof HTMLVideoElement ? [s.videoWidth, s.videoHeight] : s instanceof HTMLImageElement ? [s.naturalWidth, s.naturalHeight] : [s.width, s.height];

/** Recorta el centro en cuadrado (el producto suele estar al centro) a 256 px. `zoom` < 1 recorta más. */
export function centerSquare(src: Source, zoom = 1): HTMLCanvasElement {
  const [w, h] = size(src);
  const side = Math.min(w, h) * zoom;
  const c = document.createElement("canvas");
  c.width = c.height = SIDE;
  c.getContext("2d")!.drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIDE, SIDE);
  return c;
}

export async function embed(src: Source, zoom = 1): Promise<Int8Array> {
  const e = await loadEmbedder();
  const r = e.embed(centerSquare(src, zoom));
  const f = r.embeddings[0]?.floatEmbedding;
  if (!f?.length) throw new Error("No se pudo calcular la huella de la foto.");
  return quantize(f);
}

/** Descarga el modelo una vez para que quede guardado en el dispositivo (funciona sin señal). */
export function warmVisionFiles(): void {
  for (const f of VISION_FILES) fetch(f).catch(() => undefined);
}
