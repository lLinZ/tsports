/**
 * providers/ProveedorAplicacion.tsx
 * ---------------------------------------------------------------------
 * El panel como aplicación instalada: el service worker, el aviso de
 * versión nueva, la invitación a instalarla y lo que pasa al pulsar un
 * aviso en el móvil.
 *
 * TRES DECISIONES QUE NO SE VEN EN EL CÓDIGO
 *
 * 1. EL SERVICE WORKER SOLO SE REGISTRA CON SESIÓN INICIADA. La raíz del
 *    dominio es la web de la agencia y la visita cualquiera: a un
 *    visitante no hay que ofrecerle instalar un CRM ni descargarle el
 *    armazón entero en segundo plano. Se registra al entrar al panel.
 *
 * 2. Y NUNCA EN DESARROLLO. Una caché por delante del servidor de Vite
 *    devuelve el fichero de hace diez minutos y hace pensar que el
 *    cambio que se acaba de guardar no funciona.
 *
 * 3. LA VERSIÓN NUEVA NO ENTRA SOLA. Se queda esperando y se avisa; la
 *    aplica la persona cuando le viene bien. Cambiar los ficheros por
 *    debajo de una pestaña abierta rompe la navegación de quien está a
 *    mitad de un formulario, y es un fallo que además parece aleatorio.
 *
 * EL EVENTO DE INSTALACIÓN SE CAZA AL CARGAR EL MÓDULO, no dentro de un
 * efecto. Chrome lanza `beforeinstallprompt` en cuanto la página cumple
 * los requisitos, y eso puede pasar antes de que el proveedor se monte
 * —que espera a que el servidor confirme la sesión—. Si nadie lo
 * escucha en ese momento, el evento se pierde y el botón de instalar no
 * aparece en toda la sesión.
 * ---------------------------------------------------------------------
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { useSesion } from "@/providers/ProveedorSesion";

/**
 * El evento que Chrome y Edge lanzan cuando la aplicación se puede
 * instalar. No está en las definiciones del DOM porque no es estándar:
 * Safari no lo tiene (en iPhone se instala desde el menú de compartir).
 */
interface EventoDeInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Cada cuánto se le pregunta al servidor si hay una versión nueva. */
const CADA_CUANTO_SE_BUSCA_VERSION_MS = 30 * 60 * 1000;

/* ==================================================================== */
/* Caza del evento de instalación, antes de que React arranque          */
/* ==================================================================== */

let invitacionAInstalar: EventoDeInstalacion | null = null;

/** Se avisa a quien esté montado; si no hay nadie, el evento espera. */
let alLlegarLaInvitacion: (() => void) | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (evento) => {
    // Sin esto, Chrome enseña su propia barra de instalación abajo.
    // Preferimos ofrecerlo en la barra lateral, junto al resto.
    evento.preventDefault();

    invitacionAInstalar = evento as EventoDeInstalacion;
    alLlegarLaInvitacion?.();
  });
}

/** ¿Se está viendo ya como aplicación y no dentro del navegador? */
function estaAbiertaComoAplicacion(): boolean {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Lo de iOS, que es anterior al estándar.
    ("standalone" in window.navigator && window.navigator.standalone === true)
  );
}

/** iPhone y iPad: no hay evento de instalación, hay que explicar cómo. */
function esUnDispositivoDeApple(): boolean {
  if (typeof window === "undefined") return false;

  const identificacion = window.navigator.userAgent;

  return (
    /iPad|iPhone|iPod/.test(identificacion) ||
    // Un iPad moderno se presenta como un Mac; se distingue porque el
    // Mac de verdad no tiene pantalla táctil.
    (identificacion.includes("Macintosh") && window.navigator.maxTouchPoints > 1)
  );
}

/* ==================================================================== */
/* El contexto                                                          */
/* ==================================================================== */

interface ValorDelContextoDeAplicacion {
  /** Hay una versión nueva instalada, esperando a que se recargue. */
  hayVersionNueva: boolean;
  /** Aplica la versión nueva y recarga. Lo llama el aviso. */
  aplicarLaVersionNueva: () => void;

  /** Se puede ofrecer el botón de instalar (Chrome, Edge, Android). */
  sePuedeInstalar: boolean;
  /** Abre el diálogo del navegador. Devuelve si la persona aceptó. */
  instalar: () => Promise<boolean>;

  /** Ya está instalada y abierta como aplicación. */
  estaAbiertaComoAplicacion: boolean;
  /** Es un iPhone o un iPad: se instala a mano y hay que explicarlo. */
  seInstalaAMano: boolean;
}

const ContextoDeAplicacion = createContext<ValorDelContextoDeAplicacion | null>(null);

