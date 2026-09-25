/**
 * providers/ProveedorDatosGuardados.tsx
 * ---------------------------------------------------------------------
 * La copia de los datos que permite consultar el CRM sin conexión.
 *
 * Guarda en el navegador lo que TanStack Query ya tiene en memoria y lo
 * devuelve al arrancar, de modo que en una reunión sin cobertura el
 * panel enseñe lo último que se vio en vez de una pantalla en blanco.
 *
 * SOLO LECTURA, Y A PROPÓSITO. No se guarda ninguna escritura pendiente
 * ni se reintenta nada al volver la red. Escribir sin conexión y
 * sincronizar después es otra liga —hay que resolver dos personas
 * editando la misma marca— y no compensa para lo que esto resuelve.
 *
 * POR QUÉ AQUÍ Y NO EN EL SERVICE WORKER
 *
 * Lo fácil habría sido que el service worker guardase las respuestas de
 * `/api`. No se hace, y es la regla dura de `sw/servicio.js`:
 *
 *   · Una caché de red no sabe de quién son los datos. El armazón es el
 *     mismo para todos, pero la lista de marcas NO: un agente solo ve
 *     las suyas (regla 6). Con las respuestas guardadas por dirección,
 *     dos personas en el mismo ordenador se verían los datos.
 *   · Tampoco sabe cuándo dejan de valer, ni puede decir en pantalla de
 *     cuándo son.
 *
 * Aquí las dos cosas se resuelven: la copia lleva el id de la persona en
 * la clave, se borra al cerrar sesión, caduca sola y se sabe la fecha,
 * que es lo que enseña el indicador de la barra superior.
 *
 * UNA CONSULTA PUEDE QUEDARSE FUERA con `meta: { sinCopiaLocal: true }`.
 * La llevan el chat, que se refresca cada pocos segundos y obligaría a
 * volver a escribir la copia entera en cada vuelta, y el reporte de
 * bitácora, que puede ocupar más que todo lo demás junto y se pide a
 * propósito, no se consulta de paso. También la configuración del
 * tiempo real: sin conexión no hay WebSocket que abrir, y restaurada
 * dejaba el panel con el tiempo real apagado después de encenderlo en
 * el servidor (ver ProveedorTiempoReal).
 * ---------------------------------------------------------------------
 */
import {
  dehydrate,
  hydrate,
  useQueryClient,
  type DehydratedState,
} from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** De cuándo son los datos restaurados, para quien quiera enseñarlo. */
const ContextoDeLaCopia = createContext<number | null>(null);

/** Prefijo de la clave; detrás va el id de la persona. */
const PREFIJO_DE_LA_CLAVE = "tsports:datos:";

/**
 * Pasada una semana, la copia se descarta sin mirarla. Un tablero de
 * hace un mes no es una ayuda: es una foto vieja que parece actual.
 */
const DIAS_QUE_VALE_LA_COPIA = 7;

/** ¿Esta consulta pidió no guardarse? Ver la cabecera del fichero. */
function seQuedaFueraDeLaCopia(meta: Record<string, unknown> | undefined): boolean {
  return meta?.sinCopiaLocal === true;
}

/** Cuánto se espera tras el último cambio antes de escribir en disco. */
const ESPERA_ANTES_DE_GUARDAR_MS = 1500;

/** La forma de lo que se escribe en el navegador. */
interface CopiaGuardada {
  /**
   * DE CUÁNDO SON LOS DATOS, no cuándo se escribió el fichero.
   *
   * Es la última vez que alguna de estas consultas habló con el
   * servidor. La distinción no es una sutileza: la copia se reescribe
   * cada vez que cambia algo en memoria, incluso al restaurarla, así
   * que con la hora de escritura una copia de ayer diría «hace unos
   * segundos» en cuanto se abriese la aplicación — justo la mentira que
   * este número existe para evitar.
   */
  datosDe: number;
  /** Lo que devuelve `dehydrate`; su forma es cosa de TanStack Query. */
  datos: DehydratedState;
}

/** La última vez que alguna de estas consultas habló con el servidor. */
function cuandoSeTrajeronLosDatos(datos: DehydratedState): number {
  return datos.queries.reduce(
    (masReciente, consulta) => Math.max(masReciente, consulta.state.dataUpdatedAt),
    0,
  );
}

export function claveDeLaCopia(idDeLaPersona: string): string {
  return `${PREFIJO_DE_LA_CLAVE}${idDeLaPersona}`;
}

/**
 * Borra las copias de TODAS las personas.
 *
 * Se llama al cerrar sesión y cuando el servidor rechaza el token. Se
 * borran todas y no solo la de quien sale porque el caso que preocupa es
 * justo el ordenador compartido: si alguien cierra sesión y entra otro,
 * en el disco no debe quedar nada del anterior.
 */
export function borrarLasCopiasDeDatos(): void {
  try {
    const claves = Object.keys(localStorage).filter((clave) =>
      clave.startsWith(PREFIJO_DE_LA_CLAVE),
    );

    for (const clave of claves) {
      localStorage.removeItem(clave);
    }
  } catch {
    /* Almacenamiento bloqueado: no había nada que borrar. */
  }
}

