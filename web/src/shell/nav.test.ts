import { expect, it } from "vitest";
import { navItems } from "./nav";

it("vendedor no ve configuración ni categorías", () => {
  expect(navItems("seller").map((i) => i.to)).toEqual(["/vender", "/inventario", "/ventas"]);
});

it("admin ve todo, en orden", () => {
  expect(navItems("admin").map((i) => i.to)).toEqual([
    "/vender", "/inventario", "/ventas", "/productos/nuevo", "/categorias", "/configuracion",
  ]);
});
