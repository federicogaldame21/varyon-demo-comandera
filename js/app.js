/* Ribera · Bar — demo navegable de un sistema de comandas, caja y cierre por mozo.
   En el proyecto real corre en un servidor del local (PHP + MySQL) y sigue
   funcionando sin internet; acá todo se simula en el navegador con localStorage. */

const CASO_URL = "https://varyon.com.ar/proyectos/comandera"; // caso de estudio en la web de Varyon
const KEY = "ribera-demo-v1";
const KEY_UI = "ribera-demo-ui";

/* ---------------- Estado ---------------- */
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.version === 1) return s;
  } catch (e) { /* sin almacenamiento */ }
  return crearDatosIniciales();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
function loadUI() {
  try { return JSON.parse(localStorage.getItem(KEY_UI)) || {}; } catch (e) { return {}; }
}
function saveUI() { try { localStorage.setItem(KEY_UI, JSON.stringify({ rol: UI.rol, mozo: UI.mozo, est: UI.est })); } catch (e) {} }

let S = load();
const guardada = loadUI();
const UI = {
  rol: guardada.rol || "mozo",
  mozo: guardada.mozo || null,
  est: guardada.est || "cocina",
  mTab: "salon",
  sector: "salon",
  mesa: null,
  catalogo: false,
  cat: "cervezas",
  cTab: "cobros",
  cMesa: null,
  cobro: null,
  contado: "",
  syncing: false,
  modal: null,
  m: {},
};

/* ---------------- Utilidades ---------------- */
const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const $$ = (n) => "$ " + nf.format(Math.round(n || 0));
const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return isFinite(n) ? n : 0; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const fhora = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const minDesde = (ts) => Math.max(0, Math.floor((Date.now() - ts) / 60e3));
const fDur = (ts) => { const m = minDesde(ts); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)}`; };

const P = (id) => PRODUCTOS.find((p) => p.id === id);
const MZ = (id) => MOZOS.find((m) => m.id === id);
const MEDIO = (id) => MEDIOS.find((m) => m.id === id);
const sectorDe = (mesa) => SECTORES.find((s) => s.mesas.includes(mesa));
const nombreMesa = (mesa) => (mesa.startsWith("B") ? `Barra ${mesa.slice(1)}` : `Mesa ${mesa}`);
const avatar = (mz, cls = "") => `<img class="av ${cls}" src="${mz.foto}" alt="${esc(mz.nombre)}">`;

const consumidos = (m) => m.items.filter((i) => i.estado !== "borrador");
const borradores = (m) => m.items.filter((i) => i.estado === "borrador");
const totalItems = (items) => items.reduce((a, i) => a + P(i.prodId).precio * i.cant, 0);
const totalMesa = (m) => totalItems(consumidos(m));
const mesasAbiertas = () => Object.entries(S.mesas).filter(([, m]) => m.abierta);
const turnoCerrado = () => !!S.turno.cierre;
const mozoCerrado = (mid) => !!S.cierresMozo[mid];

/* Cada cambio queda registrado; si no hay internet se guarda en el servidor del local
   y se sube a la nube cuando vuelve la conexión. */
function mut(desc) {
  if (!S.sync.online) S.sync.pendientes.push({ ts: Date.now(), desc });
}

/* ---------------- Reglas del negocio ---------------- */
function abrirMesa(mesa, mozoId, comensales) {
  const m = S.mesas[mesa];
  if (m.abierta) return "La mesa ya está abierta.";
  if (turnoCerrado()) return "La caja está cerrada: no se pueden abrir mesas.";
  if (mozoCerrado(mozoId)) return "Tu turno ya está cerrado.";
  Object.assign(m, { abierta: Date.now(), mozoId, comensales: Math.max(1, comensales), items: [], cuentaPedida: false });
  mut(`${nombreMesa(mesa)} abierta`);
  return null;
}

function agregarProducto(mesa, prodId) {
  const m = S.mesas[mesa];
  const it = m.items.find((i) => i.estado === "borrador" && i.prodId === prodId && !i.nota);
  if (it) it.cant++;
  else m.items.push({ id: "i" + S.seq.item++, prodId, cant: 1, nota: "", comandaId: null, estado: "borrador" });
  m.cuentaPedida = false;
}

function enviarComanda(mesa) {
  const m = S.mesas[mesa];
  const bs = borradores(m);
  if (!bs.length) return 0;
  const porEst = {};
  bs.forEach((i) => (porEst[P(i.prodId).est] = porEst[P(i.prodId).est] || []).push(i));
  Object.entries(porEst).forEach(([est, items]) => {
    const c = { id: "K" + S.seq.comanda++, mesa, mozoId: m.mozoId, est, ts: Date.now(), estado: "nueva", items: items.map((i) => i.id) };
    items.forEach((i) => { i.estado = "enviado"; i.comandaId = c.id; });
    S.comandas.push(c);
  });
  mut(`Comanda de ${nombreMesa(mesa)} (${Object.keys(porEst).map((e) => ESTACIONES[e]).join(" y ")})`);
  return Object.keys(porEst).length;
}

function itemsDeComanda(c) {
  const m = S.mesas[c.mesa];
  return c.items.map((id) => m.items.find((i) => i.id === id)).filter(Boolean);
}

function avanzarComanda(cid) {
  const c = S.comandas.find((x) => x.id === cid);
  if (c.estado === "nueva") c.estado = "preparando";
  else if (c.estado === "preparando") {
    c.estado = "lista"; c.lista = Date.now();
    itemsDeComanda(c).forEach((i) => (i.estado = "listo"));
  }
  mut(`${ESTACIONES[c.est]}: ${nombreMesa(c.mesa)} ${c.estado === "lista" ? "lista" : "en preparación"}`);
}

function entregarComanda(cid) {
  const c = S.comandas.find((x) => x.id === cid);
  c.estado = "entregada";
  itemsDeComanda(c).forEach((i) => (i.estado = "entregado"));
  mut(`Entregado en ${nombreMesa(c.mesa)}`);
}

const avisosDe = (mozoId) => S.comandas.filter((c) => c.estado === "lista" && c.mozoId === mozoId && S.mesas[c.mesa].abierta);

function nuevoCobro(mesa) {
  const m = S.mesas[mesa];
  const sub = totalMesa(m);
  return { descPct: "0", propina: String(Math.round((sub * CONFIG.propinaSugerida) / 100) * 100), pagos: [], medio: "efectivo", monto: "" };
}
function calcCobro(mesa, c) {
  const m = S.mesas[mesa];
  const subtotal = totalMesa(m);
  const descuento = Math.round((subtotal * Math.min(100, Math.max(0, num(c.descPct)))) / 100);
  const propina = Math.max(0, num(c.propina));
  const total = subtotal - descuento + propina;
  const pagado = c.pagos.reduce((a, p) => a + p.base, 0);
  const recargos = c.pagos.reduce((a, p) => a + p.recargo, 0);
  return { subtotal, descuento, propina, total, pagado, recargos, saldo: total - pagado };
}

function cerrarMesa(mesa, c) {
  const m = S.mesas[mesa];
  const k = calcCobro(mesa, c);
  if (borradores(m).length) return "Hay pedidos sin enviar: el mozo tiene que enviarlos o quitarlos.";
  if (k.saldo !== 0) return `Falta cobrar ${$$(k.saldo)}.`;
  const v = {
    id: "V" + S.seq.venta++, mesa, mozoId: m.mozoId, abierta: m.abierta, cerrada: Date.now(), comensales: m.comensales,
    items: consumidos(m).map((i) => ({ prodId: i.prodId, cant: i.cant, precio: P(i.prodId).precio })),
    subtotal: k.subtotal, descuento: k.descuento, propina: k.propina, total: k.total, pagos: c.pagos.map((p) => ({ ...p })),
  };
  S.ventas.push(v);
  S.comandas = S.comandas.filter((x) => x.mesa !== mesa);
  Object.assign(m, { abierta: null, mozoId: null, comensales: 0, items: [], cuentaPedida: false });
  mut(`Cobro ${v.id} · ${nombreMesa(mesa)} · ${$$(v.total)}`);
  return v;
}

function caja() {
  const porMedio = {};
  MEDIOS.forEach((md) => (porMedio[md.id] = { base: 0, recargo: 0 }));
  S.ventas.forEach((v) => v.pagos.forEach((p) => { porMedio[p.medio].base += p.base; porMedio[p.medio].recargo += p.recargo; }));
  const egresos = S.turno.egresos.reduce((a, e) => a + e.monto, 0);
  const vendido = S.ventas.reduce((a, v) => a + v.subtotal - v.descuento, 0);
  const propinas = S.ventas.reduce((a, v) => a + v.propina, 0);
  const recargos = Object.values(porMedio).reduce((a, x) => a + x.recargo, 0);
  const esperado = S.turno.fondo + porMedio.efectivo.base - egresos;
  return { porMedio, egresos, vendido, propinas, recargos, esperado, cobrado: S.ventas.reduce((a, v) => a + v.total, 0) + recargos };
}

function resumenMozo(mid) {
  const vs = S.ventas.filter((v) => v.mozoId === mid);
  const porMedio = {};
  MEDIOS.forEach((md) => (porMedio[md.id] = 0));
  vs.forEach((v) => v.pagos.forEach((p) => (porMedio[p.medio] += p.base + p.recargo)));
  const abiertas = mesasAbiertas().filter(([, m]) => m.mozoId === mid);
  const vendido = vs.reduce((a, v) => a + v.subtotal - v.descuento, 0);
  return {
    ventas: vs.length, comensales: vs.reduce((a, v) => a + v.comensales, 0), vendido,
    propinas: vs.reduce((a, v) => a + v.propina, 0), porMedio, abiertas,
    enCurso: abiertas.reduce((a, [, m]) => a + totalMesa(m), 0),
    promedio: vs.length ? vendido / vs.length : 0,
  };
}

function consumo() {
  const filas = {};
  PRODUCTOS.forEach((p) => (filas[p.id] = { cant: 0, total: 0, enCurso: 0 }));
  S.ventas.forEach((v) => v.items.forEach((i) => { filas[i.prodId].cant += i.cant; filas[i.prodId].total += i.cant * i.precio; }));
  mesasAbiertas().forEach(([, m]) => consumidos(m).forEach((i) => (filas[i.prodId].enCurso += i.cant)));
  const porHora = {};
  S.ventas.forEach((v) => { const h = new Date(v.cerrada).getHours(); porHora[h] = (porHora[h] || 0) + v.subtotal - v.descuento; });
  const porCat = {};
  CATEGORIAS.forEach((c) => (porCat[c.id] = 0));
  PRODUCTOS.forEach((p) => (porCat[p.cat] += filas[p.id].total));
  return { filas, porHora, porCat };
}

function cerrarTurno(contado) {
  const k = caja();
  S.turno.cierre = { ts: Date.now(), contado, esperado: k.esperado, diferencia: contado - k.esperado, ventas: S.ventas.length, vendido: k.vendido, propinas: k.propinas, recargos: k.recargos, mesasAbiertas: mesasAbiertas().length };
  mut("Cierre de caja");
}
function nuevoTurno() {
  S.turnosAnteriores.push({ ...S.turno });
  S.turno = { id: "T-" + new Date().toISOString().slice(0, 10) + "-" + (S.turnosAnteriores.length + 1), apertura: Date.now(), cajero: S.turno.cajero, fondo: CONFIG.fondoInicial, egresos: [], cierre: null };
  S.ventas = [];
  S.cierresMozo = {};
  mut("Apertura de caja");
}

/* ---------------- Vistas comunes ---------------- */
const LOGO = `<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="11" fill="#173b30"/><path d="M11 13h18l-2.2 15.5a3 3 0 0 1-3 2.5h-7.6a3 3 0 0 1-3-2.5Z" fill="#e3a33b"/><path d="M11 13h18l-.6 4.5H11.6Z" fill="#fff6e3"/><path d="M29 17h2.5a3.5 3.5 0 0 1 0 7H28" fill="none" stroke="#e3a33b" stroke-width="2.2"/></svg>`;
const ICON = {
  mesas: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4Z"/><path d="M10 21h4"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m15 5-7 7 7 7"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  cloudOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18"/><path d="M8 7.5A6 6 0 0 1 18 11a4 4 0 0 1 2 7.4M16 19H7a4.5 4.5 0 0 1-1.6-8.7"/></svg>`,
  cash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`,
  people: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 6 5"/></svg>`,
  receipt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6M9 12h6"/></svg>`,
};
function opt(v, label, sel) { return `<option value="${esc(v)}"${String(sel) === String(v) ? " selected" : ""}>${esc(label)}</option>`; }

