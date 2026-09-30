/**
 * api/conexionEnVivo.ts
 * ---------------------------------------------------------------------
 * Dos datos de la conexión en vivo que hacen falta FUERA de React: en
 * el cliente HTTP y en las opciones por defecto de las consultas, que no
 * pueden leer un contexto. Los escribe ProveedorTiempoReal cada vez que
 * cambia el estado de la conexión.
 *
 *   · El id de la conexión (socket id de Reverb). Viaja en cada petición
 *     como `X-Socket-ID`, y el servidor no le manda a ESTA pestaña el
 *     aviso de «cambiaron los datos» que provoque ella misma: ya refresca
 *     lo suyo al terminar de guardar (regla 22).
 *   · Si está en vivo. Mientras lo está, volver a la pestaña no refresca
 *     nada, porque los cambios de los demás ya van llegando por el
 *     WebSocket (ver ProveedorConsultas).
 * ---------------------------------------------------------------------
 */

let idDeLaConexion: string | null = null;
let estaEnVivo = false;

/** Lo llama ProveedorTiempoReal al cambiar el estado de la conexión. */
export function anotarLaConexionEnVivo(enVivo: boolean, idDeLaConexionActual: string | null): void {
  estaEnVivo = enVivo;
  idDeLaConexion = enVivo ? idDeLaConexionActual : null;
}

export function laConexionEstaEnVivo(): boolean {
  return estaEnVivo;
}

export function idDeLaConexionEnVivo(): string | null {
  return idDeLaConexion;
}
