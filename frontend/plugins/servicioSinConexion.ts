/**
 * plugins/servicioSinConexion.ts
 * ---------------------------------------------------------------------
 * La pieza de Vite que produce `dist/sw.js`.
 *
 * El service worker está escrito a mano en `sw/servicio.js` (ver ahí el
 * porqué), pero hay dos cosas que no puede saber por sí mismo:
 *
 *   1. QUÉ FICHEROS guardar. Los del build llevan un hash en el nombre
 *      —`indice-B7fK2p.js`— que cambia en cada despliegue. Escribirlos a
 *      mano duraría hasta el siguiente.
 *
 *   2. QUÉ VERSIÓN es. Es lo que decide si hay que tirar la caché vieja
 *      y lo que dispara el aviso de «hay una versión nueva».
 *
 * Así que esto lee la plantilla, sustituye las dos marcas y emite el
 * resultado. La versión es un resumen de los nombres de los ficheros: si
 * el build produce exactamente lo mismo, la versión no cambia y a nadie
 * se le avisa de una actualización que no existe.
 *
 * POR QUÉ NO SE USA EL COMPLEMENTO HABITUAL DE PWA
 *
 * Está pensado para versiones anteriores de Vite y este proyecto va con
 * Vite 8 sobre rolldown. Escribir estas cuarenta líneas es menos trabajo
 * que perseguir una incompatibilidad en cada actualización.
 *
 * EN DESARROLLO NO SE EMITE NADA. `npm run dev` no pasa por aquí, y el
 * registro del service worker está apagado en desarrollo a propósito:
 * una caché por delante del servidor de Vite esconde los cambios que se
 * acaban de guardar y hace perder media tarde.
 * ---------------------------------------------------------------------
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Plugin } from "vite";

/** Dónde vive la plantilla, relativa a la raíz del frontend. */
const PLANTILLA = "sw/servicio.js";

/** Nombre con el que se sirve. Tiene que estar en la raíz del sitio. */
const FICHERO_EMITIDO = "sw.js";

/** La página que se guarda y se sirve para cualquier ruta del panel. */
const ARMAZON = "index.html";

/**
 * Lo que se copia de `public/` a `dist/` y merece guardarse: el icono,
 * el manifiesto y los dibujos de la aplicación. Se excluye todo lo que
 * sea pesado o que no haga falta para que el panel abra sin red.
 */
const EXTENSIONES_DE_PUBLIC = [".svg", ".png", ".webmanifest", ".ico"];

export function servicioSinConexion(): Plugin {
  return {
    name: "tsports:servicio-sin-conexion",

    // Solo al compilar de verdad. En `npm run dev` este bloque no corre.
    apply: "build",

    // DESPUÉS de todos los demás, y no es un detalle: el index.html lo
    // emite un plugin de Vite en esta misma fase. Sin "post", la lista
    // salía sin él —se vio en la primera compilación— y entonces el
    // armazón no se guarda: la aplicación abriría con red y solo con
    // red, que es justo lo contrario de lo que se quiere.
    enforce: "post",

    generateBundle(_opciones, paquete) {
      const raiz = process.cwd();

      // Todo lo que el bundler acaba de producir: el index.html, los
      // .js con hash y los .css. Se ordena para que el resumen de la
      // versión no baile entre compilaciones idénticas.
      const delBundle = Object.keys(paquete).sort();

      const armazon = paquete[ARMAZON];

      if (armazon === undefined) {
        // Si esto salta, el orden de los plugins ha cambiado y hay que
        // revisarlo: mejor romper la compilación que publicar una
        // aplicación que dice funcionar sin red y no funciona.
        this.error(
          `El service worker no puede guardar el armazón: ${ARMAZON} no está ` +
            `en el resultado de la compilación.`,
        );
      }

      const dePublic = ficherosDePublic(join(raiz, "public"));

      const aGuardar = [
        // Las rutas se guardan absolutas porque es así como las pide el
        // navegador: el armazón se sirve para cualquier ruta del panel.
        ...delBundle.map((nombre) => `/${nombre}`),
        ...dePublic,
      ];

      // La versión sale de los nombres MÁS el contenido del index.html.
      // Los nombres ya llevan hash, así que cambian solos en cuanto
      // cambia una línea de la aplicación; el index.html no lo lleva, y
      // sin mirar su contenido, tocar solo una etiqueta del <head> no
      // habría avisado a nadie de que hay versión nueva.
      const version = createHash("sha256")
        .update(aGuardar.join("\n"))
        .update(armazon.type === "asset" ? armazon.source : armazon.code)
        .digest("hex")
        .slice(0, 12);

      const plantilla = readFileSync(join(raiz, PLANTILLA), "utf8");

      const contenido = plantilla
        .replace("__VERSION__", version)
        .replace("__ARCHIVOS__", JSON.stringify(aGuardar, null, 2));

      this.emitFile({ type: "asset", fileName: FICHERO_EMITIDO, source: contenido });
    },
  };
}

/**
 * Los ficheros estáticos de `public/` que vale la pena guardar, con la
 * ruta con la que los pedirá el navegador.
 *
 * Hace falta recorrer la carpeta a mano porque Vite copia `public/` tal
 * cual, por fuera del bundle: esos ficheros no aparecen en el paquete
 * que recibe `generateBundle`.
 */
function ficherosDePublic(carpeta: string): string[] {
  const encontrados: string[] = [];

  const recorrer = (actual: string) => {
    for (const entrada of readdirSync(actual)) {
      const ruta = join(actual, entrada);

      if (statSync(ruta).isDirectory()) {
        recorrer(ruta);
        continue;
      }

      if (EXTENSIONES_DE_PUBLIC.some((extension) => entrada.endsWith(extension))) {
        encontrados.push(`/${relative(carpeta, ruta).split("\\").join("/")}`);
      }
    }
  };

  try {
    recorrer(carpeta);
  } catch {
    // Sin carpeta public/ no hay nada que añadir, y no es un error.
  }

  return encontrados.sort();
}
