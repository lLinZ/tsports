/**
 * theme/colorDeLaBarra.ts
 * ---------------------------------------------------------------------
 * El color de la barra del sistema cuando el panel se usa como
 * aplicación instalada.
 *
 * Instalada en el móvil o en el escritorio, la aplicación no tiene barra
 * de direcciones: lo que hay encima del panel es una franja que pinta el
 * sistema operativo con el color de la etiqueta `theme-color`. Si ese
 * color no acompaña al tema, queda una costura blanca sobre un panel
 * negro —o al revés— justo en el borde superior, que es donde está la
 * barra superior del CRM.
 *
 * POR QUÉ HACE FALTA ESTE FICHERO Y NO BASTA EL index.html
 *
 * En `index.html` hay dos etiquetas, una por esquema del sistema
 * operativo. Eso resuelve el arranque y resuelve del todo a quien tiene
 * la preferencia «sistema», que es la de fábrica. Pero el tema aquí es
 * DE CADA PERSONA: quien elige «oscuro» teniendo el ordenador en claro
 * se quedaría con la franja clara.
 *
 * La solución es escribir el color ya resuelto en LAS DOS etiquetas, de
 * forma que dé igual cuál elija el navegador. Se sobreescribe el
 * contenido de las que ya están en el documento en vez de añadir una
 * tercera: con varias etiquetas `theme-color` gana la primera que
 * encaje, y depender de ese orden es justo la clase de detalle que se
 * rompe al reordenar el `<head>`.
 *
 * Lo llama únicamente ProveedorTema, que es donde se decide el tema
 * (una regla, un sitio).
 * ---------------------------------------------------------------------
 */

/** Los mismos `background` de los dos temas de `frontend/hero.ts`. */
const FONDO_CLARO = "#f6f8fb";
const FONDO_OSCURO = "#080d16";

/**
 * Deja las dos etiquetas `theme-color` con el color del tema que se está
 * pintando de hecho.
 */
export function aplicarColorDeLaBarra(estaEnModoOscuro: boolean): void {
  const colorResuelto = estaEnModoOscuro ? FONDO_OSCURO : FONDO_CLARO;

  for (const etiqueta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )) {
    etiqueta.content = colorResuelto;
  }

  // La barra de estado de iOS es aparte: no lee `theme-color` sino esta
  // etiqueta, y solo admite tres valores. «black-translucent» deja el
  // contenido subir hasta debajo del reloj, que aquí taparía la barra
  // superior del panel, así que en claro se usa el estilo normal y en
  // oscuro el negro.
  const barraDeIos = document.querySelector<HTMLMetaElement>(
    'meta[name="apple-mobile-web-app-status-bar-style"]',
  );

  if (barraDeIos !== null) {
    barraDeIos.content = estaEnModoOscuro ? "black" : "default";
  }
}
