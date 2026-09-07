'use strict';

const FV = firebase.firestore.FieldValue;

const CONFIG_OK = typeof firebaseConfig === 'object' &&
  firebaseConfig && firebaseConfig.apiKey && !String(firebaseConfig.apiKey).includes('PEGA_TU');

let db = null;
let auth = null;
let appSecundaria = null;

const S = {
  listo: false,
  user: null,
  perfil: null,
  negocio: null,
  negocioId: '',
  productos: [],
  clientes: [],
  proveedores: [],
  compras: [],
  usuarios: [],
  ventasRecientes: [],
  abonosRecientes: [],
  pagosRecientes: [],
  tasaHistorial: [],
  vista: 'dashboard',
  carrito: [],
  posBusqueda: '',
  posDepartamento: '',
  invBusqueda: '',
  invSoloBajos: false,
  invDepartamento: '',
  cliBusqueda: '',
  repFiltroTipo: 'hoy',
  repDesde: null,
  repHasta: null,
  repDatos: null,
  repCargando: false,
  pvTab: 'deudas',
  desuscribir: []
};

function esAdmin() { return !!(S.perfil && S.perfil.rol === 'admin'); }

function puede(modulo, accion) {
  if (!S.perfil) return false;
  if (esAdmin()) return true;
  const p = S.perfil.permisos && S.perfil.permisos[modulo];
  if (!p) return false;
  return accion === 'usar' ? !!p.usar : !!p.ver;
}

function permisosCompletos() {
  const p = {};
  MODULOS.forEach(([k]) => { p[k] = { ver: true, usar: true }; });
  return p;
}

function negocioIdActual() {
  if (S.negocioId) return S.negocioId;
  return (S.negocio && S.negocio.negocioId) || (S.perfil && S.perfil.negocioId) || '';
}

function slugNegocio(nombre) {
  const base = String(nombre || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'mi-minimarket';
}

async function slugDisponible(nombre) {
  const base = slugNegocio(nombre);
  let cand = base;
  let i = 1;
  for (;;) {
    const snap = await db.collection('negocios').doc(cand).get();
    if (!snap.exists) return cand;
    i++;
    cand = base + '-' + i;
  }
}

function iniciarFirebase() {
  if (!CONFIG_OK) return false;
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
  return true;
}

function appSecundariaAuth() {
  if (!appSecundaria || !firebase.apps.find(a => a.name === 'creador-usuarios')) {
    appSecundaria = firebase.initializeApp(firebaseConfig, 'creador-usuarios');
  }
  return appSecundaria.auth();
}

function iniciarEscuchas() {
  quitarEscuchas();
  const nid = negocioIdActual();
  if (!nid) return;

  S.desuscribir.push(
    db.collection('negocios').doc(nid).onSnapshot(snap => {
      S.negocio = snap.exists ? snap.data() : { negocioId: nid, nombreNegocio: 'Mi Minimarket', tasaDia: 1 };
      const el = document.getElementById('sb-nombre-negocio');
      if (el) el.textContent = S.negocio.nombreNegocio || 'Mi Minimarket';
      refrescarChipTasa();
      refrescarVistaActiva();
    })
  );

  S.desuscribir.push(
    db.collection('productos').where('negocioId', '==', nid).onSnapshot(snap => {
      S.productos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      refrescarVistaActiva();
    }, err => console.error('productos', err))
  );

  S.desuscribir.push(
    db.collection('clientes').where('negocioId', '==', nid).onSnapshot(snap => {
      S.clientes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      S.clientes.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
      refrescarVistaActiva();
    }, err => console.error('clientes', err))
  );

  S.desuscribir.push(
    db.collection('proveedores').where('negocioId', '==', nid).onSnapshot(snap => {
      S.proveedores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      S.proveedores.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
      refrescarVistaActiva();
    }, err => console.error('proveedores', err))
  );

  S.desuscribir.push(
    db.collection('compras').where('negocioId', '==', nid).onSnapshot(snap => {
      S.compras = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => aFecha(b.fecha) - aFecha(a.fecha))
        .slice(0, 300);
      refrescarVistaActiva();
    }, err => console.error('compras', err))
  );

  const hace90 = sumarDias(new Date(), -90);
  S.desuscribir.push(
    db.collection('ventas').where('negocioId', '==', nid).onSnapshot(snap => {
      S.ventasRecientes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(v => aFecha(v.fecha) && aFecha(v.fecha) >= hace90)
        .sort((a, b) => aFecha(b.fecha) - aFecha(a.fecha))
        .slice(0, 500);
      refrescarVistaActiva();
    }, err => console.error('ventas', err))
  );

  S.desuscribir.push(
    db.collection('abonos').where('negocioId', '==', nid).onSnapshot(snap => {
      S.abonosRecientes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(a => aFecha(a.fecha) && aFecha(a.fecha) >= hace90)
        .sort((a, b) => aFecha(b.fecha) - aFecha(a.fecha))
        .slice(0, 500);
      refrescarVistaActiva();
    }, err => console.error('abonos', err))
  );

  S.desuscribir.push(
    db.collection('pagos_prov').where('negocioId', '==', nid).onSnapshot(snap => {
      S.pagosRecientes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(p => aFecha(p.fecha) && aFecha(p.fecha) >= hace90)
        .sort((a, b) => aFecha(b.fecha) - aFecha(a.fecha))
        .slice(0, 500);
      refrescarVistaActiva();
    }, err => console.error('pagos_prov', err))
  );

  S.desuscribir.push(
    db.collection('tasa_historial').where('negocioId', '==', nid).onSnapshot(snap => {
      S.tasaHistorial = snap.docs.map(d => d.data())
        .sort((a, b) => aFecha(b.fecha) - aFecha(a.fecha))
        .slice(0, 12);
      refrescarVistaActiva();
    }, () => {})
  );
}