function vBarra() {
  const n = S.sync.pendientes.length;
  const red = UI.syncing
    ? `<span class="net sync"><i></i>Subiendo ${n} cambio${n === 1 ? "" : "s"}…</span>`
    : S.sync.online
      ? `<button class="dbtn" data-act="offline" title="Simula un corte de internet en el local">Simular sin internet</button>`
      : `<span class="net off">${ICON.cloudOff} Sin internet · ${n} cambio${n === 1 ? "" : "s"} guardado${n === 1 ? "" : "s"} en el local</span><button class="dbtn hot" data-act="online">Volver a conectar</button>`;
  return `
    <div class="tag"><span class="dot"></span>Demo · <b>Varyon</b> <span class="hide-sm">Comandas, caja y cierre por mozo</span></div>
    <div class="roleswitch" role="group" aria-label="Elegir pantalla">
      <button data-act="rol" data-v="mozo" aria-pressed="${UI.rol === "mozo"}">Mozo</button>
      <button data-act="rol" data-v="caja" aria-pressed="${UI.rol === "caja"}">Caja</button>
      <button data-act="rol" data-v="cocina" aria-pressed="${UI.rol === "cocina"}">Cocina / barra</button>
    </div>
    <span class="spacer"></span>
    ${red}
    <button class="dbtn" data-act="reiniciar">Reiniciar</button>
    <a class="dbtn hide-sm" href="${CASO_URL}" target="_blank" rel="noopener">Ver caso de estudio</a>`;
}

function bannerOffline() {
  if (S.sync.online && !UI.syncing) return "";
  return `<div class="offline-strip">${ICON.cloudOff}<span>${UI.syncing ? "Sincronizando con la nube…" : "Sin internet: el local sigue funcionando. Los cambios se suben solos al volver la conexión."}</span></div>`;
}

/* ---------------- Mozo (celular) ---------------- */
function vMozo() {
  const notas = `
    <aside class="side-notes">
      <div class="card">
        <h4>Qué probar</h4>
        <ol>
          <li>Elegí un mozo y abrí una <b>mesa libre</b>.</li>
          <li>Cargá productos y tocá <b>Enviar comanda</b>: la parte de cocina y la de barra salen por separado.</li>
          <li>Pasá a <b>Cocina / barra</b>, marcá la comanda como lista y volvé: te llega el aviso para llevarla.</li>
          <li>En una mesa con todo entregado, <b>Pedir la cuenta</b>. La cobra la caja.</li>
          <li>Tocá <b>Simular sin internet</b> y seguí cargando: nada se pierde.</li>
        </ol>
      </div>
      <div class="card">
        <h4>Reglas que aplica</h4>
        <p class="rule">Cada mesa tiene un mozo responsable · la comanda se divide por estación · no se cobra con pedidos sin enviar · crédito con ${Math.round(CONFIG.recargoCredito * 100)} % de recargo · cierre por mozo con propinas.</p>
      </div>
      <p class="fine">Bar, personas y ventas ficticios. Lo que cargues queda guardado solo en este navegador.</p>
    </aside>`;
  return `<div class="stage"><div class="phone">${UI.mozo ? vMozoApp() : vLoginMozo()}</div>${notas}</div>`;
}

