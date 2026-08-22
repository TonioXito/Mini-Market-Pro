'use strict';

/* ==================== REPORTES ==================== */

const RANGOS_REPORTE = [
  ['hoy', 'Hoy'],
  ['ayer', 'Ayer'],
  ['semana', 'Esta semana'],
  ['mes', 'Este mes'],
  ['mespasado', 'Mes pasado'],
  ['custom', 'Fechas propias']
];

RENDERERS.reportes = function () {
  const cont = document.getElementById('cont-reportes');

  cont.innerHTML = `
    <div class="card">
      <div class="fila-cab"><h3 style="margin:0">📊 Reporte de ventas</h3></div>
      <div class="chips" id="rep-chips">
        ${RANGOS_REPORTE.map(([k, t]) => `<button class="chip ${S.repFiltroTipo === k ? 'activo' : ''}" data-rango="${k}">${t}</button>`).join('')}
      </div>
      <div class="fila fila-movil-horizontal ${S.repFiltroTipo === 'custom' ? '' : 'oculto'}" id="rep-fechas" style="margin-bottom:10px;align-items:flex-end">
        <label class="campo">Desde<input id="rep-desde" type="date" value="${S.repDesde || valorInputFecha(inicioDia(new Date()))}"></label>
        <label class="campo">Hasta<input id="rep-hasta" type="date" value="${S.repHasta || valorInputFecha(new Date())}"></label>
      </div>
      <button id="rep-gen" class="btn btn-primary btn-block">Ver reporte</button>
    </div>
    <div id="rep-resultado"></div>`;

  cont.querySelectorAll('#rep-chips .chip').forEach(ch => ch.addEventListener('click', () => {
    S.repFiltroTipo = ch.dataset.rango;
    if (ch.dataset.rango !== 'custom') generarReporte();
    else RENDERERS.reportes();
  }));

  cont.querySelector('#rep-gen').addEventListener('click', () => {
    if (S.repFiltroTipo === 'custom') {
      S.repDesde = cont.querySelector('#rep-desde').value;
      S.repHasta = cont.querySelector('#rep-hasta').value;
      if (!S.repDesde) { toast('Elige la fecha inicial', 'aviso'); return; }
    }
    generarReporte();
  });

  if (!S.repDatos && !S.repCargando) generarReporte();
  else pintarResultadoReporte();
};

function rangoDeFiltro() {
  const hoy = inicioDia(new Date());
  let ini = hoy, finExclu = sumarDias(hoy, 1);
  switch (S.repFiltroTipo) {
    case 'ayer': ini = sumarDias(hoy, -1); finExclu = hoy; break;
    case 'semana': ini = lunesDe(hoy); finExclu = sumarDias(ini, 7); break;
    case 'mes': ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1); finExclu = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1); break;
    case 'mespasado': ini = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1); finExclu = new Date(hoy.getFullYear(), hoy.getMonth(), 1); break;
    case 'custom': {
      ini = fechaDeInput(S.repDesde) || hoy;
      const hasta = fechaDeInput(S.repHasta);
      finExclu = hasta ? finDia(hasta) : sumarDias(ini, 1);
      if (finExclu <= ini) finExclu = sumarDias(ini, 1);
      break;
    }
  }
  return { ini, finExclu };
}

