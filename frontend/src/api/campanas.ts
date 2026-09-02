/**
 * api/campanas.ts
 * ---------------------------------------------------------------------
 * Las campañas comerciales: el empujón al que pertenece el trabajo sobre
 * cada marca.
 *
 * El selector de la ficha pide solo las activas, para no ofrecer una
 * campaña cerrada; la pantalla del catálogo las pide todas.
 * ---------------------------------------------------------------------
 */
import { clienteHttp } from "@/api/clienteHttp";
import type { Campana, DatosDeCampanaParaGuardar } from "@/tipos/modelos";

export async function listarCampanas(opciones?: {
  soloActivas?: boolean;
}): Promise<Campana[]> {
  const parametrosDeConsulta: Record<string, string> = {};

  if (opciones?.soloActivas) parametrosDeConsulta.soloActivas = "1";

  const { data } = await clienteHttp.get<{ data: Campana[] }>("/campanas", {
    params: parametrosDeConsulta,
  });

  return data.data;
}

export async function crearCampana(
  datos: DatosDeCampanaParaGuardar,
): Promise<Campana> {
  const { data } = await clienteHttp.post<{ data: Campana }>("/campanas", datos);

  return data.data;
}

export async function actualizarCampana(
  idDeLaCampana: string,
  datos: DatosDeCampanaParaGuardar,
): Promise<Campana> {
  const { data } = await clienteHttp.put<{ data: Campana }>(
    `/campanas/${idDeLaCampana}`,
    datos,
  );

  return data.data;
}

/**
 * Borra la campaña. Las marcas que pertenecían a ella no se borran: se
 * quedan sin campaña.
 */
export async function eliminarCampana(idDeLaCampana: string): Promise<void> {
  await clienteHttp.delete(`/campanas/${idDeLaCampana}`);
}
