/**
 * api/notificaciones.ts
 * ---------------------------------------------------------------------
 * Los avisos de la campanita. Todo trabaja sobre los de la persona con
 * sesión: el servidor no deja leer ni marcar los de nadie más.
 *
 * Aquí no se crean avisos. Los crea el servidor cuando pasa algo que
 * merece uno (un lead de la web, una marca asignada) y, si el tiempo
 * real está encendido, los empuja al momento por el canal personal.
 * ---------------------------------------------------------------------
 */
import { clienteHttp } from "@/api/clienteHttp";
import type { Notificacion } from "@/tipos/modelos";

/** Una página de avisos, con lo que necesita el scroll infinito. */
export interface PaginaDeNotificaciones {
  notificaciones: Notificacion[];
  pagina: number;
  ultimaPagina: number;
}

export async function listarNotificaciones({
  soloSinLeer = false,
  pagina = 1,
  porPagina,
}: {
  soloSinLeer?: boolean;
  pagina?: number;
  porPagina?: number;
} = {}): Promise<PaginaDeNotificaciones> {
  const parametros: Record<string, string> = {};

  if (soloSinLeer) parametros.soloSinLeer = "1";
  if (pagina > 1) parametros.page = String(pagina);
  if (porPagina) parametros.porPagina = String(porPagina);

  const { data } = await clienteHttp.get<{
    data: Notificacion[];
    meta?: { current_page: number; last_page: number };
  }>("/notificaciones", { params: parametros });

  return {
    notificaciones: data.data,
    pagina: data.meta?.current_page ?? 1,
    ultimaPagina: data.meta?.last_page ?? 1,
  };
}

/** El número de la campanita. */
export async function contarNotificacionesSinLeer(): Promise<number> {
  const { data } = await clienteHttp.get<{ sinLeer: number }>("/notificaciones/sin-leer");

  return data.sinLeer;
}

export async function marcarNotificacionComoLeida(
  idDeLaNotificacion: string,
): Promise<Notificacion> {
  const { data } = await clienteHttp.patch<{ data: Notificacion }>(
    `/notificaciones/${idDeLaNotificacion}/leida`,
  );

  return data.data;
}

export async function marcarTodasLasNotificacionesComoLeidas(): Promise<{
  marcadas: number;
  mensaje: string;
}> {
  const { data } = await clienteHttp.post<{ marcadas: number; mensaje: string }>(
    "/notificaciones/leidas",
  );

  return data;
}
