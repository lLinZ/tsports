/**
 * api/reportes.ts
 * ---------------------------------------------------------------------
 * Los reportes que se leen en pantalla:
 *
 *   · «Pronóstico por marca»: en qué marcas está el dinero que el equipo
 *     pronostica (OVP).
 *   · «Lo que viene»: lo planificado entre dos días (recordatorios y
 *     acciones de campaña).
 *
 * Lo que ve cada quien lo decide el servidor: la agencia entera admin y
 * comercial, su cartera el agente.
 *
 * El reporte de bitácora sigue en api/marcas.ts, junto a la bitácora.
 * ---------------------------------------------------------------------
 */
import { clienteHttp } from "@/api/clienteHttp";
import type { PeriodoDeLoQueViene, ReporteDeLoQueViene, ReporteDePronostico } from "@/tipos/modelos";

export async function obtenerReporteDePronostico(): Promise<ReporteDePronostico> {
  const { data } = await clienteHttp.get<ReporteDePronostico>("/reportes/pronostico");

  return data;
}

/** Lo que se pide del reporte «Lo que viene». */
export interface PeticionDeLoQueViene {
  periodo: PeriodoDeLoQueViene;
  /** Solo con «otro»: AAAA-MM-DD. */
  desde?: string;
  hasta?: string;
  /** La agenda de una persona; sin ella, la de todo lo que se ve. */
  persona?: string | null;
}

/**
 * «Lo que viene»: lo planificado día por día. Los días de cada periodo
 * («esta semana», «el mes que viene») los cuenta el servidor con el
 * calendario de Caracas; aquí solo se dice cuál.
 */
export async function obtenerLoQueViene(peticion: PeticionDeLoQueViene): Promise<ReporteDeLoQueViene> {
  const { data } = await clienteHttp.get<ReporteDeLoQueViene>("/reportes/lo-que-viene", {
    params: {
      periodo: peticion.periodo,
      ...(peticion.periodo === "otro" ? { desde: peticion.desde, hasta: peticion.hasta } : {}),
      ...(peticion.persona ? { persona: peticion.persona } : {}),
    },
  });

  return data;
}