export function ProveedorAplicacion({ children }: { children: ReactNode }) {
  const { estadoDeLaSesion } = useSesion();
  const navegar = useNavigate();
  const haySesion = estadoDeLaSesion === "conSesion";

  const [hayVersionNueva, establecerHayVersionNueva] = useState(false);
  const [registro, establecerRegistro] = useState<ServiceWorkerRegistration | null>(null);
  const [sePuedeInstalar, establecerSePuedeInstalar] = useState(invitacionAInstalar !== null);

  /* ---------------------------------------------------------------- */
  /* Invitación a instalar                                            */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    // Puede haber llegado antes de montarse esto (ver la cabecera).
    establecerSePuedeInstalar(invitacionAInstalar !== null);

    alLlegarLaInvitacion = () => establecerSePuedeInstalar(true);

    const alQuedarInstalada = () => {
      invitacionAInstalar = null;
      establecerSePuedeInstalar(false);
    };

    window.addEventListener("appinstalled", alQuedarInstalada);

    return () => {
      alLlegarLaInvitacion = null;
      window.removeEventListener("appinstalled", alQuedarInstalada);
    };
  }, []);

  const instalar = useCallback(async (): Promise<boolean> => {
    if (invitacionAInstalar === null) {
      return false;
    }

    await invitacionAInstalar.prompt();
    const decision = await invitacionAInstalar.userChoice;

    // El evento es de un solo uso: una vez contestado, el navegador no
    // deja volver a abrir el diálogo con el mismo.
    invitacionAInstalar = null;
    establecerSePuedeInstalar(false);

    return decision.outcome === "accepted";
  }, []);

  /* ---------------------------------------------------------------- */
  /* Registro del service worker                                      */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!haySesion || import.meta.env.DEV || !("serviceWorker" in navigator)) {
      return;
    }

    let sigueMontado = true;

    /** ¿Este trabajador es una versión nueva, o es la primera vez? */
    const esUnRecambio = (trabajador: ServiceWorker | null): boolean =>
      trabajador !== null && navigator.serviceWorker.controller !== null;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registroDelServicio) => {
        if (!sigueMontado) return;

        establecerRegistro(registroDelServicio);

        // Ya había una esperando de una visita anterior.
        if (esUnRecambio(registroDelServicio.waiting)) {
          establecerHayVersionNueva(true);
        }

        registroDelServicio.addEventListener("updatefound", () => {
          const entrante = registroDelServicio.installing;

          if (entrante === null) return;

          entrante.addEventListener("statechange", () => {
            // "installed" con un controlador ya en marcha significa
            // versión nueva lista; sin controlador es la primera
            // instalación, y de esa no hay que avisar a nadie.
            if (entrante.state === "installed" && esUnRecambio(entrante)) {
              establecerHayVersionNueva(true);
            }
          });
        });
      })
      .catch(() => {
        // Sin service worker la aplicación funciona igual, solo que sin
        // consulta sin conexión. No es motivo para molestar a nadie.
      });

    // Cuando el trabajador nuevo toma el mando, la página tiene que
    // recargarse para estrenar los ficheros. El guardia evita el bucle
    // de recargas si el navegador dispara el evento más de una vez.
    let yaSeEstaRecargando = false;

    const alCambiarElControlador = () => {
      if (yaSeEstaRecargando) return;

      yaSeEstaRecargando = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", alCambiarElControlador);

    return () => {
      sigueMontado = false;
      navigator.serviceWorker.removeEventListener("controllerchange", alCambiarElControlador);
    };
  }, [haySesion]);

  /* ---------------------------------------------------------------- */
  /* Al pulsar un aviso en el móvil                                   */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    // El service worker, al pulsarse un aviso, busca una pestaña abierta
    // y le pide que navegue ELLA en vez de recargarla. Así quien
    // estuviera a mitad de una ficha no pierde lo que tenía escrito.
    const alLlegarUnMensaje = (evento: MessageEvent) => {
      if (evento.data?.tipo === "abrir-aviso" && typeof evento.data.enlace === "string") {
        navegar(evento.data.enlace);
      }
    };

    navigator.serviceWorker.addEventListener("message", alLlegarUnMensaje);

    return () => {
      navigator.serviceWorker.removeEventListener("message", alLlegarUnMensaje);
    };
  }, [navegar]);

  /* ---------------------------------------------------------------- */
  /* Búsqueda periódica de versiones                                  */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (registro === null) {
      return;
    }

    const buscar = () => {
      void registro.update().catch(() => {
        /* Sin red no hay nada que buscar; se reintenta a la siguiente. */
      });
    };

    // Al volver a la pestaña, porque es cuando la persona va a empezar a
    // trabajar y es el mejor momento para enterarse.
    const alVolverALaPestana = () => {
      if (document.visibilityState === "visible") buscar();
    };

    const reloj = window.setInterval(buscar, CADA_CUANTO_SE_BUSCA_VERSION_MS);

    document.addEventListener("visibilitychange", alVolverALaPestana);

    return () => {
      window.clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolverALaPestana);
    };
  }, [registro]);

  const aplicarLaVersionNueva = useCallback(() => {
    const esperando = registro?.waiting;

    if (!esperando) {
      // No debería pasar, pero si el trabajador que esperaba ya no está,
      // recargar es lo que la persona esperaba de todos modos.
      window.location.reload();

      return;
    }

    // El service worker contesta a esto saliendo de la espera; al tomar
    // el mando salta "controllerchange" y la página se recarga sola.
    esperando.postMessage({ tipo: "aplicar-la-version-nueva" });
  }, [registro]);

  const valorDelContexto = useMemo<ValorDelContextoDeAplicacion>(
    () => ({
      hayVersionNueva,
      aplicarLaVersionNueva,
      sePuedeInstalar,
      instalar,
      estaAbiertaComoAplicacion: estaAbiertaComoAplicacion(),
      seInstalaAMano: esUnDispositivoDeApple(),
    }),
    [hayVersionNueva, aplicarLaVersionNueva, sePuedeInstalar, instalar],
  );

  return (
    <ContextoDeAplicacion.Provider value={valorDelContexto}>
      {children}
    </ContextoDeAplicacion.Provider>
  );
}

/** Acceso al estado de la aplicación instalada desde cualquier pantalla. */
export function useAplicacion(): ValorDelContextoDeAplicacion {
  const contexto = useContext(ContextoDeAplicacion);

  if (contexto === null) {
    throw new Error("useAplicacion debe usarse dentro de <ProveedorAplicacion>.");
  }

  return contexto;
}
