/**
 * api/chat.ts
 * ---------------------------------------------------------------------
 * Llamadas del chat interno: charlas, mensajes, grupos y presencia.
 *
 * Las pantallas no llaman a esto directamente, sino a los hooks de
 * `hooks/useChat.ts`, que son los que mantienen la caché al día.
 * ---------------------------------------------------------------------
 */
import { clienteHttp, leerTokenGuardado } from "@/api/clienteHttp";
import type {
  ConversacionDelChat,
  LatidoDelChat,
  MensajeDeChat,
  PersonaDelChat,
} from "@/tipos/modelos";

/**
 * El latido: «sigo aquí» (o «me voy», con `visible: false`) y, de vuelta,
 * si hay algo nuevo. Ver ChatController::latido.
 */
export async function latirEnElChat(visible: boolean): Promise<LatidoDelChat> {
  const { data } = await clienteHttp.post<LatidoDelChat>("/chat/latido", { visible });

  return data;
}

/**
 * La despedida al cerrar la pestaña. No puede ir por `clienteHttp`: al
 * cerrar, el navegador corta las peticiones normales a medias. Una con
 * `keepalive` sí termina aunque la página ya no exista. Si no llega, no
 * pasa nada: la persona deja de estar en línea sola en unos segundos.
 */
export function despedirseDelChat(): void {
  const token = leerTokenGuardado();

  if (token === null) return;

  try {
    void fetch("/api/chat/latido", {
      method: "POST",
      keepalive: true,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ visible: false }),
    }).catch(() => undefined);
  } catch {
    /* Un navegador sin keepalive: se queda en línea hasta que caduque. */
  }
}

export async function listarPersonasDelChat(): Promise<PersonaDelChat[]> {
  const { data } = await clienteHttp.get<{ data: PersonaDelChat[] }>("/chat/personas");

  return data.data;
}

export async function listarConversaciones(): Promise<ConversacionDelChat[]> {
  const { data } = await clienteHttp.get<{ data: ConversacionDelChat[] }>("/chat/conversaciones");

  return data.data;
}

export async function obtenerConversacion(id: string): Promise<ConversacionDelChat> {
  const { data } = await clienteHttp.get<{ data: ConversacionDelChat }>(`/chat/conversaciones/${id}`);

  return data.data;
}

/** La charla con alguien: la que ya había o una nueva. */
export async function abrirConversacionDirecta(idDeLaPersona: string): Promise<ConversacionDelChat> {
  const { data } = await clienteHttp.post<{ data: ConversacionDelChat }>("/chat/directas", {
    persona: idDeLaPersona,
  });

  return data.data;
}

export async function crearGrupoDelChat(datos: {
  /** Vacío: el servidor le pone el de quienes están («Ana, Luisa y Pedro»). */
  nombre: string;
  personas: string[];
}): Promise<ConversacionDelChat> {
  const { data } = await clienteHttp.post<{ data: ConversacionDelChat }>("/chat/grupos", datos);

  return data.data;
}

export async function renombrarGrupoDelChat(id: string, nombre: string): Promise<ConversacionDelChat> {
  const { data } = await clienteHttp.patch<{ data: ConversacionDelChat }>(`/chat/conversaciones/${id}`, {
    nombre,
  });

  return data.data;
}

export async function anadirAlGrupoDelChat(id: string, personas: string[]): Promise<ConversacionDelChat> {
  const { data } = await clienteHttp.post<{ data: ConversacionDelChat }>(
    `/chat/conversaciones/${id}/personas`,
    { personas },
  );

  return data.data;
}

/** Sacar a alguien del grupo; con el id propio, salirse. */
export async function sacarDelGrupoDelChat(id: string, idDeLaPersona: string): Promise<void> {
  await clienteHttp.delete(`/chat/conversaciones/${id}/personas/${idDeLaPersona}`);
}

/**
 * Mensajes de una charla. Sin nada, los últimos; con `antesDe`, la tanda
 * anterior a ese; con `despuesDe`, todo lo nuevo desde ese.
 */
export async function listarMensajes(
  idDeLaConversacion: string,
  cursor: { antesDe?: number; despuesDe?: number } = {},
): Promise<{ data: MensajeDeChat[]; hayMasAntiguos: boolean; leidoPorLosDemasHasta: number }> {
  const { data } = await clienteHttp.get<{
    data: MensajeDeChat[];
    hayMasAntiguos: boolean;
    leidoPorLosDemasHasta: number;
  }>(`/chat/conversaciones/${idDeLaConversacion}/mensajes`, { params: cursor });

  return data;
}

export async function enviarMensaje(idDeLaConversacion: string, cuerpo: string): Promise<MensajeDeChat> {
  const { data } = await clienteHttp.post<{ data: MensajeDeChat }>(
    `/chat/conversaciones/${idDeLaConversacion}/mensajes`,
    { cuerpo },
  );

  return data.data;
}

export async function marcarConversacionComoLeida(
  idDeLaConversacion: string,
  hasta: number,
): Promise<number> {
  const { data } = await clienteHttp.post<{ leidoHasta: number }>(
    `/chat/conversaciones/${idDeLaConversacion}/leido`,
    { hasta },
  );

  return data.leidoHasta;
}
