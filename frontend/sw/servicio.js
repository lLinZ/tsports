/**
 * sw/servicio.js — el service worker de la aplicación instalable.
 * ---------------------------------------------------------------------
 * Este fichero NO se compila con el resto del frontend: es la plantilla
 * que `plugins/servicioSinConexion.ts` copia a `dist/sw.js` rellenando
 * las dos marcas de abajo con la versión y la lista real de ficheros del
 * build (que llevan hash en el nombre y cambian en cada despliegue).
 *
 * Por eso está en JavaScript y fuera de `src/`: aquí no existe `window`
 * ni React, y el `tsc` de la aplicación no tiene nada que comprobar.
 *
 * LO QUE HACE, Y LO QUE NO
 *
 *   · Guarda el armazón (el index.html y los .js/.css con hash) para que
 *     la aplicación abra sin red. Es lo que permite consultar el CRM en
 *     una reunión sin cobertura.
 *
 *   · NO GUARDA NUNCA NADA DE /api. Esta es la regla dura del fichero.
 *     Una respuesta de la API guardada aquí no tendría quién la caduque
 *     ni quién la separe por usuario: un agente podría acabar viendo la
 *     lista de marcas de otro, o una marca borrada seguiría viva días.
 *     Los datos para consultar sin conexión los guarda la aplicación,
 *     por persona y diciendo de cuándo son (ver
 *     `providers/ProveedorDatosGuardados.tsx`).
 *
 *   · Tampoco toca /storage: las imágenes subidas llevan nombre
 *     irrepetible y nginx las sirve con `immutable` a un año, así que el
 *     propio navegador ya las tiene sin conexión.
 *
 * LA ACTUALIZACIÓN NO SE HACE SOLA A MEDIA SESIÓN
 *
 * Al instalarse una versión nueva, esta se queda ESPERANDO. No se llama
 * a `skipWaiting()` por las bravas: cambiar los ficheros por debajo de
 * una pestaña abierta le rompe la navegación a quien esté a mitad de un
 * formulario. Se activa cuando la persona pulsa «Actualizar» en el aviso
 * y la aplicación manda el mensaje de abajo.
 * ---------------------------------------------------------------------
 */

/* global self, caches, fetch, Request, Response, URL */

/** Cambia en cada build: es lo que hace que la caché vieja se tire. */
const VERSION = "__VERSION__";

/** El index.html y los ficheros con hash, puestos por el plugin. */
const ARCHIVOS_DEL_ARMAZON = __ARCHIVOS__;

/** La página que se sirve para CUALQUIER ruta: el enrutador hace el resto. */
const ARMAZON = "/index.html";

const CACHE_DEL_ARMAZON = `tsports-armazon-${VERSION}`;

/**
 * Las tipografías van en una caché aparte y SIN versión, para no volver
 * a descargar Inter en cada despliegue: no cambia nunca.
 */
const CACHE_DE_TIPOGRAFIAS = "tsports-tipografias";

/**
 * Todo lo que empiece por uno de estos caminos sale y entra por la red,
 * sin pasar por aquí. Son datos vivos o cosas de otro proceso.
 */
const CAMINOS_QUE_NO_SE_TOCAN = ["/api/", "/storage/", "/app/", "/up"];

/** Los dos dominios de Google Fonts, que sirven la Inter de la interfaz. */
const DOMINIOS_DE_TIPOGRAFIAS = ["fonts.googleapis.com", "fonts.gstatic.com"];

/* ==================================================================== */
/* Ciclo de vida                                                        */
/* ==================================================================== */

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE_DEL_ARMAZON).then((cache) => cache.addAll(ARCHIVOS_DEL_ARMAZON)),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      // Fuera las cachés de versiones anteriores. Solo las del armazón:
      // la de tipografías se conserva a propósito.
      const nombres = await caches.keys();

      await Promise.all(
        nombres
          .filter((nombre) => nombre.startsWith("tsports-armazon-") && nombre !== CACHE_DEL_ARMAZON)
          .map((nombre) => caches.delete(nombre)),
      );

      // Hacerse cargo de las pestañas que ya estaban abiertas, sin
      // esperar a que se cierren todas.
      await self.clients.claim();
    })(),
  );
});

