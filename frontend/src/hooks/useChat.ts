/**
 * hooks/useChat.ts
 * ---------------------------------------------------------------------
 * Lectura y escritura del chat, en un sitio: las pantallas usan esto y
 * no la API, para que al enviar o leer se mueva todo a la vez (la lista,
 * el globo con el número, la charla abierta).
 *
 * DOS FORMAS DE ENTERARSE, COMO LA CAMPANITA
 *   · Con Reverb, el servidor avisa de cada cambio (`.chat`) y aquí se
 *     pide lo que falte.
 *   · Sin Reverb —apagado, caído o con el WebSocket cortado—, la
 *     charla abierta pregunta por lo nuevo cada pocos segundos y el
 *     latido del proveedor avisa de lo demás. El mensaje está guardado antes de que nadie lo empuje, así
 *     que lo peor que pasa es verlo unos segundos más tarde.
 *
 * TODO LO DEL CHAT SE QUEDA FUERA DE LA COPIA SIN CONEXIÓN
 * (`sinCopiaLocal`): se refresca cada pocos segundos, y cada refresco
 * obligaría a reescribir la copia entera. Sin red tampoco se puede
 * escribir, que es para lo que se abre un chat.
 * ---------------------------------------------------------------------
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import {
  abrirConversacionDirecta,
  anadirAlGrupoDelChat,
  crearGrupoDelChat,
  enviarMensaje,
  listarConversaciones,
  listarMensajes,
  listarPersonasDelChat,
  marcarConversacionComoLeida,
  obtenerConversacion,
  renombrarGrupoDelChat,
  sacarDelGrupoDelChat,
} from "@/api/chat";
import { useTiempoReal } from "@/providers/ProveedorTiempoReal";
import type {
  ConversacionDelChat,
  LatidoDelChat,
  MensajeDeChat,
  MensajesDeLaConversacion,
} from "@/tipos/modelos";
import { errorSoloSiNoHayNadaQueEnsenar } from "@/utilidades/consultas";

/* ==================================================================== */
/* Claves y ritmos                                                      */
/* ==================================================================== */

export const clavesDelChat = {
  todo: ["chat"] as const,
  latido: ["chat", "latido"] as const,
  personas: ["chat", "personas"] as const,
  conversaciones: ["chat", "conversaciones"] as const,
  conversacion: (id: string) => ["chat", "conversacion", id] as const,
  mensajes: (id: string) => ["chat", "mensajes", id] as const,
  todosLosMensajes: ["chat", "mensajes"] as const,
};

const SIN_COPIA_LOCAL = { sinCopiaLocal: true } as const;

/** Cada cuánto pregunta la charla abierta por lo nuevo, sin Reverb. */
const INTERVALO_DE_LA_CHARLA_SIN_TIEMPO_REAL_MS = 4_000;

/* ==================================================================== */
/* Lectura                                                             */
/* ==================================================================== */

/**
 * Las charlas de la persona, la que se movió última arriba. El número
 * de «sin leer» de cada una lo cuenta el servidor.
 */
export function useConversaciones({ habilitado = true } = {}) {
  const consulta = useQuery({
    queryKey: clavesDelChat.conversaciones,
    queryFn: listarConversaciones,
    enabled: habilitado,
    meta: SIN_COPIA_LOCAL,
  });

  return {
    conversaciones: consulta.data ?? [],
    estaCargando: consulta.isLoading,
    error: errorSoloSiNoHayNadaQueEnsenar(consulta),
    recargar: consulta.refetch,
    datos: consulta.data,
  };
}

/**
 * Una charla concreta. Si ya está en la lista, sale de ahí al momento; si
 * no (se llegó por el enlace de un aviso), se pide aparte.
 */
export function useConversacion(id: string | null) {
  const clienteDeConsultas = useQueryClient();

  return useQuery({
    queryKey: clavesDelChat.conversacion(id ?? ""),
    queryFn: () => obtenerConversacion(id as string),
    enabled: id !== null,
    initialData: () =>
      clienteDeConsultas
        .getQueryData<ConversacionDelChat[]>(clavesDelChat.conversaciones)
        ?.find((conversacion) => conversacion.id === id),
    // Lo de la lista puede ser de hace unos segundos: se da por viejo para
    // que se pida igual, pero se enseña mientras llega.
    initialDataUpdatedAt: () =>
      clienteDeConsultas.getQueryState(clavesDelChat.conversaciones)?.dataUpdatedAt,
    retry: false,
    meta: SIN_COPIA_LOCAL,
  });
}

/** El equipo, con quién está en línea. */
export function usePersonasDelChat({ habilitado = true } = {}) {
  return useQuery({
    queryKey: clavesDelChat.personas,
    queryFn: listarPersonasDelChat,
    enabled: habilitado,
    staleTime: 30_000,
    meta: SIN_COPIA_LOCAL,
  });
}

/**
 * Quién está en línea ahora, según el último latido. Es la fuente más
 * fresca: la lista del equipo puede ser de hace un minuto; el latido,
 * de hace unos segundos.
 */
