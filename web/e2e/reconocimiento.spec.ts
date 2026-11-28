import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { login } from "./helpers";

// Sin cámara falsa: la foto se elige como archivo (igual que en un dispositivo sin cámara o sin permiso).
const photo = fileURLToPath(new URL("../../datos_prueba/fotos/p015.webp", import.meta.url));

test("prepara las fotos, reconoce un producto por foto y la IA sugiere otro candidato", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await page.goto("/configuracion");
  await page.getByRole("button", { name: "Preparar fotos ahora" }).click();
  await expect(page.getByTestId("vision-count")).toHaveText(/\d+ fotos listas · 0 sin preparar/, { timeout: 90_000 });

  // IA simulada: nunca se llama a la API real en las pruebas
  let sent: { image: string; candidates: number[] } | null = null;
  await page.route("**/api/vision/ai", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { ok: true, enabled: true, configured: true, used: 3, limit: 100, model: "claude-opus-5-5" } });
    sent = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true, match: sent!.candidates[1], reason: "Misma forma y color.", used: 4, limit: 100 } });
  });

  await page.goto("/vender");
  await page.getByRole("button", { name: "Escanear con la cámara" }).click();
  const sheet = page.getByRole("dialog", { name: "Escanear" });
  await sheet.getByRole("tab", { name: "Por foto" }).click();
  await sheet.getByLabel("Elegir foto del producto").setInputFiles(photo);
  const list = sheet.getByRole("list", { name: "Productos parecidos" });
  await expect(list.getByRole("listitem")).toHaveCount(3, { timeout: 30_000 });
  await expect(list.getByRole("listitem").first()).toContainText("Termo clásico rojo");
  await expect(sheet.getByText("IA: 3 de 100 consultas este mes.")).toBeVisible();

  await sheet.getByRole("button", { name: "Buscar con IA" }).click();
  await expect(list.getByRole("listitem").first()).toContainText("Sugerido por IA");
  await expect(list.getByRole("listitem").first()).toContainText("Misma forma y color.");
  expect(sent!.candidates.length).toBeGreaterThan(3);
  expect(sent!.image).toMatch(/^data:image\/jpeg;base64,/);

  // nada se agrega sin tocarlo
  await expect(page.getByRole("complementary").getByText("Termo clásico rojo")).toHaveCount(0);
  await list.getByRole("listitem").nth(1).getByRole("button", { name: /^Agregar Termo clásico rojo/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("complementary").getByText("Termo clásico rojo")).toBeVisible();
});