/**
 * Los dos mensajes que entiende, ambos de `hooks/useAplicacionInstalada`.
 *
 *   · aplicar-la-version-nueva → la persona pulsó «Actualizar».
 *   · que-version-eres         → para poder comprobar qué está sirviendo.
 */
self.addEventListener("message", (evento) => {
  const tipo = evento.data?.tipo;

  if (tipo === "aplicar-la-version-nueva") {
    self.skipWaiting();
    return;
  }

  if (tipo === "que-version-eres") {
    evento.source?.postMessage({ tipo: "soy-la-version", version: VERSION });
  }
});

/* ==================================================================== */
/* Peticiones                                                           */
/* ==================================================================== */

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;

  // Solo lecturas. Un POST o un DELETE no se guardan ni se reintentan
  // jamás desde aquí: repetir una escritura duplicaría una marca o un
  // comentario sin que nadie se entere.
  if (peticion.method !== "GET") {
    return;
  }

  const direccion = new URL(peticion.url);

  if (direccion.origin === self.location.origin) {
    if (CAMINOS_QUE_NO_SE_TOCAN.some((camino) => direccion.pathname.startsWith(camino))) {
      return;
    }

    // Abrir la aplicación, recargar o escribir una ruta a mano. Siempre
    // se contesta con el armazón guardado, así que abre al instante y
    // también sin red; de la versión nueva avisa el aviso, no un
    // recambio silencioso.
    if (peticion.mode === "navigate") {
      evento.respondWith(servirElArmazon());
      return;
    }

    evento.respondWith(deLaCachePrimero(peticion));
    return;
  }

  if (DOMINIOS_DE_TIPOGRAFIAS.includes(direccion.hostname)) {
    evento.respondWith(servirTipografia(peticion));
  }
});

/** El index.html guardado; si aún no lo está, el de la red. */
async function servirElArmazon() {
  const guardado = await caches.match(ARMAZON, { cacheName: CACHE_DEL_ARMAZON });

  if (guardado) {
    return guardado;
  }

  try {
    return await fetch(ARMAZON);
  } catch {
    return respuestaDeSinConexion();
  }
}

/**
 * Para los ficheros del build. Van primero a la caché porque llevan hash
 * en el nombre: si el nombre coincide, el contenido es el mismo y
 * preguntar a la red sería un viaje para nada.
 */
async function deLaCachePrimero(peticion) {
  const guardado = await caches.match(peticion, { cacheName: CACHE_DEL_ARMAZON });

  if (guardado) {
    return guardado;
  }

  try {
    const respuesta = await fetch(peticion);

    // Se guarda lo que haya salido bien, para que un trozo que se pide
    // tarde —el generador de Excel, por ejemplo— esté también la
    // próxima vez que no haya red.
    if (respuesta.ok) {
      const cache = await caches.open(CACHE_DEL_ARMAZON);

      await cache.put(peticion, respuesta.clone());
    }

    return respuesta;
  } catch {
    return respuestaDeSinConexion();
  }
}

/**
 * Inter, desde Google Fonts: primero lo guardado y se refresca por
 * detrás, porque la tipografía no cambia y esperar por ella retrasa el
 * primer texto en pantalla.
 *
 * La petición se rehace con `mode: "cors"` a propósito. La que manda el
 * navegador por un `<link rel="stylesheet">` es «no-cors» y devuelve una
 * respuesta opaca, y `cache.put()` rechaza las opacas: sin esto, la hoja
 * de estilos de la tipografía no se llegaría a guardar nunca.
 */