function escucharUsuarios() {
  const nid = negocioIdActual();
  if (!nid) return;
  S.desuscribir.push(
    db.collection('usuarios').where('negocioId', '==', nid).onSnapshot(snap => {
      S.usuarios = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      refrescarVistaActiva();
    }, err => console.error('usuarios', err))
  );
}

function quitarEscuchas() {
  S.desuscribir.forEach(unsub => { try { unsub(); } catch {} });
  S.desuscribir = [];
}

async function actualizarTasa(nuevaTasa) {
  const t = r2(nuevaTasa);
  if (!(t > 0)) throw new Error('La tasa debe ser mayor que cero');
  await db.collection('negocios').doc(negocioIdActual()).set({
    tasaDia: t,
    tasaFecha: new Date(),
    tasaPor: S.perfil ? S.perfil.nombre : ''
  }, { merge: true });
  await db.collection('tasa_historial').add({ negocioId: negocioIdActual(), tasa: t, fecha: new Date(), usuario: S.perfil ? S.perfil.nombre : '' });
}

async function guardarNombreNegocio(nombre) {
  await db.collection('negocios').doc(negocioIdActual()).set({ nombreNegocio: nombre.trim() || 'Mi Minimarket' }, { merge: true });
}

async function guardarProducto(datos, idExistente) {
  const limpio = {
    nombre: datos.nombre.trim(),
    codigo: (datos.codigo || '').trim(),
    categoria: (datos.categoria || '').trim(),
    unidad: datos.unidad === 'kg' ? 'kg' : 'unidad',
    precioUSD: r2(datos.precioUSD),
    costoUSD: r2(datos.costoUSD),
    stock: r2(datos.stock),
    stockMinimo: r2(datos.stockMinimo),
    actualizadoEn: new Date()
  };
  if (!limpio.nombre) throw new Error('El nombre es obligatorio');
  if (idExistente) {
    await db.collection('productos').doc(idExistente).update(limpio);
    return idExistente;
  }
  limpio.negocioId = negocioIdActual();
  limpio.creadoEn = new Date();
  const ref = await db.collection('productos').add(limpio);
  return ref.id;
}

