'use strict';

const RENDERERS = {};
const LOGIN_ACTIVO = true;
let instalacionPWA = null;

function etiquetaModulo(k) {
  const m = MODULOS.find(x => x[0] === k);
  return m ? { label: m[1], icono: m[2] } : { label: k, icono: '•' };
}

function modulosPermitidos() {
  return MODULOS.filter(([k]) => puede(k, 'ver')).map(([k]) => k);
}

function construirNav() {
  const permitidos = modulosPermitidos();
  const sbNav = document.getElementById('sb-nav');
  sbNav.innerHTML = permitidos.map(k => {
    const { label, icono } = etiquetaModulo(k);
    return `<button class="nav-item" data-vista="${k}"><span class="ni-icono">${icono}</span>${esc(label)}</button>`;
  }).join('');
  sbNav.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => irA(b.dataset.vista)));

  const bnBar = document.getElementById('bn-bar');
  const principales = permitidos.slice(0, 4);
  const extra = permitidos.slice(4);
  let html = principales.map(k => {
    const { icono } = etiquetaModulo(k);
    const cortosBN = { dashboard: 'Inicio', ventas: 'Ventas', inventario: 'Stock', clientes: 'Por cobrar', proveedores: 'Por pagar', reportes: 'Reportes', configuracion: 'Ajustes' };
    return `<button class="bn-item" data-vista="${k}"><span class="bn-icono">${icono}</span>${esc(cortosBN[k] || etiquetaModulo(k).label)}</button>`;
  }).join('');
  if (extra.length || true) {
    html += `<button class="bn-item" data-vista="__mas"><span class="bn-icono">☰</span>Más</button>`;
  }
  bnBar.innerHTML = html;
  bnBar.querySelectorAll('.bn-item').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.vista === '__mas') abrirSheet(extra);
    else irA(b.dataset.vista);
  }));
}

function abrirSheet(extra) {
  const sheet = document.getElementById('sheet');
  const cont = document.getElementById('sheet-items');
  const items = extra.map(k => {
    const { label, icono } = etiquetaModulo(k);
    return `<button class="sheet-btn" data-vista="${k}"><span style="font-size:1.2rem">${icono}</span>${esc(label)}</button>`;
  }).join('');
  cont.innerHTML = items + `<button class="sheet-btn" id="sh-salir"><span style="font-size:1.2rem">⏻</span>Cerrar sesión</button>`;
  cont.querySelectorAll('.sheet-btn[data-vista]').forEach(b => b.addEventListener('click', () => { cerrarSheet(); irA(b.dataset.vista); }));
  cont.querySelector('#sh-salir').addEventListener('click', () => { cerrarSheet(); cerrarSesion(); });
  sheet.classList.remove('oculto');
}
function cerrarSheet() { document.getElementById('sheet').classList.add('oculto'); }

function irA(vista) {
  if (!puede(vista, 'ver')) { toast('No tienes permiso para entrar ahí', 'aviso'); return; }
  S.vista = vista;
  document.querySelectorAll('#vistas .vista').forEach(s => s.classList.toggle('activa', s.id === 'vista-' + vista));
  document.querySelectorAll('.nav-item,.bn-item').forEach(b => b.classList.toggle('activo', b.dataset.vista === vista));
  const { label } = etiquetaModulo(vista);
  document.getElementById('tb-titulo').textContent = label;
  cerrarSheet();
  if (RENDERERS[vista]) RENDERERS[vista]();
}

function refrescarVistaActiva() {
  if (!S.perfil) return;
  refrescarChipTasa();
  if (RENDERERS[S.vista]) RENDERERS[S.vista]();
}

function refrescarChipTasa() {
  const chip = document.getElementById('tb-tasa');
  if (!chip) return;
  const t = S.negocio ? S.negocio.tasaDia : null;
  chip.textContent = 'Bs ' + (t ? Number(t).toLocaleString('es-VE', { maximumFractionDigits: 2 }) : '—');
  chip.title = 'Tasa del día';
}

async function cerrarSesion() {
  try { await auth.signOut(); } catch {}
  location.reload();
}

/* ================= AUTENTICACIÓN ================= */

function mostrarPantalla(id) {
  ['scr-login', 'scr-primer', 'scr-config'].forEach(s => document.getElementById(s).classList.add('oculto'));
  document.getElementById('app').classList.add('oculto');
  document.getElementById(id).classList.remove('oculto');
}

