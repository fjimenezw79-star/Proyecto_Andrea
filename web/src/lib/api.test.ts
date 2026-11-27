import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { api, ApiError, AuthError, resetCsrf } from "./api";
import { server } from "../test/setup";

const URL = "http://localhost:3000";

it("manda el token CSRF en POST y reintenta una vez si expiró", async () => {
  resetCsrf();
  let csrfCalls = 0;
  let posts = 0;
  server.use(
    http.get(`${URL}/api/auth/csrf`, () => HttpResponse.json({ ok: true, token: `t${++csrfCalls}` })),
    http.post(`${URL}/api/x`, ({ request }) => {
      posts++;
      if (request.headers.get("X-CSRFToken") === "t1")
        return HttpResponse.json({ ok: false, message: "La sesión de seguridad expiró. Recarga la página e inténtalo de nuevo." }, { status: 400 });
      return HttpResponse.json({ ok: true, value: 7 });
    }),
  );
  await expect(api<{ value: number }>("/api/x", { method: "POST", json: {} })).resolves.toMatchObject({ value: 7 });
  expect(csrfCalls).toBe(2);
  expect(posts).toBe(2);
});

it("401 lanza AuthError", async () => {
  server.use(http.get(`${URL}/api/auth/me`, () => HttpResponse.json({ ok: false, message: "Inicia sesión para continuar." }, { status: 401 })));
  await expect(api("/api/auth/me")).rejects.toBeInstanceOf(AuthError);
});

it("ok:false lanza ApiError con field", async () => {
  server.use(http.get(`${URL}/api/y`, () => HttpResponse.json({ ok: false, message: "El precio es obligatorio.", field: "price_cents" }, { status: 400 })));
  const err = await api("/api/y").catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ status: 400, message: "El precio es obligatorio.", field: "price_cents" });
});

it("un error de red da un mensaje en español", async () => {
  server.use(http.get(`${URL}/api/z`, () => HttpResponse.error()));
  const err = await api("/api/z").catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.message).toBe("No hay conexión con el servidor. Revisa la red e inténtalo de nuevo.");
});
