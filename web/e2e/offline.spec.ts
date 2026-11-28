import { expect, test, type Page } from "@playwright/test";
import { login, readyOffline } from "./helpers";

async function sellCash(page: Page, product: RegExp) {
  await page.getByRole("button", { name: product }).click();
  await page.getByRole("button", { name: /^Cobrar/ }).click();
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await pay.getByRole("tab", { name: "Efectivo" }).click();
  await pay.getByLabel("Recibido").fill("1000");
  await pay.getByRole("button", { name: "Confirmar cobro" }).click();
  return pay;
}

async function sales(page: Page) {
  return (await (await page.request.get("/api/sales")).json()).sales as { folio: number; client_name?: string | null; created_at: string; items?: { name: string }[] }[];
}

test("sin señal: vender, ver pendiente y enviarse solo al volver", async ({ page, context }) => {
  await login(page, "vendedor", "12345");
  await readyOffline(page);
  const before = (await sales(page)).length;
  await context.setOffline(true);
  const pay = await sellCash(page, /^Agregar Colores de madera/);
  await expect(pay.getByText("Venta guardada en este dispositivo. Se enviará al volver la señal.")).toBeVisible();
  await expect(pay.getByRole("heading", { name: /Venta #P-\d{4}/ })).toBeVisible();
  await pay.getByRole("button", { name: "Nueva venta" }).click();
  await expect(page.getByText("Sin señal").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /1 pendiente/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Agregar Colores de madera/ })).toContainText("Quedan 7");
  await expect(page.getByText(/Sin señal · existencias vistas/)).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText("Todo enviado.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /pendiente/ })).toHaveCount(0);
  const after = await sales(page);
  expect(after.length).toBe(before + 1);
});

test("cliente y venta creados sin señal quedan enlazados", async ({ page, context }) => {
  await login(page, "vendedor", "12345");
  await readyOffline(page);
  await context.setOffline(true);
  await page.getByRole("button", { name: /^Agregar Cuadernos profesionales/ }).click();
  await page.getByRole("button", { name: /^Cliente/ }).click();
  const dlg = page.getByRole("dialog", { name: "Cliente" });
  await dlg.getByRole("button", { name: "Registrar cliente nuevo" }).click();
  await dlg.getByLabel("Nombre").fill("Lucía Sin Señal");
  await dlg.getByLabel("Teléfono").fill("5512345678");
  await dlg.getByRole("button", { name: "Guardar cliente" }).click();
  await expect(page.getByRole("region", { name: "Carrito" }).getByText("Lucía Sin Señal")).toBeVisible();
  const pay = await sellCash(page, /^Agregar Lapicera mapa/);
  await expect(pay.getByText("Venta guardada en este dispositivo. Se enviará al volver la señal.")).toBeVisible();
  await pay.getByRole("button", { name: "Nueva venta" }).click();
  await expect(page.getByRole("button", { name: /2 pendientes/ }).first()).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText("Todo enviado.")).toBeVisible({ timeout: 20_000 });
  const clients = (await (await page.request.get("/api/clients?q=Lucía")).json()).clients as { id: string; name: string }[];
  expect(clients.map((c) => c.name)).toContain("Lucía Sin Señal");
  const s = (await sales(page))[0];
  expect(s.client_name).toBe("Lucía Sin Señal");
});

test("cortar la red a la mitad del envío no duplica", async ({ page }) => {
  await login(page, "vendedor", "12345");
  await readyOffline(page);
  const before = (await sales(page)).length;
  let cut = false;
  await page.route("**/api/sales", async (route) => {
    if (route.request().method() === "POST" && !cut) {
      cut = true;
      await route.fetch(); // el servidor sí registra la venta…
      await route.abort("connectionreset"); // …pero la respuesta nunca llega
      return;
    }
    await route.continue();
  });
  const replay = page.waitForResponse((r) => r.url().endsWith("/api/sales") && r.request().method() === "POST" && r.headers()["x-replayed"] === "1", { timeout: 30_000 });
  const pay = await sellCash(page, /^Agregar Juego de geometría/);
  await expect(pay.getByText("Venta guardada en este dispositivo. Se enviará al volver la señal.")).toBeVisible();
  await replay;
  await expect(page.getByText("Todo enviado.")).toBeVisible({ timeout: 20_000 });
  expect((await sales(page)).length).toBe(before + 1);
});

test("salir con pendientes pide confirmar", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, "vendedor", "12345");
  await readyOffline(page);
  await context.setOffline(true);
  const pay = await sellCash(page, /^Agregar Regla de madera/);
  await pay.getByRole("button", { name: "Nueva venta" }).click();
  await page.getByRole("button", { name: "Salir" }).first().click();
  const ask = page.getByRole("dialog", { name: "¿Salir?" });
  await expect(ask.getByText(/1 acción pendiente sin enviar/)).toBeVisible();
  await ask.getByRole("button", { name: "Quedarme" }).click();
  await expect(page).toHaveURL(/\/vender/);
  await context.setOffline(false);
  await expect(page.getByText("Todo enviado.")).toBeVisible({ timeout: 20_000 });
});

test("si la PC del negocio no responde (error de Cloudflare) la venta se guarda en el dispositivo", async ({ page }) => {
  await login(page, "vendedor", "12345");
  await readyOffline(page);
  const before = (await sales(page)).length;
  const down = (route: import("@playwright/test").Route) => route.fulfill({ status: 530, contentType: "text/html", body: "<h1>error code: 1033</h1>" });
  await page.route("**/api/**", down);
  const pay = await sellCash(page, /^Agregar Juego de geometría/);
  await expect(pay.getByText("Venta guardada en este dispositivo. Se enviará al volver la señal.")).toBeVisible();
  await pay.getByRole("button", { name: "Nueva venta" }).click();
  await expect(page.getByRole("button", { name: /1 pendiente/ }).first()).toBeVisible();
  await page.reload(); // la sesión no se pierde
  await expect(page.getByRole("heading", { name: "Vender" })).toBeVisible();
  await page.unroute("**/api/**", down);
  await expect(page.getByText("Todo enviado.")).toBeVisible({ timeout: 25_000 });
  expect((await sales(page)).length).toBe(before + 1);
});

test("salir sin señal cierra la sesión en el dispositivo y borra los datos guardados", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, "vendedor", "12345");
  await readyOffline(page);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Salir" }).first().click();
  await expect(page).toHaveURL(/\/entrar/);
  const left = await page.evaluate(() => new Promise<unknown>((res) => {
    const r = indexedDB.open("ma-cache");
    r.onsuccess = () => {
      const g = r.result.transaction("kv").objectStore("kv").get("clients");
      const c = r.result.transaction("kv").objectStore("kv").get("catalog");
      let n = 0;
      const out: unknown[] = [];
      const done = () => ++n === 2 && res(out);
      g.onsuccess = () => { out.push(g.result ?? null); done(); };
      c.onsuccess = () => { out.push(c.result ?? null); done(); };
    };
  }));
  expect(left).toEqual([null, null]);
  await context.setOffline(false);
  await page.goto("/vender");
  await expect(page).toHaveURL(/\/entrar/); // con señal tampoco regresa a la sesión anterior
});
