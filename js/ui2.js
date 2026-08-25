'use strict';

/* ==================== INVENTARIO ==================== */

RENDERERS.inventario = function () {
  const cont = document.getElementById('cont-inventario');
  const usar = puede('inventario', 'usar');
  const q = S.invBusqueda.trim().toLowerCase();
  let lista = S.productos.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  if (q) lista = lista.filter(p =>
    String(p.nombre).toLowerCase().includes(q) ||
    String(p.codigo || '').toLowerCase().includes(q) ||
    String(p.categoria || '').toLowerCase().includes(q));
  if (S.invSoloBajos) lista = lista.filter(p => r2(p.stock) <= r2(p.stockMinimo));
  if (S.invDepartamento) lista = lista.filter(p => String(p.categoria || '').trim() === S.invDepartamento);

  const deptos = departamentosExistentes();
  if (S.invDepartamento && !deptos.includes(S.invDepartamento)) S.invDepartamento = '';
  const bajos = S.productos.filter(p => r2(p.stock) <= r2(p.stockMinimo)).length;
  const valorInventario = r2(S.productos.reduce((a, p) => a + (p.costoUSD || 0) * (p.stock || 0), 0));

  cont.innerHTML = `
    <div class="grid-kpi">
      <div class="kpi azul"><div class="kpi-etiqueta">Productos</div><div class="kpi-valor">${S.productos.length}</div></div>
      <div class="kpi naranja"><div class="kpi-etiqueta">Con poco stock</div><div class="kpi-valor">${bajos}</div></div>
      <div class="kpi verde"><div class="kpi-etiqueta">Valor del inventario</div><div class="kpi-valor">${fmt$(valorInventario)}</div><div class="kpi-sub">a costo</div></div>
    </div>
    <div class="card">
      <div class="fila-cab">
        <h3 style="margin:0">📦 Productos</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button id="inv-exp-xlsx" class="btn btn-gris btn-chico">Excel</button>
          <button id="inv-exp-csv" class="btn btn-gris btn-chico">CSV</button>
          ${usar ? '<button id="inv-importar" class="btn btn-gris btn-chico">📥 Importar</button>' : ''}
          ${usar ? '<button id="inv-nuevo" class="btn btn-verde btn-chico">＋ Nuevo producto</button>' : ''}
        </div>
      </div>
      <div class="fila fila-movil-horizontal" style="margin-bottom:10px">
        <input id="inv-buscar" type="search" placeholder="🔍 Buscar producto..." value="${esc(S.invBusqueda)}">
        <label style="display:flex;align-items:center;gap:7px;font-size:.82rem;color:var(--muted);white-space:nowrap;flex:0 0 auto;padding-bottom:2px">
          <input type="checkbox" id="inv-bajos" style="width:auto" ${S.invSoloBajos ? 'checked' : ''}> Solo bajos
        </label>
      </div>
      <div class="chips" id="inv-deptos" style="margin-bottom:10px"></div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Producto</th><th>Depto.</th><th class="num">Costo $</th><th class="num">Precio $</th><th class="num">Stock</th>${usar ? '<th></th>' : ''}</tr></thead>
        <tbody id="inv-tabla"></tbody>
      </table></div>
    </div>`;

  const tbody = cont.querySelector('#inv-tabla');
  tbody.innerHTML = lista.length ? lista.map(p => {
    const bajo = r2(p.stock) <= r2(p.stockMinimo);
    return `<tr>
      <td><b>${esc(p.nombre)}</b>${p.codigo ? `<br><small style="color:var(--muted)">cód: ${esc(p.codigo)}</small>` : ''}</td>
      <td>${esc(p.categoria || '—')}</td>
      <td class="num">${fmt$(p.costoUSD)}</td>
      <td class="num"><b style="color:#4ade80">${fmt$(p.precioUSD)}</b>${p.unidad === 'kg' ? '<br><small style="color:var(--muted)">por kg</small>' : ''}</td>
      <td class="num"><span class="badge ${r2(p.stock) <= 0 ? 'rojo' : (bajo ? 'naranja' : 'verde')}">${fmtCant(p.stock)}${sufijoUnidad(p)}</span></td>
      ${usar ? `<td class="acciones-cell">
        <button class="mini-btn" data-editar="${p.id}">✏️ Editar</button>
        <button class="mini-btn peligro" data-borrar="${p.id}">🗑</button>
      </td>` : ''}
    </tr>`;
  }).join('') : '<tr><td colspan="6"><div class="vacio">No hay productos todavía.</div></td></tr>';

  tbody.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => abrirModalProducto(S.productos.find(x => x.id === b.dataset.editar))));
  tbody.querySelectorAll('[data-borrar]').forEach(b => b.addEventListener('click', async () => {
    const p = S.productos.find(x => x.id === b.dataset.borrar);
    if (!p) return;
    if (!(await confirma(`¿Eliminar "${p.nombre}" del inventario? Las ventas antiguas conservarán su nombre.`, 'Sí, eliminar'))) return;
    try { await eliminarProducto(p.id); toast('Producto eliminado', 'ok'); }
    catch (e) { toast(e.message, 'error'); }
  }));

  cont.querySelector('#inv-buscar').addEventListener('input', (e) => {
    S.invBusqueda = e.target.value;
    clearTimeout(S._invTimer);
    S._invTimer = setTimeout(() => RENDERERS.inventario(), 250);
  });
  cont.querySelector('#inv-bajos').addEventListener('change', (e) => { S.invSoloBajos = e.target.checked; RENDERERS.inventario(); });

  const zonaDeptos = cont.querySelector('#inv-deptos');
  zonaDeptos.innerHTML =
    `<button class="chip ${S.invDepartamento ? '' : 'activo'}" data-depto="">Todos</button>` +
    deptos.map(d => `<button class="chip ${S.invDepartamento === d ? 'activo' : ''}" data-depto="${esc(d)}">${esc(d)}</button>`).join('');
  zonaDeptos.querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', () => {
    S.invDepartamento = ch.dataset.depto;
    RENDERERS.inventario();
  }));

  if (usar) {
    cont.querySelector('#inv-nuevo').addEventListener('click', () => abrirModalProducto(null));
    cont.querySelector('#inv-exp-xlsx').addEventListener('click', () => exportarInventario('xlsx'));
    cont.querySelector('#inv-exp-csv').addEventListener('click', () => exportarInventario('csv'));
    cont.querySelector('#inv-importar').addEventListener('click', abrirModalImportar);
  }

  function abrirModalProducto(p) {
    const esEdicion = !!p;
    const m = abreModal(esEdicion ? 'Editar producto' : 'Nuevo producto', `
      <label class="campo">Nombre *<input id="pr-nombre" type="text" value="${esc(p ? p.nombre : '')}"></label>
      <div class="fila">
        <label class="campo">Código / barra<input id="pr-codigo" type="text" value="${esc(p ? p.codigo : '')}"></label>
        <label class="campo">Departamento<input id="pr-cat" type="text" list="dl-deptos-inv" value="${esc(p ? p.categoria : '')}" placeholder="Ej: Charcutería"></label>
        <datalist id="dl-deptos-inv">${departamentosExistentes().map(d => `<option value="${esc(d)}">`).join('')}</datalist>
      </div>
      <div class="fila">
        <label class="campo">Costo ($)<input id="pr-costo" type="number" step="0.01" min="0" value="${p ? p.costoUSD : ''}"></label>
        <label class="campo">Precio de venta ($) *<input id="pr-precio" type="number" step="0.01" min="0" value="${p ? p.precioUSD : ''}"></label>
      </div>
      <label class="campo">¿Cómo se vende?
        <select id="pr-unidad">
          <option value="unidad" ${(p && p.unidad === 'kg') ? '' : 'selected'}>Por unidad (1, 2, 3…)</option>
          <option value="kg" ${(p && p.unidad === 'kg') ? 'selected' : ''}>Por peso — el precio es por kilogramo</option>
        </select>
      </label>
      <div class="fila">
        <label class="campo">Stock actual${(p && p.unidad === 'kg') || !p ? ' (kg si vendes por peso)' : ''}<input id="pr-stock" type="number" step="0.01" value="${p ? p.stock : ''}"></label>
        <label class="campo">Stock mínimo (alerta)<input id="pr-min" type="number" step="0.01" min="0" value="${p ? p.stockMinimo : 3}"></label>
      </div>
      <div class="modal-acciones">
        <button class="btn btn-gris" id="pr-cancelar">Cancelar</button>
        <button class="btn btn-primary" id="pr-guardar">${esEdicion ? 'Guardar cambios' : 'Agregar producto'}</button>
      </div>`);
    m.querySelector('#pr-cancelar').addEventListener('click', cierraModal);
    m.querySelector('#pr-nombre').focus();
    m.querySelector('#pr-guardar').addEventListener('click', async () => {
      const precio = num(m.querySelector('#pr-precio').value);
      if (!m.querySelector('#pr-nombre').value.trim() || !(precio >= 0)) {
        toast('El nombre y el precio son obligatorios', 'error');
        return;
      }
      try {
        await guardarProducto({
          nombre: m.querySelector('#pr-nombre').value,
          codigo: m.querySelector('#pr-codigo').value,
          categoria: m.querySelector('#pr-cat').value,
          unidad: m.querySelector('#pr-unidad').value,
          costoUSD: m.querySelector('#pr-costo').value,
          precioUSD: precio,
          stock: m.querySelector('#pr-stock').value,
          stockMinimo: m.querySelector('#pr-min').value
        }, esEdicion ? p.id : null);
        cierraModal();
        toast(esEdicion ? 'Producto actualizado' : 'Producto agregado', 'ok');
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function exportarInventario(formato) {
    const filas = [['Nombre', 'Código', 'Departamento', 'Unidad', 'Costo USD', 'Precio USD', 'Stock', 'Stock mínimo']];
    lista.forEach(p => filas.push([p.nombre, p.codigo || '', p.categoria || '', p.unidad === 'kg' ? 'Peso (kg)' : 'Unidad', r2(p.costoUSD), r2(p.precioUSD), r2(p.stock), r2(p.stockMinimo)]));
    filas.push([]);
    filas.push(['Valor total a costo', '', '', '', '', '', fmt$(valorInventario), '']);
    if (formato === 'xlsx' && typeof XLSX !== 'undefined') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(filas);
      ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 11 }, { wch: 11 }, { wch: 12 }, { wch: 10 }, { wch: 13 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
      XLSX.writeFile(wb, `inventario_${valorInputFecha(new Date())}.xlsx`);
    } else {
      descargaArchivo(`inventario_${valorInputFecha(new Date())}.csv`,
        filas.map(f => f.map(celdaCSV).join(';')).join('\n'),
        'text/csv;charset=utf-8');
    }
    toast('Archivo descargado', 'ok');
  }
};

/* ==================== IMPORTAR INVENTARIO (EXCEL) ==================== */

function celdaCSV(v) {
  return '"' + String(v == null ? '' : v).replaceAll('"', '""') + '"';
}

const ENCABEZADOS_IMPORT = ['Nombre', 'Código', 'Departamento', 'Unidad', 'Costo USD', 'Precio USD', 'Stock', 'Stock mínimo'];

function normalizarEncabezado(t) {
  return String(t || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function columnaPorEncabezado(enc) {
  if (enc.includes('nombre')) return 'nombre';
  if (enc.includes('codigo')) return 'codigo';
  if (enc.includes('depart') || enc.includes('categoria') || enc.includes('depto')) return 'categoria';
  if (enc.includes('unidad')) return 'unidad';
  if (enc.includes('costo')) return 'costoUSD';
  if (enc.includes('precio')) return 'precioUSD';
  if ((enc.includes('stock') && enc.includes('min')) || enc.includes('minimo')) return 'stockMinimo';
  if (enc.includes('stock') || enc.includes('existencia')) return 'stock';
  return null;
}

function descargarPlantillaInventario() {
  if (typeof XLSX === 'undefined') { toast('No se pudo generar la plantilla', 'error'); return; }
  const ejemplos = [
    ['Harina de maíz', '75001234', 'Harinas', 'Unidad', 1.2, 1.8, 24, 5],
    ['Queso blanco', '', 'Charcutería', 'Peso (kg)', 3.5, 4.9, 12.5, 2]
  ];
  const ayuda = [
    ['Campo', 'Qué poner'],
    ['Nombre', 'OBLIGATORIO. Si ya existe un producto con ese mismo nombre (o código), sus datos se actualizan en vez de duplicarlo.'],
    ['Código', 'Opcional. Código de barra o interno. Si coincide con un producto existente, ese producto se actualiza.'],
    ['Departamento', 'Ej: Harinas, Charcutería, Bebidas, Aseo. Agrupa el inventario y el POS.'],
    ['Unidad', 'Escribe "Unidad" o "Peso (kg)". En los de peso, el precio es por KILOGRAMO y el stock va en kilos (ej: 12.5).'],
    ['Costo USD', 'Lo que te cuesta a ti, en dólares. Puede ir vacío.'],
    ['Precio USD', 'OBLIGATORIO. Precio de venta en dólares. Para productos por peso, es el precio POR KILOGRAMO.'],
    ['Stock', 'Cantidad disponible (admite decimales para peso). Si va vacío queda en 0.'],
    ['Stock mínimo', 'Cantidad donde salta la alerta de poco stock. Si va vacío queda en 0.']
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([ENCABEZADOS_IMPORT, ...ejemplos]);
  ws['!cols'] = [{ wch: 26 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 11 }, { wch: 9 }, { wch: 13 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  const wsA = XLSX.utils.aoa_to_sheet(ayuda);
  wsA['!cols'] = [{ wch: 14 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsA, 'Ayuda');
  XLSX.writeFile(wb, 'plantilla_inventario.xlsx');
  toast('Plantilla descargada', 'ok');
}

function abrirModalImportar() {
  const m = abreModal('📥 Importar inventario desde Excel', `
    <p style="color:var(--muted)">Si un producto ya existe (por su <b>código</b> o su <b>nombre</b>) se actualiza; si no existe, se crea.</p>
    <button id="im-plantilla" class="btn btn-gris btn-block">⬇️ Paso 1: Descargar la plantilla</button>
    <label class="campo" style="margin-top:10px">Paso 2: Elige tu archivo llenado
      <input id="im-archivo" type="file" accept=".xlsx,.xls,.csv">
    </label>
    <div id="im-resultado"></div>
    <div class="modal-acciones" id="im-acciones"></div>`);
  m.querySelector('#im-plantilla').addEventListener('click', descargarPlantillaInventario);
  m.querySelector('#im-archivo').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const zona = m.querySelector('#im-resultado');
    m.querySelector('#im-acciones').innerHTML = '';
    zona.innerHTML = '<div class="vacio">Leyendo archivo...</div>';
    try {
      const filas = await leerHojaImport(archivo);
      mostrarResumenImport(m, filas);
    } catch (err) {
      zona.innerHTML = `<div class="vacio">❌ No se pudo leer el archivo:<br>${esc(err.message)}</div>`;
    }
  });
}

function leerHojaImport(archivo) {
  return new Promise((resolve, reject) => {
    if (typeof XLSX === 'undefined') { reject(new Error('el lector de Excel no cargó, recarga la página')); return; }
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('no se pudo leer el archivo'));
    fr.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        for (const nombreHoja of wb.SheetNames) {
          const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, defval: '' });
          const idx = filas.findIndex(f => f.some(c => normalizarEncabezado(c).includes('nombre')));
          if (idx >= 0 && idx <= 3) { resolve(filas.slice(idx)); return; }
        }
        reject(new Error('no encontré una fila con las columnas (Nombre, Precio USD...)'));
      } catch (err) { reject(err); }
    };
    fr.readAsArrayBuffer(archivo);
  });
}

function mostrarResumenImport(m, filasCrudas) {
  const encabezados = normalizarEncabezado(filasCrudas[0]).map((enc) => columnaPorEncabezado(enc));
  const posDe = {};
  encabezados.forEach((campo, i) => { if (campo && !(campo in posDe)) posDe[campo] = i; });
  if (!('nombre' in posDe)) throw new Error('el archivo debe tener una columna "Nombre"');
  if (!('precioUSD' in posDe)) throw new Error('el archivo debe tener una columna "Precio USD"');

  const porCodigo = new Map();
  const porNombre = new Map();
  S.productos.forEach(p => {
    if (p.codigo) porCodigo.set(String(p.codigo).trim().toLowerCase(), p);
    porNombre.set(String(p.nombre).trim().toLowerCase(), p);
  });

  const resultados = new Map();
  const errores = [];
  filasCrudas.slice(1).forEach((f, i) => {
    const nFila = i + 2;
    const val = (campo) => posDe[campo] !== undefined ? f[posDe[campo]] : '';
    const nombre = String(val('nombre') || '').trim();
    const codigo = String(val('codigo')).trim();
    if (!nombre && !codigo) return;
    if (!nombre) { errores.push({ fila: nFila, motivo: 'falta el Nombre' }); return; }
    const precio = num(val('precioUSD'));
    if (!(precio > 0)) { errores.push({ fila: nFila, motivo: `"${nombre}": falta el Precio USD` }); return; }
    const uniTxt = normalizarEncabezado(val('unidad'));
    const unidad = (uniTxt.includes('kg') || uniTxt.includes('peso')) ? 'kg' : 'unidad';
    const existente = (codigo && porCodigo.get(codigo.toLowerCase())) || porNombre.get(nombre.toLowerCase());
    const item = {
      id: existente ? existente.id : null,
      nombre,
      codigo,
      categoria: String(val('categoria') || '').trim(),
      unidad,
      costoUSD: Math.max(num(val('costoUSD')), 0),
      precioUSD: precio,
      stock: Math.max(num(val('stock')), 0),
      stockMinimo: Math.max(num(val('stockMinimo')), 0)
    };
    resultados.set(item.id || nombre.toLowerCase(), item);
  });

  const items = Array.from(resultados.values());
  const nuevos = items.filter(x => !x.id);
  const actualizar = items.filter(x => x.id);
  const zona = m.querySelector('#im-resultado');
  const acc = m.querySelector('#im-acciones');

  if (!items.length) {
    zona.innerHTML = '<div class="vacio">❌ No encontré productos válidos.<br>Revisa que las columnas Nombre y Precio USD estén llenas.</div>';
    return;
  }

  zona.innerHTML = `
    <div class="resumen-pos">
      <div class="resumen-linea"><span>🆕 Productos nuevos</span><b>${nuevos.length}</b></div>
      <div class="resumen-linea"><span>🔄 Productos a actualizar</span><b>${actualizar.length}</b></div>
      ${errores.length ? `<div class="resumen-linea"><span>⚠️ Filas con problemas</span><b>${errores.length}</b></div>` : ''}
    </div>
    ${errores.length ? `<div style="max-height:130px;overflow:auto;font-size:.78rem;color:#fca5a5">${errores.map(er => `Fila ${er.fila}: ${esc(er.motivo)}`).join('<br>')}</div>` : ''}
    <p class="item-sub" style="margin-top:8px">⚠️ El stock del archivo REEMPLAZA el stock actual de los productos que ya existen.</p>`;
  acc.innerHTML = `
    <button class="btn btn-gris" id="im-cancel">Cancelar</button>
    <button class="btn btn-verde" id="im-aplicar">✅ Importar ${items.length} producto${items.length === 1 ? '' : 's'}</button>`;
  acc.querySelector('#im-cancel').addEventListener('click', cierraModal);
  acc.querySelector('#im-aplicar').addEventListener('click', async () => {
    const btn = acc.querySelector('#im-aplicar');
    btn.disabled = true;
    try {
      await aplicarImportacion(items);
      cierraModal();
      toast(`Inventario importado: ${nuevos.length} nuevos, ${actualizar.length} actualizados ✅`, 'ok');
    } catch (err) {
      toast('Error al guardar: ' + err.message, 'error');
      btn.disabled = false;
    }
  });
}

async function aplicarImportacion(items) {
  const ahora = new Date();
  for (let i = 0; i < items.length; i += 400) {
    const lote = items.slice(i, i + 400);
    const batch = db.batch();
    lote.forEach(it => {
      const datos = {
        nombre: it.nombre,
        codigo: it.codigo,
        categoria: it.categoria,
        unidad: it.unidad,
        costoUSD: r2(it.costoUSD),
        precioUSD: r2(it.precioUSD),
        stock: r2(it.stock),
        stockMinimo: r2(it.stockMinimo),
        actualizadoEn: ahora
      };
      if (it.id) batch.update(db.collection('productos').doc(it.id), datos);
      else batch.set(db.collection('productos').doc(), { ...datos, creadoEn: ahora });
    });
    await batch.commit();
  }
}

/* ==================== CLIENTES (POR COBRAR) ==================== */

RENDERERS.clientes = function () {
  const cont = document.getElementById('cont-clientes');
  const usar = puede('clientes', 'usar');
  const q = S.cliBusqueda.trim().toLowerCase();
  let lista = S.clientes.slice();
  if (q) lista = lista.filter(c => String(c.nombre).toLowerCase().includes(q) || String(c.telefono || '').includes(q));
  lista.sort((a, b) => ((r2(b.saldoUSD) > 0 ? 1 : 0) - (r2(a.saldoUSD) > 0 ? 1 : 0)) || String(a.nombre).localeCompare(String(b.nombre)));

  const totalDeuda = r2(S.clientes.reduce((a, c) => a + Math.max(c.saldoUSD || 0, 0), 0));
  const tasaActual = (S.negocio && S.negocio.tasaDia) || 0;

  cont.innerHTML = `
    <div class="grid-kpi">
      <div class="kpi naranja"><div class="kpi-etiqueta">Total que me deben</div><div class="kpi-valor">${fmt$(totalDeuda)}</div><div class="kpi-sub">${tasaActual ? '~' + fmtBs(totalDeuda * tasaActual) : ''}</div></div>
      <div class="kpi azul"><div class="kpi-etiqueta">Clientes con deuda</div><div class="kpi-valor">${S.clientes.filter(c => r2(c.saldoUSD) > 0).length}</div></div>
    </div>
    <div class="card">
      <div class="fila-cab">
        <h3 style="margin:0">👥 Cuentas por cobrar</h3>
        ${usar ? '<button id="cli-nuevo" class="btn btn-verde btn-chico">＋ Nuevo cliente</button>' : ''}
      </div>
      <input id="cli-buscar" type="search" placeholder="🔍 Buscar cliente..." style="margin-bottom:12px" value="${esc(S.cliBusqueda)}">
      <div class="lista-tarjetas" id="cli-lista"></div>
    </div>`;

  const divLista = cont.querySelector('#cli-lista');
  divLista.innerHTML = lista.length ? lista.map(c => {
    const saldo = r2(c.saldoUSD);
    return `<div class="item-lista">
      <div class="item-principal">
        <div class="item-titulo">${esc(c.nombre)} ${saldo > 0 ? '<span class="badge naranja">debe</span>' : (saldo < 0 ? '<span class="badge azul">a favor</span>' : '')}</div>
        <div class="item-sub">${c.telefono ? '📞 ' + esc(c.telefono) + ' · ' : ''}${c.nota ? esc(c.nota) : 'sin notas'}</div>
      </div>
      <div class="item-derecha monto-grande ${saldo > 0 ? 'monto-rojo' : (saldo < 0 ? 'monto-verde' : '')}">
        ${fmt$(saldo)}${tasaActual && saldo !== 0 ? `<div style="font-size:.72rem;color:var(--muted);font-weight:400">${fmtBs(saldo * tasaActual)}</div>` : ''}
      </div>
      <div>
        ${usar ? `<button class="mini-btn ok" data-abonar="${c.id}" ${saldo === 0 ? 'disabled' : ''}>💵 Abonar</button>` : ''}
        <button class="mini-btn" data-detalle="${c.id}">📄 Detalle</button>
        ${usar ? `<button class="mini-btn" data-editar="${c.id}">✏️</button>` : ''}
        ${usar && saldo === 0 ? `<button class="mini-btn peligro" data-borrar="${c.id}">🗑</button>` : ''}
      </div>
    </div>`;
  }).join('') : '<div class="vacio">No hay clientes todavía.</div>';

  let timer;
  cont.querySelector('#cli-buscar').addEventListener('input', (e) => {
    S.cliBusqueda = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(() => RENDERERS.clientes(), 250);
  });

  if (usar) {
    cont.querySelector('#cli-nuevo').addEventListener('click', () => abrirModalCliente(null));
    divLista.querySelectorAll('[data-abonar]').forEach(b => b.addEventListener('click', () => abrirModalAbono(S.clientes.find(c => c.id === b.dataset.abonar))));
    divLista.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => abrirModalCliente(S.clientes.find(c => c.id === b.dataset.editar))));
    divLista.querySelectorAll('[data-borrar]').forEach(b => b.addEventListener('click', async () => {
      const c = S.clientes.find(x => x.id === b.dataset.borrar);
      if (!(await confirma(`¿Eliminar a "${c.nombre}"?`, 'Sí, eliminar'))) return;
      try { await eliminarCliente(c.id); toast('Cliente eliminado', 'ok'); }
      catch (e) { toast(e.message, 'error'); }
    }));
  }
  divLista.querySelectorAll('[data-detalle]').forEach(b => b.addEventListener('click', () => abrirDetalleCliente(S.clientes.find(c => c.id === b.dataset.detalle))));

  function abrirModalCliente(c) {
    const esEdicion = !!c;
    const m = abreModal(esEdicion ? 'Editar cliente' : 'Nuevo cliente', `
      <label class="campo">Nombre *<input id="cl-nombre" type="text" value="${esc(c ? c.nombre : '')}"></label>
      <label class="campo">Teléfono<input id="cl-tel" type="tel" value="${esc(c ? c.telefono : '')}"></label>
      <label class="campo">Nota (dirección, referencia...)<textarea id="cl-nota" rows="2">${esc(c ? c.nota : '')}</textarea></label>
      <div class="modal-acciones">
        <button class="btn btn-gris" id="cl-cancel">Cancelar</button>
        <button class="btn btn-primary" id="cl-guardar">Guardar</button>
      </div>`);
    m.querySelector('#cl-cancel').addEventListener('click', cierraModal);
    m.querySelector('#cl-nombre').focus();
    m.querySelector('#cl-guardar').addEventListener('click', async () => {
      if (!m.querySelector('#cl-nombre').value.trim()) { toast('Escribe el nombre', 'error'); return; }
      try {
        await guardarCliente({
          nombre: m.querySelector('#cl-nombre').value,
          telefono: m.querySelector('#cl-tel').value,
          nota: m.querySelector('#cl-nota').value
        }, esEdicion ? c.id : null);
        cierraModal();
        toast('Guardado', 'ok');
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function abrirModalAbono(c) {
    if (!c) return;
    const tasaDefecto = (S.negocio && S.negocio.tasaDia) || '';
    const m = abreModal('Registrar abono de ' + c.nombre, `
      <div class="resumen-pos"><div class="resumen-linea"><span>Deuda actual</span><b class="monto-rojo">${fmt$(c.saldoUSD)}</b></div></div>
      <div class="fila">
        <label class="campo">Moneda
          <select id="ab-moneda"><option value="USD">Dólares $</option><option value="Bs">Bolívares Bs</option></select>
        </label>
        <label class="campo">Monto recibido *
          <input id="ab-monto" type="number" step="0.01" min="0.01">
        </label>
      </div>
      <div class="fila">
        <label class="campo">Tasa (Bs/$)
          <input id="ab-tasa" type="number" step="0.01" min="0.01" value="${tasaDefecto}">
        </label>
        <label class="campo">Método de pago
          <select id="ab-metodo">${opcionesHTML(METODOS, 'efectivo_usd')}</select>
        </label>
      </div>
      <label class="campo">Nota (opcional)<input id="ab-nota" type="text"></label>
      <div class="resumen-pos">
        <div class="resumen-linea"><span>Equivale a</span><b id="ab-preview">—</b></div>
        <div class="resumen-linea"><span>Deuda después del abono</span><b id="ab-restante">—</b></div>
      </div>
      <div class="modal-acciones">
        <button class="btn btn-gris" id="ab-cancel">Cancelar</button>
        <button class="btn btn-verde" id="ab-registrar">Registrar abono</button>
      </div>`);

    const actualizar = () => {
      const moneda = m.querySelector('#ab-moneda').value;
      const tasa = num(m.querySelector('#ab-tasa').value);
      const monto = num(m.querySelector('#ab-monto').value);
      const usd = moneda === 'Bs' && tasa > 0 ? r2(monto / tasa) : monto;
      m.querySelector('#ab-preview').textContent = tasa > 0 && monto > 0
        ? (moneda === 'Bs' ? fmt$(usd) + ' · ' + fmtBs(monto) : fmt$(monto) + ' · ' + fmtBs(r2(monto * tasa)))
        : '—';
      m.querySelector('#ab-restante').textContent = monto > 0 ? fmt$(r2(c.saldoUSD - usd)) : '—';
    };
    ['ab-tasa', 'ab-monto'].forEach(id => m.querySelector('#' + id).addEventListener('input', actualizar));
    m.querySelector('#ab-moneda').addEventListener('change', actualizar);
    actualizar();

    m.querySelector('#ab-cancel').addEventListener('click', cierraModal);
    m.querySelector('#ab-registrar').addEventListener('click', async () => {
      const moneda = m.querySelector('#ab-moneda').value;
      const tasa = num(m.querySelector('#ab-tasa').value);
      const monto = num(m.querySelector('#ab-monto').value);
      if (!(monto > 0)) { toast('Coloca el monto recibido', 'error'); return; }
      if (moneda === 'Bs' && !(tasa > 0)) { toast('Coloca la tasa para convertir bolívares', 'error'); return; }
      const usd = moneda === 'Bs' ? r2(monto / tasa) : r2(monto);
      try {
        await registrarAbono(c.id, {
          montoUSD: usd,
          metodo: m.querySelector('#ab-metodo').value,
          moneda,
          montoBs: moneda === 'Bs' ? monto : r2(monto * (tasa || 0)),
          tasa,
          nota: m.querySelector('#ab-nota').value
        });
        cierraModal();
        toast('Abono registrado ✅', 'ok');
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  async function abrirDetalleCliente(c) {
    if (!c) return;
    abreModal('Detalle de ' + c.nombre, '<div class="vacio">Cargando...</div>');
    const [venSnap, aboSnap] = await Promise.all([
      db.collection('ventas').where('clienteId', '==', c.id).limit(60).get(),
      db.collection('abonos').where('clienteId', '==', c.id).limit(60).get()
    ]);
    const movimientos = [
      ...venSnap.docs.map(d => ({ tipo: 'venta', ...d.data() })),
      ...aboSnap.docs.map(d => ({ tipo: 'abono', ...d.data() }))
    ].sort((a, b) => aFecha(b.fecha) - aFecha(a.fecha)).slice(0, 50);

    const saldo = r2(c.saldoUSD);
    abreModal('Detalle de ' + c.nombre, `
      <div class="grid-kpi" style="margin-bottom:12px">
        <div class="kpi ${saldo > 0 ? 'rojo' : 'verde'}"><div class="kpi-etiqueta">Saldo actual</div><div class="kpi-valor">${fmt$(saldo)}</div></div>
        <div class="kpi azul"><div class="kpi-etiqueta">Movimientos</div><div class="kpi-valor">${movimientos.length}</div></div>
      </div>
      ${movimientos.length ? `<div class="tabla-wrap"><table class="tabla" style="min-width:420px">
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Método</th><th class="num">Monto</th></tr></thead>
        <tbody>${movimientos.map(mov => mov.tipo === 'venta' ? `
          <tr class="${mov.estado === 'anulada' ? 'anulada' : ''}">
            <td>${fmtFechaCorta(mov.fecha)}<br><small style="color:var(--muted)">${fmtHora(mov.fecha)}</small></td>
            <td>${mov.estado === 'anulada' ? badgeEstadoPago('anulada') : '<span class="badge naranja">Fiado</span>'}<br><small>${esc(mov.numero || '')}</small></td>
            <td>${esc(nombreMetodo(mov.metodo))}</td>
            <td class="num"><b>+${fmt$(mov.totalUSD)}</b></td>
          </tr>` : `
          <tr>
            <td>${fmtFechaCorta(mov.fecha)}<br><small style="color:var(--muted)">${fmtHora(mov.fecha)}</small></td>
            <td><span class="badge verde">Abono</span>${mov.nota ? '<br><small>' + esc(mov.nota) + '</small>' : ''}</td>
            <td>${esc(nombreMetodo(mov.metodo))}</td>
            <td class="num"><b class="monto-verde">−${fmt$(mov.montoUSD)}</b></td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<div class="vacio">Sin movimientos registrados.</div>'}`);
  }
};

/* ==================== PROVEEDORES (POR PAGAR) ==================== */

RENDERERS.proveedores = function () {
  const cont = document.getElementById('cont-proveedores');
  const usar = puede('proveedores', 'usar');
  const pendientes = S.compras.filter(c => r2(c.pagadoUSD) < r2(c.totalUSD));
  const pagadas = S.compras.filter(c => r2(c.pagadoUSD) >= r2(c.totalUSD)).slice(0, 15);
  const totalDebe = r2(pendientes.reduce((a, c) => a + (r2(c.totalUSD) - r2(c.pagadoUSD)), 0));
  const hoy0 = inicioDia(new Date());
  const vencidas = pendientes.filter(c => c.fechaVencimiento && inicioDia(aFecha(c.fechaVencimiento)) < hoy0);

  const tabs = [
    ['deudas', `💳 Deudas (${pendientes.length})`],
    ['prov', `🚚 Proveedores (${S.proveedores.length})`]
  ];

  cont.innerHTML = `
    <div class="grid-kpi">
      <div class="kpi rojo"><div class="kpi-etiqueta">Total que debo</div><div class="kpi-valor">${fmt$(totalDebe)}</div></div>
      <div class="kpi naranja"><div class="kpi-etiqueta">Pagos vencidos</div><div class="kpi-valor">${vencidas.length}</div></div>
    </div>
    <div class="chips" id="pv-tabs">
      ${tabs.map(([k, t]) => `<button class="chip ${S.pvTab === k ? 'activo' : ''}" data-tab="${k}">${t}</button>`).join('')}
    </div>
    <div id="pv-contenido"></div>`;

  cont.querySelectorAll('#pv-tabs .chip').forEach(ch => ch.addEventListener('click', () => { S.pvTab = ch.dataset.tab; RENDERERS.proveedores(); }));
  const zona = cont.querySelector('#pv-contenido');

  if (S.pvTab === 'deudas') {
    zona.innerHTML = `
      <div class="card">
        <div class="fila-cab">
          <h3 style="margin:0">💳 Compras a crédito</h3>
          ${usar ? '<button id="cp-nueva" class="btn btn-rojo btn-chico">＋ Registrar deuda</button>' : ''}
        </div>
        <div class="lista-tarjetas" id="cp-lista"></div>
      </div>
      <div class="card">
        <h3>✅ Deudas ya pagadas (últimas)</h3>
        <div class="lista-tarjetas" id="cp-pagadas"></div>
      </div>`;

    const pintarCompra = (c) => {
      const restante = r2(r2(c.totalUSD) - r2(c.pagadoUSD));
      const vencida = restante > 0 && c.fechaVencimiento && inicioDia(aFecha(c.fechaVencimiento)) < hoy0;
      return `<div class="item-lista">
        <div class="item-principal">
          <div class="item-titulo">${esc(c.proveedorNombre)} ${restante <= 0 ? badgeEstadoPago('pagada') : (vencida ? badgeEstadoPago('vencida') : badgeEstadoPago('pendiente'))}</div>
          <div class="item-sub">${esc(c.descripcion)} · compré ${fmtFechaCorta(c.fecha)}${c.fechaVencimiento ? ' · pago límite: ' + fmtFecha(c.fechaVencimiento) : ''}</div>
        </div>
        <div class="item-derecha">
          <div class="monto-grande ${restante > 0 ? (vencida ? 'monto-rojo' : 'monto-naranja') : 'monto-verde'}">${restante > 0 ? 'falta ' + fmt$(restante) : 'pagada'}</div>
          <div style="font-size:.72rem;color:var(--muted)">total ${fmt$(c.totalUSD)}</div>
        </div>
        <div>
          ${usar && restante > 0 ? `<button class="mini-btn ok" data-pagar="${c.id}">💵 Pagar</button>` : ''}
          <button class="mini-btn" data-historial="${c.id}">📄 Pagos</button>
        </div>
      </div>`;
    };

    const ordenPend = pendientes.slice().sort((a, b) => {
      const va = a.fechaVencimiento ? aFecha(a.fechaVencimiento).getTime() : Infinity;
      const vb = b.fechaVencimiento ? aFecha(b.fechaVencimiento).getTime() : Infinity;
      return va - vb;
    });
    zona.querySelector('#cp-lista').innerHTML = ordenPend.length ? ordenPend.map(pintarCompra).join('') : '<div class="vacio">¡No tienes deudas con proveedores! 🎉</div>';
    zona.querySelector('#cp-pagadas').innerHTML = pagadas.length ? pagadas.map(pintarCompra).join('') : '<div class="vacio">Aún no hay deudas pagadas.</div>';

    zona.querySelectorAll('[data-pagar]').forEach(b => b.addEventListener('click', () => abrirModalPagoProv(S.compras.find(c => c.id === b.dataset.pagar))));
    zona.querySelectorAll('[data-historial]').forEach(b => b.addEventListener('click', () => abrirHistorialPagosProv(S.compras.find(c => c.id === b.dataset.historial))));
    if (usar) zona.querySelector('#cp-nueva').addEventListener('click', abrirNuevaCompra);

    function abrirNuevaCompra() {
      if (!S.proveedores.length) { toast('Primero crea un proveedor en la pestaña Proveedores', 'aviso'); return; }
      const tasaDefecto = (S.negocio && S.negocio.tasaDia) || '';
      const m = abreModal('Registrar compra a crédito', `
        <label class="campo">Proveedor *
          <select id="cm-prov">${S.proveedores.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select>
        </label>
        <label class="campo">Descripción<input id="cm-desc" type="text" placeholder="Ej: 24 cajas de refresco"></label>
        <div class="fila">
          <label class="campo">Moneda
            <select id="cm-moneda"><option value="USD">Dólares $</option><option value="Bs">Bolívares Bs</option></select>
          </label>
          <label class="campo">Monto *<input id="cm-monto" type="number" step="0.01" min="0.01"></label>
        </div>
        <div class="fila">
          <label class="campo">Tasa (Bs/$)<input id="cm-tasa" type="number" step="0.01" min="0.01" value="${tasaDefecto}"></label>
          <label class="campo">Fecha límite de pago<input id="cm-vence" type="date"></label>
        </div>
        <p class="item-sub" id="cm-preview">—</p>
        <div class="modal-acciones">
          <button class="btn btn-gris" id="cm-cancel">Cancelar</button>
          <button class="btn btn-rojo" id="cm-guardar">Registrar deuda</button>
        </div>`);
      const prev = () => {
        const moneda = m.querySelector('#cm-moneda').value;
        const tasa = num(m.querySelector('#cm-tasa').value);
        const monto = num(m.querySelector('#cm-monto').value);
        const usd = moneda === 'Bs' && tasa > 0 ? r2(monto / tasa) : monto;
        m.querySelector('#cm-preview').textContent = monto > 0 ? 'Equivalente: ' + fmt$(usd) : '—';
      };
      ['cm-tasa', 'cm-monto'].forEach(id => m.querySelector('#' + id).addEventListener('input', prev));
      m.querySelector('#cm-moneda').addEventListener('change', prev);
      m.querySelector('#cm-cancel').addEventListener('click', cierraModal);
      m.querySelector('#cm-guardar').addEventListener('click', async () => {
        const moneda = m.querySelector('#cm-moneda').value;
        const tasa = num(m.querySelector('#cm-tasa').value);
        const monto = num(m.querySelector('#cm-monto').value);
        if (!(monto > 0)) { toast('Coloca el monto', 'error'); return; }
        if (moneda === 'Bs' && !(tasa > 0)) { toast('Coloca la tasa para convertir', 'error'); return; }
        try {
          await guardarCompra({
            proveedorId: m.querySelector('#cm-prov').value,
            descripcion: m.querySelector('#cm-desc').value,
            totalUSD: moneda === 'Bs' ? monto / tasa : monto,
            fechaVencimiento: m.querySelector('#cm-vence').value ? fechaDeInput(m.querySelector('#cm-vence').value) : null
          });
          cierraModal();
          toast('Deuda registrada', 'ok');
        } catch (e) { toast(e.message, 'error'); }
      });
    }

    function abrirModalPagoProv(c) {
      const restante = r2(r2(c.totalUSD) - r2(c.pagadoUSD));
      const tasaDefecto = (S.negocio && S.negocio.tasaDia) || '';
      const m = abreModal('Pagar a ' + c.proveedorNombre, `
        <div class="resumen-pos"><div class="resumen-linea"><span>Falta pagar</span><b class="monto-rojo">${fmt$(restante)}</b></div></div>
        <div class="fila">
          <label class="campo">Moneda
            <select id="pp-moneda"><option value="USD">Dólares $</option><option value="Bs">Bolívares Bs</option></select>
          </label>
          <label class="campo">Monto a pagar *<input id="pp-monto" type="number" step="0.01" min="0.01" value="${restante}"></label>
        </div>
        <div class="fila">
          <label class="campo">Tasa (Bs/$)<input id="pp-tasa" type="number" step="0.01" min="0.01" value="${tasaDefecto}"></label>
          <label class="campo">Método<select id="pp-metodo">${opcionesHTML(METODOS, 'efectivo_usd')}</select></label>
        </div>
        <p class="item-sub" id="pp-preview">—</p>
        <div class="modal-acciones">
          <button class="btn btn-gris" id="pp-cancel">Cancelar</button>
          <button class="btn btn-verde" id="pp-registrar">Registrar pago</button>
        </div>`);
      const prev = () => {
        const moneda = m.querySelector('#pp-moneda').value;
        const tasa = num(m.querySelector('#pp-tasa').value);
        const monto = num(m.querySelector('#pp-monto').value);
        const usd = moneda === 'Bs' && tasa > 0 ? r2(monto / tasa) : monto;
        m.querySelector('#pp-preview').textContent = monto > 0 ? 'Equivalente: ' + fmt$(usd) + (tasa > 0 ? ' · ' + fmtBs(r2(usd * tasa)) : '') : '—';
      };
      ['pp-tasa', 'pp-monto'].forEach(id => m.querySelector('#' + id).addEventListener('input', prev));
      m.querySelector('#pp-moneda').addEventListener('change', prev);
      prev();
      m.querySelector('#pp-cancel').addEventListener('click', cierraModal);
      m.querySelector('#pp-registrar').addEventListener('click', async () => {
        const moneda = m.querySelector('#pp-moneda').value;
        const tasa = num(m.querySelector('#pp-tasa').value);
        const monto = num(m.querySelector('#pp-monto').value);
        if (!(monto > 0)) { toast('Coloca el monto', 'error'); return; }
        if (moneda === 'Bs' && !(tasa > 0)) { toast('Coloca la tasa para convertir', 'error'); return; }
        try {
          await registrarPagoProveedor(c.id, {
            montoUSD: moneda === 'Bs' ? monto / tasa : monto,
            metodo: m.querySelector('#pp-metodo').value,
            moneda,
            montoBs: moneda === 'Bs' ? monto : r2(monto * (tasa || 0)),
            tasa
          });
          cierraModal();
          toast('Pago registrado ✅', 'ok');
        } catch (e) { toast(e.message, 'error'); }
      });
    }

    async function abrirHistorialPagosProv(c) {
      abreModal('Pagos de ' + c.proveedorNombre, '<div class="vacio">Cargando...</div>');
      const snap = await db.collection('pagos_prov').where('compraId', '==', c.id).limit(100).get();
      const pagos = snap.docs.map(d => d.data()).sort((a, b) => aFecha(b.fecha) - aFecha(a.fecha)).slice(0, 50);
      abreModal('Pagos de ' + c.proveedorNombre, `
        <div class="grid-kpi" style="margin-bottom:12px">
          <div class="kpi verde"><div class="kpi-etiqueta">Total pagado</div><div class="kpi-valor">${fmt$(r2(c.pagadoUSD))}</div></div>
          <div class="kpi rojo"><div class="kpi-etiqueta">Falta</div><div class="kpi-valor">${fmt$(Math.max(r2(r2(c.totalUSD) - r2(c.pagadoUSD)), 0))}</div></div>
        </div>
        ${pagos.length ? `<div class="tabla-wrap"><table class="tabla" style="min-width:400px">
          <thead><tr><th>Fecha</th><th>Método</th><th class="num">Monto $</th><th class="num">Monto Bs</th><th>Por</th></tr></thead>
          <tbody>${pagos.map(p => `
            <tr>
              <td>${fmtFechaCorta(p.fecha)}<br><small style="color:var(--muted)">${fmtHora(p.fecha)}</small></td>
              <td>${esc(nombreMetodo(p.metodo))}</td>
              <td class="num"><b>${fmt$(p.montoUSD)}</b></td>
              <td class="num">${p.montoBs ? fmtBs(p.montoBs) : '—'}</td>
              <td><small style="color:var(--muted)">${esc(p.usuario || '')}</small></td>
            </tr>`).join('')}</tbody>
        </table></div>` : '<div class="vacio">Esta deuda no tiene pagos registrados.</div>'}`);
    }

  } else {
    zona.innerHTML = `
      <div class="card">
        <div class="fila-cab">
          <h3 style="margin:0">🚚 Mis proveedores</h3>
          ${usar ? '<button id="pv-nuevo" class="btn btn-verde btn-chico">＋ Nuevo proveedor</button>' : ''}
        </div>
        <div class="lista-tarjetas" id="pv-lista"></div>
      </div>`;

    const divProv = zona.querySelector('#pv-lista');
    divProv.innerHTML = S.proveedores.length ? S.proveedores.map(p => {
      const deuda = r2(S.compras.filter(c => c.proveedorId === p.id && r2(c.pagadoUSD) < r2(c.totalUSD))
        .reduce((a, c) => a + (r2(c.totalUSD) - r2(c.pagadoUSD)), 0));
      return `<div class="item-lista">
        <div class="item-principal">
          <div class="item-titulo">${esc(p.nombre)}</div>
          <div class="item-sub">${p.telefono ? '📞 ' + esc(p.telefono) + ' · ' : ''}${p.nota ? esc(p.nota) : 'sin notas'}</div>
        </div>
        <div class="item-derecha monto-grande ${deuda > 0 ? 'monto-rojo' : ''}">${deuda > 0 ? fmt$(deuda) : 'al día'}</div>
        <div>
          ${usar ? `<button class="mini-btn" data-editarp="${p.id}">✏️</button>` : ''}
          ${usar && deuda === 0 ? `<button class="mini-btn peligro" data-borrarp="${p.id}">🗑</button>` : ''}
        </div>
      </div>`;
    }).join('') : '<div class="vacio">No hay proveedores todavía.</div>';

    if (usar) {
      zona.querySelector('#pv-nuevo').addEventListener('click', () => abrirModalProv(null));
      divProv.querySelectorAll('[data-editarp]').forEach(b => b.addEventListener('click', () => abrirModalProv(S.proveedores.find(p => p.id === b.dataset.editarp))));
      divProv.querySelectorAll('[data-borrarp]').forEach(b => b.addEventListener('click', async () => {
        const p = S.proveedores.find(x => x.id === b.dataset.borrarp);
        if (!(await confirma(`¿Eliminar al proveedor "${p.nombre}"?`, 'Sí, eliminar'))) return;
        try { await eliminarProveedor(p.id); toast('Proveedor eliminado', 'ok'); }
        catch (e) { toast(e.message, 'error'); }
      }));
    }

    function abrirModalProv(p) {
      const esEdicion = !!p;
      const m = abreModal(esEdicion ? 'Editar proveedor' : 'Nuevo proveedor', `
        <label class="campo">Nombre *<input id="pv-nombre" type="text" value="${esc(p ? p.nombre : '')}"></label>
        <label class="campo">Teléfono<input id="pv-tel" type="tel" value="${esc(p ? p.telefono : '')}"></label>
        <label class="campo">Nota<input id="pv-nota" type="text" value="${esc(p ? p.nota : '')}"></label>
        <div class="modal-acciones">
          <button class="btn btn-gris" id="pvcancel">Cancelar</button>
          <button class="btn btn-primary" id="pvguardar">Guardar</button>
        </div>`);
      m.querySelector('#pvcancel').addEventListener('click', cierraModal);
      m.querySelector('#pv-nombre').focus();
      m.querySelector('#pvguardar').addEventListener('click', async () => {
        if (!m.querySelector('#pv-nombre').value.trim()) { toast('Escribe el nombre', 'error'); return; }
        try {
          await guardarProveedor({
            nombre: m.querySelector('#pv-nombre').value,
            telefono: m.querySelector('#pv-tel').value,
            nota: m.querySelector('#pv-nota').value
          }, esEdicion ? p.id : null);
          cierraModal();
          toast('Guardado', 'ok');
        } catch (e) { toast(e.message, 'error'); }
      });
    }
  }
};
