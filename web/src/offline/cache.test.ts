import { describe, expect, it } from "vitest";
import type { Product } from "../lib/types";
import { findByCode, type Catalog } from "./cache";

const v = (id: number, sku: string, barcode: string | null, active = true) => ({ id, sku, barcode, attrs: {}, price_cents: 100, stock: 1, hidden: false, active });
const catalog: Catalog = {
  version: 1, saved_at: "", categories: [],
  products: [
    { id: 1, name: "Termo", variants: [v(10, "MA000010", "7501234567893"), v(11, "MA000011", null, false)] } as unknown as Product,
    { id: 2, name: "Cobija", variants: [v(20, "MA000020", "abc-1")] } as unknown as Product,
  ],
};

describe("findByCode (sin señal)", () => {
  it("encuentra por código interno sin importar mayúsculas", () => {
    expect(findByCode(catalog, " ma000020 ")?.variant.id).toBe(20);
  });
  it("encuentra por código de fábrica", () => {
    expect(findByCode(catalog, "7501234567893")?.product.name).toBe("Termo");
    expect(findByCode(catalog, "ABC-1")?.variant.id).toBe(20);
  });
  it("ignora variantes inactivas y códigos desconocidos", () => {
    expect(findByCode(catalog, "MA000011")).toBeNull();
    expect(findByCode(catalog, "000")).toBeNull();
  });
});
