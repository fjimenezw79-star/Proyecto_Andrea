import { expect, test } from "@playwright/test";
import { login } from "./helpers";

async function salesCount(page: import("@playwright/test").Page) {
  const r = await page.request.get("/api/sales");
  return ((await r.json()).sales as unknown[]).length;
}

test("venta en efectivo con cambio", async ({ page }) => {
  await login(page, "vendedor", "12345");
  await page.goto("/vender");
  await page.getByRole("button", { name: /^Agregar Mario Bros/ }).click();
  await expect(page.getByRole("region", { name: "Carrito" }).getByText("Mario Bros")).toBeVisible();
  await page.getByRole("button", { name: /^Cobrar/ }).click();
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await pay.getByRole("tab", { name: "Efectivo" }).click();
  await pay.getByLabel("Recibido").fill("500");
  await expect(pay.getByText("$180.00")).toBeVisible();
  await pay.getByRole("button", { name: "Confirmar cobro" }).click();
  await expect(pay.getByRole("heading", { name: /Venta #\d+/ })).toBeVisible();
  await pay.getByRole("button", { name: "Nueva venta" }).click();
  await expect(page.getByRole("button", { name: /^Agregar Mario Bros/ })).toContainText("Quedan 1");
});

test("doble clic en Confirmar crea una sola venta", async ({ page }) => {
  await login(page);
  const before = await salesCount(page);
  await page.goto("/vender");
  await page.getByRole("button", { name: /^Agregar Termo Love/ }).click();
  await page.getByRole("button", { name: /^Cobrar/ }).click();
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await pay.getByRole("tab", { name: "Tarjeta" }).click();
  await pay.getByRole("button", { name: "Confirmar cobro" }).dblclick();
  await expect(pay.getByRole("heading", { name: /Venta #\d+/ })).toBeVisible();
  expect(await salesCount(page)).toBe(before + 1);
});

test("escanear código inexistente avisa y no cambia el carrito", async ({ page }) => {
  await login(page);
  await page.goto("/vender");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.type("ZZ99", { delay: 5 });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("No encontramos ningún producto con ese código.");
  await expect(page.getByRole("region", { name: "Carrito" })).toContainText("El carrito está vacío");
});

test("escanear un código lo agrega al carrito", async ({ page }) => {
  await login(page);
  await page.goto("/vender");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.type("MA000003", { delay: 5 });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Carrito" }).getByText("Bob Esponja")).toBeVisible();
});

test("Ctrl+K agrega un producto al carrito en Vender", async ({ page }) => {
  await login(page);
  await page.goto("/vender");
  await expect(page.getByRole("heading", { name: "Vender" })).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Buscar" }).getByRole("combobox").fill("labubu");
  await page.getByRole("option", { name: /Labubu/ }).click();
  await expect(page.getByRole("region", { name: "Carrito" }).getByText("Labubu")).toBeVisible();
});

test("el vendedor no puede pasar del 10 % de descuento", async ({ page }) => {
  await login(page, "vendedor", "12345");
  await page.goto("/vender");
  await page.getByRole("button", { name: /^Agregar Princesas Disney/ }).click();
  await page.getByRole("button", { name: "Descuento" }).click();
  await page.getByLabel("Descuento en pesos").fill("40");
  await expect(page.getByText("Ese descuento necesita autorización del administrador.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Cobrar/ })).toBeDisabled();
});