function vLoginMozo() {
  return `<div class="login">
    <div class="brand big">${LOGO}<div><div class="bn">Ribera</div><div class="bs">Bar de barrio</div></div></div>
    <h2>¿Quién toma pedidos?</h2>
    <p class="hint">En el local cada mozo entra con su PIN. En la demo, elegí uno.</p>
    <div class="who-list">
      ${MOZOS.map((mz) => {
        const r = resumenMozo(mz.id);
        return `<button class="who-btn" data-act="elegirMozo" data-id="${mz.id}">${avatar(mz, "lg")}<span><b>${esc(mz.nombre)} ${esc(mz.apellido)}</b><small>${r.abiertas.length} mesa${r.abiertas.length === 1 ? "" : "s"} abierta${r.abiertas.length === 1 ? "" : "s"}${mozoCerrado(mz.id) ? " · turno cerrado" : ""}</small></span></button>`;
      }).join("")}
    </div>
  </div>`;
}

function vMozoApp() {
  const mz = MZ(UI.mozo);
  const nAv = avisosDe(mz.id).length;
  let titulo = "Salón", cuerpo = "";
  if (UI.mesa && UI.catalogo) { titulo = nombreMesa(UI.mesa); cuerpo = vCatalogo(); }
  else if (UI.mesa) { titulo = nombreMesa(UI.mesa); cuerpo = vMesaMozo(); }
  else if (UI.mTab === "avisos") { titulo = "Para llevar"; cuerpo = vAvisos(); }
  else if (UI.mTab === "turno") { titulo = "Mi turno"; cuerpo = vMiTurno(); }
  else cuerpo = vSalonMozo();
  const back = UI.mesa ? `<button class="iconbtn" data-act="${UI.catalogo ? "cerrarCatalogo" : "cerrarMesa"}" aria-label="Volver">${ICON.back}</button>` : "";
  return `
    <div class="phone-top">
      <div class="pt-left">${back}<h2>${titulo}</h2></div>
      <button class="me-chip" data-act="salirMozo" title="Cambiar de mozo">${avatar(mz)}<span>${esc(mz.nombre)}</span></button>
    </div>
    ${bannerOffline()}
    <div class="phone-body" id="pbody">${cuerpo}</div>
    ${UI.mesa ? vBarraMesa() : `
    <nav class="tabbar">
      <button data-act="mTab" data-v="salon" aria-pressed="${UI.mTab === "salon"}">${ICON.mesas}<span>Salón</span></button>
      <button data-act="mTab" data-v="avisos" aria-pressed="${UI.mTab === "avisos"}">${ICON.bell}<span>Avisos</span>${nAv ? `<em>${nAv}</em>` : ""}</button>
      <button data-act="mTab" data-v="turno" aria-pressed="${UI.mTab === "turno"}">${ICON.user}<span>Mi turno</span></button>
    </nav>`}`;
}

function estadoMesa(mesa) {
  const m = S.mesas[mesa];
  if (!m.abierta) return "libre";
  if (m.cuentaPedida) return "cuenta";
  if (S.comandas.some((c) => c.mesa === mesa && c.estado === "lista")) return "lista";
  return "ocupada";
}

function tileMesa(mesa, { act, propia }) {
  const m = S.mesas[mesa];
  const est = estadoMesa(mesa);
  const mz = m.mozoId ? MZ(m.mozoId) : null;
  const ajena = propia && mz && mz.id !== propia;
  const sinEnviar = m.abierta ? borradores(m).reduce((a, i) => a + i.cant, 0) : 0;
  const etiqueta = { libre: "Libre", ocupada: sinEnviar ? `${sinEnviar} sin enviar` : fDur(m.abierta || Date.now()), cuenta: "Pidió la cuenta", lista: "Pedido listo" }[est];
  return `<button class="mesa st-${est}${ajena ? " ajena" : ""}" data-act="${act}" data-id="${mesa}">
    <span class="mn">${mesa}</span>
    ${m.abierta ? `<span class="mt">${$$(totalMesa(m))}</span>` : `<span class="mt muted">—</span>`}
    <span class="ms">${etiqueta}</span>
    ${mz ? avatar(mz, "xs") : ""}
  </button>`;
}

function vSalonMozo() {
  const s = SECTORES.find((x) => x.id === UI.sector);
  const mias = mesasAbiertas().filter(([, m]) => m.mozoId === UI.mozo).length;
  return `
    ${turnoCerrado() ? `<div class="alert warn">La caja está cerrada. Para abrir mesas, la caja tiene que abrir un turno nuevo.</div>` : ""}
    ${mozoCerrado(UI.mozo) ? `<div class="alert warn">Tu turno está cerrado: podés ver el salón pero no abrir mesas.</div>` : ""}
    <div class="chips">${SECTORES.map((x) => `<button class="chip" data-act="sector" data-v="${x.id}" aria-pressed="${x.id === UI.sector}">${x.nombre}</button>`).join("")}</div>
    <div class="mesas">${s.mesas.map((mesa) => tileMesa(mesa, { act: "tocarMesa", propia: UI.mozo })).join("")}</div>
    <div class="legend"><span><i class="lg-libre"></i>Libre</span><span><i class="lg-ocupada"></i>Ocupada</span><span><i class="lg-lista"></i>Pedido listo</span><span><i class="lg-cuenta"></i>Cuenta</span></div>
    <p class="hint center">Tenés ${mias} mesa${mias === 1 ? "" : "s"} abierta${mias === 1 ? "" : "s"}. Las mesas de otros mozos se ven atenuadas.</p>`;
}

const ESTADO_ITEM = { borrador: "Sin enviar", enviado: "En preparación", listo: "Listo para llevar", entregado: "Entregado" };
function lineaItem(i, editable) {
  const p = P(i.prodId);
  return `<div class="line">
    <img class="thumb" src="${p.foto}" alt="">
    <div class="grow">
      <div class="t">${i.cant} × ${esc(p.nombre)}</div>
      <div class="s">${i.nota ? `<span class="nota">${esc(i.nota)}</span> · ` : ""}${editable ? `<button class="link" data-act="modal" data-type="nota" data-id="${i.id}">${i.nota ? "Editar nota" : "Agregar nota"}</button>` : `<span class="est est-${i.estado}">${ESTADO_ITEM[i.estado]}</span> · ${ESTACIONES[p.est]}`}</div>
    </div>
    ${editable ? `<div class="qty"><button data-act="menos" data-id="${i.id}" aria-label="Quitar uno">−</button><span>${i.cant}</span><button data-act="mas" data-id="${i.id}" aria-label="Sumar uno">+</button></div>` : `<div class="money">${$$(p.precio * i.cant)}</div>`}
  </div>`;
}

function vMesaMozo() {
  const m = S.mesas[UI.mesa];
  if (!m.abierta) return `<div class="empty">La mesa se cerró. <button class="link" data-act="cerrarMesa">Volver al salón</button></div>`;
  const propia = m.mozoId === UI.mozo;
  const bs = borradores(m), cs = consumidos(m);
  return `
    <div class="mesa-head">
      <div><b>${m.comensales} comensal${m.comensales === 1 ? "" : "es"}</b> · abierta ${fhora(m.abierta)} (${fDur(m.abierta)})</div>
      <div class="mh-mozo">${avatar(MZ(m.mozoId), "xs")} ${esc(MZ(m.mozoId).nombre)}</div>
    </div>
    ${!propia ? `<div class="alert">Esta mesa la atiende ${esc(MZ(m.mozoId).nombre)}. Podés verla, pero no cargar pedidos.</div>` : ""}
    ${m.cuentaPedida ? `<div class="alert ok">Cuenta pedida. La caja ya la ve para cobrar.</div>` : ""}
    ${bs.length ? `<div class="card"><div class="card-h"><h3>Por enviar</h3><span class="pill warn">${bs.reduce((a, i) => a + i.cant, 0)} sin enviar</span></div>${bs.map((i) => lineaItem(i, propia)).join("")}</div>` : ""}
    <div class="card">
      <div class="card-h"><h3>Consumo</h3><span class="money">${$$(totalMesa(m))}</span></div>
      ${cs.length ? cs.map((i) => lineaItem(i, false)).join("") : `<div class="empty">Todavía no hay pedidos enviados.</div>`}
    </div>`;
}

