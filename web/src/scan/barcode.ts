/** Lee códigos de barras de un cuadro de video: BarcodeDetector del navegador o, si no lo tiene, ZXing. */
import type { DecodeHintType } from "@zxing/library";

const WANTED = ["code_128", "ean_13", "ean_8", "upc_a", "upc_e"];

export type FrameReader = { kind: "native" | "zxing"; read: (video: HTMLVideoElement) => Promise<string | null> };

type NativeDetector = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type NativeCtor = { new (o: { formats: string[] }): NativeDetector; getSupportedFormats?: () => Promise<string[]> };

async function nativeReader(): Promise<FrameReader | null> {
  const Ctor = (globalThis as unknown as { BarcodeDetector?: NativeCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const supported = (await Ctor.getSupportedFormats?.()) ?? WANTED;
    const formats = WANTED.filter((f) => supported.includes(f));
    if (!formats.length) return null;
    const d = new Ctor({ formats });
    return { kind: "native", read: async (v) => (await d.detect(v))[0]?.rawValue ?? null };
  } catch {
    return null;
  }
}

async function zxingReader(): Promise<FrameReader> {
  const z = await import("@zxing/library");
  const reader = new z.MultiFormatReader();
  const hints = new Map<DecodeHintType, unknown>([
    [z.DecodeHintType.POSSIBLE_FORMATS, [z.BarcodeFormat.CODE_128, z.BarcodeFormat.EAN_13, z.BarcodeFormat.EAN_8, z.BarcodeFormat.UPC_A, z.BarcodeFormat.UPC_E]],
    [z.DecodeHintType.TRY_HARDER, true],
  ]);
  reader.setHints(hints);
  const canvas = document.createElement("canvas");
  return {
    kind: "zxing",
    read: async (v) => {
      if (!v.videoWidth) return null;
      // se lee la franja central a máximo 960 px de ancho: suficiente para un código y rápido en tablets económicas
      const scale = Math.min(1, 960 / v.videoWidth);
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      canvas.getContext("2d", { willReadFrequently: true })!.drawImage(v, 0, 0, canvas.width, canvas.height);
      try {
        const bmp = new z.BinaryBitmap(new z.HybridBinarizer(new z.HTMLCanvasElementLuminanceSource(canvas)));
        return reader.decode(bmp).getText();
      } catch {
        return null;
      }
    },
  };
}

let cached: Promise<FrameReader> | null = null;
export function getFrameReader(): Promise<FrameReader> {
  cached ??= nativeReader().then((n) => n ?? zxingReader());
  return cached;
}