async function generarReporte() {
  S.repCargando = true;
  const resultado = document.getElementById('rep-resultado');
  if (resultado) resultado.innerHTML = '<div class="card"><div class="vacio">Calculando reporte...</div></div>';
  try {
    const { ini, finExclu } = rangoDeFiltro();
    const [venSnap, aboSnap, pagSnap] = await Promise.all([
      db.collection('ventas').where('fecha', '>=', ini).where('fecha', '<', finExclu).get(),
      db.collection('abonos').where('fecha', '>=', ini).where('fecha', '<', finExclu).get(),
      db.collection('pagos_prov').where('fecha', '>=', ini).where('fecha', '<', finExclu).get()
    ]);
    const ventas = venSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => aFecha(a.fecha) - aFecha(b.fecha));
    const abonosLista = aboSnap.docs.map(d => d.data());
    const pagos = pagSnap.docs.map(d => d.data());

    const activas = ventas.filter(v => v.estado !== 'anulada');
    const anuladas = ventas.length - activas.length;
    const tasaActual = (S.negocio && S.negocio.tasaDia) || 0;

    const totalUSD = r2(activas.reduce((a, v) => a + (v.totalUSD || 0), 0));
    const totalBsEquiv = r2(activas.reduce((a, v) => a + (v.totalUSD || 0) * ((v.tasa) || tasaActual || 0), 0));
    const ganancia = r2(activas.reduce((a, v) => a + (v.items || []).reduce((b, it) => b + ((it.precioUSD || 0) - (it.costoUSD || 0)) * (it.cantidad || 0), 0), 0));
    const fiadoNuevo = r2(activas.filter(v => v.tipo === 'fiado').reduce((a, v) => a + (v.saldoPendienteUSD || 0), 0));
    const cobradoUSD = r2(abonosLista.reduce((a, b) => a + (b.montoUSD || 0), 0));
    const cobradoBs = r2(abonosLista.reduce((a, b) => a + (b.montoBs || 0), 0));
    const pagadoProvUSD = r2(pagos.reduce((a, b) => a + (b.montoUSD || 0), 0));
    const pagadoProvBs = r2(pagos.reduce((a, b) => a + (b.montoBs || 0), 0));

    const porMetodoVentas = {};
    activas.forEach(v => {
      const k = v.metodo || 'otro';
      porMetodoVentas[k] = r2((porMetodoVentas[k] || 0) + (v.inicialUSD != null ? v.inicialUSD : v.totalUSD));
    });
    const porMetodoCobros = {};
    abonosLista.forEach(b => {
      const k = b.metodo || 'otro';
      porMetodoCobros[k] = r2((porMetodoCobros[k] || 0) + (b.montoUSD || 0));
    });
    const porMetodoPagos = {};
    pagos.forEach(p => {
      const k = p.metodo || 'otro';
      porMetodoPagos[k] = r2((porMetodoPagos[k] || 0) + (p.montoUSD || 0));
    });

    const prodMap = {};
    activas.forEach(v => (v.items || []).forEach(it => {
      const k = it.nombre || '(producto eliminado)';
      if (!prodMap[k]) prodMap[k] = { cantidad: 0, total: 0 };
      prodMap[k].cantidad = r2(prodMap[k].cantidad + (it.cantidad || 0));
      prodMap[k].total = r2(prodMap[k].total + (it.totalUSD || 0));
    }));
    const topProductos = Object.entries(prodMap)
      .map(([nombre, d]) => ({ nombre, ...d }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    S.repDatos = {
      ini, finExclu,
      ventas, abonos: abonosLista, pagos,
      resumen: {
        nVentas: activas.length, anuladas, totalUSD, totalBsEquiv, ganancia,
        ticket: activas.length ? r2(totalUSD / activas.length) : 0,
        fiadoNuevo, cobradoUSD, cobradoBs, pagadoProvUSD, pagadoProvBs,
        porMetodoVentas, porMetodoCobros, porMetodoPagos, topProductos
      }
    };
  } catch (e) {
    console.error(e);
    toast('No se pudo calcular el reporte: ' + e.message, 'error');
  }
  S.repCargando = false;
  pintarResultadoReporte();
}

function etiquetaPeriodo(d) {
  return `${fmtFecha(d.ini)} al ${fmtFecha(sumarDias(d.finExclu, -1))}`;
}

function tablaMetodos(mapa) {
  const entradas = Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  if (!entradas.length) return '<div class="vacio">Sin datos.</div>';
  return `<table class="tabla" style="min-width:280px">
    <thead><tr><th>Método</th><th class="num">Monto $</th></tr></thead>
    <tbody>${entradas.map(([k, v]) => `<tr><td>${esc(nombreMetodo(k))}</td><td class="num"><b>${fmt$(v)}</b></td></tr>`).join('')}</tbody>
  </table>`;
}

function pintarResultadoReporte() {
  const zona = document.getElementById('rep-resultado');
  if (!zona) return;
  const d = S.repDatos;
  if (!d) { zona.innerHTML = ''; return; }
  const r = d.resumen;

  zona.innerHTML = `
    <div class="card">
      <div class="fila-cab">
        <h3 style="margin:0">Resumen · ${etiquetaPeriodo(d)}</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button id="exp-xlsx" class="btn btn-verde btn-chico">📥 Excel</button>
          <button id="exp-csv" class="btn btn-gris btn-chico">CSV</button>
          <button id="exp-txt" class="btn btn-gris btn-chico">TXT</button>
        </div>
      </div>
      <div class="grid-kpi" style="margin-bottom:0">
        <div class="kpi verde"><div class="kpi-etiqueta">Total vendido</div><div class="kpi-valor">${fmt$(r.totalUSD)}</div><div class="kpi-sub">${r.totalBsEquiv ? '~' + fmtBs(r.totalBsEquiv) : ''}</div></div>
        <div class="kpi azul"><div class="kpi-etiqueta">N° de ventas</div><div class="kpi-valor">${r.nVentas}</div><div class="kpi-sub">${r.anuladas ? r.anuladas + ' anuladas' : 'ticket prom. ' + fmt$(r.ticket)}</div></div>
        <div class="kpi verde"><div class="kpi-etiqueta">Ganancia estimada</div><div class="kpi-valor">${fmt$(r.ganancia)}</div><div class="kpi-sub">precio − costo</div></div>
        <div class="kpi naranja"><div class="kpi-etiqueta">Fiado nuevo del período</div><div class="kpi-valor">${fmt$(r.fiadoNuevo)}</div></div>
        <div class="kpi azul"><div class="kpi-etiqueta">Cobrado a clientes</div><div class="kpi-valor">${fmt$(r.cobradoUSD)}</div><div class="kpi-sub">${fmtBs(r.cobradoBs)}</div></div>
        <div class="kpi rojo"><div class="kpi-etiqueta">Pagado a proveedores</div><div class="kpi-valor">${fmt$(r.pagadoProvUSD)}</div><div class="kpi-sub">${fmtBs(r.pagadoProvBs)}</div></div>
      </div>
    </div>

    <div class="pos-grid">
      <div class="card"><h3>💳 Cobros al momento de vender (por método)</h3>${tablaMetodos(r.porMetodoVentas)}</div>
      <div class="card"><h3>💵 Abonos recibidos (por método)</h3>${tablaMetodos(r.porMetodoCobros)}</div>
    </div>

    ${r.topProductos.length ? `
    <div class="card">
      <h3>🏆 Productos más vendidos</h3>
      <div class="tabla-wrap"><table class="tabla" style="min-width:380px">
        <thead><tr><th>#</th><th>Producto</th><th class="num">Cantidad</th><th class="num">Total $</th></tr></thead>
        <tbody>${r.topProductos.map((p, i) => `
          <tr><td>${i + 1}</td><td>${esc(p.nombre)}</td><td class="num">${fmtCant(p.cantidad)}</td><td class="num"><b>${fmt$(p.total)}</b></td></tr>`).join('')}</tbody>
      </table></div>
    </div>` : ''}

    <div class="card">
      <h3>🧾 Ventas del período (${d.ventas.length})</h3>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Fecha</th><th>N°</th><th>Vendedor</th><th>Cliente</th><th>Método</th><th class="num">Total $</th><th class="num">Tasa</th><th>Estado</th></tr></thead>
        <tbody>${d.ventas.length ? d.ventas.slice().reverse().map(v => `
          <tr class="${v.estado === 'anulada' ? 'anulada' : ''}">
            <td>${fmtFechaCorta(v.fecha)}<br><small style="color:var(--muted)">${fmtHora(v.fecha)}</small></td>
            <td>${esc(v.numero || '')}</td>
            <td><small>${esc(v.usuario || '')}</small></td>
            <td>${esc(v.clienteNombre || 'Público general')}</td>
            <td>${esc(nombreMetodo(v.metodo))}${v.tipo === 'fiado' ? '<br><small style="color:#fbbf24">fiado</small>' : ''}</td>
            <td class="num"><b>${fmt$(v.totalUSD)}</b></td>
            <td class="num">${v.tasa ? Number(v.tasa).toLocaleString('es-VE', { maximumFractionDigits: 2 }) : '—'}</td>
            <td>${v.estado === 'anulada' ? badgeEstadoPago('anulada') : (v.tipo === 'fiado' ? badgeEstadoPago('pendiente') : badgeEstadoPago('pagada'))}</td>
          </tr>`).join('') : '<tr><td colspan="8"><div class="vacio">Sin ventas en este período.</div></td></tr>'}</tbody>
      </table></div>
    </div>`;

  zona.querySelector('#exp-xlsx').addEventListener('click', exportarReporteExcel);
  zona.querySelector('#exp-csv').addEventListener('click', exportarReporteCSV);
  zona.querySelector('#exp-txt').addEventListener('click', exportarReporteTXT);
}

function filasVentasReporte(d) {
  const filas = [['Fecha', 'Hora', 'Número', 'Vendedor', 'Cliente', 'Método', 'Tipo', 'Total USD', 'Tasa', 'Total Bs', 'Estado']];
  d.ventas.forEach(v => filas.push([
    fmtFecha(v.fecha), fmtHora(v.fecha), v.numero || '', v.usuario || '',
    v.clienteNombre || 'Público general', nombreMetodo(v.metodo),
    v.tipo === 'fiado' ? 'Fiado' : 'Contado',
    r2(v.totalUSD), r2(v.tasa || 0),
    v.estado === 'anulada' ? 0 : r2((v.totalUSD || 0) * (v.tasa || 0)),
    v.estado === 'anulada' ? 'Anulada' : (v.tipo === 'fiado' ? 'Pendiente (fiado)' : 'Pagada')
  ]));
  return filas;
}

function hojaAOA(wb, nombre, filas, anchos) {
  const ws = XLSX.utils.aoa_to_sheet(filas);
  if (anchos) ws['!cols'] = anchos.map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31));
}

