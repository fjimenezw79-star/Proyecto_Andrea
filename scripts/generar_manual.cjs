// Genera Manual_Modas_Andrea.pdf a partir de docs/manual/manual.html (requiere Node y Playwright).
//   node scripts/generar_manual.cjs
const path = require("path");
const { chromium } = require("playwright");
const CREDIT = "Realizado por el I.S.C FRANCISCO JAVIER JIMENEZ WITRAGO";
(async () => {
  const root = path.resolve(__dirname, "..");
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("file://" + path.join(root, "docs", "manual", "manual.html"), { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  await p.pdf({
    path: path.join(root, "Manual_Modas_Andrea.pdf"), format: "Letter", printBackground: true, displayHeaderFooter: true,
    headerTemplate: `<div style="font-size:8px;width:100%;text-align:right;color:#6B665E;padding-right:17mm">${CREDIT}</div>`,
    footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#6B665E">Modas Andrea · Manual de usuario · ${CREDIT} · <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    margin: { top: "18mm", bottom: "20mm", left: "17mm", right: "17mm" },
  });
  await b.close();
})();