function vBarraMesa() {
  const m = S.mesas[UI.mesa];
  if (!m || !m.abierta || m.mozoId !== UI.mozo) return `<div class="actionbar"><button class="btn block" data-act="cerrarMesa">Volver al salón</button></div>`;
  if (UI.catalogo) {
    const n = borradores(m).reduce((a, i) => a + i.cant, 0);
    return `<div class="actionbar"><button class="btn primary block" data-act="cerrarCatalogo">Listo · ${n} sin enviar</button></div>`;
  }
  const bs = borradores(m);
  const pendientes = consumidos(m).some((i) => i.estado !== "entregado");
  return `<div class="actionbar">
    <button class="btn" data-act="abrirCatalogo">${ICON.plus} Agregar</button>
    ${bs.length
      ? `<button class="btn primary grow" data-act="enviar">Enviar comanda (${bs.reduce((a, i) => a + i.cant, 0)})</button>`
      : `<button class="btn primary grow" data-act="pedirCuenta" ${!consumidos(m).length || m.cuentaPedida ? "disabled" : ""} title="${pendientes ? "Hay pedidos sin entregar" : ""}">${m.cuentaPedida ? "Cuenta pedida" : "Pedir la cuenta"}</button>`}
  </div>`;
}

function vCatalogo() {
  const m = S.mesas[UI.mesa];
  const enBorrador = (pid) => borradores(m).filter((i) => i.prodId === pid).reduce((a, i) => a + i.cant, 0);
  return `
    <div class="chips sticky">${CATEGORIAS.map((c) => `<button class="chip" data-act="cat" data-v="${c.id}" aria-pressed="${c.id === UI.cat}">${c.nombre}</button>`).join("")}</div>
    <div class="prods">
      ${PRODUCTOS.filter((p) => p.cat === UI.cat).map((p) => {
        const n = enBorrador(p.id);
        return `<button class="prod" data-act="agregar" data-id="${p.id}">
          <img src="${p.foto}" alt="" loading="lazy">
          ${n ? `<span class="badge-n">${n}</span>` : ""}
          <span class="pn">${esc(p.nombre)}</span>
          <span class="pp">${$$(p.precio)} · ${ESTACIONES[p.est]}</span>
        </button>`;
      }).join("")}
    </div>
    <p class="hint center">Tocá un producto para sumarlo. Las notas («sin cebolla») se agregan desde la mesa.</p>`;
}

function vAvisos() {
  const avs = avisosDe(UI.mozo);
  if (!avs.length) return `<div class="empty big">${ICON.bell}<p>No hay pedidos listos para llevar.</p><p class="hint">Cuando cocina o barra marquen una comanda tuya como lista, aparece acá.</p></div>`;
  return avs.map((c) => `
    <div class="card aviso">
      <div class="card-h"><h3>${nombreMesa(c.mesa)}</h3><span class="pill ok">${ESTACIONES[c.est]} · listo hace ${fDur(c.lista || c.ts)}</span></div>
      ${itemsDeComanda(c).map((i) => `<div class="mini-line">${i.cant} × ${esc(P(i.prodId).nombre)}${i.nota ? ` <span class="nota">${esc(i.nota)}</span>` : ""}</div>`).join("")}
      <button class="btn primary block" data-act="entregar" data-id="${c.id}">Entregado</button>
    </div>`).join("");
}

function vMiTurno() {
  const r = resumenMozo(UI.mozo);
  return `
    <div class="kpis two">
      <div class="kpi"><span>Vendido</span><b>${$$(r.vendido)}</b></div>
      <div class="kpi"><span>Propinas</span><b>${$$(r.propinas)}</b></div>
      <div class="kpi"><span>Mesas cobradas</span><b>${r.ventas}</b></div>
      <div class="kpi"><span>Ticket promedio</span><b>${$$(r.promedio)}</b></div>
    </div>
    <div class="card">
      <div class="card-h"><h3>Mesas abiertas</h3><span class="money">${$$(r.enCurso)}</span></div>
      ${r.abiertas.length ? r.abiertas.map(([mesa, m]) => `<button class="row-btn" data-act="tocarMesa" data-id="${mesa}"><b>${nombreMesa(mesa)}</b><span>${m.comensales} pers. · ${fDur(m.abierta)}</span><span class="money">${$$(totalMesa(m))}</span></button>`).join("") : `<div class="empty">No tenés mesas abiertas.</div>`}
    </div>
    <div class="card">
      <h3>Cobrado por medio de pago</h3>
      ${MEDIOS.map((md) => `<div class="kv"><span>${md.nombre}</span><span class="money">${$$(r.porMedio[md.id])}</span></div>`).join("")}
    </div>
    ${mozoCerrado(UI.mozo) ? `<div class="alert ok">Turno cerrado por caja a las ${fhora(S.cierresMozo[UI.mozo].ts)}. Propinas a cobrar: ${$$(S.cierresMozo[UI.mozo].propinas)}.</div>` : `<p class="hint center">El cierre de tu turno lo hace la caja cuando no te quedan mesas abiertas.</p>`}`;
}

/* ---------------- Caja (web) ---------------- */
function vCaja() {
  const items = [
    ["cobros", ICON.mesas, "Salón y cobros", mesasAbiertas().filter(([, m]) => m.cuentaPedida).length],
    ["arqueo", ICON.cash, "Arqueo de caja"],
    ["mozos", ICON.people, "Cierre por mozo"],
    ["consumo", ICON.chart, "Consumo del día"],
    ["ventas", ICON.receipt, "Ventas del turno"],
  ];
  let main = "";
  if (UI.cTab === "cobros") main = vCobros();
  if (UI.cTab === "arqueo") main = vArqueo();
  if (UI.cTab === "mozos") main = vCierreMozos();
  if (UI.cTab === "consumo") main = vConsumo();
  if (UI.cTab === "ventas") main = vVentas();
  return `<div class="web">
    <aside class="sidebar">
      <div class="brand">${LOGO}<div><div class="bn">Ribera</div><div class="bs">Caja</div></div></div>
      <nav>${items.map(([id, ic, label, n]) => `<button class="navi" data-act="cTab" data-v="${id}" aria-pressed="${UI.cTab === id}">${ic}<span>${label}</span>${n ? `<em>${n}</em>` : ""}</button>`).join("")}</nav>
      <div class="me">Turno abierto ${fhora(S.turno.apertura)} · ${esc(S.turno.cajero)}${turnoCerrado() ? `<br><b class="warn-t">Caja cerrada</b>` : ""}</div>
    </aside>
    <main class="web-main">${bannerOffline()}${main}</main>
  </div>`;
}

function vCobros() {
  const paraCobrar = mesasAbiertas().filter(([, m]) => m.cuentaPedida);
  return `
    <div class="page-h"><div><h1>Salón y cobros</h1><p class="sub">${mesasAbiertas().length} mesas abiertas · ${paraCobrar.length} pidieron la cuenta</p></div></div>
    <div class="cobro-layout">
      <div>
        ${SECTORES.map((s) => `<section class="sector"><h3>${s.nombre}</h3><div class="mesas wide">${s.mesas.map((mesa) => tileMesa(mesa, { act: "cajaMesa" })).join("")}</div></section>`).join("")}
      </div>
      <div class="cobro-panel">${UI.cMesa ? vPanelCobro() : `<div class="card empty big">${ICON.receipt}<p>Elegí una mesa para ver la cuenta y cobrarla.</p>${paraCobrar.length ? `<p class="hint">Pidieron la cuenta: ${paraCobrar.map(([mesa]) => `<button class="link" data-act="cajaMesa" data-id="${mesa}">${nombreMesa(mesa)}</button>`).join(", ")}</p>` : ""}</div>`}</div>
    </div>`;
}

