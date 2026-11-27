import { describe, expect, it } from "vitest";
import { formatMoney, parsePesos } from "./money";

describe("parsePesos", () => {
  it.each([["350", 35000], ["350.5", 35050], ["350.50", 35050], ["1,250.00", 125000], ["$99", 9900], [" 12 ", 1200], ["0", 0], ["1,250", 125000]])(
    "parsePesos(%s) = %i", (t, c) => expect(parsePesos(t)).toBe(c));
  it.each(["abc", "1.234.5", "12.345", "-5", "", "1,2,3", "12,34"])("rechaza %s", (t) => expect(parsePesos(t)).toBeNull());
});

it("formatMoney", () => {
  expect(formatMoney(125000)).toBe("$1,250.00");
  expect(formatMoney(0)).toBe("$0.00");
  expect(formatMoney(5)).toBe("$0.05");
});
