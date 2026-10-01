/**
 * api/reportes.ts
 * ---------------------------------------------------------------------
 * El reporte «Pronóstico por marca»: en qué marcas está el dinero que
 * el equipo pronostica (OVP). Lo que ve cada quien lo decide el
 * servidor: la agencia entera admin y comercial, su cartera el agente.
 *
 * El reporte de bitácora sigue en api/marcas.ts, junto a la bitácora.
 * ---------------------------------------------------------------------
 */
import { clienteHttp } from "@/api/clienteHttp";
import type { ReporteDePronostico } from "@/tipos/modelos";

export async function obtenerReporteDePronostico(): Promise<ReporteDePronostico> {
  const { data } = await clienteHttp.get<ReporteDePronostico>("/reportes/pronostico");

  return data;
}