function nombreArchivoReporte(d, ext) {
  const negocio = ((S.negocio && S.negocio.nombreNegocio) || 'minimarket')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `reporte_${negocio}_${valorInputFecha(d.ini)}_al_${valorInputFecha(sumarDias(d.finExclu, -1))}.${ext}`;
}

function exportarReporteExcel() {
  const d = S.repDatos;
  if (!d || typeof XLSX === 'undefined') { toast('Genera primero el reporte', 'aviso'); return; }
  const r = d.resumen;
  const wb = XLSX.utils.book_new();

  hojaAOA(wb, 'Resumen', [
    ['REPORTE DE VENTAS — ' + ((S.negocio && S.negocio.nombreNegocio) || '')],
    ['Período', etiquetaPeriodo(d)],
    ['Generado', fmtFechaHora(new Date())],
    [],
    ['Concepto', 'Valor'],
    ['Total vendido ($)', r.totalUSD],
    ['Total vendido (~Bs)', r.totalBsEquiv],
    ['Número de ventas', r.nVentas],
    ['Ventas anuladas', r.anuladas],
    ['Ticket promedio ($)', r.ticket],
    ['Ganancia estimada ($)', r.ganancia],
    ['Fiado nuevo del período ($)', r.fiadoNuevo],
    ['Cobrado a clientes ($)', r.cobradoUSD],
    ['Cobrado a clientes (Bs)', r.cobradoBs],
    ['Pagado a proveedores ($)', r.pagadoProvUSD],
    ['Pagado a proveedores (Bs)', r.pagadoProvBs]
  ], [30, 24]);

  hojaAOA(wb, 'Ventas', filasVentasReporte(d), [11, 7, 9, 14, 18, 13, 9, 10, 8, 12, 16]);

  const metodosFilas = [['Método', 'Cobrado en ventas ($)', 'Abonos ($)']];
  METODOS.forEach(([k, t]) => {
    const v1 = r.porMetodoVentas[k] || 0;
    const v2 = r.porMetodoCobros[k] || 0;
    if (v1 || v2) metodosFilas.push([t, v1, v2]);
  });
  hojaAOA(wb, 'Métodos de pago', metodosFilas, [18, 20, 14]);

  hojaAOA(wb, 'Top productos', [
    ['#', 'Producto', 'Cantidad', 'Total ($)'],
    ...r.topProductos.map((p, i) => [i + 1, p.nombre, p.cantidad, p.total])
  ], [5, 30, 10, 12]);

  hojaAOA(wb, 'Abonos clientes', [
    ['Fecha', 'Cliente', 'Método', 'Monto USD', 'Tasa', 'Monto Bs', 'Nota', 'Recibido por'],
    ...d.abonos.map(a => [fmtFechaHora(a.fecha), a.clienteNombre || '', nombreMetodo(a.metodo), r2(a.montoUSD), r2(a.tasa || 0), r2(a.montoBs || 0), a.nota || '', a.usuario || ''])
  ], [17, 18, 13, 11, 8, 12, 18, 14]);

  hojaAOA(wb, 'Pagos proveedores', [
    ['Fecha', 'Proveedor', 'Método', 'Monto USD', 'Tasa', 'Monto Bs', 'Registrado por'],
    ...d.pagos.map(p => [fmtFechaHora(p.fecha), p.proveedorNombre || '', nombreMetodo(p.metodo), r2(p.montoUSD), r2(p.tasa || 0), r2(p.montoBs || 0), p.usuario || ''])
  ], [17, 20, 13, 11, 8, 12, 14]);

  XLSX.writeFile(wb, nombreArchivoReporte(d, 'xlsx'));
  toast('Excel descargado ✅', 'ok');
}

