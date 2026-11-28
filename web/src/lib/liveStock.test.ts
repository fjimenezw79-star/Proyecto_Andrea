import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { applyStock } from "./liveStock";

const product = (id: number, variants: { id: number; stock: number }[]) => ({ id, name: `P${id}`, variants }) as never;

describe("applyStock", () => {
  it("actualiza solo las variantes que cambiaron en todas las listas", () => {
    const qc = new QueryClient();
    qc.setQueryData(["products", "pos", "", null], { products: [product(1, [{ id: 10, stock: 3 }, { id: 11, stock: 2 }]), product(2, [{ id: 20, stock: 5 }])], total: 2 });
    qc.setQueryData(["products", "inv", "", null], { products: [product(2, [{ id: 20, stock: 5 }])], total: 1 });
    const untouched = (qc.getQueryData(["products", "pos", "", null]) as { products: unknown[] }).products[1];
    applyStock(qc, { 10: 1, 20: 4 });
    const pos = qc.getQueryData(["products", "pos", "", null]) as { products: { variants: { stock: number }[] }[] };
    expect(pos.products[0].variants.map((v) => v.stock)).toEqual([1, 2]);
    expect(pos.products[1].variants[0].stock).toBe(4);
    expect(untouched).not.toBe(pos.products[1]);
    const inv = qc.getQueryData(["products", "inv", "", null]) as { products: { variants: { stock: number }[] }[] };
    expect(inv.products[0].variants[0].stock).toBe(4);
  });

  it("no toca listas sin cambios", () => {
    const qc = new QueryClient();
    const data = { products: [product(1, [{ id: 10, stock: 3 }])], total: 1 };
    qc.setQueryData(["products", "x"], data);
    applyStock(qc, { 99: 0 });
    expect(qc.getQueryData(["products", "x"])).toBe(data);
  });
});
