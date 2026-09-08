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
  PersonaDeAuditoria,
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

/**
 * Una página del historial de auditoría. Solo la consulta un
 * administrador.
 *
 * Los filtros vacíos no se envían: así el servidor no tiene que
 * distinguir entre "sin filtro" y "filtro en blanco", y la petición se
 * queda limpia en el inspector.
 *
 * Devuelve el total —la cifra que se enseña arriba, que no es lo que
 * trae esta página— y en qué página va, que es lo que necesita el
 * scroll infinito. El historial es la lista que más crece del sistema:
 * sin pedir las páginas siguientes solo se veían los últimos cincuenta
 * movimientos y no había forma de llegar más atrás.
 */
export async function obtenerAuditoria(
  filtros?: {
    desde?: string;
    hasta?: string;
    usuario?: string;
    entidad?: string;
    accion?: string;
  },
  pagina = 1,
): Promise<{
  registros: RegistroDeActividad[];
  total: number;
  pagina: number;
  ultimaPagina: number;
}> {
  const parametros: Record<string, string> = {};

  for (const [clave, valor] of Object.entries(filtros ?? {})) {
    if (valor) parametros[clave] = valor;
  }

  if (pagina > 1) parametros.page = String(pagina);

  const { data } = await clienteHttp.get<{
    data: RegistroDeActividad[];
    meta?: { total: number; current_page: number; last_page: number };
  }>("/admin/auditoria", { params: parametros });

  return {
    registros: data.data,
    total: data.meta?.total ?? data.data.length,
    pagina: data.meta?.current_page ?? 1,
    ultimaPagina: data.meta?.last_page ?? 1,
  };
}

/**
 * Quién aparece en el historial, con cuántos movimientos tiene cada uno.
 * Sale del propio historial, así que incluye a quien ya no tiene cuenta.
 */
export async function listarPersonasDeAuditoria(): Promise<PersonaDeAuditoria[]> {
  const { data } = await clienteHttp.get<{ data: PersonaDeAuditoria[] }>(
    "/admin/auditoria/personas",
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
