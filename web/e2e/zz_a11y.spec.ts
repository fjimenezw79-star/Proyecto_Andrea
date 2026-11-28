import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const PAGES = ["/vender", "/apartados", "/caja", "/clientes", "/inventario", "/ventas", "/panel", "/reportes", "/gastos", "/productos/nuevo", "/categorias", "/configuracion", "/bitacora", "/conectar"];

for (const [w, h] of [[390, 844], [1280, 800]] as const) {
  test(`sin fallas graves de accesibilidad a ${w}px`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto("/entrar");
    await page.waitForTimeout(900);
    let r = await new AxeBuilder({ page }).analyze();
    const bad = (v: typeof r.violations) => v.filter((x) => x.impact === "serious" || x.impact === "critical").map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
    const found: string[] = bad(r.violations).map((x) => `/entrar ${x}`);
    await login(page);
    for (const p of PAGES) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(400);
      r = await new AxeBuilder({ page }).analyze();
      found.push(...bad(r.violations).map((x) => `${p} ${x}`));
    }
    expect(found).toEqual([]);
    await ctx.close();
  });
}