function exportarReporteCSV() {
  const d = S.repDatos;
  if (!d) { toast('Genera primero el reporte', 'aviso'); return; }
  const r = d.resumen;
  const L = [];
  L.push(['REPORTE;' + ((S.negocio && S.negocio.nombreNegocio) || '')]);
  L.push(['Período;' + etiquetaPeriodo(d)]);
  L.push([]);
  L.push(['RESUMEN']);
  L.push(celdaCSV('Total vendido ($)') + ';' + r.totalUSD);
  L.push(celdaCSV('Total vendido (~Bs)') + ';' + r.totalBsEquiv);
  L.push(celdaCSV('Número de ventas') + ';' + r.nVentas);
  L.push(celdaCSV('Ganancia estimada ($)') + ';' + r.ganancia);
  L.push(celdaCSV('Cobrado a clientes ($)') + ';' + r.cobradoUSD);
  L.push(celdaCSV('Pagado a proveedores ($)') + ';' + r.pagadoProvUSD);
  L.push([]);
  L.push(['VENTAS']);
  filasVentasReporte(d).forEach(f => L.push(f.map(celdaCSV).join(';')));
  L.push([]);
  L.push(['ABONOS DE CLIENTES']);
  L.push(['Fecha', 'Cliente', 'Método', 'Monto USD', 'Monto Bs'].map(celdaCSV).join(';'));
  d.abonos.forEach(a => L.push([fmtFechaHora(a.fecha), a.clienteNombre || '', nombreMetodo(a.metodo), r2(a.montoUSD), r2(a.montoBs || 0)].map(celdaCSV).join(';')));
  descargaArchivo(nombreArchivoReporte(d, 'csv'), L.join('\n'), 'text/csv;charset=utf-8');
  toast('CSV descargado ✅', 'ok');
}

