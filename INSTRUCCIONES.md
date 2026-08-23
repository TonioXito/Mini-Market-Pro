# 📱 Mi Minimarket — Guía de instalación

Aplicación para **computadora y teléfono** que sincroniza todo en tiempo real mediante Firebase (gratis). Se instala como app (PWA) desde el navegador.

## Qué incluye

- 💵 **Ventas**: punto de venta rápido con búsqueda de productos, cobro en $ o Bs, vuelto, fiado con deuda automática al cliente y anulación de ventas.
- 📦 **Inventario**: productos con costo, precio, stock, alertas de stock mínimo y valor del inventario.
- 👥 **Quién me debe**: clientes con saldo, abonos parciales, historial de fiados y pagos.
- 🚚 **Cuánto debo yo**: compras a crédito a proveedores, fecha límite de pago, pagos parciales y avisos de vencidos.
- 📊 **Reportes**: ventas del día / semana / mes / rango propio, ganancia estimada, desglose por método de pago, productos más vendidos. Descarga en **Excel (.xlsx)**, **CSV** o **TXT (bloc de notas)** — todos editables.
- 💱 **Tasa del día**: la cambias cuando quieras y se usa en todas las operaciones.
- 👤 **Usuarios**: el administrador crea usuarios con correo y contraseña temporal y decide qué puede **ver** y qué puede **usar** cada uno.

---

## Paso 1 — Crear tu Firebase (solo una vez, ~5 minutos)

1. Entra a **https://console.firebase.google.com** e inicia sesión con tu cuenta de Google.
2. Clic en **"Crear un proyecto"** → ponle nombre (ej: `mi-minimarket`) → continúa (puedes dejar Google Analytics desactivado) → **Crear**.
3. Dentro del proyecto, clic en el icono **`</>`** (Web) para agregar una app web:
   - Apodo: `minimarket-app` → **Registrar app**
   - Te mostrará un bloque `const firebaseConfig = { apiKey: "...", ... }`
4. Copia esos valores y pégalos en el archivo **`firebase-config.js`** de esta carpeta, reemplazando los textos `PEGA_TU_..._AQUI`.

## Paso 2 — Activar el inicio de sesión

Esto le dice a Firebase que acepte usuarios que entran con correo y contraseña (así funciona el login de tu app):

1. Estás dentro de tu proyecto (`mi-minimarket`). Mira el **menú del lado izquierdo**.
2. En ese menú busca la sección **"Compilación"** (en inglés: *Build*) y dentro de ella clic en **"Authentication"**.
3. Si es tu primera vez, aparece un botón azul **"Comenzar"** → púlsalo.
4. Ahora verás unas pestañas arriba: **Usuarios**, **Sign-in method**, etc. Clic en **"Sign-in method"** (a veces aparece como "Métodos de acceso").
5. En la lista de proveedores, clic sobre **"Correo electrónico/contraseña"** (*Email/Password*).
6. Activa el interruptor **"Habilitar"** (Enable) → botón **"Guardar"**.

Listo ✅ — no hay que crear ningún usuario aquí; los usuarios se crean solos cuando tú los creas desde la app.

## Paso 3 — Crear la base de datos

1. Menú izquierdo: **Firestore Database** → **Crear base de datos**.
2. Elige **Modo de producción** y la ubicación sugerida (`us-east1`) → Habilitar.
3. Pestaña **Reglas**, borra lo que hay y pega esto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

4. Clic en **Publicar**.

## Paso 4 — Abrir la aplicación

La app **no funciona con doble clic** (el navegador bloquea Firebase así). Usa una de estas opciones:

### Opción A · Probar en tu PC (red local)
1. Instala Node.js (https://nodejs.org) si no lo tienes.
2. Abre PowerShell en esta carpeta y ejecuta:
   ```
   npx -y serve .
   ```
3. En el PC abre `http://localhost:3000`.
4. En el teléfono (conectado al **mismo WiFi**) abre `http://TU_IP_DEL_PC:3000`. (Tu IP: ejecuta `ipconfig` y mira "Dirección IPv4").

> Con esta opción el teléfono solo funciona mientras estés en ese WiFi y el PC encendido.

### Opción B · Publicarla en internet gratis (recomendada)
Con esto PC y teléfono funcionan desde cualquier lugar:

**Netlify Drop (lo más fácil):**
1. Comprime esta carpeta completa en un `.zip`.
2. Entra a **https://app.netlify.com/drop** (cuenta gratuita).
3. Arrastra el archivo `.zip` → te da una dirección tipo `https://tu-minimarket.netlify.app`.

O con **Firebase Hosting**:
```
npm install -g firebase-tools
firebase login
firebase init hosting   (elige tu proyecto, carpeta pública: . , NO sobrescribir index.html)
firebase deploy
```

## Paso 5 — Primer uso

1. Abre la aplicación y entra con el acceso predeterminado:
   - **Usuario:** `master`
   - **Clave:** `010101`

   Como es la primera vez, la app crea esa cuenta automáticamente y te pedirá el nombre del negocio, tu nombre y la tasa del día. Ya eres el administrador.
2. En tu teléfono abre la misma dirección → inicia sesión → menú del navegador → **"Agregar a pantalla de inicio"** / en PC → icono de instalación en la barra de direcciones. ¡Ya tienes la app instalada!
3. Ve a **Configuración → Usuarios** para crear cuentas a tus trabajadores (puedes usar solo un nombre de usuario, ej: `maria`, sin correo) y definir sus permisos.

> 💡 Recomendación: cuando entres por primera vez con `master`, créate además tu propio usuario personal desde Configuración → Usuarios y usa ese a diario; deja `master` solo como respaldo.

---

## Notas

- Los usuarios pueden entrar escribiendo solo su **nombre de usuario** (ej: `master`, `maria`) o un correo completo. Internamente los nombres se guardan como `usuario@minimarket.local`.
- La clave `010101` es muy corta y conocida: úsala solo para el primer acceso y luego usa claves propias de 6+ caracteres.
- Quienes tengan correo real pueden recuperar su clave con «Olvidé mi contraseña». Los creados solo con nombre de usuario no: si olvidan la clave, el administrador los elimina y crea de nuevo.
- Los datos quedan guardados en Firebase (nube) con copia local en cada equipo; si no hay internet puedes seguir viendo los datos y se sincronizan al reconectar.
- Si algún día cambias algo del código (archivos), sube de número la constante `CACHE` en `sw.js` para que los teléfonos reciban la actualización.
