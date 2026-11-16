/* Ribera · Bar — datos de demostración.
   El bar, las personas, los precios y las ventas son ficticios.
   Fotos: Pexels (licencia libre), ver CREDITOS.md. */

const CONFIG = {
  recargoCredito: 0.10,   // el crédito lleva recargo; débito, efectivo y transferencia no
  fondoInicial: 40000,    // cambio con el que abre la caja
  propinaSugerida: 0.10,
  alertaMin: 12,          // minutos para marcar una comanda como demorada
  criticaMin: 20,
};

const MEDIOS = [
  { id: "efectivo", nombre: "Efectivo", recargo: 0 },
  { id: "debito", nombre: "Débito", recargo: 0 },
  { id: "credito", nombre: "Crédito", recargo: CONFIG.recargoCredito },
  { id: "transferencia", nombre: "Transferencia / QR", recargo: 0 },
];

const MOZOS = [
  { id: "m1", nombre: "Lucas", apellido: "Ferreyra", foto: "img/5920775.jpg" },
  { id: "m2", nombre: "Camila", apellido: "Ríos", foto: "img/3800577.jpg" },
  { id: "m3", nombre: "Mateo", apellido: "Juárez", foto: "img/12276390.jpg" },
];

const SECTORES = [
  { id: "salon", nombre: "Salón", mesas: ["1", "2", "3", "4", "5", "6", "7", "8"] },
  { id: "vereda", nombre: "Vereda", mesas: ["9", "10", "11", "12"] },
  { id: "barra", nombre: "Barra", mesas: ["B1", "B2", "B3"] },
];

const CATEGORIAS = [
  { id: "cervezas", nombre: "Cervezas" },
  { id: "tragos", nombre: "Tragos" },
  { id: "sin", nombre: "Sin alcohol" },
  { id: "picar", nombre: "Para picar" },
  { id: "platos", nombre: "Platos" },
];

const ESTACIONES = { cocina: "Cocina", barra: "Barra" };

const PRODUCTOS = [
  { id: "c1", nombre: "Pinta rubia", cat: "cervezas", est: "barra", precio: 4500, foto: "img/1267151.jpg" },
  { id: "c2", nombre: "Pinta IPA", cat: "cervezas", est: "barra", precio: 5200, foto: "img/15138585.jpg" },
  { id: "c3", nombre: "Chopp", cat: "cervezas", est: "barra", precio: 3500, foto: "img/5858056.jpg" },
  { id: "t1", nombre: "Fernet con coca", cat: "tragos", est: "barra", precio: 5800, foto: "img/34328349.jpg" },
  { id: "s1", nombre: "Gaseosa", cat: "sin", est: "barra", precio: 2600, foto: "img/8879626.jpg" },
  { id: "s2", nombre: "Limonada de la casa", cat: "sin", est: "barra", precio: 3900, foto: "img/8042740.jpg" },
  { id: "p1", nombre: "Papas rústicas", cat: "picar", est: "cocina", precio: 6500, foto: "img/1586942.jpg" },
  { id: "p2", nombre: "Papas cheddar y panceta", cat: "picar", est: "cocina", precio: 8900, foto: "img/17429243.jpg" },
  { id: "p3", nombre: "Empanadas (x3)", cat: "picar", est: "cocina", precio: 7200, foto: "img/13689920.jpg" },
  { id: "h1", nombre: "Hamburguesa clásica", cat: "platos", est: "cocina", precio: 12500, foto: "img/2983101.jpg" },
  { id: "h2", nombre: "Hamburguesa veggie", cat: "platos", est: "cocina", precio: 11800, foto: "img/4269604.jpg" },
  { id: "z1", nombre: "Pizza muzzarella", cat: "platos", est: "cocina", precio: 11000, foto: "img/262977.jpg" },
  { id: "z2", nombre: "Pizza especial", cat: "platos", est: "cocina", precio: 13800, foto: "img/5902953.jpg" },
];

