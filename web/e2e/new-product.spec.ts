import { expect, test } from "@playwright/test";
import path from "node:path";
import { login } from "./helpers";

const photo = path.join(import.meta.dirname, "fixtures", "termo.jpg");

test("sin cámara ofrece Elegir foto y crea el producto", async ({ page }) => {
  await login(page);
  await page.goto("/productos/nuevo");
  await page.getByLabel("Nombre del producto").fill("Termo de prueba azul");
  await page.getByLabel("Categoría").selectOption({ label: "Termos" });
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByLabel("Precio de venta").fill("299.50");
  await page.getByLabel("Costo").fill("150");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  await expect(page.getByText("Agrega al menos una foto.")).toBeVisible();
  await page.getByLabel("Elegir foto").setInputFiles(photo);
  await expect(page.getByRole("img", { name: "Foto 1" })).toBeVisible();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByText("$299.50")).toBeVisible();
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Termo de prueba azul" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Producto creado. Ya aparece en el punto de venta.");
  await expect(page.getByRole("cell", { name: /^MA\d{6}$/ })).toBeVisible();
});

test("producto con variantes de color", async ({ page }) => {
  await login(page);
  await page.goto("/productos/nuevo");
  await page.getByLabel("Nombre del producto").fill("Cobija polar lisa");
  await page.getByLabel("Categoría").selectOption({ label: "Cobijas" });
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("checkbox", { name: "Tiene variantes" }).check();
  await page.getByLabel("Tipo de variante").fill("Color");
  await page.getByLabel("Opción 1", { exact: true }).fill("Gris");
  await page.getByLabel("Precio de la opción 1").fill("350");
  await page.getByRole("button", { name: "Agregar opción" }).click();
  await page.getByLabel("Opción 2", { exact: true }).fill("Vino");
  await page.getByLabel("Precio de la opción 2").fill("350");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByLabel("Elegir foto").setInputFiles(photo);
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Cobija polar lisa" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Gris" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Vino" })).toBeVisible();
});

test("el vendedor no puede entrar a Nuevo producto", async ({ page }) => {
  await login(page, "vendedor", "12345");
  await page.goto("/productos/nuevo");
  await expect(page).toHaveURL(/\/vender$/);
});
