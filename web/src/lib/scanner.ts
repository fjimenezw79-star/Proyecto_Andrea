/** Detecta un lector de códigos USB: escribe muy rápido (menos de 60 ms entre teclas) y termina con Enter. */
export function createScanDetector(onScan: (code: string) => void, { minLength = 4, maxGapMs = 60 } = {}) {
  let buffer = "";
  let last = 0;
  let fast = true;

  function handleKey(e: KeyboardEvent): boolean {
    const now = Date.now();
    const gap = now - last;
    last = now;
    if (e.key === "Enter") {
      const code = buffer;
      const wasScan = fast && code.length >= minLength;
      buffer = "";
      fast = true;
      if (wasScan) onScan(code);
      return wasScan;
    }
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return false;
    if (buffer && gap > maxGapMs) {
      buffer = "";
      fast = true;
    }
    if (buffer && gap > maxGapMs) fast = false;
    buffer += e.key;
    return false;
  }

  return { handleKey, reset: () => ((buffer = ""), (fast = true)) };
}
