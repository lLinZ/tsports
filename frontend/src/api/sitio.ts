/**
 * api/sitio.ts
 * ---------------------------------------------------------------------
 * El administrador de la web pública y el formulario de contacto.
 *
 * El contenido del sitio es un único documento JSON con todo lo
 * editable: colores, imágenes, textos en dos idiomas, servicios,
 * proyectos, equipo, aliados y datos de contacto. El panel lo edita
 * entero y lo publica de una vez, y el servidor guarda cada publicación
 * como una versión nueva para poder volver atrás.
 * ---------------------------------------------------------------------
 */
import { clienteHttp } from "@/api/clienteHttp";
import type {
  ContenidoDeLaWeb,
  LlaveDelCatalogo,
  MensajeDeContacto,
  PropiedadEnLaWeb,
  VersionDeContenido,
} from "@/tipos/modelos";

/* ==================================================================== */
/* Lectura pública (sin sesión)                                         */
/* ==================================================================== */

/** Lo que consume la web pública para pintarse. */
export async function obtenerContenidoPublico(): Promise<ContenidoDeLaWeb> {
  const { data } = await clienteHttp.get<{ contenido: ContenidoDeLaWeb }>(
    "/contenido-web",
  );

  return data.contenido;
}

/**
 * Si la web tiene catálogo que ofrecer: hay acceso de invitados y alguna
 * propiedad publicada. Decide si se pinta la sección y su enlace.
 */
export async function saberSiHayCatalogo(): Promise<boolean> {
  const { data } = await clienteHttp.get<{ hayCatalogo: boolean }>(
    "/propiedades-en-la-web/acceso",
  );

  return data.hayCatalogo;
}

/** El usuario y la contraseña de invitado, a cambio de la llave del catálogo. */
export async function entrarAlCatalogo(
  usuario: string,
  contrasena: string,
): Promise<LlaveDelCatalogo> {
  const { data } = await clienteHttp.post<LlaveDelCatalogo>(
    "/propiedades-en-la-web/entrar",
    { usuario, contrasena },
  );

  return data;
}

/**
 * El catálogo de propiedades de la web: las activas que el equipo marcó
 * como publicadas, con sus fotos para la web. Sin montos ni documentos.
 *
 * Pide la llave del invitado. Sin ella, o caducada, el servidor contesta
 * 403 (nunca 401, que aquí cerraría la sesión del panel).
 */
export async function obtenerPropiedadesDeLaWeb(llave: string): Promise<PropiedadEnLaWeb[]> {
  const { data } = await clienteHttp.get<{ data: PropiedadEnLaWeb[] }>(
    "/propiedades-en-la-web",
    { headers: { "X-Llave-Del-Catalogo": llave } },
  );

  return data.data;
}

/** Envía el formulario de contacto; crea un lead en el CRM. */
export async function enviarMensajeDeContacto(
  mensaje: MensajeDeContacto,
): Promise<string> {
  const { data } = await clienteHttp.post<{ mensaje: string }>(
    "/contacto",
    mensaje,
  );

  return data.mensaje;
}

/* ==================================================================== */
/* Edición desde el panel                                               */
/* ==================================================================== */

export interface ContenidoParaEditar {
  contenido: ContenidoDeLaWeb;
  versionId: number;
  actualizadoPor: string | null;
  actualizadoEn: string | null;
}

export async function obtenerContenidoParaEditar(): Promise<ContenidoParaEditar> {
  const { data } = await clienteHttp.get<ContenidoParaEditar>(
    "/admin/contenido-web",
  );

  return data;
}

/** Publica una versión nueva del contenido. Se ve al instante en la web. */
export async function publicarContenido(
  contenido: ContenidoDeLaWeb,
  notaDeCambio?: string,
): Promise<{ mensaje: string; contenido: ContenidoDeLaWeb }> {
  const { data } = await clienteHttp.put<{
    mensaje: string;
    contenido: ContenidoDeLaWeb;
  }>("/admin/contenido-web", { contenido, notaDeCambio });

  return data;
}

/** Historial de versiones, para poder restaurar una anterior. */
export async function obtenerHistorialDeContenido(): Promise<VersionDeContenido[]> {
  const { data } = await clienteHttp.get<{ versiones: VersionDeContenido[] }>(
    "/admin/contenido-web/historial",
  );

  return data.versiones;
}

export async function restaurarVersionDeContenido(
  idDeLaVersion: number,
): Promise<ContenidoDeLaWeb> {
  const { data } = await clienteHttp.post<{ contenido: ContenidoDeLaWeb }>(
    `/admin/contenido-web/restaurar/${idDeLaVersion}`,
  );

  return data.contenido;
}

/**
 * Devuelve la web al contenido de fábrica. No es destructivo: la versión
 * anterior queda en el historial y se puede recuperar.
 */
export async function restablecerContenidoDeFabrica(): Promise<ContenidoDeLaWeb> {
  const { data } = await clienteHttp.post<{ contenido: ContenidoDeLaWeb }>(
    "/admin/contenido-web/restablecer",
  );

  return data.contenido;
}
