/**
 * api/clienteHttp.ts
 * ---------------------------------------------------------------------
 * El único punto por el que el frontend habla con la API.
 *
 * Se encarga de cuatro cosas que, si se hicieran en cada pantalla,
 * acabarían escritas de cuatro maneras distintas:
 *
 *   1. Añadir el token de sesión a cada petición.
 *   2. Convertir cualquier error en un objeto con un mensaje legible,
 *      ya en español, listo para enseñar en un aviso.
 *   3. Detectar el token caducado (401) y devolver al login sin dejar
 *      la aplicación colgada en una pantalla vacía.
 *   4. Guardar y recuperar el token de forma consistente.
 * ---------------------------------------------------------------------
 */
import axios, { AxiosError } from "axios";

/** Clave con la que se guarda el token de sesión en el navegador. */
const CLAVE_DEL_TOKEN = "tsports:token";

/**
 * Base de la API. En desarrollo Vite redirige /api al Laravel local
 * (ver vite.config.ts) y en producción nginx hace lo mismo, así que en
 * ambos casos vale una ruta relativa y no hay que configurar dominios.
 */
const RUTA_BASE_DE_LA_API = "/api";

export const clienteHttp = axios.create({
  baseURL: RUTA_BASE_DE_LA_API,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  // Si el servidor no responde en 20 segundos, algo va mal: mejor un
  // error claro que una rueda girando para siempre.
  timeout: 20_000,
});

/* ==================================================================== */
/* Gestión del token                                                    */
/* ==================================================================== */

export function leerTokenGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE_DEL_TOKEN);
  } catch {
    // Navegación privada con almacenamiento bloqueado: se trabaja sin
    // recordar la sesión, pero la aplicación no se rompe.
    return null;
  }
}

export function guardarToken(token: string): void {
  try {
    localStorage.setItem(CLAVE_DEL_TOKEN, token);
  } catch {
    /* Si no se puede guardar, la sesión durará solo esta pestaña. */
  }
}

export function borrarToken(): void {
  try {
    localStorage.removeItem(CLAVE_DEL_TOKEN);
  } catch {
    /* Nada que limpiar. */
  }
}

/* ==================================================================== */
/* Interceptores                                                        */
/* ==================================================================== */

// Salida: se adjunta el token si hay sesión.
clienteHttp.interceptors.request.use((configuracion) => {
  const tokenDeSesion = leerTokenGuardado();

  if (tokenDeSesion) {
    configuracion.headers.Authorization = `Bearer ${tokenDeSesion}`;
  }

  return configuracion;
});

/**
 * Se avisa a la aplicación cuando el servidor rechaza el token, para que
 * el proveedor de sesión limpie el estado y muestre el login. Se hace
 * con un callback y no importando el contexto de React para no crear una
 * dependencia circular entre la capa de red y la de interfaz.
 */
type ManejadorDeSesionCaducada = () => void;

let alCaducarLaSesion: ManejadorDeSesionCaducada | null = null;

export function registrarManejadorDeSesionCaducada(
  manejador: ManejadorDeSesionCaducada,
): void {
  alCaducarLaSesion = manejador;
}

/**
 * Error de la API ya traducido: siempre tiene un mensaje que se puede
 * mostrar tal cual, y opcionalmente el detalle por campo de un 422.
 */
export interface ErrorDeApi {
  mensaje: string;
  codigoHttp: number | null;
  erroresPorCampo: Record<string, string[]>;
  /** Solo en desarrollo: el mensaje técnico original. */
  detalleTecnico?: string;
}

/** Forma del cuerpo de error que devuelve el backend (ver bootstrap/app.php). */
interface CuerpoDeErrorDelBackend {
  mensaje?: string;
  message?: string;
  errores?: Record<string, string[]>;
  errors?: Record<string, string[]>;
  detalleTecnico?: string;
}

// Entrada: se normaliza cualquier fallo a un ErrorDeApi.
clienteHttp.interceptors.response.use(
  (respuesta) => respuesta,
  (error: AxiosError<CuerpoDeErrorDelBackend>) => {
    const codigoHttp = error.response?.status ?? null;
    const cuerpo = error.response?.data;

    // Token caducado o revocado: se limpia la sesión.
    if (codigoHttp === 401) {
      borrarToken();
      alCaducarLaSesion?.();
    }

    const errorTraducido: ErrorDeApi = {
      mensaje: elegirMensajeDeError(error, cuerpo, codigoHttp),
      codigoHttp,
      erroresPorCampo: cuerpo?.errores ?? cuerpo?.errors ?? {},
      detalleTecnico: cuerpo?.detalleTecnico,
    };

    return Promise.reject(errorTraducido);
  },
);

/**
 * Decide qué texto se le enseña a la persona. El orden importa: primero
 * lo que diga el servidor (que conoce el caso concreto) y solo si no hay
 * nada, un mensaje genérico según el tipo de fallo.
 */
function elegirMensajeDeError(
  error: AxiosError,
  cuerpo: CuerpoDeErrorDelBackend | undefined,
  codigoHttp: number | null,
): string {
  const mensajeDelServidor = cuerpo?.mensaje ?? cuerpo?.message;

  if (mensajeDelServidor) {
    return mensajeDelServidor;
  }

  if (error.code === "ECONNABORTED") {
    return "El servidor tardó demasiado en responder. Comprueba tu conexión e inténtalo otra vez.";
  }

  // Sin respuesta: el servidor no está en marcha o no hay red.
  if (codigoHttp === null) {
    return "No se pudo contactar con el servidor. Comprueba tu conexión a internet.";
  }

  return "No se pudo completar la operación. Vuelve a intentarlo.";
}

/**
 * ¿Este objeto es un error ya traducido de la API? Sirve para
 * distinguirlo de un fallo de programación en un bloque catch.
 */
export function esErrorDeApi(valor: unknown): valor is ErrorDeApi {
  return (
    typeof valor === "object" &&
    valor !== null &&
    "mensaje" in valor &&
    "codigoHttp" in valor
  );
}

/** Extrae un mensaje legible de cualquier cosa que llegue a un catch. */
export function mensajeDeError(error: unknown): string {
  if (esErrorDeApi(error)) {
    return error.mensaje;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrió un error inesperado.";
}