async function eliminarProducto(id) {
  await db.collection('productos').doc(id).delete();
}

async function guardarCliente(datos, idExistente) {
  const limpio = {
    nombre: datos.nombre.trim(),
    telefono: (datos.telefono || '').trim(),
    nota: (datos.nota || '').trim()
  };
  if (!limpio.nombre) throw new Error('El nombre es obligatorio');
  if (idExistente) {
    await db.collection('clientes').doc(idExistente).update(limpio);
    return idExistente;
  }
  limpio.negocioId = negocioIdActual();
  limpio.saldoUSD = 0;
  limpio.creadoEn = new Date();
  const ref = await db.collection('clientes').add(limpio);
  return ref.id;
}

async function eliminarCliente(id) {
  const cli = S.clientes.find(c => c.id === id);
  if (cli && r2(cli.saldoUSD) !== 0) throw new Error('Este cliente tiene deuda pendiente. Regístrale sus abonos o pon su saldo en cero antes de eliminarlo.');
  await db.collection('clientes').doc(id).delete();
}

async function guardarProveedor(datos, idExistente) {
  const limpio = {
    nombre: datos.nombre.trim(),
    telefono: (datos.telefono || '').trim(),
    nota: (datos.nota || '').trim()
  };
  if (!limpio.nombre) throw new Error('El nombre es obligatorio');
  if (idExistente) {
    await db.collection('proveedores').doc(idExistente).update(limpio);
    return idExistente;
  }
  limpio.negocioId = negocioIdActual();
  const ref = await db.collection('proveedores').add(limpio);
  return ref.id;
}

async function eliminarProveedor(id) {
  const tieneDeuda = S.compras.some(c => c.proveedorId === id && r2(c.pagadoUSD) < r2(c.totalUSD));
  if (tieneDeuda) throw new Error('Este proveedor tiene deudas pendientes de pagar.');
  await db.collection('proveedores').doc(id).delete();
}

async function guardarCompra(datos) {
  if (!datos.proveedorId) throw new Error('Selecciona un proveedor');
  if (!(datos.totalUSD > 0)) throw new Error('El monto debe ser mayor que cero');
  const prov = S.proveedores.find(p => p.id === datos.proveedorId);
  const ref = await db.collection('compras').add({
    negocioId: negocioIdActual(),
    proveedorId: datos.proveedorId,
    proveedorNombre: prov ? prov.nombre : '(eliminado)',
    descripcion: (datos.descripcion || '').trim() || 'Compra a crédito',
    totalUSD: r2(datos.totalUSD),
    pagadoUSD: 0,
    fechaVencimiento: datos.fechaVencimiento || null,
    fecha: new Date(),
    usuario: S.perfil ? S.perfil.nombre : ''
  });
  return ref.id;
}

async function registrarPagoProveedor(compraId, pago) {
  const montoUSD = r2(pago.montoUSD);
  if (!(montoUSD > 0)) throw new Error('El monto debe ser mayor que cero');
  await db.runTransaction(async (tx) => {
    const cref = db.collection('compras').doc(compraId);
    const csnap = await tx.get(cref);
    if (!csnap.exists) throw new Error('La compra ya no existe');
    const compra = csnap.data();
    if (compra.negocioId && compra.negocioId !== negocioIdActual()) throw new Error('Esta compra no pertenece a tu negocio');
    const saldo = r2(compra.totalUSD) - r2(compra.pagadoUSD);
    const aplicar = Math.min(montoUSD, Math.max(saldo, 0));
    tx.set(db.collection('pagos_prov').doc(), {
      negocioId: negocioIdActual(),
      compraId,
      proveedorId: compra.proveedorId,
      proveedorNombre: compra.proveedorNombre,
      fecha: new Date(),
      montoUSD: aplicar,
      metodo: pago.metodo,
      moneda: pago.moneda,
      montoBs: r2(pago.montoBs || 0),
      tasa: r2(pago.tasa || 0),
      usuario: S.perfil ? S.perfil.nombre : ''
    });
    tx.update(cref, { pagadoUSD: FV.increment(aplicar) });
  });
}

