import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { it, expect } from "vitest";
import App from "./App";
import { server } from "./test/setup";

it("muestra el inicio de sesión sin sesión", async () => {
  server.use(http.get("/api/auth/me", () => HttpResponse.json({ ok: false }, { status: 401 })));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Modas Andrea" })).toBeInTheDocument();
});