async function servirTipografia(peticion) {
  const cache = await caches.open(CACHE_DE_TIPOGRAFIAS);
  const guardada = await cache.match(peticion);

  const desdeLaRed = fetch(new Request(peticion.url, { mode: "cors", credentials: "omit" }))
    .then((respuesta) => {
      if (respuesta.ok) {
        void cache.put(peticion, respuesta.clone());
      }

      return respuesta;
    })
    .catch(() => null);

  if (guardada) {
    return guardada;
  }

  const recienTraida = await desdeLaRed;

  // Sin red y sin copia, mejor un fallo limpio: el navegador usa
  // entonces la tipografía del sistema y la página se lee igual.
  return recienTraida ?? respuestaDeSinConexion();
}

/**
 * Lo que se contesta cuando no hay red ni copia. Un 503 y no un 404:
 * es una situación pasajera, no un fichero que no existe.
 */
function respuestaDeSinConexion() {
  return new Response("Sin conexión y sin copia guardada de esto.", {
    status: 503,
    statusText: "Sin conexión",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/* ==================================================================== */
/* Avisos al móvil con el panel cerrado                                 */
/* ==================================================================== */

/**
 * Llega un aviso empujado desde el servidor.
 *
 * ESTO TIENE QUE ENSEÑAR ALGO SIEMPRE. Los navegadores exigen que todo
 * push acabe en una notificación visible: si el evento termina sin
 * llamar a `showNotification`, Chrome pinta un aviso genérico del tipo
 * «Este sitio se actualizó en segundo plano» y, si se repite, deja de
 * entregar los avisos de este sitio. Por eso hasta el caso raro —un
 * push sin datos o con datos rotos— acaba enseñando algo.
 *
 * El contenido lo arma el servidor (`App\Support\Push`) y viene con el
 * enlace ya resuelto: aquí no se compone ninguna ruta.
 */
self.addEventListener("push", (evento) => {
  let aviso = {};

  try {
    aviso = evento.data ? evento.data.json() : {};
  } catch {
    /* Un push que no es JSON nuestro; se enseña el texto de respaldo. */
  }

  const titulo = aviso.titulo || "TS Sports";

  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: aviso.cuerpo || "Tienes un aviso nuevo en el panel.",
      icon: "/iconos/icono-192.png",
      // El icono pequeño y monocromo de la barra de estado de Android.
      // Sin él, algunos teléfonos pintan un cuadrado gris.
      badge: "/iconos/icono-enmascarable-192.png",
      lang: "es",
      // Dos avisos del mismo tipo se sustituyen en vez de apilarse:
      // volver de un fin de semana con quince leads dejaría quince
      // avisos en el teléfono. El servidor manda ya la misma etiqueta
      // como `topic`, que hace lo propio en el servicio de entrega.
      //
      // Los mensajes del chat traen su propia etiqueta, una por charla:
      // los de una misma charla se sustituyen entre sí, y los de charlas
      // distintas no se pisan.
      tag: aviso.etiqueta || aviso.tipo || "tsports",
      // Y aun sustituyendo, un mensaje nuevo tiene que volver a sonar;
      // sin esto, el segundo mensaje de una charla llega callado.
      renotify: Boolean(aviso.volverAAvisar),
      // Lo que hace falta al pulsarlo, y nada más: ni nombres de marca
      // ni datos que no estén ya en el texto del aviso.
      data: { enlace: aviso.enlace || "/panel" },
    }),
  );
});

/**
 * Se pulsa el aviso: se va a la ficha.
 *
 * Si ya hay una ventana del panel abierta se reutiliza —abrir una
 * segunda con la misma sesión desconcierta— y solo si no hay ninguna se
 * abre una nueva.
 */
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();

  const destino = evento.notification.data?.enlace || "/panel";

  evento.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({
        type: "window",
        // Cuentan también las que todavía se están cargando.
        includeUncontrolled: true,
      });

      for (const ventana of ventanas) {
        if (new URL(ventana.url).origin === self.location.origin) {
          await ventana.focus();

          // Se le pide a la pestaña que navegue ella, con su enrutador,
          // en vez de recargarla entera: quien estuviera a mitad de algo
          // no pierde lo que tenía escrito.
          ventana.postMessage({ tipo: "abrir-aviso", enlace: destino });

          return;
        }
      }

      await self.clients.openWindow(destino);
    })(),
  );
});
