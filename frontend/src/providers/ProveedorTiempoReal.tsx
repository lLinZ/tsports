/**
 * providers/ProveedorTiempoReal.tsx
 * ---------------------------------------------------------------------
 * La conexión en vivo con el servidor: un WebSocket por pestaña, abierto
 * mientras haya sesión.
 *
 * Con sesión iniciada, pregunta al servidor si el tiempo real está
 * encendido y, si lo está, se suscribe al canal privado de la persona
 * (`usuario.{id}`, ver backend/routes/channels.php). Por ese canal llega
 * lo que es «para ti»: hoy, los avisos de prueba (del comando
 * `tiempo-real:probar` o de la pantalla «Tiempo real» del administrador);
 * con la Etapa 1, las notificaciones.
 *
 * Una pantalla que quiera enterarse de algo de ese canal usa
 * `useEventoPersonal`, que se suscribe mientras la pantalla está montada.
 *
 * El tiempo real es una mejora, no un requisito: si el servidor lo
 * tiene apagado o el demonio se cae, el panel funciona igual y solo deja
 * de enterarse al momento. Por eso ningún fallo de aquí se enseña como
 * error. Lo que sí se enseña es el ESTADO (IndicadorDeConexion), para
 * que nadie crea que no pasa nada cuando lo que pasa es que se cortó.
 *
 * La reconexión la hace pusher-js por su cuenta, con espera creciente
 * entre intentos: aquí solo se escucha cómo va.
 * ---------------------------------------------------------------------
 */
import { useQuery } from "@tanstack/react-query";
import type { Channel } from "laravel-echo";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  crearClienteDeEcho,
  obtenerConfiguracionDeTiempoReal,
} from "@/api/echo";
import { useSesion } from "@/providers/ProveedorSesion";
import { avisarDeInformacion } from "@/utilidades/avisos";
import type { AvisoDePrueba } from "@/tipos/modelos";

/**
 * · inactivo    → sin sesión, o el servidor no tiene tiempo real.
 * · conectando  → el primer intento de la sesión, aún sin desenlace.
 * · enVivo      → conectado Y suscrito al canal propio: los avisos llegan.
 * · sinConexion → se cortó, o no se pudo abrir. pusher-js sigue probando.
 */
export type EstadoDeLaConexion = "inactivo" | "conectando" | "enVivo" | "sinConexion";

interface ValorDelContextoDeTiempoReal {
  estadoDeLaConexion: EstadoDeLaConexion;
  /** El canal privado de la persona, o null mientras no está abierto. */
  canalPersonal: Channel | null;
}

/** Clave de la configuración en la caché de consultas. */
const CLAVE_DE_CONFIGURACION_DE_TIEMPO_REAL = ["tiempo-real"] as const;

const ContextoDeTiempoReal = createContext<ValorDelContextoDeTiempoReal | null>(null);

