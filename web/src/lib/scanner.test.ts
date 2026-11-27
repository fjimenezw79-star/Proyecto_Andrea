import { expect, it, vi } from "vitest";
import { createScanDetector } from "./scanner";

function feed(handle: (e: KeyboardEvent) => boolean, keys: string[], gapMs: number, start = 1000) {
  let t = start;
  const results: boolean[] = [];
  for (const k of keys) {
    vi.setSystemTime(t);
    results.push(handle(new KeyboardEvent("keydown", { key: k })));
    t += gapMs;
  }
  return results;
}

it("el lector USB se detecta por rapidez y Enter", () => {
  vi.useFakeTimers();
  const onScan = vi.fn();
  const d = createScanDetector(onScan);
  feed(d.handleKey, [..."MA000002", "Enter"], 10);
  expect(onScan).toHaveBeenCalledWith("MA000002");
  vi.useRealTimers();
});

it("el tecleo de una persona no dispara", () => {
  vi.useFakeTimers();
  const onScan = vi.fn();
  const d = createScanDetector(onScan);
  feed(d.handleKey, [..."MA000002", "Enter"], 150);
  expect(onScan).not.toHaveBeenCalled();
  vi.useRealTimers();
});

it("códigos de menos de 4 caracteres no cuentan", () => {
  vi.useFakeTimers();
  const onScan = vi.fn();
  const d = createScanDetector(onScan);
  feed(d.handleKey, [..."AB1", "Enter"], 5);
  expect(onScan).not.toHaveBeenCalled();
  vi.useRealTimers();
});
