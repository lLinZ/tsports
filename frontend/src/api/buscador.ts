/**
 * api/buscador.ts
 * ---------------------------------------------------------------------
 * El buscador único de la barra superior. El servidor decide qué
 * encuentra cada quien (lo mismo que ya puede ver) y a dónde lleva cada
 * resultado.
 * ---------------------------------------------------------------------
 */
import { clienteHttp } from "@/api/clienteHttp";
import type { RespuestaDelBuscador } from "@/tipos/modelos";

export async function buscarEnTodo(texto: string): Promise<RespuestaDelBuscador> {
  const { data } = await clienteHttp.get<RespuestaDelBuscador>("/buscar", { params: { q: texto } });

  return data;
}
