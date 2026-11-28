import { useEffect, useRef, useState } from "react";

export type CameraStatus = "starting" | "live" | "unavailable";

/** Cámara trasera mientras `active`; se apaga sola al cerrar o al salir de la pantalla. */
export function useCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<CameraStatus>("starting");

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setStatus("starting");
    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus("unavailable");
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const v = videoRef.current;
        if (v) {
          v.srcObject = s;
          await v.play().catch(() => undefined);
        }
        setStatus("live");
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  return { videoRef, status };
}