function lineaTXT(columnas, anchos) {
  return columnas.map((c, i) => String(c == null ? '' : c).slice(0, anchos[i]).padEnd(anchos[i])).join(' ');
}
function lineaNumTXT(columnas, anchos) {
  return columnas.map((c, i) => String(c == null ? '' : c).slice(0, anchos[i]).padStart(anchos[i])).join(' ');
}

function exportarReporteTXT() {
  const d = S.repDatos;
  if (!d) { toast('Genera primero el reporte', 'aviso'); return; }
  const r = d.resumen;
  const sep = '='.repeat(96);
  const fina = '-'.repeat(96);
  const T = [];
  T.push(sep);
  T.push(('REPORTE DE VENTAS — ' + ((S.negocio && S.negocio.nombreNegocio) || '')).toUpperCase());
  T.push('Período: ' + etiquetaPeriodo(d) + '   |   Generado: ' + fmtFechaHora(new Date()));
  T.push(sep);
  T.push('');
  T.push('RESUMEN');
  T.push(fina);
  T.push(lineaTXT(['Total vendido:', fmt$(r.totalUSD) + (r.totalBsEquiv ? '  (~' + fmtBs(r.totalBsEquiv) + ')' : ''), 'Ventas:', String(r.nVentas)], [18, 40, 10, 28]));
  T.push(lineaTXT(['Ganancia estimada:', fmt$(r.ganancia), 'Ticket prom.:', fmt$(r.ticket)], [18, 40, 10, 28]));
  T.push(lineaTXT(['Fiado nuevo:', fmt$(r.fiadoNuevo), 'Anuladas:', String(r.anuladas)], [18, 40, 10, 28]));
  T.push(lineaTXT(['Cobrado a clientes:', fmt$(r.cobradoUSD) + ' / ' + fmtBs(r.cobradoBs), '', ''], [18, 70, 4, 4]));
  T.push(lineaTXT(['Pagado proveedores:', fmt$(r.pagadoProvUSD) + ' / ' + fmtBs(r.pagadoProvBs), '', ''], [18, 70, 4, 4]));
  T.push('');
  T.push('COBROS POR MÉTODO (ventas)');
  T.push(fina);
  Object.entries(r.porMetodoVentas).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
    T.push(lineaTXT([nombreMetodo(k), '', fmt$(v)], [22, 50, 24])));
  T.push('');
  T.push('ABONOS RECIBIDOS POR MÉTODO');
  T.push(fina);
  Object.entries(r.porMetodoCobros).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
    T.push(lineaTXT([nombreMetodo(k), '', fmt$(v)], [22, 50, 24])));
  T.push('');
  T.push('PRODUCTOS MÁS VENDIDOS');
  T.push(fina);
  T.push(lineaTXT(['#', 'Producto', 'Cant.', 'Total $'], [4, 56, 12, 24]));
  r.topProductos.forEach((p, i) => T.push(lineaNumTXT([String(i + 1), p.nombre, fmtCant(p.cantidad), fmt$(p.total)], [4, 56, 12, 24])));
  T.push('');
  T.push('DETALLE DE VENTAS');
  T.push(fina);
  const anchosV = [17, 10, 20, 18, 12, 10];
  T.push(lineaTXT(['Fecha', 'Número', 'Cliente', 'Método', 'Estado', 'Total $'], anchosV));
  d.ventas.forEach(v => {
    T.push(lineaNumTXT([
      fmtFechaHora(v.fecha), v.numero || '',
      (v.clienteNombre || 'Público general'), nombreMetodo(v.metodo),
      v.estado === 'anulada' ? 'ANULADA' : (v.tipo === 'fiado' ? 'FIADO' : 'PAGADA'),
      fmt$(v.totalUSD)
    ].map(x => x), anchosV));
  });
  T.push(sep);
  descargaArchivo(nombreArchivoReporte(d, 'txt'), T.join('\n'), 'text/plain;charset=utf-8');
  toast('TXT descargado ✅', 'ok');
}