export function useQuienEstaEnLinea(): Set<string> {
  return new Set(useUltimoLatido()?.enLinea ?? []);
}

function useUltimoLatido(): LatidoDelChat | null {
  const { data } = useQuery<LatidoDelChat | null>({
    queryKey: clavesDelChat.latido,
    // No se pide nunca desde aquí: lo rellena el latido del proveedor.
    queryFn: () => null,
    enabled: false,
    meta: SIN_COPIA_LOCAL,
  });

  return data ?? null;
}

/**
 * El equipo en el orden en que se enseña: primero quien está en línea y
 * después el resto, por nombre (por nombre y no por «visto hace…»: la
 * lista se recorre buscando a alguien, y si bailara con cada latido no
 * se le encontraría).
 *
 * Quién está en línea sale del último latido, más fresco que la lista.
 * Hasta que llega el primero, vale lo que trajo la lista.
 */
export function useEquipoConPresencia() {
  const latido = useUltimoLatido();
  const { data: personas = [], isLoading, error } = usePersonasDelChat();

  const enLinea = new Set(
    latido !== null
      ? latido.enLinea
      : personas.filter((persona) => persona.enLinea).map((persona) => persona.id),
  );

  const equipo = [...personas].sort(
    (una, otra) =>
      Number(enLinea.has(otra.id)) - Number(enLinea.has(una.id)) ||
      una.nombre.localeCompare(otra.nombre, "es"),
  );

  return {
    equipo,
    enLinea,
    cuantosEnLinea: equipo.filter((persona) => enLinea.has(persona.id)).length,
    estaCargando: isLoading,
    error,
  };
}

/**
 * Los mensajes de una charla, que se van completando por los dos lados:
 *
 *   · Hacia adelante, cada refresco pide SOLO lo nuevo desde el último
 *     que se tiene (`despuesDe`), no la charla entera otra vez.
 *   · Hacia atrás, `cargarAnteriores` trae la tanda anterior al subir.
 *
 * Por eso la función de consulta mira lo que ya hay en la caché antes de
 * pedir: la primera vez trae los últimos 40, y a partir de ahí, lo que
 * falte.
 */
export function useMensajesDeLaConversacion(id: string) {
  const clienteDeConsultas = useQueryClient();
  const { estadoDeLaConexion } = useTiempoReal();
  const [cargandoAnteriores, establecerCargandoAnteriores] = useState(false);

  const clave = clavesDelChat.mensajes(id);

  const consulta = useQuery({
    queryKey: clave,
    queryFn: () => traerLoQueFalta(clienteDeConsultas, id),
    // En vivo, lo nuevo lo anuncia Reverb; sin él, se pregunta. TanStack
    // deja de preguntar solo con la pestaña escondida.
    refetchInterval:
      estadoDeLaConexion === "enVivo" ? false : INTERVALO_DE_LA_CHARLA_SIN_TIEMPO_REAL_MS,
    gcTime: 10 * 60_000,
    meta: SIN_COPIA_LOCAL,
  });

  async function cargarAnteriores() {
    const actual = clienteDeConsultas.getQueryData<MensajesDeLaConversacion>(clave);
    const primero = actual?.mensajes[0];

    if (actual === undefined || primero === undefined || !actual.hayMasAntiguos || cargandoAnteriores) {
      return;
    }

    establecerCargandoAnteriores(true);

    try {
      const anteriores = await listarMensajes(id, { antesDe: primero.id });

      clienteDeConsultas.setQueryData<MensajesDeLaConversacion>(clave, (ahora) =>
        ahora === undefined
          ? ahora
          : {
              ...ahora,
              mensajes: unirMensajes(anteriores.data, ahora.mensajes),
              hayMasAntiguos: anteriores.hayMasAntiguos,
            },
      );
    } finally {
      establecerCargandoAnteriores(false);
    }
  }

  return {
    mensajes: consulta.data?.mensajes ?? [],
    hayMasAntiguos: consulta.data?.hayMasAntiguos ?? false,
    leidoPorLosDemasHasta: consulta.data?.leidoPorLosDemasHasta ?? 0,
    estaCargando: consulta.isLoading,
    error: errorSoloSiNoHayNadaQueEnsenar(consulta),
    cargarAnteriores,
    cargandoAnteriores,
    recargar: consulta.refetch,
  };
}

async function traerLoQueFalta(
  clienteDeConsultas: QueryClient,
  id: string,
): Promise<MensajesDeLaConversacion> {
  const actual = clienteDeConsultas.getQueryData<MensajesDeLaConversacion>(clavesDelChat.mensajes(id));
  const ultimo = actual?.mensajes[actual.mensajes.length - 1];

  if (actual !== undefined && ultimo !== undefined) {
    const nuevos = await listarMensajes(id, { despuesDe: ultimo.id });

    return {
      mensajes: nuevos.data.length === 0 ? actual.mensajes : unirMensajes(actual.mensajes, nuevos.data),
      hayMasAntiguos: actual.hayMasAntiguos,
      leidoPorLosDemasHasta: nuevos.leidoPorLosDemasHasta,
    };
  }

  const primeros = await listarMensajes(id);

  return {
    mensajes: primeros.data,
    hayMasAntiguos: primeros.hayMasAntiguos,
    leidoPorLosDemasHasta: primeros.leidoPorLosDemasHasta,
  };
}

