/**
 * api/marcas.ts
 * ---------------------------------------------------------------------
 * Llamadas del CRM: el tablero de marcas y la bitácora de cada una.
 *
 * Es la parte del sistema que más se usa, así que las firmas están
 * pensadas para leerse solas: `listarMarcas(filtros)`,
 * `alternarFaseDeMarca(id, "propuesta", true)`.
 * ---------------------------------------------------------------------
 */
import { clienteHttp } from "@/api/clienteHttp";
import type {
  AccionDeCampanaEnElHistorial,
  ComentarioDeMarca,
  DatosDeAccionParaCorregir,
  DatosDeMarcaParaGuardar,
  FiltrosDeMarcas,
  Marca,
} from "@/tipos/modelos";

/** Respuesta paginada de Laravel, con lo que de verdad usamos. */
interface RespuestaPaginada<T> {
  data: T[];
  meta?: { total: number; current_page: number; last_page: number };
}

export interface ResultadoDeListado {
  marcas: Marca[];
  total: number;
}

/**
 * Trae el listado del tablero aplicando los filtros de la interfaz.
 * Los filtros vacíos no se envían, para no ensuciar la URL ni obligar al
 * backend a distinguir entre "sin filtro" y "filtro en blanco".
 */
export async function listarMarcas(
  filtros: Partial<FiltrosDeMarcas>,
): Promise<ResultadoDeListado> {
  const parametrosDeConsulta: Record<string, string> = {};

  if (filtros.busqueda?.trim()) parametrosDeConsulta.busqueda = filtros.busqueda.trim();
  if (filtros.etapa) parametrosDeConsulta.etapa = filtros.etapa;
  if (filtros.zona) parametrosDeConsulta.zona = filtros.zona;
  if (filtros.sector) parametrosDeConsulta.sector = filtros.sector;
  if (filtros.vendedor) parametrosDeConsulta.vendedor = filtros.vendedor;
  if (filtros.campana) parametrosDeConsulta.campana = filtros.campana;
  if (filtros.propiedad) parametrosDeConsulta.propiedad = filtros.propiedad;
  if (filtros.invierte) parametrosDeConsulta.invierte = filtros.invierte;
  if (filtros.orden) parametrosDeConsulta.orden = filtros.orden;

  const { data } = await clienteHttp.get<RespuestaPaginada<Marca>>("/marcas", {
    params: parametrosDeConsulta,
  });

  return {
    marcas: data.data,
    total: data.meta?.total ?? data.data.length,
  };
}

/** Ficha completa de una marca, con su bitácora incluida. */
export async function obtenerMarca(idDeLaMarca: string): Promise<Marca> {
  const { data } = await clienteHttp.get<{ data: Marca }>(`/marcas/${idDeLaMarca}`);

  return data.data;
}

export async function crearMarca(
  datos: DatosDeMarcaParaGuardar,
): Promise<Marca> {
  const { data } = await clienteHttp.post<{ data: Marca }>("/marcas", datos);

  return data.data;
}

export async function actualizarMarca(
  idDeLaMarca: string,
  datos: DatosDeMarcaParaGuardar,
): Promise<Marca> {
  const { data } = await clienteHttp.put<{ data: Marca }>(
    `/marcas/${idDeLaMarca}`,
    datos,
  );

  return data.data;
}

export async function eliminarMarca(idDeLaMarca: string): Promise<void> {
  await clienteHttp.delete(`/marcas/${idDeLaMarca}`);
}

/**
 * Marca o desmarca una fase directamente desde la tarjeta del tablero.
 *
 * La prospección no está entre las opciones a propósito: el servidor la
 * calcula sola a partir de los datos de la ficha y no admite que se
 * fuerce, para que el indicador nunca pueda mentir.
 */
export async function alternarFaseDeMarca(
  idDeLaMarca: string,
  fase: "aproximacion" | "propuesta",
  completada: boolean,
): Promise<Marca> {
  const { data } = await clienteHttp.patch<{ data: Marca }>(
    `/marcas/${idDeLaMarca}/fase`,
    { fase, completada },
  );

  return data.data;
}

/* ==================================================================== */
/* Bitácora                                                             */
/* ==================================================================== */

export async function listarComentarios(
  idDeLaMarca: string,
): Promise<ComentarioDeMarca[]> {
  const { data } = await clienteHttp.get<{ data: ComentarioDeMarca[] }>(
    `/marcas/${idDeLaMarca}/comentarios`,
  );

  return data.data;
}

export async function crearComentario(
  idDeLaMarca: string,
  cuerpo: string,
): Promise<ComentarioDeMarca> {
  const { data } = await clienteHttp.post<{ data: ComentarioDeMarca }>(
    `/marcas/${idDeLaMarca}/comentarios`,
    { cuerpo },
  );

  return data.data;
}

export async function eliminarComentario(
  idDeLaMarca: string,
  idDelComentario: string,
): Promise<void> {
  await clienteHttp.delete(`/marcas/${idDeLaMarca}/comentarios/${idDelComentario}`);
}

/* ==================================================================== */
/* Historial de acciones de campaña                                     */
/* ==================================================================== */

/**
 * Cómo queda la acción en curso de una marca después de tocar su
 * historial. `null` significa que se quedó sin ninguna.
 *
 * La calcula el servidor y viaja en la respuesta: cuál es la acción
 * vigente tras borrar o corregir un evento es una regla suya, y tenerla
 * escrita también aquí es pedir que las dos versiones dejen de
 * coincidir.
 */
export interface AccionVigenteDeLaMarca {
  campanaId: string;
  fechaCampana: string | null;
}

/**
 * Corrige una acción ya anotada: su campaña, su día o su nota.
 *
 * Los eventos se crean solos al asignar campaña en la ficha, pero la
 * realidad se mueve —una visita se aplaza, una invitación se cancela— y
 * sin poder corregirlos el calendario acabaría enseñando cosas que ya no
 * van a pasar.
 *
 * Al guardar, el servidor vuelve a fijar la acción en curso de la marca
 * a partir de su historial y devuelve cómo queda, para que la ficha
 * abierta pueda ponerse al día.
 */
export async function corregirAccionDeCampana(
  idDeLaAccion: string,
  datos: DatosDeAccionParaCorregir,
): Promise<{
  evento: AccionDeCampanaEnElHistorial;
  accionVigente: AccionVigenteDeLaMarca | null;
}> {
  const { data } = await clienteHttp.put<{
    mensaje: string;
    evento: AccionDeCampanaEnElHistorial;
    accionVigente: AccionVigenteDeLaMarca | null;
  }>(`/eventos-de-campana/${idDeLaAccion}`, datos);

  return { evento: data.evento, accionVigente: data.accionVigente ?? null };
}

/**
 * Borra una acción del historial. Solo admin y comercial.
 *
 * Devuelve con qué acción se queda la marca —la más reciente de las que
 * sobreviven, o ninguna si se vació el historial—. Quien llame tiene que
 * usarla para refrescar el formulario abierto: si no, la ficha sigue
 * enseñando la campaña recién borrada y al guardar la reenvía, con lo
 * que la acción reaparece sola.
 */
export async function eliminarAccionDeCampana(
  idDeLaAccion: string,
): Promise<AccionVigenteDeLaMarca | null> {
  const { data } = await clienteHttp.delete<{
    mensaje: string;
    accionVigente: AccionVigenteDeLaMarca | null;
  }>(`/eventos-de-campana/${idDeLaAccion}`);

  return data.accionVigente ?? null;
}