function crearDatosIniciales() {
  const ahora = Date.now();
  const hace = (min) => ahora - min * 60e3;
  let nItem = 1, nCom = 1;

  const mesas = {};
  SECTORES.forEach((s) => s.mesas.forEach((m) => (mesas[m] = { abierta: null, mozoId: null, comensales: 0, items: [], cuentaPedida: false })));
  const comandas = [];

  // abre una mesa con ítems; cada grupo [estacion, estado, minutos, [[prod, cant, nota]]] es una comanda
  function abrir(mesa, mozoId, comensales, min, grupos, borrador = [], cuentaPedida = false) {
    const m = mesas[mesa];
    Object.assign(m, { abierta: hace(min), mozoId, comensales, cuentaPedida });
    grupos.forEach(([est, estado, minC, lineas]) => {
      const c = { id: "K" + nCom++, mesa, mozoId, est, ts: hace(minC), estado, items: [] };
      if (estado === "lista" || estado === "entregada") c.lista = hace(Math.max(0, minC - 8));
      lineas.forEach(([prodId, cant, nota = ""]) => {
        const it = { id: "i" + nItem++, prodId, cant, nota, comandaId: c.id, estado: estado === "entregada" ? "entregado" : estado === "lista" ? "listo" : "enviado" };
        m.items.push(it); c.items.push(it.id);
      });
      comandas.push(c);
    });
    borrador.forEach(([prodId, cant, nota = ""]) => m.items.push({ id: "i" + nItem++, prodId, cant, nota, comandaId: null, estado: "borrador" }));
  }

  abrir("2", "m1", 4, 70, [
    ["barra", "entregada", 66, [["c1", 2], ["t1", 1]]],
    ["cocina", "entregada", 62, [["p2", 1], ["h1", 2, "una sin cebolla"]]],
  ], [], true);
  abrir("5", "m2", 2, 25, [
    ["barra", "lista", 22, [["c2", 2]]],
    ["cocina", "preparando", 21, [["z2", 1], ["p3", 1]]],
  ]);
  abrir("9", "m3", 3, 12, [
    ["barra", "nueva", 4, [["c3", 3]]],
    ["cocina", "nueva", 4, [["p1", 1, "bien crocantes"]]],
  ]);
  abrir("B1", "m2", 1, 40, [
    ["barra", "entregada", 38, [["t1", 1]]],
    ["cocina", "entregada", 35, [["p3", 1]]],
  ]);
  abrir("7", "m1", 2, 5, [], [["s2", 2]]);

  // ventas ya cobradas en este turno: [mesa, mozo, minutos, comensales, ítems, pagos, propina, descuento%]
  const ventasBase = [
    ["4", "m1", 175, 2, [["c1", 2], ["p1", 1]], [["efectivo", 1]], 1500, 0],
    ["10", "m3", 160, 4, [["c3", 4], ["z1", 1], ["p3", 1]], [["debito", 1]], 0, 0],
    ["B2", "m2", 150, 1, [["t1", 2]], [["efectivo", 1]], 1000, 0],
    ["1", "m2", 135, 3, [["c2", 3], ["h1", 2], ["h2", 1]], [["credito", 0.5], ["efectivo", 0.5]], 4000, 0],
    ["11", "m3", 120, 2, [["s2", 2], ["z2", 1]], [["transferencia", 1]], 0, 0],
    ["6", "m1", 105, 5, [["c1", 4], ["t1", 2], ["p2", 2], ["z1", 1]], [["credito", 1]], 6000, 0],
    ["3", "m2", 90, 2, [["s1", 2], ["h2", 2]], [["debito", 1]], 2000, 10],
    ["12", "m3", 75, 3, [["c2", 2], ["s1", 1], ["p1", 1], ["h1", 1]], [["efectivo", 1]], 2500, 0],
    ["8", "m1", 50, 2, [["t1", 2], ["p3", 1]], [["transferencia", 1]], 0, 0],
  ];
  const P = (id) => PRODUCTOS.find((p) => p.id === id);
  const ventas = ventasBase.map(([mesa, mozoId, min, comensales, lineas, pagos, propina, descPct], i) => {
    const items = lineas.map(([prodId, cant]) => ({ prodId, cant, precio: P(prodId).precio }));
    const subtotal = items.reduce((a, x) => a + x.precio * x.cant, 0);
    const descuento = Math.round((subtotal * descPct) / 100);
    const total = subtotal - descuento + propina;
    let resto = total;
    const ps = pagos.map(([medio, parte], j) => {
      const base = j === pagos.length - 1 ? resto : Math.round(total * parte);
      resto -= base;
      return { medio, base, recargo: Math.round(base * MEDIOS.find((m) => m.id === medio).recargo) };
    });
    return { id: "V" + (1001 + i), mesa, mozoId, abierta: hace(min + 40), cerrada: hace(min), comensales, items, subtotal, descuento, propina, total, pagos: ps };
  });

  return {
    version: 1,
    turno: { id: "T-" + new Date(hace(190)).toISOString().slice(0, 10), apertura: hace(190), cajero: "Romina", fondo: CONFIG.fondoInicial, egresos: [{ id: "E1", ts: hace(130), concepto: "Hielo (proveedor)", monto: 6000 }], cierre: null },
    cierresMozo: {},
    mesas,
    comandas,
    ventas,
    turnosAnteriores: [],
    sync: { online: true, pendientes: [], ultimo: ahora },
    seq: { item: nItem, comanda: nCom, venta: 1001 + ventasBase.length, egreso: 2 },
  };
}
