import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

async function pickClient(page: Page, name: string, phone?: string) {
  await page.getByRole("button", { name: /^Cliente/ }).click();
  const dlg = page.getByRole("dialog", { name: "Cliente" });
  await dlg.getByLabel("Buscar cliente").fill(name);
  const existing = dlg.getByRole("button", { name: new RegExp(`^${name}`) });
  if (phone === undefined && (await existing.count())) {
    await existing.first().click();
  } else {
    await dlg.getByRole("button", { name: "Registrar cliente nuevo" }).click();
    await dlg.getByLabel("Nombre").fill(name);
    if (phone) await dlg.getByLabel("Teléfono").fill(phone);
    await dlg.getByRole("button", { name: "Guardar cliente" }).click();
  }
  await expect(page.getByRole("button", { name: new RegExp(`^Cliente: ${name}`) })).toBeVisible();
}

test("alta rápida de cliente desde el carrito suma puntos", async ({ page }) => {
  await login(page, "vendedor", "12345");
  await page.goto("/vender");
  await page.getByRole("button", { name: /^Agregar Mochila búho/ }).click();
  await pickClient(page, "Rosa Martínez", "4731112233");
  await page.getByRole("button", { name: /^Cobrar/ }).click();
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await pay.getByRole("tab", { name: "Tarjeta" }).click();
  await pay.getByRole("button", { name: "Confirmar cobro" }).click();
  await pay.getByRole("button", { name: "Nueva venta" }).click();
  await page.goto("/clientes");
  await page.getByLabel("Buscar cliente").fill("Rosa");
  await page.getByRole("link", { name: /Rosa Martínez/ }).click();
  await expect(page.getByText("28 puntos")).toBeVisible();
});

