import { useId, useRef, useState } from "react";
import { formatMoney } from "../../lib/money";

type Point = { label: string; value: number };

/** Una serie en el tiempo: línea de 2 px, rejilla tenue, cruz y tooltip al pasar el dedo o el mouse. */
export function LineChart({ title, points, height = 220 }: { title: string; points: Point[]; height?: number }) {
  const id = useId();
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = height, L = 64, R = 16, T = 12, B = 28;
  const max = Math.max(10000, ...points.map((p) => p.value));
  const min = Math.min(0, ...points.map((p) => p.value));
  const step = niceStep((max - min) / 4);
  const top = Math.ceil(max / step) * step;
  const bottom = Math.floor(min / step) * step;
  const x = (i: number) => L + (points.length <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1));
  const y = (v: number) => T + ((top - v) * (H - T - B)) / (top - bottom || 1);
  const ticks: number[] = [];
  for (let v = bottom; v <= top + 1e-9; v += step) ticks.push(v);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const every = Math.max(1, Math.ceil(points.length / 8));

  function move(clientX: number) {
    const r = ref.current!.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }

  return (
    <figure className="relative m-0">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={`${id}-t`}
        tabIndex={0}
        className="w-full touch-none outline-none"
        onPointerMove={(e) => move(e.clientX)}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setHover((h) => Math.min(points.length - 1, (h ?? -1) + 1));
          if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? points.length) - 1));
        }}
        onBlur={() => setHover(null)}
      >
        <title id={`${id}-t`}>{title}</title>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill="var(--muted)" className="tnum">{formatMoney(v).replace(".00", "")}</text>
          </g>
        ))}
        {points.map((p, i) => i % every === 0 && (
          <text key={p.label} x={x(i)} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--muted)">{p.label}</text>
        ))}
        <path d={d} fill="none" stroke="var(--chart)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && points[hover] && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(points[hover].value)} r={5} fill="var(--chart)" stroke="var(--paper)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover !== null && points[hover] && (
        <div role="status" className="pointer-events-none absolute top-0 rounded-xl border border-line bg-paper px-3 py-2 text-sm shadow-lg" style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 70px), calc(100% - 140px))` }}>
          <span className="block text-muted">{points[hover].label}</span>
          <span className="tnum font-semibold">{formatMoney(points[hover].value)}</span>
        </div>
      )}
    </figure>
  );
}

function niceStep(raw: number) {
  if (raw <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