async function registrarAbono(clienteId, abono) {
  const montoUSD = r2(abono.montoUSD);
  if (!(montoUSD > 0)) throw new Error('El monto debe ser mayor que cero');
  await db.runTransaction(async (tx) => {
    const clref = db.collection('clientes').doc(clienteId);
    const csnap = await tx.get(clref);
    if (!csnap.exists) throw new Error('El cliente ya no existe');
    if (csnap.data().negocioId && csnap.data().negocioId !== negocioIdActual()) throw new Error('Este cliente no pertenece a tu negocio');
    tx.set(db.collection('abonos').doc(), {
      negocioId: negocioIdActual(),
      clienteId,
      clienteNombre: csnap.data().nombre,
      fecha: new Date(),
      montoUSD,
      metodo: abono.metodo,
      moneda: abono.moneda,
      montoBs: r2(abono.montoBs || 0),
      tasa: r2(abono.tasa || 0),
      nota: (abono.nota || '').trim(),
      usuario: S.perfil ? S.perfil.nombre : ''
    });
    tx.update(clref, { saldoUSD: FV.increment(-montoUSD), ultimoPagoEn: new Date() });
  });
}

async function cobrarVenta(pos) {
  if (!S.carrito.length) throw new Error('El carrito está vacío');
  const tasa = r2(pos.tasa);
  if (!(tasa > 0)) throw new Error('Coloca una tasa válida');
  const totalUSD = r2(S.carrito.reduce((a, i) => a + i.totalUSD, 0));
  const entregadoUSD = r2(pos.moneda === 'Bs' ? num(pos.entregadoMoneda) / tasa : num(pos.entregadoMoneda));
  const inicialUSD = r2(Math.min(Math.max(entregadoUSD, 0), totalUSD));
  const deuda = r2(totalUSD - inicialUSD);
  let cliente = null;
  if (pos.clienteId) cliente = S.clientes.find(c => c.id === pos.clienteId) || null;
  if (deuda > 0.009 && !cliente) throw new Error('Hay un monto sin pagar: selecciona un cliente para dejarle la deuda');

  const items = S.carrito.map(i => ({ ...i }));
  const nid = negocioIdActual();

  const datos = {};
  await db.runTransaction(async (tx) => {
    const contRef = db.collection('negocios').doc(nid);
    const lecturas = [];
    for (const it of items) {
      const ref = db.collection('productos').doc(it.productoId);
      lecturas.push(tx.get(ref).then(s => [ref, s]));
    }
    const resultados = await Promise.all(lecturas);
    for (const [, snap] of resultados) {
      if (snap.exists && snap.data().negocioId && snap.data().negocioId !== nid) {
        throw new Error('Uno de los productos no pertenece a tu negocio');
      }
    }
    const contSnap = await tx.get(contRef);
    const seq = ((contSnap.exists && contSnap.data().ventaSeq) || 0) + 1;
    const vref = db.collection('ventas').doc();
    datos.numero = 'V-' + String(seq).padStart(5, '0');
    datos.totalUSD = totalUSD;

    tx.set(vref, {
      negocioId: nid,
      numero: datos.numero,
      fecha: new Date(),
      items,
      totalUSD,
      tipo: deuda > 0.009 ? 'fiado' : 'contado',
      inicialUSD,
      metodo: pos.metodo,
      moneda: pos.moneda,
      montoBs: r2(inicialUSD * tasa),
      tasa,
      clienteId: cliente ? cliente.id : null,
      clienteNombre: cliente ? cliente.nombre : '',
      saldoPendienteUSD: deuda,
      estado: 'activa',
      usuarioUid: S.user.uid,
      usuario: S.perfil.nombre
    });
    tx.set(contRef, { ventaSeq: seq }, { merge: true });

    for (const [ref, snap] of resultados) {
      if (snap.exists) {
        const it = items.find(i => i.productoId === ref.id);
        tx.update(ref, { stock: r2((snap.data().stock || 0) - it.cantidad) });
      }
    }
    if (deuda > 0.009 && cliente) {
      tx.update(db.collection('clientes').doc(cliente.id), { saldoUSD: FV.increment(deuda) });
    }
  });
  return datos.numero;
}

