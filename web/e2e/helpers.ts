import { expect, type Page } from "@playwright/test";

export async function login(page: Page, username = "admin", password = "admin123") {
  await page.goto("/entrar");
  await page.getByLabel("Usuario").fill(username);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/entrar/);
  await expect(page.getByRole("navigation", { name: "Principal" }).first()).toBeVisible();
}

/** Espera a que la app y la copia del catálogo queden guardadas en el dispositivo. */
export async function readyOffline(page: Page) {
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

