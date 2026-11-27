import { expect, it } from "vitest";
import { safeTarget } from "./safeTarget";

it.each([["/inventario", "/inventario"], [null, "/vender"], ["//evil.com", "/vender"], ["/\\evil.com", "/vender"], ["https://evil.com", "/vender"], ["/ventas?x=1", "/ventas?x=1"]])(
  "safeTarget(%s) = %s", (v, out) => expect(safeTarget(v)).toBe(out));
