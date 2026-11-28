import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

/** window.print no abre nada en las pruebas: se cuenta y lo impreso se queda en .print-root para revisarlo. */
async function stubPrint(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __prints: number }).__prints = 0;
    window.print = () => {
      (window as unknown as { __prints: number }).__prints++;
    };
  });
}
const prints = (page: Page) => page.evaluate(() => (window as unknown as { __prints: number }).__prints);

test("etiquetas: una por pieza, en térmica u hoja carta", async ({ page }) => {
  await stubPrint(page);
  await login(page);
  await page.goto("/inventario");
  await page.getByLabel("Buscar en inventario").fill("Termo clásico rojo");
  await page.getByRole("link", { name: /Termo clásico rojo/ }).first().click();
  await page.getByRole("link", { name: "Imprimir etiquetas" }).click();
  await expect(page).toHaveURL(/\/etiquetas\?producto=\d+/);

  const list = page.getByRole("list", { name: "Etiquetas a imprimir" });
  await expect(list.getByRole("textbox")).toHaveValue("4");
  await expect(page.getByRole("status").filter({ hasText: /etiqueta/ })).toHaveText("4 etiquetas");
  await expect(page.getByLabel("Vista previa").locator("[data-label]")).toHaveCount(1); // térmica: una por página
  await expect(page.getByLabel("Vista previa").getByRole("img", { name: /^Código MA\d{6}$/ }).first()).toBeVisible();

  await list.getByRole("button", { name: /^Una etiqueta más/ }).click();
  await page.getByLabel("Tipo de etiqueta").selectOption("carta-30");
  await expect(page.getByRole("status").filter({ hasText: /etiqueta/ })).toHaveText("5 etiquetas · 1 hoja");
  await expect(page.getByLabel("Vista previa").locator("[data-label]")).toHaveCount(5);

  // agregar otro producto desde la búsqueda
  await page.getByLabel("Buscar producto para etiquetar").fill("Cobija venados");
  await page.getByRole("button", { name: /^Agregar Cobija venados/ }).first().click();
  await expect(list.getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: /^Imprimir \d+ etiquetas$/ }).click();
  await expect.poll(() => prints(page)).toBe(1);
  const printed = page.locator(".print-root [data-label]");
  await expect.poll(() => printed.count()).toBeGreaterThan(5);
});

test("ticket de venta: imprimir y WhatsApp al cliente; se reimprime desde Ventas de hoy", async ({ page }) => {
  await stubPrint(page);
  await login(page);
  await page.goto("/vender");
  await page.getByRole("button", { name: /^Agregar Vaso térmico de viaje/ }).click();
  await page.getByRole("button", { name: /^Cliente/ }).click();
  const dlg = page.getByRole("dialog", { name: "Cliente" });
  await dlg.getByLabel("Buscar cliente").fill("Marta Ticket");
  await dlg.getByRole("button", { name: "Registrar cliente nuevo" }).click();
  await dlg.getByLabel("Nombre").fill("Marta Ticket");
  await dlg.getByLabel("Teléfono").fill("4735556677");
  await dlg.getByRole("button", { name: "Guardar cliente" }).click();

  await page.getByRole("button", { name: /^Cobrar/ }).click();
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await pay.getByLabel("Recibido").fill("1000");
  await pay.getByRole("button", { name: "Confirmar cobro" }).click();
  const folio = (await pay.getByRole("heading", { name: /Venta #\d+/ }).textContent())!.replace("Venta #", "");

  const wa = pay.getByRole("link", { name: "Enviar por WhatsApp" });
  const href = decodeURIComponent((await wa.getAttribute("href"))!);
  expect(href).toMatch(/^https:\/\/wa\.me\/524735556677\?text=/);
  expect(href).toContain(`Venta #${folio}`);
  expect(href).toContain("Cliente: Marta Ticket");
  expect(href).toMatch(/Cambio: \$/);

  await pay.getByRole("button", { name: "Imprimir ticket" }).click();
  await expect.poll(() => prints(page)).toBe(1);
  const ticket = page.locator(`.print-root [data-ticket="#${folio}"]`);
  await expect(ticket).toContainText("Modas Andrea");
  await expect(ticket).toContainText("Vaso térmico de viaje");
  await expect(ticket).toContainText("Total");
  await expect(ticket).toContainText("¡Gracias por tu compra!");

  await pay.getByRole("button", { name: "Nueva venta" }).click();
  await page.goto("/ventas");
  await page.getByRole("button", { name: new RegExp(`^Venta #${folio} `) }).click();
  await page.getByRole("dialog", { name: `Venta #${folio}` }).getByRole("button", { name: "Imprimir ticket" }).click();
  await expect.poll(() => prints(page)).toBe(1); // la página se recargó
  await expect(page.locator(`.print-root [data-ticket="#${folio}"]`)).toContainText("Marta Ticket");
});

test("ticket de apartado con abonos y saldo", async ({ page }) => {
  await stubPrint(page);
  await login(page);
  await page.goto("/vender");
  await page.getByRole("button", { name: /^Agregar Compás de pizarrón/ }).click();
  await page.getByRole("button", { name: /^Cliente/ }).click();
  const dlg = page.getByRole("dialog", { name: "Cliente" });
  await dlg.getByLabel("Buscar cliente").fill("Nora Apartado");
  await dlg.getByRole("button", { name: "Registrar cliente nuevo" }).click();
  await dlg.getByLabel("Nombre").fill("Nora Apartado");
  await dlg.getByRole("button", { name: "Guardar cliente" }).click();
  await page.getByRole("button", { name: "Apartar" }).click();
  const sheet = page.getByRole("dialog", { name: "Apartar" });
  await sheet.getByLabel("Anticipo").fill("50");
  await sheet.getByRole("button", { name: "Guardar apartado" }).click();
  await sheet.getByRole("button", { name: "Ver apartado" }).click();
  await page.getByRole("button", { name: "Imprimir ticket" }).click();
  const ticket = page.locator(".print-root [data-ticket^='A-']");
  await expect(ticket).toContainText("Abonos");
  await expect(ticket).toContainText("Pagado$50.00");
  await expect(ticket).toContainText("Resta$130.00");
  await expect(ticket).toContainText("Fecha límite");
});
