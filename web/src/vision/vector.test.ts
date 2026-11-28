import { describe, expect, it } from "vitest";
import { fromBase64, quantize, similarity, toBase64, topProducts, type IndexItem } from "./vector";

const unit = (xs: number[]) => {
  const n = Math.hypot(...xs);
  return xs.map((x) => x / n);
};

describe("huellas", () => {
  it("cuantiza y vuelve de base64 sin perder el signo", () => {
    const q = quantize([1, -1, 0.5, -0.25, 0]);
    expect([...q]).toEqual([127, -127, 64, -32, 0]);
    expect([...fromBase64(toBase64(q))]).toEqual([...q]);
    expect(toBase64(quantize(new Array(1024).fill(0.03)))).toHaveLength(1368);
  });

  it("similitud: 1 igual, 0 perpendicular, -1 opuesto", () => {
    const a = quantize(unit([1, 0, 0]));
    expect(similarity(a, a)).toBeCloseTo(1);
    expect(similarity(a, quantize(unit([0, 1, 0])))).toBeCloseTo(0);
    expect(similarity(a, quantize(unit([-1, 0, 0])))).toBeCloseTo(-1);
  });

  it("devuelve los productos más parecidos usando la mejor foto de cada uno", () => {
    const items: IndexItem[] = [
      { photo_id: 1, product_id: 10, vec: quantize(unit([1, 0, 0])) },
      { photo_id: 2, product_id: 10, vec: quantize(unit([0, 0, 1])) },
      { photo_id: 3, product_id: 20, vec: quantize(unit([0.7, 0.7, 0])) },
      { photo_id: 4, product_id: 30, vec: quantize(unit([0, 1, 0])) },
      { photo_id: 5, product_id: 40, vec: quantize([1, 0]) }, // de otro tamaño: se ignora
    ];
    const top = topProducts(items, quantize(unit([0.1, 0, 1])), 2);
    expect(top.map((m) => m.product_id)).toEqual([10, 20]);
    expect(top[0].score).toBeGreaterThan(0.9);
  });
});
