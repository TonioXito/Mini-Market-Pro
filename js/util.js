'use strict';

const MODULOS = [
  ['dashboard', 'Inicio', '🏠'],
  ['ventas', 'Ventas', '🛒'],
  ['inventario', 'Inventario', '📦'],
  ['clientes', 'Cuentas por cobrar', '👥'],
  ['proveedores', 'Cuentas por pagar', '🚚'],
  ['reportes', 'Reportes', '📊'],
  ['configuracion', 'Configuración', '⚙️']
];

const METODOS = [
  ['efectivo_usd', 'Efectivo $'],
  ['efectivo_bs', 'Efectivo Bs'],
  ['punto', 'Punto de venta'],
  ['pago_movil', 'Pago móvil'],
  ['transferencia', 'Transferencia'],
  ['zelle', 'Zelle'],
  ['binance', 'Binance'],
  ['otro', 'Otro']
];

const nombreMetodo = (k) => (METODOS.find(m => m[0] === k) || [k, k])[1];

function departamentosExistentes() {
  const set = new Set(S.productos.map(p => String(p.categoria || '').trim()).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function sufijoUnidad(p) {
  return p && p.unidad === 'kg' ? ' kg' : '';
}

function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function num(v) { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; }

function fmt$(n) {
  return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtBs(n) {
  return 'Bs ' + (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtCant(n) {
  const v = Number(n) || 0;
  return v % 1 === 0 ? String(v) : String(r2(v));
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function aFecha(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function fmtFecha(v) {
  const d = aFecha(v);
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function fmtFechaCorta(v) {
  const d = aFecha(v);
  if (!d) return '—';
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
}
function fmtHora(v) {
  const d = aFecha(v);
  if (!d) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function fmtFechaHora(v) { return fmtFecha(v) + ' ' + fmtHora(v); }

function inicioDia(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function finDia(d) { const x = inicioDia(d); x.setDate(x.getDate() + 1); return x; }
function sumarDias(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function lunesDe(d) { const x = inicioDia(d); const dia = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dia); return x; }
function mismoDia(a, b) {
  const x = aFecha(a), y = aFecha(b);
  return !!x && !!y && x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}
function valorInputFecha(d) {
  const x = aFecha(d) || new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
function fechaDeInput(s) {
  if (!s) return null;
  const p = s.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function esc(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function toast(msg, tipo = '') {
  const wrap = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + tipo;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function abreModal(titulo, cuerpoHTML) {
  cierraModal();
  const root = document.getElementById('modales');
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal">
      <h2><span>${esc(titulo)}</span><button class="modal-cerrar" title="Cerrar">✕</button></h2>
      <div class="modal-cuerpo">${cuerpoHTML}</div>
    </div>`;
  ov.addEventListener('click', (e) => { if (e.target === ov) cierraModal(); });
  ov.querySelector('.modal-cerrar').addEventListener('click', cierraModal);
  root.appendChild(ov);
  return ov.querySelector('.modal');
}
function cierraModal() { document.getElementById('modales').innerHTML = ''; }

function confirma(mensaje, textoOk = 'Sí, confirmar') {
  return new Promise((resolve) => {
    const m = abreModal('Confirmar', `
      <p style="color:var(--muted)">${esc(mensaje)}</p>
      <div class="modal-acciones">
        <button class="btn btn-gris" data-r="no">Cancelar</button>
        <button class="btn btn-rojo" data-r="si">${esc(textoOk)}</button>
      </div>`);
    m.querySelector('[data-r=no]').addEventListener('click', () => { cierraModal(); resolve(false); });
    m.querySelector('[data-r=si]').addEventListener('click', () => { cierraModal(); resolve(true); });
  });
}

function pregunta(titulo, mensaje) {
  return new Promise((resolve) => {
    const m = abreModal(titulo, `
      <p style="color:var(--muted)">${esc(mensaje)}</p>
      <div class="modal-acciones">
        <button class="btn btn-gris" data-r="">Cancelar</button>
        <button class="btn btn-primary" data-r="ok">Aceptar</button>
      </div>`);
    m.querySelector('[data-r=ok]').addEventListener('click', () => { cierraModal(); resolve(true); });
    m.querySelector('[data-r=""]').addEventListener('click', () => { cierraModal(); resolve(false); });
  });
}

function descargaArchivo(nombre, contenido, mime) {
  const blob = new Blob(['\ufeff' + contenido], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 400);
}

function opcionesHTML(lista, seleccionada) {
  return lista.map(([v, t]) => `<option value="${esc(v)}" ${v === seleccionada ? 'selected' : ''}>${esc(t)}</option>`).join('');
}

function badgeEstadoPago(estado) {
  const mapa = {
    pagada: '<span class="badge verde">Pagada</span>',
    pendiente: '<span class="badge naranja">Pendiente</span>',
    anulada: '<span class="badge rojo">Anulada</span>',
    vencida: '<span class="badge rojo">Vencida</span>'
  };
  return mapa[estado] || `<span class="badge gris">${esc(estado)}</span>`;
}
