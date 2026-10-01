/*
 * tema-inicial.js
 * ---------------------------------------------------------------------
 * Pinta el tema y el color de acento ANTES de que React arranque. Sin
 * esto, quien tiene el modo oscuro guardado vería un destello blanco en
 * cada recarga. Lee las mismas claves de localStorage que ProveedorTema.
 *
 * Va en un fichero y no escrito dentro de index.html por la política de
 * contenido (CSP, deploy/nginx-seguridad.conf): solo se ejecuta código
 * que venga de ficheros del propio sitio. Un script escrito en la página
 * necesitaría su huella en la política, y cualquier retoque aquí la
 * rompería sin avisar. index.html lo carga sin `defer` ni `async`, en el
 * <head>: así sigue corriendo antes de que se pinte nada.
 * ---------------------------------------------------------------------
 */
(function aplicarTemaGuardado() {
  try {
    var preferencia = localStorage.getItem("tsports:tema") || "sistema";
    var prefiereOscuroElSistema = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var debeSerOscuro =
      preferencia === "oscuro" || (preferencia === "sistema" && prefiereOscuroElSistema);
    document.documentElement.classList.toggle("dark", debeSerOscuro);

    // Color de acento del perfil (se guarda junto al tema).
    var acento = localStorage.getItem("tsports:acento");
    if (acento) document.documentElement.setAttribute("data-acento", acento);
  } catch (e) {
    /* Si localStorage está bloqueado, se queda el tema claro. */
  }
})();
