import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { login } from "./helpers";

// Cámara falsa: muestra una etiqueta impresa con el código MA000015 (Termo clásico rojo).
const video = fileURLToPath(new URL("./fixtures/codigo-ma000015.y4m", import.meta.url));
const chromium = "/opt/pw-browsers/chromium";
test.use({
  permissions: ["camera"],
  launchOptions: {
    ...(existsSync(chromium) ? { executablePath: chromium } : {}),
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${video}`],
  },
});

test("lee el código de barras con la cámara y agrega la pieza", async ({ page }) => {
  await login(page, "vendedor", "12345");
  await page.goto("/vender");
  await page.getByRole("button", { name: "Escanear con la cámara" }).click();
  const sheet = page.getByRole("dialog", { name: "Escanear" });
  await expect(sheet.getByRole("tab", { name: "Código de barras" })).toHaveAttribute("aria-selected", "true");
  await expect(sheet).toBeHidden({ timeout: 15_000 }); // se cierra solo al leer
  await expect(page.getByText("Termo clásico rojo agregado.")).toBeVisible();
  await expect(page.getByRole("complementary").getByText("Termo clásico rojo")).toBeVisible();
});