/**
 * Junta dos tandas sin repetir ninguno y en orden. Un mensaje puede
 * llegar dos veces —al enviarlo y en el refresco siguiente—, y sin esto
 * saldría duplicado.
 */
function unirMensajes(unos: MensajeDeChat[], otros: MensajeDeChat[]): MensajeDeChat[] {
  const porId = new Map<number, MensajeDeChat>();

  for (const mensaje of [...unos, ...otros]) {
    porId.set(mensaje.id, mensaje);
  }

  return Array.from(porId.values()).sort((uno, otro) => uno.id - otro.id);
}

/* ==================================================================== */
/* Escritura                                                           */
/* ==================================================================== */

export function useEnviarMensaje(idDeLaConversacion: string) {
  const clienteDeConsultas = useQueryClient();

  return useMutation({
    mutationFn: (cuerpo: string) => enviarMensaje(idDeLaConversacion, cuerpo),
    onSuccess: (mensaje) => {
      // Se pinta ya, sin esperar al siguiente refresco.
      clienteDeConsultas.setQueryData<MensajesDeLaConversacion>(
        clavesDelChat.mensajes(idDeLaConversacion),
        (ahora) =>
          ahora === undefined
            ? { mensajes: [mensaje], hayMasAntiguos: false, leidoPorLosDemasHasta: 0 }
            : { ...ahora, mensajes: unirMensajes(ahora.mensajes, [mensaje]) },
      );

      void clienteDeConsultas.invalidateQueries({ queryKey: clavesDelChat.conversaciones });
    },
  });
}

/**
 * Deja la charla leída hasta un mensaje y baja su número en la lista al
 * momento, sin esperar a que el servidor lo cuente otra vez.
 */
export function useMarcarComoLeida() {
  const clienteDeConsultas = useQueryClient();

  return useMutation({
    mutationFn: ({ idDeLaConversacion, hasta }: { idDeLaConversacion: string; hasta: number }) =>
      marcarConversacionComoLeida(idDeLaConversacion, hasta),
    onMutate: ({ idDeLaConversacion, hasta }) => {
      clienteDeConsultas.setQueryData<ConversacionDelChat[]>(clavesDelChat.conversaciones, (lista) =>
        lista?.map((conversacion) =>
          conversacion.id === idDeLaConversacion
            ? { ...conversacion, sinLeer: 0, miUltimoLeidoId: Math.max(conversacion.miUltimoLeidoId, hasta) }
            : conversacion,
        ),
      );
    },
  });
}

/** Lo que tienen en común las operaciones que cambian una charla. */
function useRefrescarAlCambiarUnaCharla() {
  const clienteDeConsultas = useQueryClient();

  return (conversacion?: ConversacionDelChat) => {
    if (conversacion !== undefined) {
      clienteDeConsultas.setQueryData(clavesDelChat.conversacion(conversacion.id), conversacion);
      void clienteDeConsultas.invalidateQueries({ queryKey: clavesDelChat.mensajes(conversacion.id) });
    }

    void clienteDeConsultas.invalidateQueries({ queryKey: clavesDelChat.conversaciones });
  };
}

export function useAbrirConversacionDirecta() {
  const refrescar = useRefrescarAlCambiarUnaCharla();

  return useMutation({ mutationFn: abrirConversacionDirecta, onSuccess: refrescar });
}

export function useCrearGrupo() {
  const refrescar = useRefrescarAlCambiarUnaCharla();

  return useMutation({ mutationFn: crearGrupoDelChat, onSuccess: refrescar });
}

export function useRenombrarGrupo() {
  const refrescar = useRefrescarAlCambiarUnaCharla();

  return useMutation({
    mutationFn: ({ id, nombre }: { id: string; nombre: string }) => renombrarGrupoDelChat(id, nombre),
    onSuccess: refrescar,
  });
}

export function useAnadirAlGrupo() {
  const refrescar = useRefrescarAlCambiarUnaCharla();

  return useMutation({
    mutationFn: ({ id, personas }: { id: string; personas: string[] }) => anadirAlGrupoDelChat(id, personas),
    onSuccess: refrescar,
  });
}

export function useSacarDelGrupo() {
  const clienteDeConsultas = useQueryClient();

  return useMutation({
    mutationFn: ({ id, idDeLaPersona }: { id: string; idDeLaPersona: string }) =>
      sacarDelGrupoDelChat(id, idDeLaPersona),
    onSuccess: (_resultado, { id }) => {
      void clienteDeConsultas.invalidateQueries({ queryKey: clavesDelChat.conversacion(id) });
      void clienteDeConsultas.invalidateQueries({ queryKey: clavesDelChat.mensajes(id) });
      void clienteDeConsultas.invalidateQueries({ queryKey: clavesDelChat.conversaciones });
    },
  });
}
