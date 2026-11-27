import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("Ctrl+K encuentra un producto por nombre", async ({ page }) => {
  await login(page);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Buscar" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill("mario");
  await expect(dialog.getByRole("option", { name: /Mario Bros/ })).toBeVisible();
});

test("Ctrl+K lleva a una sección", async ({ page }) => {
  await login(page);
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Buscar" }).getByRole("combobox").fill("inventario");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/inventario$/);
});

test("el vendedor no ve Configuración en el menú", async ({ page }) => {
  await login(page, "vendedor", "12345");
  const nav = page.getByRole("navigation", { name: "Principal" });
  await expect(nav.getByRole("link", { name: "Vender" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Configuración" })).toHaveCount(0);
});

test("en celular hay barra inferior", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await login(page);
  const bar = page.getByRole("navigation", { name: "Principal" });
  await expect(bar).toBeVisible();
  const box = await bar.boundingBox();
  expect(box!.y).toBeGreaterThan(700);
  await ctx.close();
});
