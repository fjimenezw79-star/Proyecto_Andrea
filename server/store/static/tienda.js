/* Modas Andrea · Tienda en línea (sin dependencias). Los datos vienen del sistema en #store-data. */
(() => {
  "use strict";
  const D = JSON.parse(document.getElementById("store-data").textContent);
  const P = D.products;
  const DEPTS = D.depts;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (c) => "$" + (c / 100).toLocaleString("es-MX", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const byId = new Map(P.map((p) => [p.id, p]));
  const vById = new Map(P.flatMap((p) => p.variants.map((v) => [v.id, { p, v }])));
  const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const priceText = (p) => (p.price === p.priceMax ? money(p.price) : "Desde " + money(p.price));
  const absUrl = (path) => new URL(path, location.href).href;
  let dept = "Todo", q = "", cur = null, curV = null, qty = 1, photo = 0;

  // ---------- bolsa (se guarda en este navegador) ----------
  const KEY = "ma-bolsa";
  let bag = [];
  try { bag = JSON.parse(localStorage.getItem(KEY) || "[]").filter((l) => vById.has(l.v) && l.qty > 0); } catch { bag = []; }
  const saveBag = () => { try { localStorage.setItem(KEY, JSON.stringify(bag)); } catch { /* modo privado */ } };

  const img = (p, i = 0, cls = "") => p.imgs.length ? '<img alt="' + esc(p.name) + '" src="' + esc(p.imgs[i]) + '"' + (cls ? ' class="' + cls + '"' : "") + ' loading="lazy">' : "";

  // ---------- portada ----------
  $("#nav").innerHTML = DEPTS.map((d) => '<a href="#catalogo" data-go="' + esc(d) + '">' + esc(d) + "</a>").join("");
  $("#menu").insertAdjacentHTML("afterbegin", DEPTS.map((d) => '<a href="#catalogo" data-go="' + esc(d) + '">' + esc(d) + "</a>").join(""));
  $("#meta").innerHTML = "<div><b>" + P.length + "</b>productos</div><div><b>" + DEPTS.length + "</b>departamentos</div><div><b>WhatsApp</b>pedidos y apartados</div>";
  $("#track").innerHTML = [0, 1].map(() => DEPTS.concat(["Apartados con anticipo", "Recoge en tienda"]).map((t) => "<span>" + esc(t) + "</span>").join("")).join("");

  const feat = DEPTS.map((d) => P.find((p) => p.dept === d && p.stock > 0 && p.imgs.length) || P.find((p) => p.dept === d && p.imgs.length)).filter(Boolean);
  const stage = $("#stage");
  feat.forEach((p, i) => stage.insertAdjacentHTML("afterbegin", '<img data-i="' + i + '" alt="' + esc(p.name) + '" src="' + esc(p.imgs[0]) + '" style="inset:0;width:100%;height:100%;object-fit:cover;filter:none">'));
  $("#stage-dots").innerHTML = feat.map(() => "<i></i>").join("");
  let si = 0;
  function showStage(i) {
    if (!feat.length) return;
    stage.querySelectorAll("img").forEach((im) => im.classList.toggle("on", +im.dataset.i === i));
    $("#stage-dots").querySelectorAll("i").forEach((d, k) => d.classList.toggle("on", k === i));
    const p = feat[i];
    $("#stage-cap").innerHTML = "<b>" + esc(p.name) + "</b>" + esc(p.dept) + ", " + priceText(p);
  }
  showStage(0);
  if (!reduce && feat.length > 1) setInterval(() => { si = (si + 1) % feat.length; showStage(si); }, 3800);
  if (feat.length) { stage.addEventListener("click", () => open(feat[si].id)); stage.style.cursor = "pointer"; }

  $("#bento").innerHTML = DEPTS.map((d) => {
    const p = feat.find((x) => x.dept === d);
    const n = P.filter((x) => x.dept === d).length;
    return '<button class="tile photo" data-go="' + esc(d) + '">' + (p ? img(p) : "") + '<span class="t"><b>' + esc(d) + "</b><small>" + n + (n === 1 ? " modelo" : " modelos") + "</small></span></button>";
  }).join("");

  // ---------- catálogo ----------
  function chips() {
    const box = $("#chips");
    box.innerHTML = "";
    ["Todo"].concat(DEPTS).forEach((d) => {
      const n = d === "Todo" ? P.length : P.filter((p) => p.dept === d).length;
      const b = document.createElement("button");
      b.className = "chip";
      b.setAttribute("aria-pressed", String(d === dept));
      b.innerHTML = esc(d) + "<small>" + n + "</small>";
      b.onclick = () => { dept = d; chips(); grid(); };
      box.appendChild(b);
    });
  }
  function stockBadge(p) {
    if (p.stock <= 0) return '<span class="stock out">Agotado</span>';
    if (p.stock <= 2) return '<span class="stock low">Quedan ' + p.stock + "</span>";
    return '<span class="stock">' + p.stock + " disponibles</span>";
  }
  function grid() {
    const g = $("#grid");
    g.innerHTML = "";
    const t = norm(q);
    const list = P.filter((p) => (dept === "Todo" || p.dept === dept) && (!t || norm(p.name + " " + p.cat + " " + p.variants.map((v) => v.label).join(" ")).includes(t)));
    list.forEach((p, i) => {
      const b = document.createElement("button");
      b.className = "prod enter";
      b.style.animationDelay = Math.min(i, 12) * 0.04 + "s";
      b.setAttribute("aria-label", p.name + ", " + priceText(p) + (p.stock <= 0 ? ", agotado" : ""));
      if (p.stock <= 0) b.setAttribute("aria-disabled", "true");
      b.innerHTML = '<div class="ph">' + stockBadge(p) + img(p) + '</div><div class="row"><h3>' + esc(p.name) + '<span class="sub">' + esc(p.cat) + '</span></h3><span class="price">' + priceText(p) + "</span></div>";
      b.onclick = () => open(p.id);
      g.appendChild(b);
    });
    if (!list.length) g.innerHTML = '<div class="empty"><b>' + (q ? "No encontramos “" + esc(q) + "”" : "Pronto habrá productos aquí") + "</b>Prueba con otro nombre o revisa todos los departamentos.</div>";
  }

  // ---------- hoja de producto ----------
  function overlay(on) { $("#scrim").classList.toggle("on", on); }
  function setPhoto(i) {
    photo = i;
    $("#sh-gal").innerHTML = img(cur, i);
    $("#sh-thumbs").querySelectorAll("button").forEach((b, k) => b.setAttribute("aria-current", String(k === i)));
  }
  function setVariant(v) {
    curV = v;
    qty = 1;
    $("#q-val").textContent = qty;
    $("#sh-price").textContent = money(v.price);
    const left = $("#sh-left");
    left.textContent = v.stock <= 0 ? "Agotado por ahora" : v.stock <= 2 ? "¡Quedan " + v.stock + "!" : v.stock + " disponibles";
    left.className = "left" + (v.stock <= 2 ? " low" : "");
    $("#sh-vars").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.v === v.id)));
    $("#sh-add").disabled = v.stock <= 0;
  }
  function open(id) {
    cur = byId.get(id);
    if (!cur) return;
    $("#sh-cat").textContent = cur.dept + (cur.cat !== cur.dept ? " · " + cur.cat : "");
    $("#sh-name").textContent = cur.name;
    $("#sh-desc").textContent = cur.desc || "";
    $("#sh-thumbs").innerHTML = cur.imgs.length > 1 ? cur.imgs.map((u, i) => '<button aria-label="Foto ' + (i + 1) + '"><img alt="" src="' + esc(u) + '"></button>').join("") : "";
    $("#sh-thumbs").querySelectorAll("button").forEach((b, i) => (b.onclick = () => setPhoto(i)));
    setPhoto(0);
    const vs = cur.variants;
    $("#sh-vars").innerHTML = vs.length > 1 ? vs.map((v) => '<button class="var" data-v="' + v.id + '"' + (v.stock <= 0 ? " disabled" : "") + ">" + esc(v.label) + "</button>").join("") : "";
    $("#sh-vars").querySelectorAll("button").forEach((b) => (b.onclick = () => setVariant(vById.get(+b.dataset.v).v)));
    setVariant(vs.find((v) => v.stock > 0) || vs[0]);
    const link = absUrl(cur.url);
    $("#sh-wa").href = "https://wa.me/?text=" + encodeURIComponent(cur.name + " · " + priceText(cur) + "\n" + link);
    $("#sh-copy").onclick = async () => { try { await navigator.clipboard.writeText(link); toast("Link copiado"); } catch { prompt("Copia el link:", link); } };
    closeBag();
    overlay(true);
    $("#sheet").classList.add("on");
    $("#sheet").setAttribute("aria-hidden", "false");
    $("#sh-close").focus({ preventScroll: true });
  }
  function closeSheet() {
    $("#sheet").classList.remove("on");
    $("#sheet").setAttribute("aria-hidden", "true");
    if (!$("#bag").classList.contains("on")) overlay(false);
  }

  // ---------- bolsa y pedido ----------
  function openBag() { closeSheet(); renderBag(); overlay(true); $("#bag").classList.add("on"); $("#bag").setAttribute("aria-hidden", "false"); }
  function closeBag() { $("#bag").classList.remove("on"); $("#bag").setAttribute("aria-hidden", "true"); if (!$("#sheet").classList.contains("on")) overlay(false); }
  const total = () => bag.reduce((s, l) => s + l.qty * vById.get(l.v).v.price, 0);
  function renderBag() {
    const it = $("#items");
    it.innerHTML = bag.length ? "" : '<div class="empty"><b>Tu bolsa está vacía</b>Toca un producto del catálogo y agrégalo.</div>';
    bag.forEach((l, i) => {
      const { p, v } = vById.get(l.v);
      const d = document.createElement("div");
      d.className = "item";
      d.innerHTML = (p.imgs.length ? '<img alt="" src="' + esc(p.imgs[0]) + '">' : "<span></span>") + "<div><b>" + esc(p.name) + "</b><small>" + (p.variants.length > 1 ? esc(v.label) + " · " : "") + l.qty + " × " + money(v.price) + '</small></div><button class="rm" type="button">Quitar</button>';
      d.querySelector(".rm").onclick = () => { bag.splice(i, 1); saveBag(); count(); renderBag(); };
      it.appendChild(d);
    });
    $("#tot").textContent = money(total());
  }
  function count() {
    $("#bagn").textContent = bag.reduce((s, l) => s + l.qty, 0);
    const b = $("#bagbtn");
    b.classList.remove("bump");
    void b.offsetWidth;
    b.classList.add("bump");
  }
  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("on"), 1800); }

  $("#q").addEventListener("input", (e) => { q = e.target.value.trim(); grid(); });
  $("#q-minus").onclick = () => { qty = Math.max(1, qty - 1); $("#q-val").textContent = qty; };
  $("#q-plus").onclick = () => { qty = Math.min(Math.max(1, curV.stock), qty + 1); $("#q-val").textContent = qty; };
  $("#sh-add").onclick = () => {
    if (!curV || curV.stock <= 0) return;
    const l = bag.find((x) => x.v === curV.id);
    if (l) l.qty = Math.min(curV.stock, l.qty + qty);
    else bag.push({ v: curV.id, qty: Math.min(curV.stock, qty) });
    saveBag();
    count();
    closeSheet();
    toast("Agregado a la bolsa");
  };
  $("#sh-close").onclick = closeSheet;
  $("#bagbtn").onclick = openBag;
  $("#bag-x").onclick = closeBag;
  $("#scrim").onclick = () => { closeSheet(); closeBag(); };
  $("#o-how").onchange = (e) => { $("#o-addr-l").hidden = e.target.value !== "shipping"; };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeSheet(); closeBag(); setMenu(false); } });

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }
  function folio() {
    const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return "W-" + [...crypto.getRandomValues(new Uint8Array(5))].map((x) => a[x % a.length]).join("");
  }
  $("#order").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#o-err");
    const fail = (m) => { err.textContent = m; err.hidden = false; };
    err.hidden = true;
    if (!bag.length) return fail("Agrega al menos un producto.");
    const name = $("#o-name").value.trim(), phone = $("#o-tel").value.replace(/\D/g, "");
    const delivery = $("#o-how").value, address = $("#o-addr").value.trim(), note = $("#o-note").value.trim();
    if (!name) return fail("Escribe tu nombre.");
    if (phone.length < 10) return fail("Escribe tu WhatsApp de 10 dígitos.");
    if (delivery === "shipping" && !address) return fail("Escribe la dirección de envío.");
    const order = { id: uuid(), folio: folio(), name, phone, delivery, address, note, items: bag.map((l) => ({ variant_id: l.v, qty: l.qty })) };
    const send = $("#o-send");
    send.disabled = true;
    // Se abre la ventana antes de esperar al servidor: así el navegador del celular no la bloquea.
    const win = D.biz.whatsapp ? window.open("", "_blank") : null;
    try {
      const r = await fetch(D.api + "pedido", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(order) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 400 || r.status === 429) { send.disabled = false; win?.close(); return fail(d.message || "Revisa tu pedido."); }
      if (d.folio) order.folio = d.folio;
    } catch {
      /* sin conexión con la tienda: el pedido igual llega por WhatsApp */
    }
    const lines = bag.map((l) => { const { p, v } = vById.get(l.v); return "• " + l.qty + " × " + p.name + (p.variants.length > 1 ? " (" + v.label + ")" : "") + " — " + money(v.price * l.qty); });
    const text = "Hola, quiero hacer el pedido " + order.folio + ":\n" + lines.join("\n") + "\nTotal: " + money(total()) + "\nNombre: " + name + "\nEntrega: " + (delivery === "shipping" ? "Envío a " + address : "Recojo en tienda") + (note ? "\nNota: " + note : "");
    const url = "https://wa.me/" + D.biz.whatsapp + "?text=" + encodeURIComponent(text);
    bag = [];
    saveBag();
    count();
    renderBag();
    send.disabled = false;
    $("#items").innerHTML = '<div class="empty"><b>¡Pedido ' + esc(order.folio) + ' enviado!</b>' + (D.biz.whatsapp ? 'Si WhatsApp no se abrió, <a href="' + esc(url) + '" target="_blank" rel="noopener">tócalo aquí</a>.' : "Te contactaremos por WhatsApp.") + "</div>";
    if (win) win.location.href = url;
  });

  function setMenu(on) { document.documentElement.classList.toggle("menu-open", on); $("#menubtn").setAttribute("aria-expanded", String(on)); $("#menu").setAttribute("aria-hidden", String(!on)); }
  $("#menubtn").onclick = () => setMenu(!document.documentElement.classList.contains("menu-open"));
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-go]");
    if (!a) return;
    dept = a.dataset.go;
    chips();
    grid();
    setMenu(false);
    if (a.tagName === "BUTTON") $("#catalogo").scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  });
  addEventListener("scroll", () => $("#top").classList.toggle("scrolled", scrollY > 10), { passive: true });
  chips();
  grid();
  count();
  if (D.open) open(D.open);
})();
