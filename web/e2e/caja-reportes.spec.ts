import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("abrir caja, cobrar en efectivo con cambio y hacer corte", async ({ page }) => {
  await login(page, "vendedor", "12345");
  await page.goto("/caja");
  await expect(page.getByRole("button", { name: /Abrir caja|Hacer corte/ })).toBeVisible();
  if (await page.getByRole("button", { name: "Hacer corte" }).count()) {
    await page.getByRole("button", { name: "Hacer corte" }).click();
    const pre = page.getByRole("dialog", { name: "Corte de caja" });
    const cents = Number(await page.getByTestId("expected").getAttribute("data-cents"));
    await pre.getByLabel("Efectivo contado").fill((cents / 100).toFixed(2));
    await pre.getByRole("button", { name: "Guardar corte" }).click();
  }
  await page.getByLabel("Fondo inicial").fill("500");
  await page.getByRole("button", { name: "Abrir caja" }).click();
  await expect(page.getByTestId("expected")).toHaveText("$500.00");
  await page.goto("/vender");
  await page.getByRole("button", { name: /^Agregar Sacapuntas avión/ }).click();
  await page.getByRole("button", { name: /^Cobrar/ }).click();
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await pay.getByLabel("Recibido").fill("100");
  await pay.getByRole("button", { name: "Confirmar cobro" }).click();
  await pay.getByRole("button", { name: "Nueva venta" }).click();
  await page.goto("/caja");
  await expect(page.getByTestId("expected")).toHaveText("$545.00");
  await page.getByRole("button", { name: "Hacer corte" }).click();
  const dlg = page.getByRole("dialog", { name: "Corte de caja" });
  await dlg.getByLabel("Efectivo contado").fill("545");
  await expect(dlg.getByText("Cuadra")).toBeVisible();
  await dlg.getByRole("button", { name: "Guardar corte" }).click();
  await expect(page.getByRole("status")).toContainText("Corte registrado");
  await expect(page.getByRole("button", { name: "Abrir caja" })).toBeVisible();
});

test("gasto pagado con caja baja el esperado", async ({ page }) => {
  await login(page);
  await page.goto("/caja");
  await expect(page.getByRole("button", { name: /Abrir caja|Hacer corte/ })).toBeVisible();
  if (await page.getByRole("button", { name: "Abrir caja" }).count()) {
    await page.getByLabel("Fondo inicial").fill("300");
    await page.getByRole("button", { name: "Abrir caja" }).click();
  }
  const before = Number(await page.getByTestId("expected").getAttribute("data-cents"));
  await page.goto("/gastos");
  await page.getByLabel("Concepto").fill("Garrafón de agua");
  await page.getByLabel("Categoría").selectOption("Insumos");
  await page.getByLabel("Monto").fill("45");
  await page.getByRole("checkbox", { name: "Se pagó con dinero de la caja" }).check();
  await page.getByRole("button", { name: "Registrar gasto" }).click();
  await expect(page.getByRole("list", { name: "Gastos" })).toContainText("Garrafón de agua");
  await page.goto("/caja");
  await expect(page.getByTestId("expected")).toHaveAttribute("data-cents", String(before - 4500));
});

test("reportes del mes muestran ventas netas y bajan el CSV", async ({ page }) => {
  await login(page);
  await page.goto("/reportes");
  await page.getByRole("button", { name: "Mes" }).click();
  await expect(page.getByTestId("kpi-net")).not.toHaveText("$0.00");
  await expect(page.getByRole("img", { name: /Ventas netas por día/ })).toBeVisible();
  await expect(page.getByRole("table", { name: "Más vendidos" })).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Descargar Excel (CSV)" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^ventas_.*\.csv$/);
});

test("panel muestra 'Se agota pronto' y la utilidad del mes", async ({ page }) => {
  await login(page);
  await page.goto("/vender");
  const card = page.getByRole("button", { name: /^Agregar Cobija cuadros tejidos/ });
  for (let i = 0; i < 4; i++) await card.click();
  await page.getByRole("button", { name: /^Cobrar/ }).click();
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await pay.getByRole("tab", { name: "Tarjeta" }).click();
  await pay.getByRole("button", { name: "Confirmar cobro" }).click();
  await pay.getByRole("button", { name: "Nueva venta" }).click();
  await page.goto("/panel");
  await expect(page.getByRole("region", { name: "Se agota pronto" })).toContainText("Cobija cuadros tejidos");
  await expect(page.getByText("Utilidad del mes")).toBeVisible();
});
