import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("conectar dispositivo muestra QR y enlace de WhatsApp", async ({ page }) => {
  await login(page);
  await page.goto("/conectar");
  await expect(page.getByRole("heading", { name: "Conectar dispositivo" })).toBeVisible();
  const qr = page.getByRole("img", { name: /Código QR del enlace http/ });
  await expect(qr).toBeVisible();
  expect(await qr.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const url = await page.getByLabel("Enlace").inputValue();
  expect(url).toMatch(/^http:\/\/.+:\d+$/);
  const wa = page.getByRole("link", { name: "Enviar por WhatsApp" });
  await expect(wa).toHaveAttribute("href", new RegExp(`^https://wa\\.me/\\?text=.*${encodeURIComponent(url).replace(/[.]/g, "\\.")}`));
  await expect(page.getByText("Solo en la red del negocio")).toBeVisible();
});

test("el vendedor no ve Conectar dispositivo", async ({ page }) => {
  await login(page, "vendedor", "12345");
  await expect(page.getByRole("link", { name: "Conectar dispositivo" })).toHaveCount(0);
});

test("mi cuenta: la contraseña actual equivocada se marca en su campo", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, "vendedor", "12345");
  await page.getByRole("button", { name: /Mi cuenta/ }).click();
  const dlg = page.getByRole("dialog", { name: "Mi cuenta" });
  await dlg.getByLabel("Contraseña actual").fill("equivocada");
  await dlg.getByLabel("Contraseña nueva", { exact: true }).fill("Nueva-123");
  await dlg.getByLabel("Repite la contraseña nueva").fill("Nueva-123");
  await dlg.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(dlg.getByText("La contraseña actual no es correcta.")).toBeVisible();
});