async function anularVenta(ventaId) {
  await db.runTransaction(async (tx) => {
    const vref = db.collection('ventas').doc(ventaId);
    const vsnap = await tx.get(vref);
    if (!vsnap.exists) throw new Error('La venta no existe');
    const venta = vsnap.data();
    if (venta.negocioId && venta.negocioId !== negocioIdActual()) throw new Error('Esta venta no pertenece a tu negocio');
    if (venta.estado === 'anulada') throw new Error('Esta venta ya está anulada');

    const lecturas = [];
    for (const it of (venta.items || [])) {
      if (!it.productoId) continue;
      const ref = db.collection('productos').doc(it.productoId);
      lecturas.push(tx.get(ref).then(s => [ref, s, it]));
    }
    const resultados = await Promise.all(lecturas);

    tx.update(vref, { estado: 'anulada', anuladaEn: new Date() });
    for (const [ref, snap, it] of resultados) {
      if (snap.exists) tx.update(ref, { stock: r2((snap.data().stock || 0) + it.cantidad) });
    }
    if (venta.clienteId && r2(venta.saldoPendienteUSD) > 0.009) {
      tx.update(db.collection('clientes').doc(venta.clienteId), { saldoUSD: FV.increment(-r2(venta.saldoPendienteUSD)) });
    }
  });
}

async function crearPrimerAdmin(uid, email, nombreNegocio, nombre, tasaInicial) {
  const nid = await slugDisponible(nombreNegocio || 'Mi Minimarket');

  const batch = db.batch();
  batch.set(db.collection('negocios').doc(nid), {
    negocioId: nid,
    nombreNegocio: (nombreNegocio || '').trim() || 'Mi Minimarket',
    tasaDia: r2(tasaInicial) || 1,
    tasaFecha: new Date(),
    tasaPor: (nombre || '').trim(),
    ventaSeq: 0,
    adminUids: [uid],
    creadoEn: new Date()
  });
  if (r2(tasaInicial) > 0) {
    batch.set(db.collection('tasa_historial').doc(), { negocioId: nid, tasa: r2(tasaInicial), fecha: new Date(), usuario: nombre });
  }
  batch.set(db.collection('usuarios').doc(uid), {
    negocioId: nid,
    nombre: nombre.trim(),
    email,
    rol: 'admin',
    permisos: permisosCompletos(),
    activo: true,
    creadoEn: new Date()
  });
  await batch.commit();
  return nid;
}

