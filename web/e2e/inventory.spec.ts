import { expect, test } from "@playwright/test";
import { login } from "./helpers";

async function openProduct(page: import("@playwright/test").Page, name: string) {
  await page.goto("/inventario");
  await page.getByLabel("Buscar en inventario").fill(name);
  await page.getByRole("link", { name: new RegExp(name) }).first().click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test("entrada de 5 piezas sube el stock y aparece en la bitácora", async ({ page }) => {
  await login(page);
  await openProduct(page, "Termo clásico rojo");
  await expect(page.getByTestId("stock-total")).toHaveText("4 piezas");
  await page.getByRole("button", { name: "Entrada" }).click();
  const dlg = page.getByRole("dialog", { name: "Entrada de mercancía" });
  await dlg.getByLabel("Piezas que llegaron").fill("5");
  await dlg.getByRole("button", { name: "Guardar entrada" }).click();
  await expect(page.getByTestId("stock-total")).toHaveText("9 piezas");
  await expect(page.getByRole("list", { name: "Bitácora" }).getByText("Entrada").first()).toBeVisible();
  await expect(page.getByRole("list", { name: "Bitácora" })).toContainText("+5");
});

test("ajuste sin motivo no se envía", async ({ page }) => {
  await login(page);
  await openProduct(page, "Cobija venados");
  await page.getByRole("button", { name: "Ajustar existencias" }).click();
  const dlg = page.getByRole("dialog", { name: "Ajustar existencias" });
  await dlg.getByLabel("Piezas que hay en la tienda").fill("2");
  await dlg.getByRole("button", { name: "Guardar ajuste" }).click();
  await expect(dlg.getByText("Escribe el motivo del ajuste.")).toBeVisible();
  await dlg.getByLabel("Motivo").fill("Conteo físico");
  await dlg.getByRole("button", { name: "Guardar ajuste" }).click();
  await expect(page.getByTestId("stock-total")).toHaveText("2 piezas");
});

test("vendedor no ve costos ni botón Entrada", async ({ page }) => {
  await login(page, "vendedor", "12345");
  await openProduct(page, "Cobija tartán");
  await expect(page.getByRole("columnheader", { name: "Costo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Entrada" })).toHaveCount(0);
});

test("admin cambia el precio de una variante", async ({ page }) => {
  await login(page);
  await openProduct(page, "Botella tejida");
  await page.getByLabel("Precio de MA").first().fill("260");
  await page.getByLabel("Precio de MA").first().blur();
  await expect(page.getByRole("status")).toContainText("Precio actualizado");
  await page.reload();
  await expect(page.getByLabel("Precio de MA").first()).toHaveValue("260.00");
});

test("filtro de stock bajo", async ({ page }) => {
  await login(page);
  await page.goto("/inventario");
  await page.getByRole("button", { name: "Stock bajo" }).click();
  await expect(page.getByRole("link", { name: /Mochila de piel vintage/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Cuadernos profesionales/ })).toHaveCount(0);
});