function vPanelCobro() {
  const mesa = UI.cMesa, m = S.mesas[mesa];
  if (!m.abierta) return `<div class="card empty">${nombreMesa(mesa)} está libre.</div>`;
  const c = UI.cobro, k = calcCobro(mesa, c);
  const bs = borradores(m);
  const sinEntregar = consumidos(m).filter((i) => i.estado !== "entregado").length;
  const agrupado = {};
  consumidos(m).forEach((i) => (agrupado[i.prodId] = (agrupado[i.prodId] || 0) + i.cant));
  const medioSel = MEDIO(c.medio);
  const montoPago = c.monto === "" ? k.saldo : num(c.monto);
  return `<div class="card">
    <div class="card-h"><h2>${nombreMesa(mesa)}</h2><button class="iconbtn" data-act="cerrarPanel" aria-label="Cerrar">×</button></div>
    <p class="hint">${avatar(MZ(m.mozoId), "xs")} ${esc(MZ(m.mozoId).nombre)} · ${m.comensales} comensales · abierta ${fhora(m.abierta)}</p>
    ${bs.length ? `<div class="alert danger">Hay ${bs.length} pedido${bs.length === 1 ? "" : "s"} sin enviar. No se puede cobrar hasta que el mozo los envíe o los quite.</div>` : ""}
    ${sinEntregar ? `<div class="alert warn">${sinEntregar} ítem${sinEntregar === 1 ? "" : "s"} todavía no figura${sinEntregar === 1 ? "" : "n"} como entregado${sinEntregar === 1 ? "" : "s"}.</div>` : ""}
    <div class="ticket">
      ${Object.entries(agrupado).map(([pid, cant]) => `<div class="kv"><span>${cant} × ${esc(P(pid).nombre)}</span><span class="money">${$$(cant * P(pid).precio)}</span></div>`).join("") || `<div class="empty">Sin consumo.</div>`}
      <div class="kv sep"><span>Subtotal</span><span class="money">${$$(k.subtotal)}</span></div>
      <div class="kv"><span>Descuento <input class="mini" type="number" min="0" max="100" data-bind="cobro.descPct" data-live value="${esc(c.descPct)}" aria-label="Descuento en porcentaje"> %</span><span class="money">− ${$$(k.descuento)}</span></div>
      <div class="kv"><span>Propina <input class="mini wide" type="number" min="0" step="100" data-bind="cobro.propina" data-live value="${esc(c.propina)}" aria-label="Propina"></span><span class="money">${$$(k.propina)}</span></div>
      <div class="kv total"><span>Total</span><span class="money">${$$(k.total)}</span></div>
    </div>
    ${c.pagos.length ? `<div class="pagos">${c.pagos.map((p, idx) => `<div class="kv"><span>${MEDIO(p.medio).nombre}${p.recargo ? ` <small class="muted">+ ${$$(p.recargo)} recargo</small>` : ""}</span><span class="money">${$$(p.base)} <button class="link" data-act="quitarPago" data-i="${idx}">quitar</button></span></div>`).join("")}</div>` : ""}
    <div class="kv total ${k.saldo === 0 ? "ok-t" : ""}"><span>${k.saldo === 0 ? "Cuenta saldada" : "Falta cobrar"}</span><span class="money">${$$(Math.max(0, k.saldo))}</span></div>
    ${k.saldo > 0 ? `
      <div class="pay-row">
        <div class="seg">${MEDIOS.map((md) => `<button data-act="medio" data-v="${md.id}" aria-pressed="${c.medio === md.id}">${md.nombre}</button>`).join("")}</div>
        <div class="field-row"><input type="number" min="0" data-bind="cobro.monto" data-live value="${esc(c.monto === "" ? k.saldo : c.monto)}" aria-label="Monto"><button class="btn" data-act="agregarPago">Agregar pago</button></div>
        ${medioSel.recargo ? `<p class="hint warn">Crédito: ${Math.round(medioSel.recargo * 100)} % de recargo. El cliente paga ${$$(montoPago * (1 + medioSel.recargo))} en el posnet.</p>` : `<p class="hint">Podés dividir la cuenta en varios pagos y medios.</p>`}
      </div>` : ""}
    <button class="btn primary block" data-act="cobrarMesa" ${k.saldo !== 0 || bs.length || turnoCerrado() ? "disabled" : ""}>Cobrar y liberar mesa</button>
  </div>`;
}

function vArqueo() {
  const k = caja();
  const t = S.turno;
  if (t.cierre) {
    const c = t.cierre;
    return `<div class="page-h"><div><h1>Arqueo de caja</h1><p class="sub">Turno abierto ${fhora(t.apertura)} · cerrado ${fhora(c.ts)}</p></div></div>
      <div class="card cierre">
        <h2>Cierre de caja</h2>
        <div class="kv"><span>Ventas</span><span>${c.ventas}</span></div>
        <div class="kv"><span>Vendido (sin propinas)</span><span class="money">${$$(c.vendido)}</span></div>
        <div class="kv"><span>Propinas</span><span class="money">${$$(c.propinas)}</span></div>
        <div class="kv"><span>Recargos por crédito</span><span class="money">${$$(c.recargos)}</span></div>
        <div class="kv sep"><span>Efectivo esperado</span><span class="money">${$$(c.esperado)}</span></div>
        <div class="kv"><span>Efectivo contado</span><span class="money">${$$(c.contado)}</span></div>
        <div class="kv total ${c.diferencia === 0 ? "ok-t" : "bad-t"}"><span>Diferencia</span><span class="money">${c.diferencia > 0 ? "+" : ""}${$$(c.diferencia)}</span></div>
        ${c.mesasAbiertas ? `<p class="hint warn">Quedaron ${c.mesasAbiertas} mesas abiertas que pasan al turno siguiente.</p>` : ""}
        <button class="btn primary" data-act="nuevoTurno">Abrir turno nuevo</button>
      </div>`;
  }
  const dif = UI.contado === "" ? null : num(UI.contado) - k.esperado;
  const abiertas = mesasAbiertas().length;
  return `<div class="page-h"><div><h1>Arqueo de caja</h1><p class="sub">Turno abierto ${fhora(t.apertura)} por ${esc(t.cajero)} · ${S.ventas.length} ventas</p></div><button class="btn" data-act="modal" data-type="egreso">Registrar egreso</button></div>
    <div class="kpis">
      ${MEDIOS.map((md) => { const x = k.porMedio[md.id]; return `<div class="kpi"><span>${md.nombre}</span><b>${$$(x.base + x.recargo)}</b>${x.recargo ? `<small>incluye ${$$(x.recargo)} de recargo</small>` : ""}</div>`; }).join("")}
    </div>
    <div class="grid2">
      <div class="card">
        <h3>Efectivo en caja</h3>
        <div class="kv"><span>Fondo inicial</span><span class="money">${$$(t.fondo)}</span></div>
        <div class="kv"><span>+ Cobros en efectivo</span><span class="money">${$$(k.porMedio.efectivo.base)}</span></div>
        <div class="kv"><span>− Egresos</span><span class="money">${$$(k.egresos)}</span></div>
        <div class="kv total"><span>Efectivo esperado</span><span class="money">${$$(k.esperado)}</span></div>
        <div class="field"><label for="contado">Efectivo contado</label><input id="contado" type="number" min="0" data-bind="contado" data-live value="${esc(UI.contado)}" placeholder="Contá los billetes"></div>
        ${dif === null ? "" : `<div class="alert ${dif === 0 ? "ok" : "danger"}">${dif === 0 ? "La caja cuadra." : dif > 0 ? `Sobran ${$$(dif)}.` : `Faltan ${$$(-dif)}.`}</div>`}
        ${abiertas ? `<p class="hint warn">Hay ${abiertas} mesas abiertas: si cerrás ahora, pasan al turno siguiente.</p>` : ""}
        <button class="btn primary" data-act="cerrarTurno" ${UI.contado === "" ? "disabled" : ""}>Cerrar caja</button>
      </div>
      <div class="card">
        <h3>Egresos del turno</h3>
        ${t.egresos.length ? t.egresos.map((e) => `<div class="kv"><span>${fhora(e.ts)} · ${esc(e.concepto)}</span><span class="money">${$$(e.monto)}</span></div>`).join("") : `<div class="empty">Sin egresos.</div>`}
        <h3 class="mt">Resumen</h3>
        <div class="kv"><span>Vendido (sin propinas)</span><span class="money">${$$(k.vendido)}</span></div>
        <div class="kv"><span>Propinas</span><span class="money">${$$(k.propinas)}</span></div>
        <div class="kv"><span>Recargos por crédito</span><span class="money">${$$(k.recargos)}</span></div>
        <div class="kv total"><span>Total cobrado</span><span class="money">${$$(k.cobrado)}</span></div>
      </div>
    </div>`;
}

