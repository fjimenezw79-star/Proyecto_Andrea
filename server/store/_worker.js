// Modas Andrea · Tienda en Cloudflare Pages: guarda los pedidos (KV "ORDERS") hasta que la PC del negocio los recoge.
// Lo genera y publica el sistema (server/store/cloud.py). No lo edites a mano.
const SECRET = "__SECRET__";
const ID_RE = /^[A-Za-z0-9-]{8,36}$/;
const FOLIO_RE = /^W-[A-Z0-9]{4,8}$/;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function authorized(req) {
  return req.headers.get("authorization") === `Bearer ${SECRET}`;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/api/pedido" && req.method === "POST") {
      const text = await req.text();
      if (text.length > 20000) return json({ ok: false, message: "Pedido demasiado grande." }, 400);
      let o;
      try { o = JSON.parse(text); } catch { return json({ ok: false, message: "Pedido no válido." }, 400); }
      if (!o || !ID_RE.test(String(o.id)) || !Array.isArray(o.items) || !o.items.length || o.items.length > 30)
        return json({ ok: false, message: "Pedido no válido." }, 400);
      if (!FOLIO_RE.test(String(o.folio))) o.folio = "W-" + crypto.randomUUID().replace(/[^A-Z0-9]/gi, "").slice(0, 5).toUpperCase();
      const key = `order:${o.id}`;
      if (!(await env.ORDERS.get(key))) await env.ORDERS.put(key, JSON.stringify({ ...o, received_at: new Date().toISOString() }));
      return json({ ok: true, folio: o.folio, id: o.id }, 201);
    }
    if (url.pathname === "/api/pedidos" && req.method === "GET") {
      if (!authorized(req)) return json({ ok: false }, 401);
      const list = await env.ORDERS.list({ prefix: "order:", limit: 100 });
      const orders = [];
      for (const k of list.keys) {
        const v = await env.ORDERS.get(k.name);
        if (v) orders.push(JSON.parse(v));
      }
      return json({ ok: true, orders });
    }
    if (url.pathname === "/api/pedidos/ack" && req.method === "POST") {
      if (!authorized(req)) return json({ ok: false }, 401);
      const { ids } = await req.json().catch(() => ({ ids: [] }));
      for (const id of Array.isArray(ids) ? ids.slice(0, 100) : []) if (ID_RE.test(String(id))) await env.ORDERS.delete(`order:${id}`);
      return json({ ok: true });
    }
    return env.ASSETS.fetch(req);
  },
};