/* ==================== CONFIGURACIÓN ==================== */

RENDERERS.configuracion = function () {
  const cont = document.getElementById('cont-config');
  const tasaActual = (S.negocio && S.negocio.tasaDia) || '';
  const puedeTasa = puede('configuracion', 'usar');

  cont.innerHTML = `
    <div class="card">
      <h3>🏪 Negocio</h3>
      <div class="fila fila-movil-horizontal" style="align-items:flex-end">
        <label class="campo">Nombre del negocio
          <input id="cf-nombre" type="text" value="${esc((S.negocio && S.negocio.nombreNegocio) || '')}" ${puedeTasa ? '' : 'disabled'}>
        </label>
        ${puedeTasa ? '<button id="cf-guardar-neg" class="btn btn-primary" style="min-width:120px;margin-bottom:10px">Guardar</button>' : ''}
      </div>
    </div>

    <div class="card">
      <div class="fila-cab">
        <h3 style="margin:0">💱 Tasa del día</h3>
        ${S.negocio && S.negocio.tasaFecha ? `<span class="badge gris">actualizada ${fmtFechaHora(S.negocio.tasaFecha)}${S.negocio.tasaPor ? ' por ' + esc(S.negocio.tasaPor) : ''}</span>` : ''}
      </div>
      <div class="fila fila-movil-horizontal" style="align-items:flex-end">
        <label class="campo">Bs por cada $
          <input id="cf-tasa" type="number" step="0.01" min="0.01" value="${tasaActual}" ${puedeTasa ? '' : 'disabled'}>
        </label>
        ${puedeTasa ? '<button id="cf-guardar-tasa" class="btn btn-verde" style="min-width:150px;margin-bottom:10px">Guardar tasa</button>' : ''}
      </div>
      ${S.tasaHistorial.length ? `<div class="tabla-wrap"><table class="tabla" style="min-width:340px">
        <thead><tr><th>Tasa</th><th>Cuándo</th><th>Quién</th></tr></thead>
        <tbody>${S.tasaHistorial.map(t => `
          <tr><td><b>Bs ${Number(t.tasa).toLocaleString('es-VE', { maximumFractionDigits: 2 })}</b></td>
          <td>${fmtFechaHora(t.fecha)}</td><td><small style="color:var(--muted)">${esc(t.usuario || '')}</small></td></tr>`).join('')}</tbody>
      </table></div>` : ''}
    </div>

    ${esAdmin() ? `
    <div class="card">
      <div class="fila-cab">
        <h3 style="margin:0">👤 Usuarios y permisos</h3>
        <button id="usr-nuevo" class="btn btn-verde btn-chico">＋ Crear usuario</button>
      </div>
      <p class="item-sub">Los administradores pueden todo. A los empleados puedes darles permiso de <b>ver</b> (solo consultar) o de <b>usar</b> (crear, vender, cobrar...) en cada módulo.</p>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Usuario</th><th>Rol</th><th>Permisos</th><th>Estado</th><th></th></tr></thead>
        <tbody id="usr-tabla"></tbody>
      </table></div>
      <p class="item-sub" style="margin-top:10px">🔑 Las contraseñas no se pueden cambiar desde aquí: cada persona usa «Olvidé mi contraseña» en la pantalla de entrada.</p>
    </div>` : ''}
  `;

  if (puedeTasa) {
    cont.querySelector('#cf-guardar-neg').addEventListener('click', async () => {
      try {
        await guardarNombreNegocio(cont.querySelector('#cf-nombre').value);
        toast('Nombre guardado', 'ok');
      } catch (e) { toast(e.message, 'error'); }
    });
    const btnTasa = cont.querySelector('#cf-guardar-tasa');
    btnTasa.addEventListener('click', async () => {
      const valor = num(cont.querySelector('#cf-tasa').value);
      if (!(valor > 0)) { toast('Coloca una tasa válida', 'error'); return; }
      btnTasa.disabled = true;
      try {
        await actualizarTasa(valor);
        toast('Tasa actualizada a Bs ' + valor, 'ok');
        refrescarChipTasa();
      } catch (e) { toast(e.message, 'error'); }
      btnTasa.disabled = false;
    });
  }

  if (esAdmin()) {
    const tbody = cont.querySelector('#usr-tabla');
    tbody.innerHTML = S.usuarios.length ? S.usuarios.map(u => {
      const esYo = u.id === S.perfil.id;
      const admin = u.rol === 'admin';
      let resumenPermisos = 'Todo';
      if (!admin) {
        const mods = MODULOS.filter(([k]) => u.permisos && u.permisos[k]);
        const ver = mods.filter(([k]) => u.permisos[k].ver).length;
        const usar = mods.filter(([k]) => u.permisos[k].usar).length;
        resumenPermisos = `${ver} ver · ${usar} usar`;
      }
      return `<tr>
        <td><b>${esc(u.nombre)}</b>${esYo ? ' <span class="badge azul">tú</span>' : ''}<br><small style="color:var(--muted)">${esc(u.email || '')}</small></td>
        <td>${admin ? '<span class="badge verde">Admin</span>' : '<span class="badge gris">Empleado</span>'}</td>
        <td>${admin ? 'Todos los permisos' : resumenPermisos}</td>
        <td>${u.activo === false ? badgeEstadoPago('anulada').replace('Anulada', 'Inactivo') : '<span class="badge verde">Activo</span>'}</td>
        <td class="acciones-cell">
          <button class="mini-btn" data-editaru="${u.id}">✏️ Editar</button>
          ${!esYo ? `<button class="mini-btn" data-toggleu="${u.id}">${u.activo === false ? 'Activar' : 'Desactivar'}</button>
          <button class="mini-btn peligro" data-borraru="${u.id}">🗑</button>` : ''}
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="5"><div class="vacio">Sin usuarios.</div></td></tr>';

    cont.querySelector('#usr-nuevo').addEventListener('click', () => abrirModalUsuario(null));
    tbody.querySelectorAll('[data-editaru]').forEach(b => b.addEventListener('click', () => abrirModalUsuario(S.usuarios.find(u => u.id === b.dataset.editaru))));
    tbody.querySelectorAll('[data-toggleu]').forEach(b => b.addEventListener('click', async () => {
      const u = S.usuarios.find(x => x.id === b.dataset.toggleu);
      const nuevo = u.activo === false;
      if (!(await confirma(`¿${nuevo ? 'Activar' : 'Desactivar'} a "${u.nombre}"?${nuevo ? '' : ' No podrá entrar a la aplicación.'}`, 'Sí'))) return;
      try { await cambiarActivoUsuario(u.id, nuevo); toast('Listo', 'ok'); }
      catch (e) { toast(e.message, 'error'); }
    }));
    tbody.querySelectorAll('[data-borraru]').forEach(b => b.addEventListener('click', async () => {
      const u = S.usuarios.find(x => x.id === b.dataset.borraru);
      if (!(await confirma(`¿Eliminar el usuario "${u.nombre}"? Ya no podrá entrar (sus registros de ventas se conservan).`, 'Sí, eliminar'))) return;
      try { await eliminarUsuario(u.id); toast('Usuario eliminado', 'ok'); }
      catch (e) { toast(e.message, 'error'); }
    }));
  }
};

function abrirModalUsuario(u) {
  const esEdicion = !!u;
  const adminSel = u && u.rol === 'admin';
  const permisosActuales = {};
  MODULOS.forEach(([k, label]) => {
    const p = (u && u.permisos && u.permisos[k]) || {};
    permisosActuales[k] = { ver: !!p.ver, usar: !!p.usar };
  });

  const m = abreModal(esEdicion ? 'Editar usuario' : 'Crear usuario', `
    <label class="campo">Nombre *<input id="us-nombre" type="text" value="${esc(u ? u.nombre : '')}"></label>
    <label class="campo">Correo electrónico *<input id="us-email" type="email" value="${esc(u ? (u.email || '') : '')}" ${esEdicion ? 'disabled' : ''}></label>
    ${esEdicion ? '' : `<label class="campo">Contraseña temporal * (compártela con esa persona; mínimo 6 caracteres)
      <input id="us-pass" type="text" autocomplete="off" placeholder="Ej: venta2026">
    </label>`}
    <label class="campo">Rol
      <select id="us-rol">
        <option value="empleado" ${adminSel ? '' : 'selected'}>Empleado (permisos limitados)</option>
        <option value="admin" ${adminSel ? 'selected' : ''}>Administrador (acceso total)</option>
      </select>
    </label>

    <div id="us-zona-permisos" ${adminSel ? 'style="opacity:.45"' : ''}>
      <div class="fila-cab" style="margin-bottom:6px">
        <h3 style="margin:0">Permisos por módulo</h3>
        <div>
          <button type="button" class="mini-btn" id="us-todo">Dar todo</button>
          <button type="button" class="mini-btn peligro" id="us-nada">Quitar todo</button>
        </div>
      </div>
      <table class="permisos-tabla">
        <thead><tr><th>Módulo</th><th>Puede ver</th><th>Puede usar</th></tr></thead>
        <tbody>
          ${MODULOS.map(([k, label]) => `
          <tr>
            <td>${esc(label)}</td>
            <td><input type="checkbox" data-perm="${k}:ver" ${permisosActuales[k].ver ? 'checked' : ''} ${adminSel ? 'disabled' : ''}></td>
            <td><input type="checkbox" data-perm="${k}:usar" ${permisosActuales[k].usar ? 'checked' : ''} ${adminSel ? 'disabled' : ''}></td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p class="item-sub">«Usar» incluye lo de «ver». Si solo marcas «ver», esa persona consulta pero no puede crear ni modificar.</p>
    </div>

    <div class="modal-acciones">
      <button class="btn btn-gris" id="us-cancel">Cancelar</button>
      <button class="btn btn-primary" id="us-guardar">${esEdicion ? 'Guardar cambios' : 'Crear usuario'}</button>
    </div>`);

  const zonaPer = m.querySelector('#us-zona-permisos');
  m.querySelector('#us-rol').addEventListener('change', (e) => {
    const esAdminRol = e.target.value === 'admin';
    zonaPer.style.opacity = esAdminRol ? '.45' : '1';
    zonaPer.querySelectorAll('[data-perm]').forEach(cb => { cb.disabled = esAdminRol; if (esAdminRol) cb.checked = true; });
  });
  m.querySelector('#us-todo').addEventListener('click', () => zonaPer.querySelectorAll('[data-perm]').forEach(cb => { if (!cb.disabled) cb.checked = true; }));
  m.querySelector('#us-nada').addEventListener('click', () => zonaPer.querySelectorAll('[data-perm]').forEach(cb => { if (!cb.disabled) cb.checked = false; }));
  m.querySelector('#us-cancel').addEventListener('click', cierraModal);

  m.querySelector('#us-guardar').addEventListener('click', async () => {
    const nombre = m.querySelector('#us-nombre').value.trim();
    const rol = m.querySelector('#us-rol').value;
    if (!nombre) { toast('Escribe el nombre', 'error'); return; }

    const permisos = {};
    if (rol === 'admin') {
      MODULOS.forEach(([k]) => { permisos[k] = { ver: true, usar: true }; });
    } else {
      MODULOS.forEach(([k]) => {
        const ver = m.querySelector(`[data-perm="${k}:ver"]`).checked;
        const usar = m.querySelector(`[data-perm="${k}:usar"]`).checked;
        permisos[k] = { ver: ver || usar, usar };
      });
      if (!MODULOS.some(([k]) => permisos[k].ver)) {
        toast('Dale al menos un permiso de ver', 'error');
        return;
      }
    }

    const btn = m.querySelector('#us-guardar');
    btn.disabled = true;
    try {
      if (esEdicion) {
        await guardarPermisosUsuario(u.id, { nombre, rol, permisos });
        cierraModal();
        toast('Usuario actualizado', 'ok');
      } else {
        const email = m.querySelector('#us-email').value.trim();
        const pass = m.querySelector('#us-pass').value;
        if (!email || !/^\S+@\S+\.\S+$/.test(email)) { toast('Correo inválido', 'error'); btn.disabled = false; return; }
        if (!pass || pass.length < 6) { toast('La contraseña debe tener mínimo 6 caracteres', 'error'); btn.disabled = false; return; }
        await crearUsuarioAdmin({ email, password: pass, nombre, rol, permisos });
        cierraModal();
        toast('Usuario creado ✅ Compártele el correo y la contraseña.', 'ok');
      }
    } catch (e) {
      toast(mensajeAuthError(e), 'error');
      btn.disabled = false;
    }
  });
}