export function ProveedorTiempoReal({ children }: { children: ReactNode }) {
  const { estadoDeLaSesion, usuario } = useSesion();
  const haySesion = estadoDeLaSesion === "conSesion";
  const idDelUsuario = haySesion ? (usuario?.id ?? null) : null;

  const { data: configuracion } = useQuery({
    queryKey: CLAVE_DE_CONFIGURACION_DE_TIEMPO_REAL,
    queryFn: obtenerConfiguracionDeTiempoReal,
    enabled: haySesion,
    // La clave solo cambia si se reinstala Reverb: basta con pedirla
    // una vez por carga de la página.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    // Pero UNA vez por carga, sí o sí. Hasta el 2026-09-25 esta consulta
    // entraba en la copia sin conexión: el «apagado» de antes de encender
    // Reverb en producción se restauraba en cada arranque y, con el
    // staleTime infinito, no se volvía a preguntar nunca. El panel se
    // quedaba sin tiempo real aunque el servidor ya lo tuviera. El
    // `sinCopiaLocal` evita que se guarde; esto, que valga una copia
    // vieja que ya estuviera guardada.
    refetchOnMount: "always",
    meta: { sinCopiaLocal: true },
    // Si falla, el panel sigue sin tiempo real: no compensa insistir.
    retry: false,
  });

  const claveDeReverb = configuracion?.activo ? configuracion.clave : null;

  const [estadoDeLaConexion, establecerEstadoDeLaConexion] =
    useState<EstadoDeLaConexion>("inactivo");
  const [canalPersonal, establecerCanalPersonal] = useState<Channel | null>(null);

  useEffect(() => {
    if (idDelUsuario === null || claveDeReverb === null) {
      return;
    }

    const echo = crearClienteDeEcho(claveDeReverb);
    const conexion = echo.connector.pusher.connection;

    // «En vivo» exige las dos cosas: la conexión abierta no basta si el
    // servidor rechazó el canal, porque los avisos tampoco llegarían.
    let estaSuscrito = false;

    // Hasta el primer desenlace —en vivo o fallo— se está «conectando»;
    // después, todo lo que no sea en vivo es un corte. Sin esta
    // distinción, cada reintento de pusher-js haría saltar el indicador
    // de «sin conexión» a «conectando» y vuelta.
    let yaHuboDesenlace = false;

    const recalcularEstado = () => {
      if (conexion.state === "connected" && estaSuscrito) {
        yaHuboDesenlace = true;
        establecerEstadoDeLaConexion("enVivo");

        return;
      }

      if (conexion.state === "unavailable" || conexion.state === "failed") {
        yaHuboDesenlace = true;
      }

      establecerEstadoDeLaConexion(yaHuboDesenlace ? "sinConexion" : "conectando");
    };

    const alCambiarLaConexion = () => {
      // Al caerse la conexión, pusher-js da el canal por perdido y lo
      // vuelve a suscribir al reconectar: hasta esa nueva confirmación,
      // los avisos no llegan.
      if (conexion.state !== "connected") {
        estaSuscrito = false;
      }

      recalcularEstado();
    };

    conexion.bind("state_change", alCambiarLaConexion);

    const canal = echo
      .private(`usuario.${idDelUsuario}`)
      .subscribed(() => {
        estaSuscrito = true;
        recalcularEstado();
      })
      .error(() => {
        estaSuscrito = false;
        yaHuboDesenlace = true;
        recalcularEstado();
      })
      .listen(".prueba-de-conexion", (aviso: AvisoDePrueba) => {
        // Título y mensaje los pone quien lo manda desde la pantalla del
        // administrador; los del comando de artisan llegan vacíos.
        const texto =
          aviso.mensaje ?? "Este aviso ha llegado por el WebSocket, sin recargar la página.";

        avisarDeInformacion(
          aviso.titulo ?? "Tiempo real funcionando",
          aviso.enviadoPor ? `${texto} — ${aviso.enviadoPor}` : texto,
        );
      });

    establecerCanalPersonal(canal);
    recalcularEstado();

    return () => {
      conexion.unbind("state_change", alCambiarLaConexion);
      echo.leaveAllChannels();
      echo.disconnect();
      establecerCanalPersonal(null);
      establecerEstadoDeLaConexion("inactivo");
    };
  }, [idDelUsuario, claveDeReverb]);

  const valorDelContexto = useMemo<ValorDelContextoDeTiempoReal>(
    () => ({ estadoDeLaConexion, canalPersonal }),
    [estadoDeLaConexion, canalPersonal],
  );

  return (
    <ContextoDeTiempoReal.Provider value={valorDelContexto}>
      {children}
    </ContextoDeTiempoReal.Provider>
  );
}

/** Acceso al estado de la conexión en vivo desde cualquier componente. */
export function useTiempoReal(): ValorDelContextoDeTiempoReal {
  const contexto = useContext(ContextoDeTiempoReal);

  if (contexto === null) {
    throw new Error("useTiempoReal debe usarse dentro de <ProveedorTiempoReal>.");
  }

  return contexto;
}

/**
 * Escucha un evento del canal privado de la persona mientras el
 * componente esté montado, y deja de escucharlo al desmontarse.
 *
 * El nombre va con punto delante (`.prueba-de-conexion`): los eventos
 * llevan nombre propio en el servidor (broadcastAs), no el de su clase
 * PHP, y el punto le dice a Echo que no le añada el espacio de nombres.
 *
 * `alRecibir` puede ser una función nueva en cada render: se guarda en
 * una referencia para no volver a suscribirse cada vez.
 */
export function useEventoPersonal<Datos>(
  nombreDelEvento: string,
  alRecibir: (datos: Datos) => void,
): void {
  const { canalPersonal } = useTiempoReal();
  const alRecibirActual = useRef(alRecibir);

  useEffect(() => {
    alRecibirActual.current = alRecibir;
  });

  useEffect(() => {
    if (canalPersonal === null) {
      return;
    }

    // La misma función al suscribirse y al darse de baja: pusher-js la
    // busca por referencia para quitarla.
    const manejador = (datos: Datos) => alRecibirActual.current(datos);

    canalPersonal.listen(nombreDelEvento, manejador);

    return () => {
      canalPersonal.stopListening(nombreDelEvento, manejador);
    };
  }, [canalPersonal, nombreDelEvento]);
}
