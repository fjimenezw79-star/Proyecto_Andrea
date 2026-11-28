import { expect, it } from "vitest";
import { navItems } from "./nav";

it("vendedor no ve configuración, gastos ni reportes", () => {
  expect(navItems("seller").map((i) => i.to)).toEqual(["/vender", "/apartados", "/caja", "/clientes", "/inventario", "/etiquetas", "/ventas"]);
});

it("admin ve todo, en orden", () => {
  expect(navItems("admin").map((i) => i.to)).toEqual([
    "/vender", "/apartados", "/caja", "/clientes", "/inventario", "/etiquetas", "/ventas",
    "/panel", "/reportes", "/gastos", "/productos/nuevo", "/categorias", "/bitacora", "/conectar", "/configuracion",
  ]);
});
