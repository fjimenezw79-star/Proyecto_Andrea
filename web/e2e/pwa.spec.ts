import { expect, test } from "@playwright/test";
import { login } from "./helpers";

async function readyOffline(page: import("@playwright/test").Page) {
  await page.goto("/vender");
  await expect(page.getByRole("button", { name: /^Agregar Princesas Disney/ })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    // espera a que la copia del catálogo quede guardada
    for (let i = 0; i < 50; i++) {
      const ok = await new Promise<boolean>((res) => {
        const r = indexedDB.open("ma-cache");
        r.onsuccess = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains("kv")) return res(false);
          const g = db.transaction("kv").objectStore("kv").get("catalog");
          g.onsuccess = () => res(!!g.result);
          g.onerror = () => res(false);
        };
        r.onerror = () => res(false);
      });
      if (ok && navigator.serviceWorker.controller) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error("La app no quedó guardada en el dispositivo");
  });
}

test("sin señal la app abre y muestra el catálogo guardado", async ({ page, context }) => {
  await login(page, "vendedor", "12345");
  await readyOffline(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Vender" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Agregar Princesas Disney/ })).toBeVisible();
  await page.getByRole("searchbox", { name: "Buscar producto" }).fill("cobija");
  await expect(page.getByRole("button", { name: /^Agregar Cobija tartán/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Agregar Princesas Disney/ })).toHaveCount(0);
  await context.setOffline(false);
});

test("sin señal la sesión no se pierde", async ({ page, context }) => {
  await login(page, "vendedor", "12345");
  await readyOffline(page);
  await context.setOffline(true);
  await page.goto("/apartados");
  await expect(page).not.toHaveURL(/\/entrar/);
  await expect(page.getByRole("navigation", { name: "Principal" }).first()).toBeVisible();
  await context.setOffline(false);
});

test("la app se puede instalar", async ({ page }) => {
  await page.goto("/entrar");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const m = await (await page.request.get(href!)).json();
  expect(m.short_name).toBe("Modas Andrea");
  expect(m.icons.length).toBeGreaterThanOrEqual(2);
  const sw = await page.request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toContain("no-cache");
});