async function migrarLegadoAUnNegocio() {
  if (!S.user || !S.user.uid) return '';
  if (S.perfil && S.perfil.negocioId) return S.perfil.negocioId;
  const uid = S.user.uid;

  let legNegocio = null;
  let legCont = null;
  try {
    const a = await db.collection('config').doc('negocio').get();
    if (a.exists) legNegocio = a.data();
  } catch {}
  try {
    const b = await db.collection('config').doc('contadores').get();
    if (b.exists) legCont = b.data();
  } catch {}

  let nid = (legNegocio && legNegocio.negocioId) || '';
  const refNeg = db.collection('negocios').doc(nid);
  const snapNeg = nid ? await refNeg.get() : null;

  if (!snapNeg || !snapNeg.exists) {
    const existentes = await db.collection('negocios').get();
    if (existentes.size === 1) {
      nid = existentes.docs[0].id;
    } else {
      nid = await slugDisponible((legNegocio && legNegocio.nombreNegocio) || 'Mi Minimarket');
      await db.collection('negocios').doc(nid).set({
        negocioId: nid,
        nombreNegocio: (legNegocio && legNegocio.nombreNegocio) || 'Mi Minimarket',
        tasaDia: (legNegocio && r2(legNegocio.tasaDia)) || 1,
        tasaFecha: (legNegocio && legNegocio.tasaFecha) || new Date(),
        tasaPor: (legNegocio && legNegocio.tasaPor) || '',
        ventaSeq: (legCont && legCont.ventaSeq) || 0,
        adminUids: [uid],
        creadoEn: new Date()
      }, { merge: true });
    }
  }

  const colecciones = ['productos', 'clientes', 'proveedores', 'compras', 'ventas', 'abonos', 'pagos_prov', 'tasa_historial'];
  for (const col of colecciones) {
    const snap = await db.collection(col).get();
    const refs = snap.docs.filter(d => d.data().negocioId !== nid).map(d => d.ref);
    for (let i = 0; i < refs.length; i += 400) {
      const batch = db.batch();
      refs.slice(i, i + 400).forEach(r => batch.set(r, { negocioId: nid }, { merge: true }));
      await batch.commit();
    }
  }

  const usSnap = await db.collection('usuarios').get();
  const usRefs = usSnap.docs.filter(d => d.data().negocioId !== nid).map(d => d.ref);
  for (let i = 0; i < usRefs.length; i += 400) {
    const batch = db.batch();
    usRefs.slice(i, i + 400).forEach(r => batch.set(r, { negocioId: nid }, { merge: true }));
    await batch.commit();
  }

  if (S.perfil) S.perfil.negocioId = nid;
  return nid;
}

async function cambiarMiClave(claveActual, claveNueva) {
  const u = firebase.auth().currentUser;
  if (!u || !u.email) throw new Error('No hay sesión activa');
  if (!claveNueva || claveNueva.length < 6) throw new Error('La clave nueva debe tener mínimo 6 caracteres');
  const cred = firebase.auth.EmailAuthProvider.credential(u.email, claveActual);
  await u.reauthenticateWithCredential(cred);
  await u.updatePassword(claveNueva);
}

async function crearUsuarioAdmin({ email, password, nombre, rol, permisos }) {
  const secAuth = appSecundariaAuth();
  const cred = await secAuth.createUserWithEmailAndPassword(email.trim(), password);
  const uid = cred.user.uid;
  await db.collection('usuarios').doc(uid).set({
    negocioId: negocioIdActual(),
    nombre: nombre.trim(),
    email: email.trim(),
    rol: rol === 'admin' ? 'admin' : 'empleado',
    permisos: rol === 'admin' ? permisosCompletos() : permisos,
    activo: true,
    creadoEn: new Date(),
    creadoPor: S.perfil.nombre
  });
  await secAuth.signOut();
  return uid;
}

async function guardarPermisosUsuario(uid, { nombre, rol, permisos }) {
  await db.collection('usuarios').doc(uid).update({
    nombre: nombre.trim(),
    rol: rol === 'admin' ? 'admin' : 'empleado',
    permisos: rol === 'admin' ? permisosCompletos() : permisos
  });
}

async function cambiarActivoUsuario(uid, activo) {
  await db.collection('usuarios').doc(uid).update({ activo: !!activo });
}

async function eliminarUsuario(uid) {
  await db.collection('usuarios').doc(uid).delete();
}

async function enviarResetPass(email) {
  await firebase.auth().sendPasswordResetEmail(email.trim());
}
