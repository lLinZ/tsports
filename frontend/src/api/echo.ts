/**
 * api/echo.ts
 * ---------------------------------------------------------------------
 * El cliente del tiempo real: Echo sobre el WebSocket de Reverb.
 *
 * DÓNDE CONECTA. Contra el mismo origen de la página, en la ruta /app/.
 * En el VPS la reenvía nginx al Reverb de esa instalación, y en local
 * lo hace el proxy de Vite. Es el mismo truco que con /api: el cliente
 * no sabe de hosts ni de puertos, y por eso un mismo build sirve para
 * producción y para test.tsports.tech, cada uno con su propio Reverb.
 *
 * CON QUÉ CLAVE. La pide al servidor (GET /api/tiempo-real) en vez de
 * llevarla compilada: así vive solo en backend/.env. El porqué, en
 * TiempoRealController.
 *
 * CÓMO SE AUTORIZA. Los canales privados se autorizan con `clienteHttp`
 * —y con él viajan el Authorization: Bearer y el aviso de sesión
 * caducada— en vez de con la petición que pusher-js hace de fábrica, que
 * va sin token porque está pensada para cookie de sesión. Sin este paso
 * la suscripción da 403 sin explicar por qué. La ruta es
 * /api/broadcasting/auth, declarada en backend/bootstrap/app.php.
 *
 * Quien abre y cierra la conexión es ProveedorTiempoReal.
 * ---------------------------------------------------------------------
 */
import Echo from "laravel-echo";
import Pusher from "pusher-js";
import type {
  ChannelAuthorizationCallback,
  ChannelAuthorizationRequestParams,
} from "pusher-js/types/src/core/auth/options";
import { clienteHttp, mensajeDeError } from "@/api/clienteHttp";
import type {
  ConfiguracionDeTiempoReal,
  PanelDeTiempoReal,
  ResultadoDelAvisoDePrueba,
} from "@/tipos/modelos";

/** Si el servidor tiene el tiempo real encendido y con qué clave se entra. */
export async function obtenerConfiguracionDeTiempoReal(): Promise<ConfiguracionDeTiempoReal> {
  const { data } = await clienteHttp.get<ConfiguracionDeTiempoReal>("/tiempo-real");

  return data;
}

/* ==================================================================== */
/* Pantalla de pruebas del administrador                                */
/* ==================================================================== */

/** El equipo, con quién tiene ahora mismo el panel abierto. Solo admin. */
export async function obtenerPanelDeTiempoReal(): Promise<PanelDeTiempoReal> {
  const { data } = await clienteHttp.get<PanelDeTiempoReal>("/admin/tiempo-real");

  return data;
}

/**
 * Manda un aviso de prueba. `destinatario` es el id de una persona o
 * "todos" (el equipo activo). Título y mensaje vacíos dejan el texto de
 * siempre del aviso de prueba.
 */
export async function enviarAvisoDePrueba(datos: {
  destinatario: string;
  titulo: string;
  mensaje: string;
}): Promise<ResultadoDelAvisoDePrueba> {
  const { data } = await clienteHttp.post<ResultadoDelAvisoDePrueba>(
    "/admin/tiempo-real/prueba",
    datos,
  );

  return data;
}

function autorizarCanal(
  parametros: ChannelAuthorizationRequestParams,
  callback: ChannelAuthorizationCallback,
): void {
  clienteHttp
    .post("/broadcasting/auth", {
      socket_id: parametros.socketId,
      channel_name: parametros.channelName,
    })
    .then((respuesta) => callback(null, respuesta.data))
    // clienteHttp rechaza con un ErrorDeApi, que no es un Error: sin
    // extraer el mensaje, pusher-js registraría "[object Object]".
    .catch((error: unknown) => callback(new Error(mensajeDeError(error)), null));
}

/**
 * Crea un cliente conectado a la instalación desde la que se sirve la
 * página. Empieza a conectar en cuanto se crea.
 */
export function crearClienteDeEcho(claveDeReverb: string) {
  const vaPorHttps = window.location.protocol === "https:";
  // Sin puerto en la barra de direcciones, el del esquema.
  const puertoDeLaPagina = Number(window.location.port) || (vaPorHttps ? 443 : 80);

  return new Echo({
    broadcaster: "reverb",
    Pusher,
    key: claveDeReverb,
    wsHost: window.location.hostname,
    wsPort: puertoDeLaPagina,
    wssPort: puertoDeLaPagina,
    forceTLS: vaPorHttps,
    // Solo WebSocket: sin esto, pusher-js probaría a caer a sondeo por
    // HTTP, que Reverb no ofrece, y tardaría más en dar la conexión por
    // perdida.
    enabledTransports: ["ws", "wss"],
    channelAuthorization: {
      customHandler: autorizarCanal,
    },
  });
}
