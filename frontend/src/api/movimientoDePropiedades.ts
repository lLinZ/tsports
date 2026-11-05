/**
 * api/movimientoDePropiedades.ts
 * ---------------------------------------------------------------------
 * Propiedades › Movimiento y Cruce, y la ficha de cada propiedad: dónde
 * está caliente cada una (desde el 2026-11-05, admin y comercial).
 *
 * Todo lo cuenta el servidor (MovimientoDeLasPropiedades): cuántas marcas
 * de cada estado, el dinero en las calientes, los días y el siguiente
 * paso. Aquí solo se pide.
 *
 * `exportarMovimiento` devuelve lo mismo que la vista que se mira y deja
 * la exportación en la auditoría; con esa respuesta el navegador arma el
 * Excel (utilidades/excelDeMovimiento.ts).
 * ---------------------------------------------------------------------
 */
import { clienteHttp } from "@/api/clienteHttp";
import type {
  CruceDePropiedades,
  FiltrosDelCruce,
  MovimientoDeLaPropiedad,
  MovimientoDePropiedades,
  OrdenDelMovimiento,
} from "@/tipos/modelos";

function parametrosDelCruce(filtros: FiltrosDelCruce): Record<string, string> {
  const parametros: Record<string, string> = { orden: filtros.orden };

  if (filtros.estado !== null) parametros.estado = filtros.estado;
  if (filtros.agente !== null) parametros.agente = filtros.agente;

  return parametros;
}

export async function obtenerMovimientoDePropiedades(
  orden: OrdenDelMovimiento,
): Promise<MovimientoDePropiedades> {
  const { data } = await clienteHttp.get<MovimientoDePropiedades>(
    "/propiedades/movimiento",
    {
      params: { orden },
    },
  );

  return data;
}

export async function obtenerCruceDePropiedades(
  filtros: FiltrosDelCruce,
): Promise<CruceDePropiedades> {
  const { data } = await clienteHttp.get<CruceDePropiedades>(
    "/propiedades/movimiento/cruce",
    {
      params: parametrosDelCruce(filtros),
    },
  );

  return data;
}

export async function obtenerMovimientoDeLaPropiedad(
  idDeLaPropiedad: string,
): Promise<MovimientoDeLaPropiedad> {
  const { data } = await clienteHttp.get<MovimientoDeLaPropiedad>(
    `/propiedades/${idDeLaPropiedad}/movimiento`,
  );

  return data;
}

/** Lo que se exporta: la vista y, según cuál, su orden, filtros o propiedad. */
export type QueSeExporta =
  | { vista: "ranking"; orden: OrdenDelMovimiento }
  | { vista: "cruce"; filtros: FiltrosDelCruce }
  | { vista: "ficha"; idDeLaPropiedad: string };

export async function exportarMovimiento(queSeExporta: {
  vista: "ranking";
  orden: OrdenDelMovimiento;
}): Promise<MovimientoDePropiedades>;
export async function exportarMovimiento(queSeExporta: {
  vista: "cruce";
  filtros: FiltrosDelCruce;
}): Promise<CruceDePropiedades>;
export async function exportarMovimiento(queSeExporta: {
  vista: "ficha";
  idDeLaPropiedad: string;
}): Promise<MovimientoDeLaPropiedad>;
export async function exportarMovimiento(
  queSeExporta: QueSeExporta,
): Promise<
  MovimientoDePropiedades | CruceDePropiedades | MovimientoDeLaPropiedad
> {
  const parametros: Record<string, string> =
    queSeExporta.vista === "ranking"
      ? { vista: "ranking", orden: queSeExporta.orden }
      : queSeExporta.vista === "cruce"
        ? { vista: "cruce", ...parametrosDelCruce(queSeExporta.filtros) }
        : { vista: "ficha", propiedad: queSeExporta.idDeLaPropiedad };

  const { data } = await clienteHttp.get(
    "/propiedades/movimiento/exportacion",
    {
      params: parametros,
    },
  );

  return data;
}