function mensajeAuthError(e) {
  const c = e && e.code ? e.code : '';
  if (c.includes('invalid-credential') || c.includes('credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Correo o contraseña incorrectos.';
  if (c.includes('invalid-email')) return 'El correo no tiene un formato válido.';
  if (c.includes('too-many-requests')) return 'Demasiados intentos fallidos. Espera un momento y prueba de nuevo.';
  if (c.includes('network')) return 'Sin conexión a internet. Revisa tu red.';
  if (c.includes('weak-password')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (c.includes('email-already-in-use')) return 'Ese correo ya está registrado como usuario.';
  return 'Ocurrió un problema: ' + (e.message || c);
}

const DOMINIO_LOCAL = '@minimarket.local';

function aEmailLogin(v) {
  v = String(v || '').trim();
  if (!v) return '';
  return v.includes('@') ? v : v.toLowerCase().replace(/\s+/g, '') + DOMINIO_LOCAL;
}
function mostrarAcceso(email) {
  return String(email || '').replace(DOMINIO_LOCAL, '');
}

function arrancarAuth() {
  if (!CONFIG_OK) { mostrarPantalla('scr-config'); return; }

  if (!iniciarFirebase()) { mostrarPantalla('scr-config'); return; }

  if (!LOGIN_ACTIVO) {
    S.user = { uid: 'master-local' };
    S.perfil = {
      id: 'master-local',
      nombre: 'Administrador',
      rol: 'admin',
      permisos: permisosCompletos(),
      activo: true
    };
    iniciarApp();
    return;
  }

  mostrarPantalla('scr-login');

  auth.onAuthStateChanged(async (u) => {
    cierraModal();
    if (!u) {
      S.user = null; S.perfil = null;
      mostrarPantalla('scr-login');
      return;
    }
    S.user = u;
    try {
      const snap = await db.collection('usuarios').doc(u.uid).get();
      if (snap.exists && snap.data().activo !== false) {
        S.perfil = { id: snap.id, ...snap.data() };
        iniciarApp();
        return;
      }
      const q = await db.collection('usuarios').limit(1).get();
      if (q.empty) {
        document.getElementById('pu-email').textContent = u.email || '';
        mostrarPantalla('scr-primer');
      } else if (snap.exists && snap.data().activo === false) {
        await auth.signOut();
        mostrarErrorLogin('Tu usuario está desactivado. Habla con el administrador.');
      } else {
        await auth.signOut();
        mostrarErrorLogin('Este correo no está registrado en la aplicación. Pide al administrador que te cree un usuario.');
      }
    } catch (e) {
      console.error(e);
      mostrarErrorLogin('No se pudo verificar tu usuario: ' + e.message);
    }
  });
}

function mostrarErrorLogin(msg) {
  const el = document.getElementById('lg-err');
  el.textContent = msg;
  el.classList.remove('oculto');
}

function iniciarApp() {
  mostrarPantalla('app');
  S.listo = true;
  document.getElementById('sb-nombre-negocio').textContent = (S.negocio && S.negocio.nombreNegocio) || 'Mi Minimarket';
  document.getElementById('tb-usuario').textContent = S.perfil.nombre || '';
  document.getElementById('sb-usuario').innerHTML = `<b>${esc(S.perfil.nombre)}</b>${esAdmin() ? 'Administrador' : 'Empleado'}${S.perfil.email ? ' · ' + esc(S.perfil.email) : ''}`;
  construirNav();
  iniciarEscuchas();
  if (esAdmin()) escucharUsuarios();
  irA(modulosPermitidos()[0] || 'dashboard');
  toast('Bienvenido, ' + (S.perfil.nombre || ''), 'ok');
}

/* ================= DASHBOARD ================= */

RENDERERS.dashboard = function () {
  const cont = document.getElementById('cont-dashboard');
  const hoy = new Date();
  const ventasHoy = S.ventasRecientes.filter(v => v.estado !== 'anulada' && mismoDia(v.fecha, hoy));
  const vendidoUSD = r2(ventasHoy.reduce((a, v) => a + (v.totalUSD || 0), 0));
  const tasaActual = (S.negocio && S.negocio.tasaDia) || 0;
  const cobradoHoy = r2(S.abonosRecientes.filter(a => mismoDia(a.fecha, hoy)).reduce((a, b) => a + (b.montoUSD || 0), 0));
  const porCobrar = r2(S.clientes.reduce((a, c) => a + Math.max(c.saldoUSD || 0, 0), 0));
  const porPagar = r2(S.compras.filter(c => r2(c.pagadoUSD) < r2(c.totalUSD)).reduce((a, c) => a + (r2(c.totalUSD) - r2(c.pagadoUSD)), 0));
  const bajoStock = S.productos.filter(p => r2(p.stock) <= r2(p.stockMinimo)).sort((a, b) => (a.stock || 0) - (b.stock || 0));

  const limite = sumarDias(hoy, 7);
  const vencimientos = S.compras
    .filter(c => r2(c.pagadoUSD) < r2(c.totalUSD) && c.fechaVencimiento)
    .map(c => ({ ...c, restante: r2(r2(c.totalUSD) - r2(c.pagadoUSD)) }))
    .filter(c => { const f = aFecha(c.fechaVencimiento); return f && inicioDia(f) <= inicioDia(limite); })
    .sort((a, b) => aFecha(a.fechaVencimiento) - aFecha(b.fechaVencimiento))
    .slice(0, 6);

  const puedeEditarTasa = puede('configuracion', 'usar');

  cont.innerHTML = `
    <div class="grid-kpi">
      <div class="kpi verde">
        <div class="kpi-etiqueta">Vendido hoy</div>
        <div class="kpi-valor">${fmt$(vendidoUSD)}</div>
        <div class="kpi-sub">${ventasHoy.length} venta${ventasHoy.length === 1 ? '' : 's'}${tasaActual > 0 ? ' · ~' + fmtBs(vendidoUSD * tasaActual) : ''}</div>
      </div>
      <div class="kpi azul">
        <div class="kpi-etiqueta">Cobrado hoy</div>
        <div class="kpi-valor">${fmt$(cobradoHoy)}</div>
        <div class="kpi-sub">abonos de clientes</div>
      </div>
      <div class="kpi naranja">
        <div class="kpi-etiqueta">Me deben</div>
        <div class="kpi-valor">${fmt$(porCobrar)}</div>
        <div class="kpi-sub">${tasaActual > 0 ? '~' + fmtBs(porCobrar * tasaActual) : 'por cobrar a clientes'}</div>
      </div>
      <div class="kpi rojo">
        <div class="kpi-etiqueta">Debo yo</div>
        <div class="kpi-valor">${fmt$(porPagar)}</div>
        <div class="kpi-sub">deudas con proveedores</div>
      </div>
    </div>

    <div class="card">
      <div class="fila-cab">
        <h2 style="margin:0">💱 Tasa del día</h2>
        ${S.negocio && S.negocio.tasaFecha ? `<span class="badge gris">Actualizada ${fmtFechaHora(S.negocio.tasaFecha)}${S.negocio.tasaPor ? ' por ' + esc(S.negocio.tasaPor) : ''}</span>` : ''}
      </div>
      <div class="fila fila-movil-horizontal" style="align-items:flex-end">
        <label class="campo" style="margin-bottom:0">Bs por cada $
          <input id="dash-tasa" type="number" step="0.01" min="0.01" value="${tasaActual || ''}" ${puedeEditarTasa ? '' : 'disabled'}>
        </label>
        ${puedeEditarTasa ? '<button id="dash-guardar-tasa" class="btn btn-verde" style="min-width:130px">Guardar tasa</button>' : '<div class="item-sub" style="padding-bottom:10px">Solo quien tenga permiso puede cambiarla.</div>'}
      </div>
    </div>

    <div class="card">
      <div class="fila-cab">
        <h3 style="margin:0">⏰ Pagos a proveedores próximos o vencidos</h3>
        ${puede('proveedores', 'ver') ? '<button class="btn btn-gris btn-chico" data-ira="proveedores">Ver todo</button>' : ''}
      </div>
      <div class="lista-tarjetas" id="dash-vencimientos"></div>
    </div>

    <div class="card">
      <div class="fila-cab">
        <h3 style="margin:0">📦 Productos con poco inventario (${bajoStock.length})</h3>
        ${puede('inventario', 'ver') ? '<button class="btn btn-gris btn-chico" data-ira="inventario">Ver inventario</button>' : ''}
      </div>
      <div class="lista-tarjetas" id="dash-bajostock"></div>
    </div>

    <div class="card">
      <div class="fila-cab">
        <h3 style="margin:0">🧾 Últimas ventas</h3>
        ${puede('reportes', 'ver') ? '<button class="btn btn-gris btn-chico" data-ira="reportes">Ver reportes</button>' : ''}
      </div>
      <div class="tabla-wrap"><table class="tabla"><tbody id="dash-ultimas"></tbody></table></div>
    </div>
  `;

  cont.querySelectorAll('[data-ira]').forEach(b => b.addEventListener('click', () => irA(b.dataset.ira)));

  const divVen = cont.querySelector('#dash-vencimientos');
  divVen.innerHTML = vencimientos.length ? vencimientos.map(c => {
    const f = aFecha(c.fechaVencimiento);
    const vencido = inicioDia(f) < inicioDia(hoy);
    return `<div class="item-lista">
      <div class="item-principal">
        <div class="item-titulo">${esc(c.proveedorNombre)}</div>
        <div class="item-sub">${esc(c.descripcion)} · vence ${fmtFecha(f)}</div>
      </div>
      <div class="item-derecha">
        <div class="monto-grande ${vencido ? 'monto-rojo' : 'monto-naranja'}">${fmt$(c.restante)}</div>
        ${vencido ? '<span class="badge rojo">Vencido</span>' : `<span class="badge naranja">en ${Math.ceil((inicioDia(f) - inicioDia(hoy)) / 86400000)} días</span>`}
      </div>
    </div>`;
  }).join('') : '<div class="vacio">Nada pendiente en los próximos 7 días 🎉</div>';

  const divBajo = cont.querySelector('#dash-bajostock');
  divBajo.innerHTML = bajoStock.length ? bajoStock.slice(0, 8).map(p =>
    `<div class="item-lista">
      <div class="item-principal"><div class="item-titulo">${esc(p.nombre)}</div><div class="item-sub">mínimo: ${fmtCant(p.stockMinimo)}</div></div>
      <div class="item-derecha"><span class="badge ${r2(p.stock) <= 0 ? 'rojo' : 'naranja'}">stock: ${fmtCant(p.stock)}</span></div>
    </div>`
  ).join('') : '<div class="vacio">Todo el inventario está bien 👍</div>';

  const tbody = cont.querySelector('#dash-ultimas');
  const ultimas = S.ventasRecientes.slice(0, 6);
  tbody.innerHTML = ultimas.length ? ultimas.map(v => `
    <tr class="${v.estado === 'anulada' ? 'anulada' : ''}">
      <td>${fmtHora(v.fecha)}</td>
      <td>${esc(v.numero || '')}</td>
      <td>${esc(v.clienteNombre || 'Público general')}</td>
      <td>${esc(nombreMetodo(v.metodo))}</td>
      <td class="num"><b>${fmt$(v.totalUSD)}</b></td>
      <td>${badgeEstadoPago(v.tipo === 'fiado' ? 'pendiente' : 'pagada')}</td>
    </tr>`).join('') : '<tr><td colspan="6"><div class="vacio">Aún no hay ventas registradas.</div></td></tr>';

  if (puedeEditarTasa) {
    const btn = cont.querySelector('#dash-guardar-tasa');
    btn.addEventListener('click', async () => {
      const valor = num(cont.querySelector('#dash-tasa').value);
      if (!(valor > 0)) { toast('Coloca una tasa válida', 'error'); return; }
      btn.disabled = true;
      try { await actualizarTasa(valor); toast('Tasa actualizada a Bs ' + valor, 'ok'); }
      catch (e) { toast(e.message, 'error'); }
      btn.disabled = false;
    });
  }
};

/* ================= VENTAS (POS) ================= */

RENDERERS.ventas = function () {
  const cont = document.getElementById('cont-ventas');
  if (!puede('ventas', 'usar')) {
    cont.innerHTML = `<div class="card"><div class="vacio">Solo puedes consultar las ventas (sin permiso para vender).</div></div>` + bloqueVentasHoy();
    pintarVentasHoy();
    return;
  }
  capturarPosForm();
  cont.innerHTML = `
    <div class="pos-grid">
      <div class="card">
        <div class="pos-buscador">
          <input id="pos-buscar" type="search" placeholder="🔍 Buscar producto por nombre, código o categoría..." value="${esc(S.posBusqueda)}">
        </div>
        <div id="pos-grid" class="productos-grid"></div>
      </div>
      <div class="card" id="pos-card-carrito"></div>
    </div>
    <div id="pos-hoy-wrap">${bloqueVentasHoy()}</div>
  `;
  document.getElementById('pos-buscar').addEventListener('input', (e) => {
    S.posBusqueda = e.target.value;
    pintarGridProductos();
  });
  pintarGridProductos();
  pintarCarrito();
  pintarVentasHoy();
};

function bloqueVentasHoy() {
  return `
    <div class="card">
      <div class="fila-cab">
        <h3 style="margin:0">🧾 Ventas de hoy <span id="vh-total" class="badge verde"></span></h3>
      </div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Hora</th><th>N°</th><th>Cliente</th><th>Método</th><th class="num">Total $</th><th class="num">Bs pagados</th><th>Estado</th><th></th></tr></thead>
        <tbody id="pos-tabla-hoy"></tbody>
      </table></div>
    </div>`;
}

function capturarPosForm() {
  const g = (id) => document.getElementById(id);
  S.posForm = S.posForm || { clienteId: '', metodo: 'efectivo_usd', moneda: 'USD', autoEntregado: true };
  if (g('pos-cliente')) S.posForm.clienteId = g('pos-cliente').value;
  if (g('pos-metodo')) S.posForm.metodo = g('pos-metodo').value;
  if (g('pos-moneda')) S.posForm.moneda = g('pos-moneda').value;
  if (g('pos-tasa')) S.posForm.tasa = g('pos-tasa').value;
  if (g('pos-entregado')) S.posForm.entregado = g('pos-entregado').value;
}

function totalCarritoUSD() {
  return r2(S.carrito.reduce((a, i) => a + i.totalUSD, 0));
}

function tasaPosActual() {
  const t = num((S.posForm && S.posForm.tasa) || (S.negocio && S.negocio.tasaDia) || 0);
  return t > 0 ? t : ((S.negocio && S.negocio.tasaDia) || 0);
}

function pintarGridProductos() {
  const grid = document.getElementById('pos-grid');
  if (!grid) return;
  const q = S.posBusqueda.trim().toLowerCase();
  let lista = S.productos.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  if (q) lista = lista.filter(p =>
    String(p.nombre).toLowerCase().includes(q) ||
    String(p.codigo || '').toLowerCase().includes(q) ||
    String(p.categoria || '').toLowerCase().includes(q));
  grid.innerHTML = lista.length ? lista.map(p => {
    const stockBajo = r2(p.stock) <= r2(p.stockMinimo);
    return `<button class="prod-btn" data-id="${p.id}">
      <span class="prod-nombre">${esc(p.nombre)}</span>
      <span class="prod-precio">${fmt$(p.precioUSD)}</span>
      <span class="prod-stock ${stockBajo ? 'bajo' : ''}">stock: ${fmtCant(p.stock)}</span>
    </button>`;
  }).join('') : '<div class="vacio" style="grid-column:1/-1">No hay productos que coincidan.<br>Agrégalos en Inventario.</div>';
  grid.querySelectorAll('.prod-btn').forEach(b => b.addEventListener('click', () => agregarAlCarrito(b.dataset.id)));
}

function agregarAlCarrito(id) {
  const p = S.productos.find(x => x.id === id);
  if (!p) return;
  const ya = S.carrito.find(i => i.productoId === id);
  if (ya) ya.cantidad = r2(ya.cantidad + 1);
  else S.carrito.push({
    productoId: p.id,
    nombre: p.nombre,
    cantidad: 1,
    precioUSD: r2(p.precioUSD),
    costoUSD: r2(p.costoUSD || 0),
    totalUSD: r2(p.precioUSD)
  });
  pintarCarrito();
}

function cambiarCantidad(id, delta) {
  const it = S.carrito.find(i => i.productoId === id);
  if (!it) return;
  it.cantidad = Math.max(0.5, r2(it.cantidad + delta));
  it.totalUSD = r2(it.precioUSD * it.cantidad);
  pintarCarrito();
}
function fijarCantidad(id, valor) {
  const it = S.carrito.find(i => i.productoId === id);
  if (!it) return;
  const v = num(valor);
  if (v <= 0) { quitarDelCarrito(id); return; }
  it.cantidad = r2(v);
  it.totalUSD = r2(it.precioUSD * it.cantidad);
  pintarCarrito();
}
function quitarDelCarrito(id) {
  S.carrito = S.carrito.filter(i => i.productoId !== id);
  pintarCarrito();
}

function pintarCarrito() {
  const card = document.getElementById('pos-card-carrito');
  if (!card) return;
  capturarPosForm();
  const form = S.posForm;
  const totalUSD = totalCarritoUSD();
  const tasa = tasaPosActual();
  const moneda = form.moneda || 'USD';
  const totalMoneda = moneda === 'Bs' && tasa > 0 ? r2(totalUSD * tasa) : totalUSD;

  let entregadoVal = form.entregado;
  if (form.autoEntregado || entregadoVal === undefined || entregadoVal === '') entregadoVal = totalMoneda ? String(totalMoneda) : '';

  const opcionesClientes = `<option value="">Público general (sin deuda)</option>` +
    S.clientes.map(c => `<option value="${c.id}" ${form.clienteId === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');

  card.innerHTML = `
    <div class="fila-cab">
      <h3 style="margin:0">🛒 Carrito (${S.carrito.length})</h3>
      ${S.carrito.length ? '<button id="pos-vaciar" class="mini-btn peligro">Vaciar</button>' : ''}
    </div>
    <div id="pos-lista-carrito">
      ${S.carrito.length ? S.carrito.map(i => `
        <div class="cart-item">
          <div class="cart-nombre">${esc(i.nombre)}<small>${fmt$(i.precioUSD)} c/u · ${fmt$(i.totalUSD)}</small></div>
          <div class="stepper">
            <button data-acc="menos" data-id="${i.productoId}">−</button>
            <input data-acc="cant" data-id="${i.productoId}" type="number" step="0.5" min="0.5" value="${i.cantidad}">
            <button data-acc="mas" data-id="${i.productoId}">+</button>
          </div>
          <button class="mini-btn peligro" data-acc="quitar" data-id="${i.productoId}">✕</button>
        </div>`).join('') : '<div class="vacio">Toca los productos para agregarlos</div>'}
    </div>

    <div class="fila" style="margin-top:12px">
      <label class="campo">Cliente
        <select id="pos-cliente">${opcionesClientes}</select>
      </label>
      <button id="pos-btn-cli" class="btn btn-gris" style="align-self:flex-end;margin-bottom:10px;flex:0 0 auto" title="Crear cliente nuevo">＋</button>
    </div>
    <div class="fila">
      <label class="campo">Método de pago
        <select id="pos-metodo">${opcionesHTML(METODOS, form.metodo)}</select>
      </label>
      <label class="campo">Moneda
        <select id="pos-moneda">
          <option value="USD" ${moneda === 'USD' ? 'selected' : ''}>Dólares $</option>
          <option value="Bs" ${moneda === 'Bs' ? 'selected' : ''}>Bolívares Bs</option>
        </select>
      </label>
    </div>
    <div class="fila">
      <label class="campo">Tasa (Bs/$)
        <input id="pos-tasa" type="number" step="0.01" min="0.01" value="${form.tasa !== undefined && form.tasa !== '' ? form.tasa : (tasa || '')}">
      </label>
      <label class="campo">Entregó (${moneda})
        <input id="pos-entregado" type="number" step="0.01" min="0" value="${entregadoVal}">
      </label>
    </div>

    <div class="resumen-pos" id="pos-resumen"></div>
    <button id="pos-cobrar" class="btn btn-verde btn-block" style="padding:14px;font-size:1.02rem" ${S.carrito.length ? '' : 'disabled'}>💵 COBRAR</button>
  `;

  card.querySelector('#pos-vaciar').addEventListener('click', () => { S.carrito = []; form.autoEntregado = true; form.entregado = ''; pintarCarrito(); });

  card.querySelectorAll('[data-acc]').forEach(el => {
    const id = el.dataset.id;
    const acc = el.dataset.acc;
    if (acc === 'menos') el.addEventListener('click', () => cambiarCantidad(id, -1));
    if (acc === 'mas') el.addEventListener('click', () => cambiarCantidad(id, 1));
    if (acc === 'quitar') el.addEventListener('click', () => quitarDelCarrito(id));
    if (acc === 'cant') el.addEventListener('change', () => fijarCantidad(id, el.value));
  });

  card.querySelector('#pos-cliente').addEventListener('change', (e) => { form.clienteId = e.target.value; });
  card.querySelector('#pos-metodo').addEventListener('change', (e) => { form.metodo = e.target.value; });
  card.querySelector('#pos-moneda').addEventListener('change', (e) => { form.moneda = e.target.value; form.autoEntregado = true; pintarCarrito(); });
  card.querySelector('#pos-tasa').addEventListener('input', (e) => { form.tasa = e.target.value; actualizarResumenPos(); });
  card.querySelector('#pos-entregado').addEventListener('input', (e) => { form.entregado = e.target.value; form.autoEntregado = false; actualizarResumenPos(); });
  card.querySelector('#pos-btn-cli').addEventListener('click', abrirClienteRapido);

  actualizarResumenPos();

  const btnCobrar = card.querySelector('#pos-cobrar');
  btnCobrar.addEventListener('click', async () => {
    capturarPosForm();
    const f = S.posForm;
    const tasaFinal = tasaPosActual();
    const btn = btnCobrar;
    btn.disabled = true;
    try {
      const numero = await cobrarVenta({
        clienteId: f.clienteId,
        metodo: f.metodo,
        moneda: f.moneda,
        tasa: tasaFinal,
        entregadoMoneda: f.entregado
      });
      S.carrito = [];
      form.autoEntregado = true;
      form.entregado = '';
      toast('Venta ' + numero + ' registrada ✅', 'ok');
      pintarCarrito();
      pintarVentasHoy();
    } catch (e) {
      toast(e.message, 'error');
    }
    btn.disabled = false;
  });
}

function actualizarResumenPos() {
  const res = document.getElementById('pos-resumen');
  if (!res) return;
  const totalUSD = totalCarritoUSD();
  const tasa = tasaPosActual();
  const moneda = (S.posForm && S.posForm.moneda) || 'USD';
  const totalMoneda = moneda === 'Bs' && tasa > 0 ? r2(totalUSD * tasa) : totalUSD;
  const entregado = num(document.getElementById('pos-entregado') ? document.getElementById('pos-entregado').value : 0);
  const entregadoUSD = moneda === 'Bs' && tasa > 0 ? r2(entregado / tasa) : r2(entregado);

  let lineas = '';
  if (totalUSD > 0 && tasa > 0) lineas += `<div class="resumen-linea"><span>Total en bolívares</span><b>${fmtBs(totalUSD * tasa)}</b></div>`;
  if (S.carrito.length && entregado > 0) {
    const difMoneda = r2(entregado - totalMoneda);
    if (difMoneda >= 0.009 && totalMoneda > 0) {
      lineas += `<div class="resumen-linea"><span>Vuelto</span><b class="monto-verde">${moneda === 'Bs' ? fmtBs(difMoneda) : fmt$(difMoneda)}</b></div>`;
    } else if (difMoneda <= -0.009) {
      const debeUSD = r2(totalUSD - entregadoUSD);
      const cliSel = S.posForm && S.posForm.clienteId;
      lineas += `<div class="resumen-linea"><span>Quedará debiendo</span><b class="alerta-deuda">${fmt$(debeUSD)}${cliSel ? '' : ' ⚠️ falta elegir cliente'}</b></div>`;
    }
  }
  res.innerHTML = `
    <div class="resumen-linea total"><span>Total</span><span>${fmt$(totalUSD)}${moneda === 'Bs' ? ` / ${fmtBs(totalMoneda)}` : ''}</span></div>
    ${lineas}`;
}

function abrirClienteRapido() {
  const m = abreModal('Nuevo cliente', `
    <label class="campo">Nombre <input id="nc-nombre" type="text"></label>
    <label class="campo">Teléfono (opcional) <input id="nc-telefono" type="tel"></label>
    <div class="modal-acciones">
      <button class="btn btn-gris" id="nc-cancelar">Cancelar</button>
      <button class="btn btn-primary" id="nc-guardar">Guardar</button>
    </div>`);
  m.querySelector('#nc-cancelar').addEventListener('click', cierraModal);
  m.querySelector('#nc-nombre').focus();
  m.querySelector('#nc-guardar').addEventListener('click', async () => {
    const nombre = m.querySelector('#nc-nombre').value;
    if (!nombre.trim()) { toast('Escribe el nombre', 'error'); return; }
    try {
      const id = await guardarCliente({ nombre, telefono: m.querySelector('#nc-telefono').value });
      S.posForm.clienteId = id;
      cierraModal();
      toast('Cliente creado', 'ok');
      pintarCarrito();
    } catch (e) { toast(e.message, 'error'); }
  });
}

function pintarVentasHoy() {
  const tbody = document.getElementById('pos-tabla-hoy');
  if (!tbody) return;
  const hoy = new Date();
  const lista = S.ventasRecientes
    .filter(v => mismoDia(v.fecha, hoy))
    .sort((a, b) => aFecha(b.fecha) - aFecha(a.fecha));
  const activas = lista.filter(v => v.estado !== 'anulada');
  const totalUSD = r2(activas.reduce((a, v) => a + (v.totalUSD || 0), 0));
  const totalBs = r2(activas.reduce((a, v) => a + (v.totalUSD || 0) * ((v.tasa) || 0), 0));
  const spanTotal = document.getElementById('vh-total');
  if (spanTotal) spanTotal.textContent = `${lista.length} ventas · ${fmt$(totalUSD)}${totalBs ? ' · ' + fmtBs(totalBs) : ''}`;

  const puedoAnular = puede('ventas', 'usar');
  tbody.innerHTML = lista.length ? lista.map(v => `
    <tr class="${v.estado === 'anulada' ? 'anulada' : ''}">
      <td>${fmtHora(v.fecha)}</td>
      <td>${esc(v.numero || '')}</td>
      <td>${esc(v.clienteNombre || 'Público general')}<br><small style="color:var(--muted)">${esc(nombreMetodo(v.metodo))}${v.tipo === 'fiado' ? ' · fiado' : ''}</small></td>
      <td class="num">${esc(nombreMetodo(v.metodo))}</td>
      <td class="num"><b>${fmt$(v.totalUSD)}</b></td>
      <td class="num">${v.montoBs ? fmtBs(v.montoBs) : '—'}</td>
      <td>${v.tipo === 'fiado' ? badgeEstadoPago('pendiente') : badgeEstadoPago('pagada')}</td>
      <td class="acciones-cell">${puedoAnular && v.estado !== 'anulada' ? `<button class="mini-btn peligro" data-anular="${v.id}" title="Anular venta">✕</button>` : ''}</td>
    </tr>`).join('') : '<tr><td colspan="8"><div class="vacio">Todavía no hay ventas hoy. ¡Ánimo! 💪</div></td></tr>';

  tbody.querySelectorAll('[data-anular]').forEach(b => b.addEventListener('click', async () => {
    const ok = await confirma('¿Anular esta venta? El stock de los productos será devuelto y la deuda del cliente (si tenía) se eliminará.', 'Sí, anular');
    if (!ok) return;
    try { await anularVenta(b.dataset.anular); toast('Venta anulada', 'ok'); }
    catch (e) { toast(e.message, 'error'); }
  }));
}

/* ================= ARRANQUE ================= */

document.addEventListener('DOMContentLoaded', () => {

  document.getElementById('lg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('lg-btn');
    btn.disabled = true;
    document.getElementById('lg-err').classList.add('oculto');
    try {
      const nombreEscrito = document.getElementById('lg-email').value.trim();
      const email = aEmailLogin(nombreEscrito);
      const pass = document.getElementById('lg-pass').value;

      if (nombreEscrito.toLowerCase() === 'master' && pass === '010101') {
        try {
          await auth.signInWithEmailAndPassword(email, pass);
        } catch (errEntrar) {
          try {
            await auth.createUserWithEmailAndPassword(email, pass);
            toast('Cuenta master creada por primera vez ✅', 'ok');
          } catch (errCrear) {
            if (String(errCrear.code || '').includes('already-in-use')) throw errEntrar;
            throw errCrear;
          }
        }
      } else {
        await auth.signInWithEmailAndPassword(email, pass);
      }
    } catch (err) {
      mostrarErrorLogin(mensajeAuthError(err));
      btn.disabled = false;
    }
  });

  document.getElementById('lg-crear').addEventListener('click', async (e) => {
    e.preventDefault();
    let yaHay = false;
    try {
      const q = await db.collection('usuarios').limit(1).get();
      yaHay = !q.empty;
    } catch {}
    if (yaHay) {
      mostrarErrorLogin('Ya existe una cuenta de administrador. Entra con tu usuario normal; si necesitas otra cuenta, pídesela al administrador desde Configuración → Usuarios.');
      return;
    }
    const m = abreModal('Crear cuenta del administrador', `
      <p class="item-sub" style="margin-bottom:12px">Esta opción solo está disponible la primera vez. Con tu correo y una contraseña crearás el usuario dueño del negocio.</p>
      <label class="campo">Usuario de acceso (o correo)<input id="cr-email" type="text" placeholder="Ej: master"></label>
      <label class="campo">Contraseña (mínimo 6 caracteres)<input id="cr-pass" type="text" autocomplete="off"></label>
      <label class="campo">Repite la contraseña<input id="cr-pass2" type="text" autocomplete="off"></label>
      <div class="modal-acciones">
        <button class="btn btn-gris" id="cr-cancel">Cancelar</button>
        <button class="btn btn-primary" id="cr-crear">Crear mi cuenta</button>
      </div>`);
    m.querySelector('#cr-cancel').addEventListener('click', cierraModal);
    m.querySelector('#cr-crear').addEventListener('click', async () => {
      const email = aEmailLogin(m.querySelector('#cr-email').value);
      const pass = m.querySelector('#cr-pass').value;
      const pass2 = m.querySelector('#cr-pass2').value;
      if (!/^\S+@\S+\.\S+$/.test(email)) { toast('Escribe un correo válido', 'error'); return; }
      if (!pass || pass.length < 6) { toast('La contraseña debe tener mínimo 6 caracteres', 'error'); return; }
      if (pass !== pass2) { toast('Las contraseñas no coinciden', 'error'); return; }
      try {
        await auth.createUserWithEmailAndPassword(email, pass);
        cierraModal();
        toast('Cuenta creada. Ahora completa los datos de tu negocio.', 'ok');
      } catch (err) {
        mostrarErrorLogin(mensajeAuthError(err));
        cierraModal();
      }
    });
  });

  document.getElementById('lg-reset').addEventListener('click', (e) => {
    e.preventDefault();
    const m = abreModal('Recuperar contraseña', `
      <p style="color:var(--muted)">Te enviaremos un correo con un enlace para cambiar tu contraseña.</p>
      <label class="campo">Correo electrónico <input id="rp-email" type="email" value="${esc(document.getElementById('lg-email').value)}"></label>
      <div class="modal-acciones">
        <button class="btn btn-gris" id="rp-cancel">Cancelar</button>
        <button class="btn btn-primary" id="rp-enviar">Enviar correo</button>
      </div>`);
    m.querySelector('#rp-cancel').addEventListener('click', cierraModal);
    m.querySelector('#rp-enviar').addEventListener('click', async () => {
      const correo = m.querySelector('#rp-email').value.trim();
      if (!correo) { toast('Escribe tu correo', 'error'); return; }
      try {
        await enviarResetPass(correo);
        cierraModal();
        toast('Correo enviado. Revisa tu bandeja (y spam).', 'ok');
      } catch (err) { toast(mensajeAuthError(err), 'error'); }
    });
  });

  document.getElementById('pu-btn').addEventListener('click', async () => {
    const btn = document.getElementById('pu-btn');
    const negocio = document.getElementById('pu-negocio').value;
    const nombre = document.getElementById('pu-nombre').value;
    const tasa = num(document.getElementById('pu-tasa').value);
    const errEl = document.getElementById('pu-err');
    errEl.classList.add('oculto');
    if (!negocio.trim() || !nombre.trim()) {
      errEl.textContent = 'Completa el nombre del negocio y tu nombre.';
      errEl.classList.remove('oculto');
      return;
    }
    btn.disabled = true;
    try {
      await crearPrimerAdmin(S.user.uid, S.user.email, negocio, nombre, tasa > 0 ? tasa : 1);
      S.perfil = { id: S.user.uid, nombre: nombre.trim(), email: S.user.email, rol: 'admin', permisos: permisosCompletos(), activo: true };
      iniciarApp();
    } catch (e) {
      errEl.textContent = mensajeAuthError(e);
      errEl.classList.remove('oculto');
      btn.disabled = false;
    }
  });

  document.getElementById('sb-salir').addEventListener('click', cerrarSesion);
  document.getElementById('tb-salir').addEventListener('click', cerrarSesion);
  document.getElementById('sheet-cerrar').addEventListener('click', cerrarSheet);
  document.getElementById('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') cerrarSheet(); });
  document.getElementById('tb-tasa').addEventListener('click', () => {
    if (puede('configuracion', 'ver')) irA('configuracion');
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    instalacionPWA = e;
    document.getElementById('btn-instalar').classList.remove('oculto');
  });
  document.getElementById('btn-instalar').addEventListener('click', async () => {
    document.getElementById('btn-instalar').classList.add('oculto');
    if (instalacionPWA) { instalacionPWA.prompt(); instalacionPWA = null; }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  arrancarAuth();
});
