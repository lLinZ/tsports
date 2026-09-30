/**
 * utilidades/llaveDelCatalogo.ts
 * ---------------------------------------------------------------------
 * La llave del catálogo de la web, guardada en el navegador del cliente.
 *
 * Es lo que devuelve la puerta del catálogo al entrar con el usuario y la
 * contraseña de invitado (la contraseña no se guarda nunca). Se guarda
 * con la fecha en que caduca para no mandar al servidor una llave que ya
 * se sabe muerta. Si la agencia cambia la contraseña antes, la llave deja
 * de abrir y la página la olvida.
 *
 * Todo en try/catch: sin almacenamiento (ventana privada, datos del sitio
 * bloqueados) la llave dura lo que dure la página abierta.
 * ---------------------------------------------------------------------
 */

const CLAVE_DE_LA_LLAVE = "tsports:llave-del-catalogo";

/** La llave guardada, si la hay y no ha caducado. */
export function leerLlaveDelCatalogo(): string | null {
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE_DE_LA_LLAVE) ?? "null") as {
      llave?: string;
      caducaEn?: string;
    } | null;

    if (!guardada?.llave || !guardada.caducaEn) return null;

    return new Date(guardada.caducaEn).getTime() > Date.now() ? guardada.llave : null;
  } catch {
    return null;
  }
}

export function guardarLlaveDelCatalogo(llave: string, caducaEn: string): void {
  try {
    localStorage.setItem(CLAVE_DE_LA_LLAVE, JSON.stringify({ llave, caducaEn }));
  } catch {
    /* Sin almacenamiento, la llave dura lo que dure la página abierta. */
  }
}

export function olvidarLlaveDelCatalogo(): void {
  try {
    localStorage.removeItem(CLAVE_DE_LA_LLAVE);
  } catch {
    /* Nada que olvidar. */
  }
}
