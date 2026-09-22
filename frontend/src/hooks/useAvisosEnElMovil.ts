/**
 * hooks/useAvisosEnElMovil.ts
 * ---------------------------------------------------------------------
 * Aceptar (o dejar de recibir) los avisos del sistema cuando el panel
 * está cerrado.
 *
 * EL PERMISO SE PIDE UNA VEZ EN LA VIDA
 *
 * Es la regla que manda sobre todo lo demás. Cuando el navegador enseña
 * su diálogo de permiso y la persona dice que no, NO VUELVE A
 * PREGUNTARLO nunca: a partir de ahí el permiso queda en «denegado» y la
 * única forma de deshacerlo es entrar en la configuración del sitio, que
 * no va a hacer nadie. Así que una sola ventana mal puesta —al entrar
 * por primera vez, sin contexto— apaga la función para esa persona para
 * siempre.
 *
 * Por eso aquí `pedirPermisoYSuscribir` NO se llama sola. La llama un
 * botón que la persona pulsa a sabiendas, después de leer qué va a
 * recibir, y eso vive en `TarjetaDeAvisosEnElMovil`, dentro de la
 * pantalla de avisos.
 *
 * LO QUE SÍ SE HACE SOLO es volver a registrar una suscripción que ya
 * existía, al entrar. El navegador puede renovarla por su cuenta y, si
 * el servidor no se entera, deja de llegarle nada a un dispositivo que
 * cree tenerlo puesto.
 * ---------------------------------------------------------------------
 */
import { useCallback, useEffect, useState } from "react";
import {
  borrarSuscripcionDePush,
  guardarSuscripcionDePush,
  obtenerConfiguracionDelPush,
} from "@/api/push";
import { avisarDeError } from "@/utilidades/avisos";

/** En qué punto está este navegador. */
export type EstadoDeLosAvisos =
  /** Este navegador no sabe de push, o el servidor lo tiene apagado. */
  | "noDisponible"
  /** Se puede ofrecer: aún no se ha preguntado. */
  | "sinDecidir"
  /** Aceptados y registrados en el servidor. */
  | "activos"
  /** La persona dijo que no. No se puede volver a preguntar. */
  | "bloqueados"
  /** Comprobando al arrancar. */
  | "comprobando";

/**
 * Pasa la clave pública VAPID de texto a los bytes que pide
 * `pushManager.subscribe`.
 *
 * Viaja en base64url (sin `+`, sin `/` y sin relleno) porque va dentro
 * de cabeceras y direcciones; el navegador la quiere en crudo.
 */
function comoBytes(claveEnBase64Url: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (claveEnBase64Url.length % 4)) % 4);
  const base64 = (claveEnBase64Url + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const binario = window.atob(base64);

  // Se reserva el búfer a mano en vez de usar `Uint8Array.from`: así el
  // tipo queda atado a un ArrayBuffer de verdad, que es lo único que
  // acepta `applicationServerKey`.
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));

  for (let posicion = 0; posicion < binario.length; posicion += 1) {
    bytes[posicion] = binario.charCodeAt(posicion);
  }

  return bytes;
}

