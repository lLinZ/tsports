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

  // Sin conexión, una escritura no sale de aquí.
  //
  // El panel se puede CONSULTAR sin red (ver ProveedorDatosGuardados),
  // pero no escribir. Dejar salir el intento daría veinte segundos de
  // rueda girando y después un «no se pudo contactar con el servidor»,
  // y lo peor: nadie sabría si llegó a guardarse o no. Se corta aquí,
  // en el único sitio por el que pasan todas las peticiones, con un
  // mensaje que dice exactamente qué ha pasado.
  //
  // Solo se corta cuando el navegador afirma que NO hay red. Lo
  // contrario —que diga que sí— no garantiza nada (wifi de hotel,
  // cautivo), y por eso no se usa para nada más.
  const esUnaEscritura = (configuracion.method ?? "get").toLowerCase() !== "get";

  if (esUnaEscritura && typeof navigator !== "undefined" && navigator.onLine === false) {
    const sinConexion: ErrorDeApi = {
      mensaje:
        "Estás sin conexión. Esto no se ha guardado: vuelve a intentarlo cuando regrese la red.",
      codigoHttp: null,
      erroresPorCampo: {},
    };

    return Promise.reject(sinConexion);
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
    // Lo que ya viene traducido pasa de largo. Es el caso de la
    // escritura cortada por falta de red: axios encadena los fallos del
    // interceptor de salida aquí, y volver a traducir su mensaje lo
    // cambiaría por el genérico.
    if (esErrorDeApi(error)) {
      return Promise.reject(error);
    }

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

  // Sin respuesta: el servidor no está en marcha o no hay red. Si el
  // navegador confirma que no hay red, se dice eso y no se manda a
  // nadie a revisar una conexión que ya sabe que no tiene.
  if (codigoHttp === null) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return "Estás sin conexión. Se muestra lo último que se guardó en este dispositivo.";
    }

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

  // Sin error y sin datos. Pasa al abrir sin conexión una pantalla de la
  // que no hay copia guardada: TanStack Query deja la petición EN ESPERA
  // en vez de fallarla, así que no hay ningún error que contar, y sin
  // esto saldría un «ocurrió un error inesperado» que no ayuda a nadie.
  if (error === null || error === undefined) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return "Estás sin conexión y de esta pantalla no hay nada guardado en este dispositivo. Vuelve a abrirla cuando regrese la red.";
    }

    return "No hay nada que mostrar todavía.";
  }

  return "Ocurrió un error inesperado.";
}
