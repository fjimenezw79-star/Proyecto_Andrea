import { expect, it } from "vitest";
import { newId } from "./cart";

it("genera ids aunque el navegador no tenga crypto.randomUUID (red local sin https)", () => {
  const orig = crypto.randomUUID;
  // @ts-expect-error simulamos un navegador en http://192.168…
  crypto.randomUUID = undefined;
  try {
    const a = newId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newId()).not.toBe(a);
  } finally {
    crypto.randomUUID = orig;
  }
});

it("ningún componente usa crypto.randomUUID directo", async () => {
  const files = import.meta.glob("../**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const offenders = Object.entries(files).filter(([, src]) => src.includes("crypto.randomUUID")).map(([f]) => f);
  expect(offenders).toEqual([]);
});
