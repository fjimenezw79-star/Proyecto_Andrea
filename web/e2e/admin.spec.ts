import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("admin cancela una venta y el stock regresa", async ({ page }) => {
  await login(page);
  await page.goto("/vender");
  await page.getByRole("button", { name: /^Agregar Reloj redondo acero/ }).click();
  await page.getByRole("button", { name: /^Cobrar/ }).click();
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await pay.getByRole("tab", { name: "Transferencia" }).click();
  await pay.getByRole("button", { name: "Confirmar cobro" }).click();
  const folio = (await pay.getByRole("heading", { name: /Venta #\d+/ }).textContent())!.replace("Venta #", "");
  await pay.getByRole("button", { name: "Nueva venta" }).click();
  await expect(page.getByRole("button", { name: /^Agregar Reloj redondo acero/ })).toContainText("Quedan 2");

  await page.goto("/ventas");
  await page.getByRole("button", { name: new RegExp(`^Venta #${folio} `) }).click();
  const det = page.getByRole("dialog", { name: `Venta #${folio}` });
  await det.getByRole("button", { name: "Cancelar venta" }).click();
  await det.getByLabel("Motivo de la cancelación").fill("El cliente devolvió el reloj");
  await det.getByRole("button", { name: "Confirmar cancelación" }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Venta #${folio} `) })).toContainText("Cancelada");

  await page.goto("/vender");
  await expect(page.getByRole("button", { name: /^Agregar Reloj redondo acero/ })).toContainText("Quedan 3");
});

test("el vendedor ve las ventas pero no puede cancelar", async ({ page }) => {
  await login(page, "vendedor", "12345");
  await page.goto("/ventas");
  await expect(page.getByRole("heading", { name: "Ventas de hoy" })).toBeVisible();
  const first = page.getByRole("button", { name: /^Venta #\d+ / }).first();
  if (await first.count()) {
    await first.click();
    await expect(page.getByRole("button", { name: "Cancelar venta" })).toHaveCount(0);
  }
});

test("crear categoría Termos dentro de Hogar", async ({ page }) => {
  await login(page);
  await page.goto("/categorias");
  await page.getByLabel("Nueva categoría").fill("Hogar");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByRole("list", { name: "Categorías" }).getByText("Hogar", { exact: true })).toBeVisible();
  await page.getByLabel("Nueva categoría").fill("Termos de acero");
  await page.getByLabel("Dentro de").selectOption({ label: "Hogar" });
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByRole("list", { name: "Dentro de Hogar" }).getByText("Termos de acero", { exact: true })).toBeVisible();
});

test("guardar WhatsApp del negocio", async ({ page }) => {
  await login(page);
  await page.goto("/configuracion");
  await page.getByLabel("WhatsApp del negocio").fill("4731234567");
  await page.getByRole("button", { name: "Guardar configuración" }).click();
  await expect(page.getByRole("status")).toContainText("Configuración guardada.");
  await page.reload();
  await expect(page.getByLabel("WhatsApp del negocio")).toHaveValue("4731234567");
});
