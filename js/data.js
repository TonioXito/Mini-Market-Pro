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

  S.desuscribir.push(
    db.collection('config').doc('negocio').onSnapshot(snap => {
      S.negocio = snap.exists ? snap.data() : { nombreNegocio: 'Mi Minimarket', tasaDia: 1 };
      const el = document.getElementById('sb-nombre-negocio');
      if (el) el.textContent = S.negocio.nombreNegocio || 'Mi Minimarket';
      refrescarChipTasa();
      refrescarVistaActiva();
    })
  );

  S.desuscribir.push(
    db.collection('productos').onSnapshot(snap => {
      S.productos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      refrescarVistaActiva();
    }, err => console.error('productos', err))
  );

  S.desuscribir.push(
    db.collection('clientes').onSnapshot(snap => {
      S.clientes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      S.clientes.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
      refrescarVistaActiva();
    }, err => console.error('clientes', err))
  );

  S.desuscribir.push(
    db.collection('proveedores').onSnapshot(snap => {
      S.proveedores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      S.proveedores.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
      refrescarVistaActiva();
    }, err => console.error('proveedores', err))
  );

  S.desuscribir.push(
    db.collection('compras').orderBy('fecha', 'desc').limit(300).onSnapshot(snap => {
      S.compras = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      refrescarVistaActiva();
    }, err => console.error('compras', err))
  );

  const hace90 = sumarDias(new Date(), -90);
  S.desuscribir.push(
    db.collection('ventas').where('fecha', '>=', hace90).orderBy('fecha', 'desc').limit(500)
      .onSnapshot(snap => {
        S.ventasRecientes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        refrescarVistaActiva();
      }, err => console.error('ventas', err))
  );

  S.desuscribir.push(
    db.collection('abonos').where('fecha', '>=', hace90).orderBy('fecha', 'desc').limit(500)
      .onSnapshot(snap => {
        S.abonosRecientes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        refrescarVistaActiva();
      }, err => console.error('abonos', err))
  );

  S.desuscribir.push(
    db.collection('pagos_prov').where('fecha', '>=', hace90).orderBy('fecha', 'desc').limit(500)
      .onSnapshot(snap => {
        S.pagosRecientes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        refrescarVistaActiva();
      }, err => console.error('pagos_prov', err))
  );

  S.desuscribir.push(
    db.collection('tasa_historial').orderBy('fecha', 'desc').limit(12)
      .onSnapshot(snap => {
        S.tasaHistorial = snap.docs.map(d => d.data());
        refrescarVistaActiva();
      }, () => {})
  );
}

function escucharUsuarios() {
  S.desuscribir.push(
    db.collection('usuarios').onSnapshot(snap => {
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
  await db.collection('config').doc('negocio').set({
    tasaDia: t,
    tasaFecha: new Date(),
    tasaPor: S.perfil ? S.perfil.nombre : ''
  }, { merge: true });
  await db.collection('tasa_historial').add({ tasa: t, fecha: new Date(), usuario: S.perfil ? S.perfil.nombre : '' });
}

async function guardarNombreNegocio(nombre) {
  await db.collection('config').doc('negocio').set({ nombreNegocio: nombre.trim() || 'Mi Minimarket' }, { merge: true });
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
    const saldo = r2(compra.totalUSD) - r2(compra.pagadoUSD);
    const aplicar = Math.min(montoUSD, Math.max(saldo, 0));
    tx.set(db.collection('pagos_prov').doc(), {
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
    tx.set(db.collection('abonos').doc(), {
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

  const datos = {};
  await db.runTransaction(async (tx) => {
    const contRef = db.collection('config').doc('contadores');
    const lecturas = [];
    for (const it of items) {
      const ref = db.collection('productos').doc(it.productoId);
      lecturas.push(tx.get(ref).then(s => [ref, s]));
    }
    const resultados = await Promise.all(lecturas);
    const contSnap = await tx.get(contRef);
    const seq = ((contSnap.exists && contSnap.data().ventaSeq) || 0) + 1;
    const vref = db.collection('ventas').doc();
    datos.numero = 'V-' + String(seq).padStart(5, '0');
    datos.totalUSD = totalUSD;

    tx.set(vref, {
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
  let negocioExistente = null;
  try {
    const snap = await db.collection('config').doc('negocio').get();
    if (snap.exists) negocioExistente = snap.data();
  } catch {}

  const batch = db.batch();
  if (!negocioExistente) {
    batch.set(db.collection('config').doc('negocio'), {
      nombreNegocio: nombreNegocio.trim() || 'Mi Minimarket',
      tasaDia: r2(tasaInicial) || 1,
      tasaFecha: new Date(),
      tasaPor: nombre
    });
    if (r2(tasaInicial) > 0) {
      batch.set(db.collection('tasa_historial').doc(), { tasa: r2(tasaInicial), fecha: new Date(), usuario: nombre });
    }
  }
  batch.set(db.collection('config').doc('contadores'), { ventaSeq: 0 }, { merge: true });
  batch.set(db.collection('usuarios').doc(uid), {
    nombre: nombre.trim(),
    email,
    rol: 'admin',
    permisos: permisosCompletos(),
    activo: true,
    creadoEn: new Date()
  });
  await batch.commit();
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