/** Una de las dos claves de la suscripción, ya en base64url. */
function claveDeLaSuscripcion(
  suscripcion: PushSubscription,
  cual: "p256dh" | "auth",
): string | null {
  const bytes = suscripcion.getKey(cual);

  if (bytes === null) return null;

  const binario = String.fromCharCode(...new Uint8Array(bytes));

  return window.btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Un nombre corto para que la persona reconozca el dispositivo el día
 * que haya una pantalla de «mis dispositivos». Del user-agent solo
 * interesan el navegador y el sistema; lo demás es ruido.
 */
function comoSeLlamaEsteDispositivo(): string {
  const identificacion = navigator.userAgent;

  const navegador =
    /Edg\//.test(identificacion) ? "Edge"
    : /OPR\//.test(identificacion) ? "Opera"
    : /Firefox\//.test(identificacion) ? "Firefox"
    : /Chrome\//.test(identificacion) ? "Chrome"
    : /Safari\//.test(identificacion) ? "Safari"
    : "Navegador";

  const sistema =
    /Android/.test(identificacion) ? "Android"
    : /iPhone|iPad|iPod/.test(identificacion) ? "iPhone o iPad"
    : /Mac OS X/.test(identificacion) ? "Mac"
    : /Windows/.test(identificacion) ? "Windows"
    : /Linux/.test(identificacion) ? "Linux"
    : "";

  return sistema === "" ? navegador : `${navegador} en ${sistema}`;
}

/** ¿Este navegador tiene las tres piezas que hacen falta? */
function elNavegadorLoAdmite(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function useAvisosEnElMovil(): {
  estado: EstadoDeLosAvisos;
  /** Cómo se llama este dispositivo, para enseñarlo en pantalla. */
  nombreDelDispositivo: string;
  estaTrabajando: boolean;
  pedirPermisoYSuscribir: () => Promise<void>;
  dejarDeRecibir: () => Promise<void>;
} {
  const [estado, establecerEstado] = useState<EstadoDeLosAvisos>("comprobando");
  const [estaTrabajando, establecerEstaTrabajando] = useState(false);

  /**
   * Guarda la suscripción del navegador en el servidor.
   *
   * Se usa igual al aceptar por primera vez que al reconfirmar una que
   * ya existía, para que la forma de los datos se arme en un solo sitio.
   */
  const registrarEnElServidor = useCallback(async (suscripcion: PushSubscription) => {
    const p256dh = claveDeLaSuscripcion(suscripcion, "p256dh");
    const auth = claveDeLaSuscripcion(suscripcion, "auth");

    if (p256dh === null || auth === null) {
      throw new Error("El navegador no entregó las claves de la suscripción.");
    }

    await guardarSuscripcionDePush({
      endpoint: suscripcion.endpoint,
      p256dh,
      auth,
      dispositivo: comoSeLlamaEsteDispositivo(),
    });
  }, []);

  /* ---------------------------------------------------------------- */
  /* En qué punto estamos, al entrar                                  */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!elNavegadorLoAdmite()) {
      establecerEstado("noDisponible");

      return;
    }

    let sigueMontado = true;

    void (async () => {
      try {
        const configuracion = await obtenerConfiguracionDelPush();

        if (!sigueMontado) return;

        // El servidor no tiene claves VAPID: no hay nada que ofrecer, y
        // pedir permiso para unos avisos que nunca llegarían sería
        // quemar el único intento que da el navegador.
        if (!configuracion.activo) {
          establecerEstado("noDisponible");

          return;
        }

        if (Notification.permission === "denied") {
          establecerEstado("bloqueados");

          return;
        }

        if (Notification.permission !== "granted") {
          establecerEstado("sinDecidir");

          return;
        }

        // Ya dijo que sí alguna vez. Se vuelve a registrar lo que tenga
        // el navegador ahora mismo: puede haber renovado la suscripción
        // por su cuenta, y si el servidor guarda la vieja, a este
        // dispositivo no le llega nada aunque todo parezca correcto.
        const registro = await navigator.serviceWorker.ready;
        const yaSuscrito = await registro.pushManager.getSubscription();

        if (!sigueMontado) return;

        if (yaSuscrito === null) {
          // Permiso dado pero sin suscripción: pasa al limpiar los datos
          // del sitio. Se puede rehacer sin volver a preguntar nada.
          establecerEstado("sinDecidir");

          return;
        }

        await registrarEnElServidor(yaSuscrito);

        if (sigueMontado) establecerEstado("activos");
      } catch {
        // Sin red o con el servidor caído no se sabe: se deja como no
        // disponible en vez de ofrecer algo que ahora no funcionaría.
        if (sigueMontado) establecerEstado("noDisponible");
      }
    })();

    return () => {
      sigueMontado = false;
    };
  }, [registrarEnElServidor]);

  /* ---------------------------------------------------------------- */
  /* Aceptar                                                          */
  /* ---------------------------------------------------------------- */

  const pedirPermisoYSuscribir = useCallback(async () => {
    establecerEstaTrabajando(true);

    try {
      const configuracion = await obtenerConfiguracionDelPush();

      if (!configuracion.activo || configuracion.clavePublica === null) {
        establecerEstado("noDisponible");

        return;
      }

      // AQUÍ es donde el navegador enseña su diálogo, y solo aquí:
      // detrás de un botón que la persona acaba de pulsar.
      const respuesta = await Notification.requestPermission();

      if (respuesta !== "granted") {
        establecerEstado(respuesta === "denied" ? "bloqueados" : "sinDecidir");

        return;
      }

      const registro = await navigator.serviceWorker.ready;

      const suscripcion =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({
          // Obligatorio: el navegador no admite suscripciones que no
          // acaben enseñando un aviso a la persona.
          userVisibleOnly: true,
          applicationServerKey: comoBytes(configuracion.clavePublica),
        }));

      await registrarEnElServidor(suscripcion);

      establecerEstado("activos");
    } catch (error) {
      avisarDeError(error, "No se pudieron activar los avisos en este dispositivo");
    } finally {
      establecerEstaTrabajando(false);
    }
  }, [registrarEnElServidor]);

  /* ---------------------------------------------------------------- */
  /* Dejar de recibir                                                 */
  /* ---------------------------------------------------------------- */

  const dejarDeRecibir = useCallback(async () => {
    establecerEstaTrabajando(true);

    try {
      const registro = await navigator.serviceWorker.ready;
      const suscripcion = await registro.pushManager.getSubscription();

      if (suscripcion !== null) {
        // Primero el servidor: si se cancelara antes en el navegador y
        // la llamada fallase, quedaría una dirección muerta a la que se
        // seguiría intentando escribir.
        await borrarSuscripcionDePush(suscripcion.endpoint);
        await suscripcion.unsubscribe();
      }

      // El permiso del navegador sigue dado; solo dejamos de usarlo. Así
      // volver a activarlo no vuelve a pasar por el diálogo.
      establecerEstado("sinDecidir");
    } catch (error) {
      avisarDeError(error, "No se pudieron desactivar los avisos");
    } finally {
      establecerEstaTrabajando(false);
    }
  }, []);

  return {
    estado,
    nombreDelDispositivo: elNavegadorLoAdmite() ? comoSeLlamaEsteDispositivo() : "",
    estaTrabajando,
    pedirPermisoYSuscribir,
    dejarDeRecibir,
  };
}
