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

it("una página de error de Cloudflare (530/502) cuenta como sin señal", async () => {
  server.use(
    http.get(`${URL}/api/products`, () => new HttpResponse("<h1>error code: 1033</h1>", { status: 530, headers: { "Content-Type": "text/html" } })),
    http.get(`${URL}/api/caja`, () => new HttpResponse("Bad gateway", { status: 502 })),
  );
  await expect(api("/api/products")).rejects.toMatchObject({ status: 0 });
  await expect(api("/api/caja")).rejects.toMatchObject({ status: 0 });
});

it("un 500 con mensaje del sistema no se confunde con falta de señal", async () => {
  server.use(http.get(`${URL}/api/y`, () => HttpResponse.json({ ok: false, message: "Falla interna" }, { status: 500 })));
  await expect(api("/api/y")).rejects.toMatchObject({ status: 500, message: "Falla interna" });
});

it("sin conexión, una acción que no se guarda en el dispositivo pide conexión", async () => {
  resetCsrf();
  server.use(
    http.get(`${URL}/api/auth/csrf`, () => HttpResponse.json({ ok: true, token: "t" })),
    http.post(`${URL}/api/expenses`, () => HttpResponse.error()),
  );
  await expect(api("/api/expenses", { method: "POST", json: {} })).rejects.toMatchObject({ status: 0, message: "Necesitas conexión para hacer esto." });
});
