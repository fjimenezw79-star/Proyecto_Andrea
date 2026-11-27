import { expect, test } from "@playwright/test";

test("entra, ve su nombre y sale", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/entrar/);
  await page.getByLabel("Usuario").fill("vendedor");
  await page.getByLabel("Contraseña").fill("12345");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Vendedor", { exact: true }).first()).toBeVisible();
});

test("contraseña incorrecta muestra el mensaje del servidor", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("Usuario").fill("vendedor");
  await page.getByLabel("Contraseña").fill("mala");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toHaveText("Usuario o contraseña incorrectos.");
});

test("sin sesión, una ruta interna pide entrar y regresa a ella", async ({ page }) => {
  await page.goto("/inventario");
  await expect(page).toHaveURL(/\/entrar\?volver=%2Finventario/);
  await page.getByLabel("Usuario").fill("admin");
  await page.getByLabel("Contraseña").fill("admin123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/inventario$/);
});
