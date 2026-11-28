import { BitArray, Code128Reader, DecodeHintType } from "@zxing/library";
import { describe, expect, it } from "vitest";
import { bars, encodeValues, encodeWidths, patterns, START_B, START_C } from "./code128";

/** Dibuja el código en una fila de píxeles y lo lee con ZXing, como lo haría la cámara. */
function decode(text: string): string {
  const { rects, width } = bars(text);
  const scale = 3;
  const row = new BitArray(width * scale);
  for (const [x, w] of rects) for (let p = x * scale; p < (x + w) * scale; p++) row.set(p);
  const hints = new Map([[DecodeHintType.ASSUME_GS1, false]]);
  return new Code128Reader().decodeRow(0, row, hints).getText();
}

describe("code128", () => {
  it("cada patrón mide 11 módulos (13 el de parada)", () => {
    const p = patterns();
    expect(p).toHaveLength(107);
    p.slice(0, 106).forEach((x) => expect([...x].reduce((s, d) => s + Number(d), 0)).toBe(11));
    expect([...p[106]].reduce((s, d) => s + Number(d), 0)).toBe(13);
  });

  it("calcula el dígito de control conocido", () => {
    // "PJJ123C" en juego B: 104 + 48·1 + 42·2 + 42·3 + 17·4 + 18·5 + 19·6 + 35·7 = 879 → 879 mod 103 = 55
    expect(encodeValues("PJJ123C")).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55]);
  });

  it("usa juego C para los dígitos del código interno", () => {
    const v = encodeValues("MA000123");
    expect(v[0]).toBe(START_B);
    expect(v.slice(1, 4)).toEqual([45, 33, 99]); // M, A, cambio a C
    expect(v.slice(4, 7)).toEqual([0, 1, 23]);
    expect(encodeValues("12345678")[0]).toBe(START_C);
  });

  it.each(["MA000123", "MA000001", "7501234567893", "ABC-12", "PJJ123C", "1234567", "A1", "MA12345X"])("ZXing lee %s", (code) => {
    expect(decode(code)).toBe(code);
  });

  it("los anchos alternan barra y espacio y terminan en barra", () => {
    expect(encodeWidths("MA000123").length % 2).toBe(1);
  });

  it("rechaza vacíos y caracteres no imprimibles", () => {
    expect(() => encodeValues("")).toThrow();
    expect(() => encodeValues("Ñ")).toThrow();
  });
});
