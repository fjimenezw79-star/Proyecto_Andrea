/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

/** Genera sw.js con la lista de archivos del build para guardarlos en el dispositivo. */
function serviceWorker(): Plugin {
  return {
    name: "ma-service-worker",
    apply: "build",
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith(".map") && !f.startsWith("vision/"));
      const extra = ["manifest.webmanifest", "favicon.svg", "icon-192.png", "icon-512.png"];
      const list = ["/", "/index.html", ...files.filter((f) => f !== "index.html").map((f) => `/${f}`), ...extra.map((f) => `/${f}`)];
      const version = createHash("sha256").update(files.sort().join("|")).digest("hex").slice(0, 12);
      const src = readFileSync(new URL("./sw/sw.js", import.meta.url), "utf8")
        .replace("__VERSION__", version)
        .replace("__PRECACHE__", JSON.stringify(list));
      this.emitFile({ type: "asset", fileName: "sw.js", source: src });
    },
  };
}

/** Copia los .wasm de MediaPipe a /vision/wasm: el reconocimiento visual no depende de ningún CDN. */
function visionWasm(): Plugin {
  const files = ["vision_wasm_internal.js", "vision_wasm_internal.wasm"];
  return {
    name: "ma-vision-wasm",
    apply: "build",
    generateBundle() {
      for (const f of files) {
        this.emitFile({ type: "asset", fileName: `vision/wasm/${f}`, source: readFileSync(new URL(`./node_modules/@mediapipe/tasks-vision/wasm/${f}`, import.meta.url)) });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), visionWasm(), serviceWorker()],
  build: { outDir: "../server/web_dist", emptyOutDir: true },
  server: {
    proxy: { "/api": "http://127.0.0.1:5000", "/uploads": "http://127.0.0.1:5000", "/vision/wasm": "http://127.0.0.1:5000" },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
