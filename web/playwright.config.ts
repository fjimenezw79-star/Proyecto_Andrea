import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const chromium = "/opt/pw-browsers/chromium";
const launchOptions = existsSync(chromium) ? { executablePath: chromium } : {};

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: { baseURL: "http://127.0.0.1:5055", trace: "off", locale: "es-MX", launchOptions },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions } }],
  webServer: {
    command: "cd .. && .venv/bin/python -m scripts.e2e_server",
    url: "http://127.0.0.1:5055/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
