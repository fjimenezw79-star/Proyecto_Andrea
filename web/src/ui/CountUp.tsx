import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { formatMoney } from "../lib/money";

/** Cifra en pesos que cuenta hasta su valor. El texto final siempre es el valor exacto. */
export function CountUp({ cents, className = "", testId }: { cents: number; className?: string; testId?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) { el.textContent = formatMoney(cents); prev.current = cents; return; }
    const c = animate(prev.current, cents, { duration: 0.7, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => (el.textContent = formatMoney(Math.round(v))), onComplete: () => (el.textContent = formatMoney(cents)) });
    prev.current = cents;
    return () => c.stop();
  }, [cents, reduce]);
  return <span ref={ref} data-testid={testId} data-cents={cents} className={`tnum ${className}`}>{formatMoney(cents)}</span>;
}
