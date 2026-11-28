import { expect, test, type Page } from "@playwright/test";
import { login, readyOffline } from "./helpers";

/** Simula lo que hace la cola del dispositivo: una venta que llega marcada como hecha sin señal. */
async function offlineSale(page: Page, code: string, qty: number) {
  return page.evaluate(
    async ({ code, qty }) => {
      const token = (await (await fetch("/api/auth/csrf")).json()).token as string;
      const p = (await (await fetch(`/api/products?q=${code}`)).json()).products[0];
      const v = p.variants[0];
      const uid = `prueba-${Date.now()}`;
      const d = new Date(Date.now() - 5 * 60_000);
      const p2 = (n: number) => String(n).padStart(2, "0");
      const when = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
      const r = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": token, "X-Client-Uid": uid, "X-Client-Time": when, "X-Offline": "1" },
        body: JSON.stringify({ id: crypto.randomUUID(), items: [{ variant_id: v.id, qty, discount_cents: 0 }], discount_cents: 0, payments: [{ method: "card", amount_cents: v.price_cents * qty }] }),
      });
      return r.status;
    },
    { code, qty },
  );
}

test("alerta de stock negativo aparece en el Panel y se marca revisada", async ({ page }) => {
  await login(page);
  expect(await offlineSale(page, "MA000014", 2)).toBe(201);
  await page.goto("/panel");
  const panel = page.getByRole("region", { name: "Stock negativo por ventas sin señal" });
  await expect(panel.getByText("Mochila de piel vintage")).toBeVisible();
  await expect(panel.getByText(/quedó en -1/)).toBeVisible();
  await panel.getByRole("button", { name: "Marcar como revisada" }).click();
  await expect(page.getByText("Alerta marcada como revisada.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Stock negativo por ventas sin señal" })).toHaveCount(0);
});

test("bitácora muestra la venta hecha sin señal", async ({ page, context }) => {
  await login(page);
  await readyOffline(page);
  await context.setOffline(true);
  await page.getByRole("button", { name: /^Agregar Cobija zigzag/ }).click();
  await page.getByRole("button", { name: /^Cobrar/ }).click();
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await pay.getByRole("tab", { name: "Tarjeta" }).click();
  await pay.getByRole("button", { name: "Confirmar cobro" }).click();
  await expect(pay.getByText("Venta guardada en este dispositivo. Se enviará al volver la señal.")).toBeVisible();
  await pay.getByRole("button", { name: "Nueva venta" }).click();
  await context.setOffline(false);
  await expect(page.getByText("Todo enviado.")).toBeVisible({ timeout: 20_000 });
  await page.goto("/bitacora");
  const row = page.getByRole("listitem").filter({ hasText: "Registró venta" }).filter({ hasText: "Sin señal" }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("Administrador");
  await expect(row).toContainText(/Hecha a las/);
});
