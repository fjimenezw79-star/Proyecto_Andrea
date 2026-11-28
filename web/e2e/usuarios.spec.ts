import { expect, test, type Browser } from "@playwright/test";
import { login } from "./helpers";

async function tryLogin(browser: Browser, username: string, password: string) {
  const ctx = await browser.newContext({ locale: "es-MX", baseURL: "http://127.0.0.1:5055" });
  const page = await ctx.newPage();
  await page.goto("/entrar");
  await page.getByLabel("Usuario").fill(username);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  return { ctx, page };
}

test("el administrador da de alta un vendedor, le restablece la contraseña y lo desactiva", async ({ page, browser }) => {
  await login(page);
  await page.getByRole("navigation", { name: "Principal" }).first().getByRole("link", { name: "Usuarios" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Usuarios" })).toBeVisible();
  const list = page.getByRole("list", { name: "Usuarios" });
  await expect(list).toContainText("admin");
  await expect(list).toContainText("vendedor");

  // alta
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  const dlg = page.getByRole("dialog", { name: "Nuevo usuario" });
  await dlg.getByLabel("Usuario (para entrar)").fill("lupita");
  await dlg.getByLabel("Nombre").fill("Lupita Ramírez");
  await dlg.getByLabel("Contraseña", { exact: true }).fill("lupita2026");
  await dlg.getByLabel("Repite la contraseña").fill("otra");
  await dlg.getByRole("button", { name: "Crear usuario" }).click();
  await expect(dlg.getByText("Las contraseñas no coinciden.")).toBeVisible();
  await dlg.getByLabel("Repite la contraseña").fill("lupita2026");
  await dlg.getByRole("button", { name: "Crear usuario" }).click();
  await expect(page.getByText("Usuario lupita creado.")).toBeVisible();
  await expect(list).toContainText("Lupita Ramírez");

  let s = await tryLogin(browser, "lupita", "lupita2026");
  await expect(s.page).toHaveURL(/\/vender/);
  await expect(s.page.getByRole("link", { name: "Usuarios" })).toHaveCount(0); // el vendedor no ve Usuarios
  await s.ctx.close();

  // restablecer contraseña (no hace falta saber la anterior)
  await page.getByRole("button", { name: "Restablecer contraseña de lupita" }).click();
  const pw = page.getByRole("dialog", { name: "Contraseña de lupita" });
  await pw.getByLabel("Contraseña nueva").fill("nueva2026");
  await pw.getByLabel("Repite la contraseña").fill("nueva2026");
  await pw.getByRole("button", { name: "Restablecer contraseña" }).click();
  await expect(page.getByText("Contraseña de lupita restablecida. Ya puede entrar con la nueva.")).toBeVisible();
  s = await tryLogin(browser, "lupita", "nueva2026");
  await expect(s.page).toHaveURL(/\/vender/);
  await s.ctx.close();

  // desactivar
  await page.getByRole("switch", { name: "lupita activo" }).click();
  await expect(page.getByText("Usuario desactivado: ya no puede entrar. Sus ventas se conservan.")).toBeVisible();
  s = await tryLogin(browser, "lupita", "nueva2026");
  await expect(s.page.getByText("Usuario o contraseña incorrectos.")).toBeVisible();
  await s.ctx.close();

  // el administrador no puede desactivarse a sí mismo (no tiene el interruptor)
  await expect(page.getByRole("switch", { name: "admin activo" })).toHaveCount(0);
});
