import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("venta en otra pestaña se ve en la primera en menos de 5 s", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await login(a, "vendedor", "12345");
  await login(b);
  await a.goto("/vender");
  await a.getByRole("searchbox", { name: "Buscar producto" }).fill("Calculadora");
  const card = a.getByRole("button", { name: /^Agregar Calculadora básica/ });
  await expect(card).toContainText("Quedan 8");

  await b.goto("/vender");
  await b.getByRole("searchbox", { name: "Buscar producto" }).fill("Calculadora");
  await b.getByRole("button", { name: /^Agregar Calculadora básica/ }).click();
  await b.getByRole("button", { name: /^Cobrar/ }).click();
  const pay = b.getByRole("dialog", { name: "Cobrar" });
  await pay.getByRole("tab", { name: "Efectivo" }).click();
  await pay.getByLabel("Recibido").fill("1000");
  await pay.getByRole("button", { name: "Confirmar cobro" }).click();
  await expect(pay.getByRole("heading", { name: /Venta #\d+/ })).toBeVisible();

  await expect(card).toContainText("Quedan 7", { timeout: 5000 });
});
