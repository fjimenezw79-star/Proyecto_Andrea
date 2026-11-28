import { expect, type Page } from "@playwright/test";

export async function login(page: Page, username = "admin", password = "admin123") {
  await page.goto("/entrar");
  await page.getByLabel("Usuario").fill(username);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/entrar/);
  await expect(page.getByRole("navigation", { name: "Principal" }).first()).toBeVisible();
}
