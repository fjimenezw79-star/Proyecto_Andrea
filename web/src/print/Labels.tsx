import { formatMoney } from "../lib/money";
import type { LabelSize } from "../lib/settings";
import { Barcode } from "../ui/Barcode";

export type LabelItem = { sku: string; name: string; variant: string; priceCents: number };

type Sheet = { name: string; page: string; margin: string; w: number; h: number; cols: number; rows: number; gapX: number };

/** Medidas en mm. Las hojas carta siguen los formatos comunes de etiquetas adhesivas (5160, 5161 y 5163). */
export const LABEL_SIZES: Record<LabelSize, Sheet> = {
  "50x25": { name: "Térmica 50 × 25 mm", page: "50mm 25mm", margin: "0", w: 50, h: 25, cols: 1, rows: 1, gapX: 0 },
  "carta-30": { name: "Hoja carta · 30 etiquetas (66.7 × 25.4 mm)", page: "letter", margin: "12.7mm 0 0 4.76mm", w: 66.675, h: 25.4, cols: 3, rows: 10, gapX: 3.175 },
  "carta-20": { name: "Hoja carta · 20 etiquetas (101.6 × 25.4 mm)", page: "letter", margin: "12.7mm 0 0 3.97mm", w: 101.6, h: 25.4, cols: 2, rows: 10, gapX: 4.76 },
  "carta-10": { name: "Hoja carta · 10 etiquetas (101.6 × 50.8 mm)", page: "letter", margin: "12.7mm 0 0 3.97mm", w: 101.6, h: 50.8, cols: 2, rows: 5, gapX: 4.76 },
};

export function labelPageCss(size: LabelSize): string {
  const s = LABEL_SIZES[size];
  return `@page { size: ${s.page}; margin: ${s.margin}; }`;
}

export function perPage(size: LabelSize): number {
  return LABEL_SIZES[size].cols * LABEL_SIZES[size].rows;
}

export function Label({ item, size, business }: { item: LabelItem; size: LabelSize; business: string }) {
  const s = LABEL_SIZES[size];
  const u = s.h / 25; // escala: 1 en las etiquetas de 25 mm de alto
  const mm = (n: number) => `${(n * u).toFixed(2)}mm`;
  return (
    <div
      data-label={item.sku}
      style={{ width: `${s.w}mm`, height: `${s.h}mm`, padding: `${mm(1.4)} ${mm(2.2)}`, boxSizing: "border-box", overflow: "hidden", display: "flex", flexDirection: "column", background: "#fff", color: "#000", fontFamily: "var(--font-sans)" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: mm(1.5), lineHeight: 1.1 }}>
        <span style={{ fontSize: mm(2.6), fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{item.name}</span>
        <span style={{ fontSize: mm(4.2), fontWeight: 800, whiteSpace: "nowrap" }} className="tnum">{formatMoney(item.priceCents)}</span>
      </div>
      <div style={{ fontSize: mm(2.1), lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {item.variant || business}
      </div>
      <Barcode value={item.sku} style={{ display: "block", width: "100%", maxWidth: "none", height: mm(s.h >= 40 ? 9 : 10.5), marginTop: "auto" }} />
      <div style={{ fontSize: mm(2.1), textAlign: "center", letterSpacing: "0.08em", lineHeight: 1.1 }} className="tnum">{item.sku}</div>
    </div>
  );
}

/** Hojas listas para imprimir: una etiqueta por elemento, repartidas por página. */
export function LabelSheets({ items, size, business, pages }: { items: LabelItem[]; size: LabelSize; business: string; pages?: number }) {
  const s = LABEL_SIZES[size];
  const n = perPage(size);
  const chunks: LabelItem[][] = [];
  for (let i = 0; i < items.length; i += n) chunks.push(items.slice(i, i + n));
  return (
    <>
      {chunks.slice(0, pages ?? chunks.length).map((chunk, p, all) => (
        <div
          key={p}
          className="label-page"
          style={{ display: "grid", gridTemplateColumns: `repeat(${s.cols}, ${s.w}mm)`, gridAutoRows: `${s.h}mm`, columnGap: `${s.gapX}mm`, breakAfter: p < all.length - 1 ? "page" : "auto", background: "#fff" }}
        >
          {chunk.map((it, i) => <Label key={i} item={it} size={size} business={business} />)}
        </div>
      ))}
    </>
  );
}
