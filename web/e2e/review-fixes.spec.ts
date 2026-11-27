import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("si la sesión vence al cobrar, pide entrar y conserva el carrito", async ({ page, context }) => {
  await login(page, "vendedor", "12345");
  await page.goto("/vender");
  await page.getByRole("button", { name: /^Agregar Plumones/ }).click();
  await page.getByRole("button", { name: /^Cobrar/ }).click();
  await context.clearCookies();
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await pay.getByRole("tab", { name: "Tarjeta" }).click();
  await pay.getByRole("button", { name: "Confirmar cobro" }).click();
  await expect(page).toHaveURL(/\/entrar\?volver=%2Fvender/);
  await page.getByLabel("Usuario").fill("vendedor");
  await page.getByLabel("Contraseña").fill("12345");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("region", { name: "Carrito" }).getByText("Plumones de colores")).toBeVisible();
});

test("el carrito se conserva al ir a otra pantalla y regresar", async ({ page }) => {
  await login(page);
  await page.goto("/vender");
  await page.getByRole("button", { name: /^Agregar Crayones/ }).click();
  await page.getByRole("link", { name: "Inventario" }).first().click();
  await expect(page.getByRole("heading", { name: "Inventario" })).toBeVisible();
  await page.getByRole("link", { name: "Vender" }).first().click();
  await expect(page.getByRole("region", { name: "Carrito" }).getByText("Crayones 24 colores")).toBeVisible();
});

test("el descuento de una venta no pasa a la siguiente", async ({ page }) => {
  await login(page, "vendedor", "12345");
  await page.goto("/vender");
  await page.getByRole("button", { name: /^Agregar Mochila pana negra/ }).click();
  await page.getByRole("button", { name: "Descuento" }).click();
  await page.getByLabel("Descuento en pesos").fill("30");
  await page.getByRole("button", { name: /^Cobrar/ }).click();
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await pay.getByRole("tab", { name: "Tarjeta" }).click();
  await pay.getByRole("button", { name: "Confirmar cobro" }).click();
  await pay.getByRole("button", { name: "Nueva venta" }).click();
  await page.getByRole("button", { name: /^Agregar Tijeras escolares/ }).click();
  await expect(page.getByLabel("Descuento en pesos")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Cobrar/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /^Cobrar/ })).toContainText("$35.00");
});

test("Elegir foto abre la galería y hay botón aparte para la cámara del celular", async ({ page }) => {
  await login(page);
  await page.goto("/productos/nuevo");
  await page.getByLabel("Nombre del producto").fill("X");
  await page.getByLabel("Categoría").selectOption({ label: "Termos" });
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByLabel("Precio de venta").fill("10");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByLabel("Elegir foto")).not.toHaveAttribute("capture", /.*/);
  await expect(page.getByLabel("Tomar foto con el celular")).toHaveAttribute("capture", "environment");
});
