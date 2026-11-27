/** Cliente de la API: sesión por cookie, token CSRF en todo lo que no es GET y errores en español. */

export class ApiError extends Error {
  status: number;
  field: string | null;
  data: Record<string, unknown>;
  constructor(status: number, message: string, field: string | null = null, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.field = field;
    this.data = data;
  }
}

export class AuthError extends ApiError {}

const CSRF_EXPIRED = "La sesión de seguridad expiró";
const NETWORK = "No hay conexión con el servidor. Revisa la red e inténtalo de nuevo.";

let csrfToken: string | null = null;

export function resetCsrf() {
  csrfToken = null;
}

function url(path: string) {
  return new URL(path, window.location.origin).toString();
}

async function getCsrf(): Promise<string> {
  if (!csrfToken) {
    const r = await fetch(url("/api/auth/csrf"), { credentials: "same-origin" });
    csrfToken = ((await r.json()) as { token: string }).token;
  }
  return csrfToken;
}

type Opts = { method?: string; json?: unknown; form?: FormData };

export async function api<T = Record<string, unknown>>(path: string, opts: Opts = {}, retried = false): Promise<T> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    body = opts.form;
  }
  let res: Response;
  try {
    if (method !== "GET") headers["X-CSRFToken"] = await getCsrf();
    res = await fetch(url(path), { method, headers, body, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, NETWORK);
  }
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* respuesta sin JSON */
  }
  if (res.ok && data.ok !== false) return data as T;
  const message = typeof data.message === "string" && data.message ? data.message : "Ocurrió un error inesperado. Inténtalo de nuevo.";
  if (res.status === 400 && message.startsWith(CSRF_EXPIRED) && !retried) {
    resetCsrf();
    return api<T>(path, opts, true);
  }
  if (res.status === 401) throw new AuthError(401, message);
  throw new ApiError(res.status, message, (data.field as string) ?? null, data);
}