test("apartado: crear con anticipo, abonar y liquidar", async ({ page }) => {
  await login(page, "vendedor", "12345");
  await page.goto("/vender");
  await expect(page.getByRole("button", { name: /^Agregar Reloj cuadrado lila/ })).toContainText("Quedan 3");
  await page.getByRole("button", { name: /^Agregar Reloj cuadrado lila/ }).click();
  await pickClient(page, "Carmen Ruiz", "4732223344");
  await page.getByRole("button", { name: "Apartar" }).click();
  const sheet = page.getByRole("dialog", { name: "Apartar" });
  await sheet.getByLabel("Anticipo").fill("500");
  await sheet.getByRole("button", { name: "Guardar apartado" }).click();
  await expect(sheet.getByRole("heading", { name: /Apartado #\d+/ })).toBeVisible();
  await expect(sheet.getByText("Saldo $1,090.00")).toBeVisible();
  await sheet.getByRole("button", { name: "Ver apartado" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Apartado #\d+/ })).toBeVisible();
  await page.getByRole("button", { name: "Registrar abono" }).click();
  const ab = page.getByRole("dialog", { name: "Registrar abono" });
  await ab.getByLabel("Monto").fill("590");
  await ab.getByRole("button", { name: "Guardar abono" }).click();
  await expect(page.getByTestId("balance")).toHaveText("$500.00");
  await page.getByRole("button", { name: "Liquidar" }).click();
  const liq = page.getByRole("dialog", { name: "Liquidar" });
  await liq.getByRole("button", { name: "Confirmar y liquidar" }).click();
  await expect(page.getByText("Liquidado", { exact: true }).first()).toBeVisible();
  await page.goto("/vender");
  await expect(page.getByRole("button", { name: /^Agregar Reloj cuadrado lila/ })).toContainText("Quedan 2");
});

test("abono mayor que el saldo muestra el mensaje y no guarda", async ({ page }) => {
  await login(page, "vendedor", "12345");
  await page.goto("/vender");
  await page.getByRole("button", { name: /^Agregar Tijeras escolares/ }).click();
  await pickClient(page, "Pedro Luna", "4733334455");
  await page.getByRole("button", { name: "Apartar" }).click();
  const sheet = page.getByRole("dialog", { name: "Apartar" });
  await sheet.getByLabel("Anticipo").fill("10");
  await sheet.getByRole("button", { name: "Guardar apartado" }).click();
  await sheet.getByRole("button", { name: "Ver apartado" }).click();
  await page.getByRole("button", { name: "Registrar abono" }).click();
  const ab = page.getByRole("dialog", { name: "Registrar abono" });
  await ab.getByLabel("Monto").fill("100");
  await ab.getByRole("button", { name: "Guardar abono" }).click();
  await expect(ab.getByText("El abono es mayor que el saldo. Faltan $25.00.")).toBeVisible();
  await ab.getByRole("button", { name: "Cerrar" }).click();
  await expect(page.getByTestId("balance")).toHaveText("$25.00");
});

test("cancelar apartado como saldo a favor y usarlo en una venta", async ({ page }) => {
  await login(page);
  await page.goto("/vender");
  await page.getByRole("button", { name: /^Agregar Marcatextos pastel/ }).click();
  await pickClient(page, "Lucía Gómez", "4734445566");
  await page.getByRole("button", { name: "Apartar" }).click();
  const sheet = page.getByRole("dialog", { name: "Apartar" });
  await sheet.getByLabel("Anticipo").fill("40");
  await sheet.getByRole("button", { name: "Guardar apartado" }).click();
  await sheet.getByRole("button", { name: "Ver apartado" }).click();
  await page.getByRole("button", { name: "Cancelar apartado" }).click();
  const c = page.getByRole("dialog", { name: "Cancelar apartado" });
  await c.getByLabel("Motivo").fill("Ya no lo quiere");
  await c.getByRole("radio", { name: "Dejar como saldo a favor" }).check();
  await c.getByRole("button", { name: "Confirmar cancelación" }).click();
  await expect(page.getByText("Cancelado", { exact: true })).toBeVisible();
  await page.goto("/vender");
  await page.getByRole("button", { name: /^Agregar Transportador de colores/ }).click();
  await pickClient(page, "Lucía Gómez");
  await expect(page.getByRole("button", { name: /^Cliente: Lucía Gómez/ })).toContainText("Saldo $40.00");
  await page.getByRole("button", { name: /^Cobrar/ }).click();
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await pay.getByRole("tab", { name: "Saldo" }).click();
  await pay.getByRole("button", { name: "Confirmar cobro" }).click();
  await expect(pay.getByRole("heading", { name: /Venta #\d+/ })).toBeVisible();
});

test("devolver 1 de 2 piezas reembolsa y regresa stock", async ({ page }) => {
  await login(page);
  await page.goto("/vender");
  const card = page.getByRole("button", { name: /^Agregar Regla de 30 cm/ });
  await card.click();
  await card.click();
  await page.getByRole("button", { name: /^Cobrar/ }).click();
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await pay.getByRole("tab", { name: "Tarjeta" }).click();
  await pay.getByRole("button", { name: "Confirmar cobro" }).click();
  const folio = (await pay.getByRole("heading", { name: /Venta #\d+/ }).textContent())!.replace("Venta #", "");
  await pay.getByRole("button", { name: "Nueva venta" }).click();
  await expect(card).toContainText("Quedan 18");
  await page.goto("/ventas");
  await page.getByRole("button", { name: new RegExp(`^Venta #${folio} `) }).click();
  const det = page.getByRole("dialog", { name: `Venta #${folio}` });
  await det.getByRole("button", { name: "Devolver piezas" }).click();
  await det.getByLabel("Piezas a devolver de Regla de 30 cm").fill("1");
  await expect(det.getByText("Reembolso $15.00")).toBeVisible();
  await det.getByLabel("Motivo de la devolución").fill("Venía rota");
  await det.getByRole("button", { name: "Confirmar devolución" }).click();
  await expect(page.getByRole("status")).toContainText("Devolución registrada");
  await page.goto("/vender");
  await expect(card).toContainText("Quedan 19");
});
