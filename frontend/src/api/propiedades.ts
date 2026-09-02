/**
 * api/propiedades.ts
 * ---------------------------------------------------------------------
 * El catálogo de productos IOP: las propiedades que la agencia vende.
 *
 * Se pide de dos maneras distintas y conviene no confundirlas:
 *
 *   · `listarPropiedades({ soloActivas: true })` → lo que necesita el
 *     checklist de la ficha de una marca: ligero, sin totales.
 *   · `listarPropiedades({ conTotales: true })`  → lo que necesita la
 *     pantalla del catálogo: añade cuántas marcas llevan cada propiedad
 *     y cuánto suman sus pronósticos.
 * ---------------------------------------------------------------------
 */
import { clienteHttp } from "@/api/clienteHttp";
import type { DatosDePropiedadParaGuardar, Propiedad } from "@/tipos/modelos";

export async function listarPropiedades(opciones?: {
  soloActivas?: boolean;
  conTotales?: boolean;
}): Promise<Propiedad[]> {
  const parametrosDeConsulta: Record<string, string> = {};

  if (opciones?.soloActivas) parametrosDeConsulta.soloActivas = "1";
  if (opciones?.conTotales) parametrosDeConsulta.conTotales = "1";

  const { data } = await clienteHttp.get<{ data: Propiedad[] }>("/propiedades", {
    params: parametrosDeConsulta,
  });

  return data.data;
}

export async function obtenerPropiedad(idDeLaPropiedad: string): Promise<Propiedad> {
  const { data } = await clienteHttp.get<{ data: Propiedad }>(
    `/propiedades/${idDeLaPropiedad}`,
  );

  return data.data;
}

export async function crearPropiedad(
  datos: DatosDePropiedadParaGuardar,
): Promise<Propiedad> {
  const { data } = await clienteHttp.post<{ data: Propiedad }>("/propiedades", datos);

  return data.data;
}

export async function actualizarPropiedad(
  idDeLaPropiedad: string,
  datos: DatosDePropiedadParaGuardar,
): Promise<Propiedad> {
  const { data } = await clienteHttp.put<{ data: Propiedad }>(
    `/propiedades/${idDeLaPropiedad}`,
    datos,
  );

  return data.data;
}

/**
 * Borra la propiedad y, con ella, sus líneas del checklist en todas las
 * marcas. Para retirarla de la venta conservando el histórico, la
 * pantalla ofrece antes desactivarla.
 */
export async function eliminarPropiedad(idDeLaPropiedad: string): Promise<void> {
  await clienteHttp.delete(`/propiedades/${idDeLaPropiedad}`);
}
