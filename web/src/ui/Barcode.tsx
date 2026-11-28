import type { CSSProperties } from "react";
import { bars } from "../lib/code128";

/** Código de barras Code 128 en SVG: barras negras sobre blanco, nítidas al imprimir. */
export function Barcode({ value, className = "", title, style }: { value: string; className?: string; title?: string; style?: CSSProperties }) {
  let data: ReturnType<typeof bars>;
  try {
    data = bars(value);
  } catch {
    return null;
  }
  return (
    <svg viewBox={`0 0 ${data.width} 1`} preserveAspectRatio="none" shapeRendering="crispEdges" role="img" aria-label={title ?? `Código ${value}`} className={className} style={style}>
      <rect width={data.width} height="1" fill="#fff" />
      {data.rects.map(([x, w]) => (
        <rect key={x} x={x} width={w} height="1" fill="#000" />
      ))}
    </svg>
  );
}
