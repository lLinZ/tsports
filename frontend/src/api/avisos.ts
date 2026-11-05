/**
 * api/avisos.ts
 * ---------------------------------------------------------------------
 * El panel de avisos (desde el 2026-11-05):
 *
 *   · La pantalla «Avisos» del administrador: qué avisos salen, a qué
 *     roles, si cada canal funciona y el registro de envíos.
 *   · Los ajustes de cada persona (Notificaciones › Ajustes): si le suena
 *     el móvil y si suena el panel, aviso por aviso, y su horario de
 *     silencio.
 *
 * Qué se puede elegir y a quién le llega cada aviso lo decide el
 * servidor (AjustesDeAvisos); aquí solo se pide y se guarda.
 * ---------------------------------------------------------------------
 */
import { clienteHttp } from "@/api/clienteHttp";
import type {
  EnvioDeAviso,
  FiltrosDelRegistroDeEnvios,
  HorarioDeSilencio,
  MisAvisos,
  PaginaDelRegistroDeEnvios,
  PanelDeAvisos,
  TipoDeAviso,
} from "@/tipos/modelos";

export async function obtenerPanelDeAvisos(): Promise<PanelDeAvisos> {
  const { data } = await clienteHttp.get<PanelDeAvisos>("/avisos");

  return data;
}

/** Enciende o apaga un aviso y, en los de grupo, a quién le llega. */
export async function guardarAjusteDeAviso(
  tipo: TipoDeAviso,
  cambios: { activo: boolean; destinatarios?: Record<string, boolean> },
): Promise<PanelDeAvisos> {
  const { data } = await clienteHttp.put<PanelDeAvisos>(
    `/avisos/${tipo}`,
    cambios,
  );

  return data;
}

export async function listarEnviosDeAvisos(
  filtros: FiltrosDelRegistroDeEnvios,
  pagina = 1,
): Promise<PaginaDelRegistroDeEnvios> {
  const parametros: Record<string, string> = {
    dias: String(filtros.dias),
    resultado: filtros.resultado,
  };

  if (filtros.persona !== null) parametros.persona = filtros.persona;
  if (filtros.tipo !== null) parametros.tipo = filtros.tipo;
  if (pagina > 1) parametros.page = String(pagina);

  const { data } = await clienteHttp.get<{
    data: EnvioDeAviso[];
    meta: { total: number; current_page: number; last_page: number };
    resumen: PaginaDelRegistroDeEnvios["resumen"];
    personas: PaginaDelRegistroDeEnvios["personas"];
  }>("/avisos/envios", { params: parametros });

  return {
    envios: data.data,
    pagina: data.meta.current_page,
    ultimaPagina: data.meta.last_page,
    total: data.meta.total,
    resumen: data.resumen,
    personas: data.personas,
  };
}

export async function obtenerMisAvisos(): Promise<MisAvisos> {
  const { data } = await clienteHttp.get<MisAvisos>("/mis-avisos");

  return data;
}

export async function guardarMiPreferenciaDeAviso(
  tipo: TipoDeAviso,
  cambios: { alMovil?: boolean; conSonido?: boolean },
): Promise<MisAvisos> {
  const { data } = await clienteHttp.put<MisAvisos>(
    `/mis-avisos/${tipo}`,
    cambios,
  );

  return data;
}

export async function guardarMiHorarioDeSilencio(
  silencio: HorarioDeSilencio,
): Promise<MisAvisos> {
  const { data } = await clienteHttp.put<MisAvisos>(
    "/mis-avisos/silencio",
    silencio,
  );

  return data;
}
