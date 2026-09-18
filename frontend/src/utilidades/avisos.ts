/**
 * utilidades/avisos.ts
 * ---------------------------------------------------------------------
 * Los mensajes flotantes de confirmación y de error.
 *
 * Envuelve el sistema de avisos de HeroUI en funciones con nombre
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
import { addToast, Button } from "@heroui/react";
import { createElement } from "react";
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

/**
 * Un aviso de la campanita que acaba de llegar en vivo.
 *
 * Dura más que la información neutra porque casi siempre pide hacer algo
 * —abrir la marca—, y por eso lleva un botón que va directo sin tener
 * que buscar la campanita. Sin enlace, sale sin botón.
 *
 * Este fichero es .ts y no .tsx: por eso el botón se crea con
 * createElement y no con JSX.
 */
export function avisarDeNotificacion(
  titulo: string,
  cuerpo: string | null,
  alAbrir?: () => void,
): void {
  addToast({
    title: titulo,
    description: cuerpo ?? undefined,
    color: "primary",
    timeout: 8000,
    endContent: alAbrir
      ? createElement(
          Button,
          { color: "primary", radius: "full", size: "sm", variant: "flat", onPress: alAbrir },
          "Abrir",
        )
      : undefined,
  });
}
