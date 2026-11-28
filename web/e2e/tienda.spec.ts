import { expect, test, type Browser } from "@playwright/test";
import { login } from "./helpers";

/** Un cliente cualquiera: sin sesión en el sistema. */
async function visitor(browser: Browser) {
  const ctx = await browser.newContext({ locale: "es-MX", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, baseURL: "http://127.0.0.1:5055" });
  await ctx.route("https://wa.me/**", (r) => r.fulfill({ contentType: "text/html", body: "<p>WhatsApp</p>" })); // sin salir a internet
  return { ctx, page: await ctx.newPage() };
}

test("cliente pide por WhatsApp desde la tienda y el pedido se confirma y se cobra en el sistema", async ({ page, browser }) => {
  // el administrador pone el WhatsApp del negocio
  await login(page);
  await page.goto("/configuracion");
  await page.getByLabel("WhatsApp del negocio").fill("473 100 2000");
  await page.getByRole("button", { name: "Guardar configuración" }).click();
  await expect(page.getByText("Configuración guardada.")).toBeVisible();
  await expect(page.getByTestId("store-url")).toHaveText(/\/tienda\/$/);

  // cliente en su celular
  const { ctx, page: shop } = await visitor(browser);
  await shop.goto("/tienda/");
  await expect(shop.getByRole("heading", { level: 1 })).toContainText("Para la escuela");
  await shop.getByLabel("Buscar en el catálogo").fill("botella deportiva azul");
  await shop.getByRole("button", { name: /^Botella deportiva azul, \$190/ }).click();
  const sheet = shop.getByRole("dialog", { name: "Detalle del producto" });
  await expect(sheet.getByText("4 disponibles")).toBeVisible();
  await sheet.getByRole("button", { name: "Más" }).click();
  await sheet.getByRole("button", { name: "Agregar a la bolsa" }).click();
  await expect(shop.locator("#bagn")).toHaveText("2");
  await shop.getByRole("button", { name: "Abrir bolsa" }).click();
  const bag = shop.getByRole("dialog", { name: "Bolsa" });
  await expect(bag.locator("#tot")).toHaveText("$380");
  await bag.getByRole("button", { name: "Pedir por WhatsApp" }).click();
  await expect(bag.getByRole("alert")).toHaveText("Escribe tu nombre.");
  await bag.getByLabel("Tu nombre").fill("Paola Tienda");
  await bag.getByLabel("Tu WhatsApp").fill("4739998877");
  const popup = shop.waitForEvent("popup");
  await bag.getByRole("button", { name: "Pedir por WhatsApp" }).click();
  const wa = await popup;
  await expect.poll(() => wa.url()).toMatch(/wa\.me\/524731002000\?text=/);
  const text = decodeURIComponent(wa.url().split("text=")[1]);
  const folio = text.match(/pedido (W-[A-Z0-9]{5})/)![1];
  expect(text).toContain("2 × Botella deportiva azul — $380");
  expect(text).toContain("Nombre: Paola Tienda");
  await expect(bag.getByText(`¡Pedido ${folio} enviado!`)).toBeVisible();
  await expect(shop.locator("#bagn")).toHaveText("0");
  await ctx.close();

  // en el sistema
  await page.goto("/pedidos");
  await expect(page.getByRole("navigation", { name: "Principal" }).first().getByLabel("1 pendientes")).toBeVisible();
  await page.getByRole("button", { name: `Pedido ${folio} de Paola Tienda` }).click();
  const dlg = page.getByRole("dialog", { name: `Pedido ${folio}` });
  await expect(dlg).toContainText("2 × Botella deportiva azul");
  await expect(dlg.getByRole("link", { name: /Escribirle por WhatsApp/ })).toHaveAttribute("href", /wa\.me\/524739998877/);
  await dlg.getByRole("button", { name: "Confirmar" }).click();
  await dlg.getByRole("button", { name: "Confirmar y apartar" }).click();
  await expect(page.getByText(`Pedido ${folio} confirmado. Las piezas quedaron apartadas.`)).toBeVisible();

  await page.getByRole("tab", { name: /Confirmados/ }).click();
  await page.getByRole("button", { name: `Pedido ${folio} de Paola Tienda` }).click();
  await page.getByRole("dialog", { name: `Pedido ${folio}` }).getByRole("button", { name: "Cobrar" }).click();
  await page.getByRole("radio", { name: "Transferencia" }).check({ force: true });
  await page.getByRole("button", { name: "Registrar cobro" }).click();
  const done = page.getByRole("dialog", { name: "Pedido cobrado" });
  await expect(done).toContainText(/venta #\d+/);
  await expect(done.getByRole("button", { name: "Imprimir ticket" })).toBeVisible();
  await done.getByRole("button", { name: "Listo" }).click();

  // las piezas se descontaron una sola vez
  await page.goto("/inventario");
  await page.getByLabel("Buscar en inventario").fill("Botella deportiva azul");
  await page.getByRole("link", { name: /Botella deportiva azul/ }).first().click();
  await expect(page.getByTestId("stock-total")).toHaveText("2 piezas");
});

test("cada producto tiene su página con vista previa para WhatsApp y Facebook", async ({ page, browser }) => {
  await login(page);
  await page.goto("/inventario");
  await page.getByLabel("Buscar en inventario").fill("Cobija gris de sala");
  await page.getByRole("link", { name: /Cobija gris de sala/ }).first().click();
  const share = page.getByRole("link", { name: "Compartir de la tienda" });
  const link = (await share.getAttribute("title"))!;
  expect(link).toMatch(/\/tienda\/p\/cobija-gris-de-sala-\d+\/$/);

  const { ctx, page: shop } = await visitor(browser);
  const path = new URL(link).pathname; // el enlace usa la IP de la red local; aquí se prueba su ruta
  const res = await shop.request.get(path);
  const html = await res.text();
  expect(html).toContain('<meta property="og:title" content="Cobija gris de sala · $390 · Modas Andrea">');
  const og = html.match(/property="og:image" content="([^"]+)"/)![1];
  expect(og).toMatch(/^http:\/\/127\.0\.0\.1:5055\/tienda\/og\/\d+\.jpg$/);
  expect((await shop.request.get(new URL(og).pathname)).headers()["content-type"]).toBe("image/jpeg");
  await shop.goto(path);
  await expect(shop.getByRole("dialog", { name: "Detalle del producto" }).getByRole("heading", { name: "Cobija gris de sala" })).toBeVisible();
  await ctx.close();
});

test("los productos que no están en la tienda no se ven", async ({ page, browser }) => {
  await login(page);
  await page.goto("/inventario");
  await page.getByLabel("Buscar en inventario").fill("Termos infantiles");
  await page.getByRole("link", { name: /Termos infantiles/ }).first().click();
  await page.getByRole("switch").click(); // apaga "Mostrar en tienda en línea"
  await expect(page.getByText("Ya no aparece en la tienda en línea.")).toBeVisible();
  const { ctx, page: shop } = await visitor(browser);
  await shop.goto("/tienda/");
  await shop.getByLabel("Buscar en el catálogo").fill("Termos infantiles");
  await expect(shop.getByText("No encontramos “Termos infantiles”")).toBeVisible();
  await ctx.close();
  await page.getByRole("switch").click();
});
