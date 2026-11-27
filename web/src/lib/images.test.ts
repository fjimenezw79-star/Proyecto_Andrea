import { expect, it } from "vitest";
import { fitSize } from "./images";

it("reduce a 1600 por el lado mayor", () => {
  expect(fitSize(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
  expect(fitSize(1200, 4000, 1600)).toEqual({ width: 480, height: 1600 });
});

it("nunca agranda", () => {
  expect(fitSize(800, 600, 1600)).toEqual({ width: 800, height: 600 });
});
