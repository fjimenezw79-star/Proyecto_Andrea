import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

let current: { root: Root; el: HTMLElement; style: HTMLStyleElement } | null = null;

function cleanup() {
  if (!current) return;
  current.root.unmount();
  current.el.remove();
  current.style.remove();
  current = null;
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Imprime solo `node` con la vista de impresión del navegador (ticket, etiquetas). `pageCss` define la hoja. */
export async function printNow(node: ReactNode, pageCss: string): Promise<void> {
  cleanup();
  const el = document.createElement("div");
  el.className = "print-root";
  document.body.appendChild(el);
  const style = document.createElement("style");
  style.textContent = pageCss;
  document.head.appendChild(style);
  const root = createRoot(el);
  current = { root, el, style };
  root.render(node);
  await frame();
  await frame();
  await document.fonts?.ready;
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
}