function vCierreMozos() {
  return `<div class="page-h"><div><h1>Cierre por mozo</h1><p class="sub">Lo que vendió y cobró cada uno en el turno, con sus propinas.</p></div><button class="btn" data-act="csvMozos">Exportar CSV</button></div>
    <div class="mozo-cards">
      ${MOZOS.map((mz) => {
        const r = resumenMozo(mz.id), cerrado = S.cierresMozo[mz.id];
        return `<div class="card mozo-card">
          <div class="mc-h">${avatar(mz, "lg")}<div><h3>${esc(mz.nombre)} ${esc(mz.apellido)}</h3><p class="hint">${r.ventas} mesas cobradas · ${r.comensales} comensales</p></div>${cerrado ? `<span class="pill ok">Cerrado ${fhora(cerrado.ts)}</span>` : ""}</div>
          <div class="kv"><span>Vendido</span><span class="money">${$$(r.vendido)}</span></div>
          <div class="kv"><span>Ticket promedio</span><span class="money">${$$(r.promedio)}</span></div>
          ${MEDIOS.map((md) => `<div class="kv sm"><span>${md.nombre}</span><span class="money">${$$(r.porMedio[md.id])}</span></div>`).join("")}
          <div class="kv total"><span>Propinas</span><span class="money">${$$(r.propinas)}</span></div>
          ${r.abiertas.length ? `<div class="alert warn">${r.abiertas.length} mesa${r.abiertas.length === 1 ? "" : "s"} abierta${r.abiertas.length === 1 ? "" : "s"} (${r.abiertas.map(([x]) => nombreMesa(x)).join(", ")}) · ${$$(r.enCurso)} en curso</div>` : ""}
          ${cerrado
            ? `<button class="btn block" data-act="reabrirMozo" data-id="${mz.id}">Reabrir turno</button>`
            : `<button class="btn primary block" data-act="cerrarMozo" data-id="${mz.id}" ${r.abiertas.length ? "disabled" : ""}>${r.abiertas.length ? "Cobrá sus mesas para cerrar" : "Cerrar turno del mozo"}</button>`}
        </div>`;
      }).join("")}
    </div>`;
}

