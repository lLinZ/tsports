/**
 * api/sistema.ts
 * ---------------------------------------------------------------------
 * Lo transversal: catálogos, métricas del panel, subida de imágenes y
 * el historial de auditoría.
 * ---------------------------------------------------------------------
 */
import { clienteHttp } from "@/api/clienteHttp";
import type {
  CatalogosDelSistema,
  PeriodoDelCalendario,
  VistaDelCalendario,
  RegistroDeActividad,
  ResumenDelPanel,
} from "@/tipos/modelos";

/**
 * Zonas, sectores, vías, roles, temas y colores de acento.
 *
 * Se pide una sola vez al arrancar y se cachea: son listas que cambian
 * como mucho una vez al trimestre, no tiene sentido volver a pedirlas en
 * cada pantalla.
 */
export async function obtenerCatalogos(): Promise<CatalogosDelSistema> {
  const { data } = await clienteHttp.get<CatalogosDelSistema>("/catalogos");

  return data;
}

/** Contadores, resumen por zona, por sector, por vendedor y actividad. */
export async function obtenerResumenDelPanel(): Promise<ResumenDelPanel> {
  const { data } = await clienteHttp.get<ResumenDelPanel>("/panel/resumen");

  return data;
}

/** Resultado de subir una imagen al servidor. */
export interface ImagenSubida {
  id: string;
  url: string;
  nombreOriginal: string;
  tamanoBytes: number;
}

/** Para qué se sube la imagen; determina en qué carpeta acaba. */
export type PropositoDeImagen = "logo_marca" | "contenido_web" | "avatar";

/**
 * Sube una imagen y devuelve su URL pública.
 *
 * Se envía como multipart y se deja que el navegador ponga el
 * Content-Type con su propio boundary: si se fija a mano, el servidor no
 * sabe dónde empieza y acaba cada parte del formulario.
 */
export async function subirImagen(
  archivo: File,
  proposito: PropositoDeImagen = "contenido_web",
): Promise<ImagenSubida> {
  const formulario = new FormData();
  formulario.append("archivo", archivo);
  formulario.append("proposito", proposito);

  const { data } = await clienteHttp.post<ImagenSubida>("/media", formulario, {
    headers: { "Content-Type": undefined },
    // Las imágenes pueden tardar más que una petición normal.
    timeout: 60_000,
  });

  return data;
}

export async function eliminarImagen(idDeLaImagen: string): Promise<void> {
  await clienteHttp.delete(`/media/${idDeLaImagen}`);
}

/** Historial de auditoría. Solo lo puede consultar un administrador. */
export async function obtenerAuditoria(filtros?: {
  usuario?: string;
  entidad?: string;
  accion?: string;
}): Promise<RegistroDeActividad[]> {
  const { data } = await clienteHttp.get<{ data: RegistroDeActividad[] }>(
    "/admin/auditoria",
    { params: filtros ?? {} },
  );

  return data.data;
}

/**
 * El calendario de acciones de campaña, por semana o por mes.
 *
 * Se le pasa un día cualquiera y el servidor devuelve el periodo
 * completo que lo contiene: la semana de lunes a domingo, o las semanas
 * enteras que cubren el mes. El cálculo lo hace él a propósito: si cada
 * navegador decidiera dónde empieza la semana según su configuración
 * regional, dos personas del equipo verían periodos distintos y los
 * reportes no cuadrarían entre sí.
 *
 * @param dia AAAA-MM-DD. Sin él, el periodo actual.
 */
export async function obtenerCalendario(
  vista: VistaDelCalendario,
  dia?: string,
): Promise<PeriodoDelCalendario> {
  const { data } = await clienteHttp.get<PeriodoDelCalendario>("/panel/calendario", {
    params: { vista, ...(dia ? { desde: dia } : {}) },
  });

  return data;
}
