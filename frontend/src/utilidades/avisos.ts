/**
 * utilidades/avisos.ts
 * ---------------------------------------------------------------------
 * Los mensajes flotantes de confirmación y de error.
 *
 * Envuelve el sistema de avisos de HeroUI en tres funciones con nombre
 * propio, por dos razones:
 *
 *   1. El tono y la duración quedan iguales en toda la aplicación. Un
 *      error se lee más despacio que un "Guardado", así que se queda más
 *      tiempo en pantalla.
 *
 *   2. `avisarDeError` acepta directamente lo que llega a un bloque
 *      catch, sin que cada pantalla tenga que extraer el mensaje. Ese
 *      trabajo repetido era justo donde antes se colaban los avisos
 *      inútiles del tipo "[object Object]".
 * ---------------------------------------------------------------------
 */
import { addToast } from "@heroui/react";
import { mensajeDeError } from "@/api/clienteHttp";

/** Confirmación de que algo salió bien. Breve: no hay nada que leer. */
export function avisarDeExito(mensaje: string): void {
  addToast({
    title: mensaje,
    color: "success",
    timeout: 2600,
  });
}

/**
 * Algo falló. Acepta un texto o cualquier error capturado.
 *
 * Se queda más tiempo en pantalla porque suele explicar qué hacer, y eso
 * requiere leerlo con calma.
 */
export function avisarDeError(errorOMensaje: unknown, titulo?: string): void {
  const textoDelError =
    typeof errorOMensaje === "string" ? errorOMensaje : mensajeDeError(errorOMensaje);

  addToast({
    title: titulo ?? "No se pudo completar",
    description: textoDelError,
    color: "danger",
    timeout: 6000,
  });
}

/** Información neutra: un aviso que no es ni éxito ni fallo. */
export function avisarDeInformacion(mensaje: string, descripcion?: string): void {
  addToast({
    title: mensaje,
    description: descripcion,
    color: "primary",
    timeout: 4000,
  });
}