/** Lee la copia de esta persona, si existe y no ha caducado. */
function leerLaCopia(idDeLaPersona: string): CopiaGuardada | null {
  try {
    const crudo = localStorage.getItem(claveDeLaCopia(idDeLaPersona));

    if (crudo === null) return null;

    const copia = JSON.parse(crudo) as CopiaGuardada;
    const edadEnDias = (Date.now() - copia.datosDe) / 86_400_000;

    if (edadEnDias > DIAS_QUE_VALE_LA_COPIA) {
      localStorage.removeItem(claveDeLaCopia(idDeLaPersona));

      return null;
    }

    // Una copia sin nada dentro no es una copia. Se escriben así cuando
    // se entra con el servidor caído: ninguna consulta llega a
    // completarse y no hay nada que guardar. Tratarla como buena haría
    // que el aviso dijese «lo que ves se guardó hace un rato» sobre una
    // pantalla vacía.
    if (copia.datos.queries.length === 0) {
      return null;
    }

    return copia;
  } catch {
    // JSON roto o almacenamiento bloqueado. Se empieza de cero, que es
    // exactamente lo que pasaba antes de que esto existiera.
    return null;
  }
}

/**
 * Guarda la copia de los datos de esta persona.
 *
 * Restaurar tiene que ser SÍNCRONO y antes del primer renderizado: si se
 * hiciera en un efecto, las pantallas ya habrían pedido sus datos con la
 * caché vacía y se vería el esqueleto de carga igualmente. Por eso el
 * componente se remonta al cambiar de persona (`key`) y restaura dentro
 * del inicializador del estado, que corre antes que sus hijos.
 */
export function ProveedorDatosGuardados({
  idDeLaPersona,
  children,
}: {
  idDeLaPersona: string;
  children: ReactNode;
}) {
  const clienteDeConsultas = useQueryClient();
  const temporizador = useRef<number | null>(null);

  // Restauración, una sola vez, antes de que los hijos se monten.
  const [datosDe] = useState<number | null>(() => {
    const copia = leerLaCopia(idDeLaPersona);

    if (copia === null) return null;

    try {
      hydrate(clienteDeConsultas, copia.datos);
    } catch {
      return null;
    }

    return copia.datosDe;
  });

  useEffect(() => {
    const cache = clienteDeConsultas.getQueryCache();

    const guardar = () => {
      try {
        const datos = dehydrate(clienteDeConsultas, {
          // Solo lo que salió bien. Guardar un error lo revive en el
          // arranque siguiente y hace pensar que el servidor falla.
          shouldDehydrateQuery: (consulta) =>
            consulta.state.status === "success" && !seQuedaFueraDeLaCopia(consulta.meta),
          // Ninguna escritura, ni siquiera las que quedaron en pausa:
          // esto es para consultar, no para sincronizar después.
          shouldDehydrateMutation: () => false,
        });

        // Sin nada que guardar no se pisa lo que ya hubiera. Si no,
        // entrar un momento con el servidor caído borraría la copia
        // buena justo cuando más falta hace.
        if (datos.queries.length === 0) {
          return;
        }

        const copia: CopiaGuardada = { datosDe: cuandoSeTrajeronLosDatos(datos), datos };

        localStorage.setItem(claveDeLaCopia(idDeLaPersona), JSON.stringify(copia));
      } catch {
        // Lo normal aquí es quedarse sin espacio. Se tira la copia a
        // medias —una copia incompleta miente más que ninguna— y se
        // vuelve a intentar en el siguiente cambio, que ya será otro
        // tamaño.
        try {
          localStorage.removeItem(claveDeLaCopia(idDeLaPersona));
        } catch {
          /* Nada más que hacer. */
        }
      }
    };

    // Se escribe cuando amaina, no en cada cambio: cargar el tablero
    // dispara decenas de avisos seguidos y serializarlo en todos ellos
    // se notaría al desplazarse.
    const desuscribir = cache.subscribe((evento) => {
      // Lo que no se guarda tampoco dispara el guardado: si no, el
      // refresco del chat reescribiría la copia cada pocos segundos.
      if (seQuedaFueraDeLaCopia(evento.query.meta)) {
        return;
      }

      if (temporizador.current !== null) {
        window.clearTimeout(temporizador.current);
      }

      temporizador.current = window.setTimeout(guardar, ESPERA_ANTES_DE_GUARDAR_MS);
    });

    return () => {
      desuscribir();

      if (temporizador.current !== null) {
        window.clearTimeout(temporizador.current);
      }
    };
  }, [clienteDeConsultas, idDeLaPersona]);

  return (
    <ContextoDeLaCopia.Provider value={datosDe}>
      {children}
    </ContextoDeLaCopia.Provider>
  );
}

/**
 * De cuándo son los datos que se restauraron al arrancar, o null si se
 * arrancó sin copia.
 *
 * Lo lee el indicador de la barra superior para poder decirlo en
 * pantalla. Importa: un tablero de ayer que no avisa de que es de ayer
 * se toma por el de hoy, y aquí lo que se mira son importes y fechas de
 * campaña.
 */
export function useFechaDeLosDatos(): number | null {
  return useContext(ContextoDeLaCopia);
}