function vConsumo() {
  const { filas, porHora, porCat } = consumo();
  const lista = PRODUCTOS.map((p) => ({ p, ...filas[p.id] })).sort((a, b) => b.total - a.total);
  const totalV = lista.reduce((a, x) => a + x.total, 0) || 1;
  const horas = Object.keys(porHora).map(Number).sort((a, b) => a - b);
  const maxH = Math.max(1, ...Object.values(porHora));
  const maxC = Math.max(1, ...Object.values(porCat));
  return `<div class="page-h"><div><h1>Consumo del día</h1><p class="sub">Productos vendidos en mesas cobradas, y lo que se está consumiendo en mesas abiertas.</p></div><button class="btn" data-act="csvConsumo">Exportar CSV</button></div>
    <div class="grid2">
      <div class="card">
        <h3>Ventas por hora</h3>
        <div class="bars">${horas.map((h) => `<div class="bar"><span class="bv">${$$(porHora[h] / 1000)}k</span><i style="height:${Math.round((porHora[h] / maxH) * 100)}%"></i><span class="bl">${pad(h)} h</span></div>`).join("")}</div>
      </div>
      <div class="card">
        <h3>Por categoría</h3>
        ${CATEGORIAS.map((c) => `<div class="hbar"><span>${c.nombre}</span><div><i style="width:${Math.round((porCat[c.id] / maxC) * 100)}%"></i></div><b>${$$(porCat[c.id])}</b></div>`).join("")}
      </div>
    </div>
    <div class="card">
      <table class="tbl">
        <thead><tr><th>Producto</th><th>Estación</th><th class="r">Vendidos</th><th class="r">En mesas abiertas</th><th class="r">Total</th><th class="r">%</th></tr></thead>
        <tbody>${lista.map((x) => `<tr><td><span class="tprod"><img src="${x.p.foto}" alt="">${esc(x.p.nombre)}</span></td><td>${ESTACIONES[x.p.est]}</td><td class="r">${x.cant}</td><td class="r">${x.enCurso || "—"}</td><td class="r money">${$$(x.total)}</td><td class="r">${Math.round((x.total / totalV) * 100)} %</td></tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function vVentas() {
  const vs = [...S.ventas].sort((a, b) => b.cerrada - a.cerrada);
  return `<div class="page-h"><div><h1>Ventas del turno</h1><p class="sub">${vs.length} mesas cobradas desde las ${fhora(S.turno.apertura)}</p></div></div>
    <div class="card">
      <table class="tbl">
        <thead><tr><th>N.º</th><th>Hora</th><th>Mesa</th><th>Mozo</th><th>Medios</th><th class="r">Propina</th><th class="r">Total</th></tr></thead>
        <tbody>${vs.length ? vs.map((v) => `<tr><td>${v.id}</td><td>${fhora(v.cerrada)}</td><td>${nombreMesa(v.mesa)}</td><td><span class="tprod">${avatar(MZ(v.mozoId), "xs")}${esc(MZ(v.mozoId).nombre)}</span></td><td>${v.pagos.map((p) => MEDIO(p.medio).nombre).join(" + ")}</td><td class="r money">${$$(v.propina)}</td><td class="r money">${$$(v.total + v.pagos.reduce((a, p) => a + p.recargo, 0))}</td></tr>`).join("") : `<tr><td colspan="7" class="empty">Todavía no hay ventas en este turno.</td></tr>`}</tbody>
      </table>
    </div>`;
}

/* ---------------- Cocina / barra (pantalla de comandas) ---------------- */
function vCocina() {
  const cs = S.comandas.filter((c) => c.est === UI.est && S.mesas[c.mesa].abierta);
  const col = (estado, titulo, lista) => `<section class="kcol"><h3>${titulo} <em>${lista.length}</em></h3>${lista.length ? lista.map((c) => ticket(c)).join("") : `<div class="kempty">Nada por acá</div>`}</section>`;
  const nuevas = cs.filter((c) => c.estado === "nueva").sort((a, b) => a.ts - b.ts);
  const prep = cs.filter((c) => c.estado === "preparando").sort((a, b) => a.ts - b.ts);
  const listas = cs.filter((c) => c.estado === "lista").sort((a, b) => b.lista - a.lista);
  return `<div class="kds">
    <div class="kds-top">
      <div class="brand dark">${LOGO}<div><div class="bn">Ribera</div><div class="bs">Pantalla de comandas</div></div></div>
      <div class="seg dark">${Object.entries(ESTACIONES).map(([id, n]) => `<button data-act="est" data-v="${id}" aria-pressed="${UI.est === id}">${n} <em>${S.comandas.filter((c) => c.est === id && c.estado !== "lista" && c.estado !== "entregada" && S.mesas[c.mesa].abierta).length}</em></button>`).join("")}</div>
      <span class="kclock" id="kclock">${fhora(Date.now())}</span>
    </div>
    ${bannerOffline()}
    <div class="kcols">
      ${col("nueva", "Nuevas", nuevas)}
      ${col("preparando", "En preparación", prep)}
      ${col("lista", "Listas para llevar", listas)}
    </div>
    <p class="kfoot">En el local esta pantalla está en una tablet o un monitor en la cocina y otro en la barra. Cada comanda llega solo a la estación que la prepara.</p>
  </div>`;
}

function ticket(c) {
  const mins = minDesde(c.ts);
  const nivel = c.estado === "lista" ? "ok" : mins >= CONFIG.criticaMin ? "crit" : mins >= CONFIG.alertaMin ? "alert" : "";
  const mz = MZ(c.mozoId);
  return `<div class="tk ${nivel}">
    <div class="tk-h"><b>${nombreMesa(c.mesa)}</b><span data-since="${c.estado === "lista" ? c.lista : c.ts}">${fDur(c.estado === "lista" ? c.lista : c.ts)}</span></div>
    <div class="tk-m">${avatar(mz, "xs")} ${esc(mz.nombre)} · ${fhora(c.ts)} · #${c.id}</div>
    <ul>${itemsDeComanda(c).map((i) => `<li><b>${i.cant}</b> ${esc(P(i.prodId).nombre)}${i.nota ? `<span class="tk-nota">${esc(i.nota)}</span>` : ""}</li>`).join("")}</ul>
    ${c.estado === "nueva" ? `<button class="kbtn" data-act="avanzar" data-id="${c.id}">Empezar</button>`
      : c.estado === "preparando" ? `<button class="kbtn go" data-act="avanzar" data-id="${c.id}">Listo</button>`
      : `<div class="tk-wait">Esperando a ${esc(mz.nombre)}</div>`}
  </div>`;
}

/* ---------------- Modales ---------------- */
function vModal() {
  if (!UI.modal) return "";
  const { type, id } = UI.modal;
  let body = "";
  if (type === "abrir") {
    body = `<h2>Abrir ${nombreMesa(id)}</h2>
      <p class="hint">${sectorDe(id).nombre}. Queda a tu nombre hasta que se cobre.</p>
      <div class="field"><label>Comensales</label>
        <div class="stepper"><button data-act="comensales" data-v="-1" aria-label="Menos">−</button><span>${UI.m.comensales}</span><button data-act="comensales" data-v="1" aria-label="Más">+</button></div></div>
      ${UI.m.err ? `<div class="alert danger">${esc(UI.m.err)}</div>` : ""}
      <div class="modal-actions"><button class="btn" data-act="cerrarModal">Cancelar</button><button class="btn primary" data-act="confirmarAbrir" data-id="${id}">Abrir mesa</button></div>`;
  }
  if (type === "nota") {
    const it = S.mesas[UI.mesa].items.find((i) => i.id === id);
    body = `<h2>Nota para ${esc(P(it.prodId).nombre)}</h2>
      <div class="field"><label for="nota">Aclaración para ${ESTACIONES[P(it.prodId).est].toLowerCase()}</label><input id="nota" data-bind="m.nota" value="${esc(UI.m.nota ?? it.nota)}" placeholder="Ej.: sin cebolla, bien cocida" autocomplete="off"></div>
      <div class="chips">${["sin cebolla", "sin sal", "bien cocida", "sin hielo", "para compartir"].map((s) => `<button class="chip" data-act="sugerir" data-v="${s}">${s}</button>`).join("")}</div>
      <div class="modal-actions"><button class="btn" data-act="cerrarModal">Cancelar</button><button class="btn primary" data-act="guardarNota" data-id="${id}">Guardar</button></div>`;
  }
  if (type === "egreso") {
    body = `<h2>Registrar egreso</h2>
      <p class="hint">Plata que sale de la caja: pagos a proveedores, retiros, compras chicas.</p>
      <div class="field"><label for="ec">Concepto</label><input id="ec" data-bind="m.concepto" value="${esc(UI.m.concepto || "")}" placeholder="Ej.: compra de limones" autocomplete="off"></div>
      <div class="field"><label for="em">Monto</label><input id="em" type="number" min="0" data-bind="m.monto" value="${esc(UI.m.monto || "")}"></div>
      ${UI.m.err ? `<div class="alert danger">${esc(UI.m.err)}</div>` : ""}
      <div class="modal-actions"><button class="btn" data-act="cerrarModal">Cancelar</button><button class="btn primary" data-act="guardarEgreso">Registrar</button></div>`;
  }
  return `<div class="modal-bg" data-act="fondoModal"><div class="modal" role="dialog" aria-modal="true">${body}</div></div>`;
}

/* ---------------- Render ---------------- */
let toastTimer;
function toast(msg, warn) {
  const el = document.getElementById("toast");
  el.innerHTML = `<div class="toast ${warn ? "warn" : ""}">${esc(msg)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.innerHTML = ""), 2800);
}

function render(keepScroll = true) {
  save(); saveUI();
  const pb = document.getElementById("pbody");
  const top = keepScroll && pb ? pb.scrollTop : 0;
  document.body.dataset.rol = UI.rol;
  document.getElementById("bar").innerHTML = vBarra();
  document.getElementById("app").innerHTML = UI.rol === "mozo" ? vMozo() : UI.rol === "caja" ? vCaja() : vCocina();
  document.getElementById("modal").innerHTML = vModal();
  const pb2 = document.getElementById("pbody");
  if (pb2) pb2.scrollTop = top;
}

// los tiempos de las comandas avanzan solos
setInterval(() => {
  document.querySelectorAll("[data-since]").forEach((el) => (el.textContent = fDur(Number(el.dataset.since))));
  const k = document.getElementById("kclock");
  if (k) k.textContent = fhora(Date.now());
}, 15000);

function setPath(path, value) {
  const keys = path.split(".");
  let o = UI;
  keys.slice(0, -1).forEach((k) => { if (o[k] === undefined) o[k] = {}; o = o[k]; });
  o[keys[keys.length - 1]] = value;
}

function descargarCSV(nombre, filas) {
  let embebida = false;
  try { embebida = window.self !== window.top; } catch (e) { embebida = true; }
  if (embebida) return toast("En esta vista previa no se permiten descargas; en la demo publicada sí", true);
  try {
    const csv = "﻿" + filas.map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    toast("CSV descargado");
  } catch (e) { toast("Este navegador no permitió la descarga", true); }
}

/* ---------------- Eventos ---------------- */
const A = {
  rol: (d) => { UI.rol = d.v; UI.modal = null; render(false); window.scrollTo(0, 0); },
  reiniciar: () => {
    S = crearDatosIniciales();
    Object.assign(UI, { mozo: null, mesa: null, catalogo: false, mTab: "salon", cMesa: null, cobro: null, contado: "", modal: null, m: {} });
    toast("Demo reiniciada con los datos de ejemplo"); render(false);
  },
  offline: () => { S.sync.online = false; toast("Se cortó internet. El local sigue funcionando."); render(); },
  online: () => {
    S.sync.online = true;
    const n = S.sync.pendientes.length;
    if (!n) { toast("Conexión restablecida"); return render(); }
    UI.syncing = true; render();
    setTimeout(() => { S.sync.pendientes = []; S.sync.ultimo = Date.now(); UI.syncing = false; toast(`${n} cambio${n === 1 ? "" : "s"} subido${n === 1 ? "" : "s"} a la nube`); render(); }, 1600);
  },

  // mozo
  elegirMozo: (d) => { UI.mozo = d.id; UI.mTab = "salon"; UI.mesa = null; render(false); },
  salirMozo: () => { UI.mozo = null; UI.mesa = null; UI.catalogo = false; render(false); },
  mTab: (d) => { UI.mTab = d.v; render(false); },
  sector: (d) => { UI.sector = d.v; render(); },
  tocarMesa: (d) => {
    const m = S.mesas[d.id];
    if (!m.abierta) {
      if (turnoCerrado()) return toast("La caja está cerrada", true);
      if (mozoCerrado(UI.mozo)) return toast("Tu turno está cerrado", true);
      UI.modal = { type: "abrir", id: d.id }; UI.m = { comensales: 2 }; return render();
    }
    UI.mesa = d.id; UI.catalogo = false; render(false);
  },
  comensales: (d) => { UI.m.comensales = Math.min(20, Math.max(1, UI.m.comensales + Number(d.v))); render(); },
  confirmarAbrir: (d) => {
    const err = abrirMesa(d.id, UI.mozo, UI.m.comensales);
    if (err) { UI.m.err = err; return render(); }
    UI.modal = null; UI.mesa = d.id; UI.catalogo = true; UI.cat = "cervezas";
    toast(`${nombreMesa(d.id)} abierta`); render(false);
  },
  cerrarMesa: () => { UI.mesa = null; UI.catalogo = false; render(false); },
  abrirCatalogo: () => { UI.catalogo = true; render(false); },
  cerrarCatalogo: () => { UI.catalogo = false; render(false); },
  cat: (d) => { UI.cat = d.v; render(); },
  agregar: (d) => { agregarProducto(UI.mesa, d.id); render(); },
  mas: (d) => { S.mesas[UI.mesa].items.find((i) => i.id === d.id).cant++; render(); },
  menos: (d) => {
    const m = S.mesas[UI.mesa], it = m.items.find((i) => i.id === d.id);
    if (--it.cant <= 0) m.items = m.items.filter((i) => i.id !== d.id);
    render();
  },
  enviar: () => {
    const n = enviarComanda(UI.mesa);
    toast(n === 2 ? "Comanda enviada a cocina y a barra" : "Comanda enviada"); render();
  },
  pedirCuenta: () => {
    const m = S.mesas[UI.mesa];
    m.cuentaPedida = true; mut(`${nombreMesa(UI.mesa)} pidió la cuenta`);
    toast("Cuenta pedida · le llega a la caja"); render();
  },
  entregar: (d) => { entregarComanda(d.id); toast("Marcado como entregado"); render(); },
  sugerir: (d) => { UI.m.nota = d.v; render(); },
  guardarNota: (d) => {
    const it = S.mesas[UI.mesa].items.find((i) => i.id === d.id);
    it.nota = (UI.m.nota ?? it.nota).trim(); UI.modal = null; render();
  },

  // caja
  cTab: (d) => { UI.cTab = d.v; render(false); window.scrollTo(0, 0); },
  cajaMesa: (d) => {
    if (!S.mesas[d.id].abierta) { UI.cMesa = null; toast(`${nombreMesa(d.id)} está libre`); return render(); }
    UI.cMesa = d.id; UI.cobro = nuevoCobro(d.id); render();
  },
  cerrarPanel: () => { UI.cMesa = null; render(); },
  medio: (d) => { UI.cobro.medio = d.v; render(); },
  agregarPago: () => {
    const k = calcCobro(UI.cMesa, UI.cobro);
    const base = UI.cobro.monto === "" ? k.saldo : num(UI.cobro.monto);
    if (base <= 0) return toast("Ingresá un monto", true);
    if (base > k.saldo) return toast(`El pago supera lo que falta (${$$(k.saldo)})`, true);
    const md = MEDIO(UI.cobro.medio);
    UI.cobro.pagos.push({ medio: md.id, base, recargo: Math.round(base * md.recargo) });
    UI.cobro.monto = ""; render();
  },
  quitarPago: (d) => { UI.cobro.pagos.splice(Number(d.i), 1); render(); },
  cobrarMesa: () => {
    const r = cerrarMesa(UI.cMesa, UI.cobro);
    if (typeof r === "string") return toast(r, true);
    toast(`Cobrado ${$$(r.total + r.pagos.reduce((a, p) => a + p.recargo, 0))} · ${nombreMesa(r.mesa)} libre`);
    UI.cMesa = null; UI.cobro = null; render();
  },
  cerrarTurno: () => {
    cerrarTurno(num(UI.contado)); const d = S.turno.cierre.diferencia; UI.contado = "";
    toast(d === 0 ? "Caja cerrada · cuadra" : `Caja cerrada · ${d > 0 ? "sobran" : "faltan"} ${$$(Math.abs(d))}`, d !== 0); render();
  },
  nuevoTurno: () => { nuevoTurno(); toast("Turno nuevo abierto"); render(false); },
  cerrarMozo: (d) => {
    const r = resumenMozo(d.id);
    if (r.abiertas.length) return toast("Tiene mesas abiertas", true);
    S.cierresMozo[d.id] = { ts: Date.now(), vendido: r.vendido, propinas: r.propinas };
    mut(`Cierre de ${MZ(d.id).nombre}`);
    toast(`Turno de ${MZ(d.id).nombre} cerrado · propinas ${$$(r.propinas)}`); render();
  },
  reabrirMozo: (d) => { delete S.cierresMozo[d.id]; mut(`Reapertura de ${MZ(d.id).nombre}`); render(); },
  guardarEgreso: () => {
    const monto = num(UI.m.monto), concepto = (UI.m.concepto || "").trim();
    if (!concepto || monto <= 0) { UI.m.err = "Completá el concepto y un monto mayor a cero."; return render(); }
    S.turno.egresos.push({ id: "E" + S.seq.egreso++, ts: Date.now(), concepto, monto });
    mut(`Egreso: ${concepto}`); UI.modal = null; toast("Egreso registrado"); render();
  },
  csvConsumo: () => {
    const { filas } = consumo();
    descargarCSV("ribera-consumo-del-dia.csv", [["Producto", "Categoría", "Estación", "Vendidos", "En mesas abiertas", "Total"], ...PRODUCTOS.map((p) => [p.nombre, CATEGORIAS.find((c) => c.id === p.cat).nombre, ESTACIONES[p.est], filas[p.id].cant, filas[p.id].enCurso, filas[p.id].total])]);
  },
  csvMozos: () => {
    descargarCSV("ribera-cierre-por-mozo.csv", [["Mozo", "Mesas cobradas", "Comensales", "Vendido", ...MEDIOS.map((m) => m.nombre), "Propinas", "Mesas abiertas"], ...MOZOS.map((mz) => { const r = resumenMozo(mz.id); return [`${mz.nombre} ${mz.apellido}`, r.ventas, r.comensales, Math.round(r.vendido), ...MEDIOS.map((m) => Math.round(r.porMedio[m.id])), r.propinas, r.abiertas.length]; })]);
  },

  // cocina / barra
  est: (d) => { UI.est = d.v; render(); },
  avanzar: (d) => {
    avanzarComanda(d.id);
    const c = S.comandas.find((x) => x.id === d.id);
    toast(c.estado === "lista" ? `Avisado a ${MZ(c.mozoId).nombre}: ${nombreMesa(c.mesa)} lista` : "En preparación"); render();
  },

  // modales
  modal: (d) => { UI.modal = { type: d.type, id: d.id }; UI.m = {}; render(); },
  cerrarModal: () => { UI.modal = null; render(); },
  fondoModal: (d, el, e) => { if (e.target === el) { UI.modal = null; render(); } },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = A[el.dataset.act];
  if (fn) fn(el.dataset, el, e);
});
document.addEventListener("input", (e) => {
  const el = e.target;
  if (!el.dataset || !el.dataset.bind) return;
  setPath(el.dataset.bind, el.value);
  if (el.dataset.live !== undefined) {
    const pos = el.selectionStart;
    render();
    const again = document.querySelector(`[data-bind="${el.dataset.bind}"]`);
    if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (err) {} }
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && UI.modal) { UI.modal = null; render(); }
  if (e.key === "Enter" && UI.modal && e.target.tagName === "INPUT") {
    const b = document.querySelector(".modal .btn.primary"); if (b) b.click();
  }
});

render(false);
