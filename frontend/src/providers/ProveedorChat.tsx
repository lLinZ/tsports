/**
 * providers/ProveedorChat.tsx
 * ---------------------------------------------------------------------
 * El chat interno, por encima de todas las pantallas: la ventana
 * flotante, el latido que dice quién está y los avisos de mensajes
 * nuevos. Va aquí arriba, junto al tiempo real, para que cambiar de
 * pantalla no cierre la ventana ni corte el latido.
 *
 * EL LATIDO (`POST /api/chat/latido`) hace tres cosas en una llamada:
 * deja a la persona «en línea» mientras tiene el panel a la vista, dice
 * cuántos mensajes tiene sin leer y trae quién más está en línea. Solo
 * late con la pestaña visible: una pestaña olvidada no es alguien que
 * esté para contestar. Al esconderla se despide, y al cerrar la pestaña
 * también (con una petición que sobrevive al cierre).
 *
 *   · Con Reverb, cada 30 s: lo nuevo llega por el WebSocket. Con el
 *     chat abierto, cada 10 s, porque quién está en línea NO llega por
 *     el WebSocket: solo lo trae el latido.
 *   · Sin Reverb, cada 15 s, y cada 5 s con el chat abierto: es lo que
 *     trae la lista al día.
 *
 * LOS AVISOS DE MENSAJE NUEVO salen en pantalla cuando llega algo de
 * otra persona a una charla que no se está mirando, y el «pop» suena con
 * cualquier mensaje de otra persona (utilidades/sonidos.ts). Al móvil no
 * va nada desde aquí: eso lo decide el servidor, que no se lo manda a
 * quien está en línea (ver EnviarMensajeDeChatAlMovil).
 * ---------------------------------------------------------------------
 */
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { despedirseDelChat, latirEnElChat } from "@/api/chat";
import {
  clavesDelChat,
  useAbrirConversacionDirecta,
  useConversaciones,
} from "@/hooks/useChat";
import { useSesion } from "@/providers/ProveedorSesion";
import { useEventoPersonal, useTiempoReal } from "@/providers/ProveedorTiempoReal";
import { avisarDeError, avisarDeNotificacion } from "@/utilidades/avisos";
import { sonarMensaje } from "@/utilidades/sonidos";
import type { LatidoDelChat, SugerenciaDeMarca } from "@/tipos/modelos";

/** Una marca que alguien quiere mandar por el chat desde su ficha. */
export type MarcaParaCompartir = Pick<SugerenciaDeMarca, "id" | "nombre" | "logoUrl">;

interface ValorDelChat {
  /** Suma de «sin leer» de todas las charlas, contada por el servidor. */
  sinLeer: number;

  ventanaAbierta: boolean;
  /** La charla que enseña la ventana flotante; null = la lista. */
  conversacionDeLaVentana: string | null;
  abrirVentana: (idDeLaConversacion?: string | null) => void;
  cerrarVentana: () => void;
  elegirConversacionDeLaVentana: (idDeLaConversacion: string | null) => void;

  /** Abre (o crea) la charla con alguien, en la ventana o en la página. */
  escribirA: (idDeLaPersona: string) => Promise<void>;
  abriendoCharla: boolean;

  /**
   * Marca que se quiere mandar por el chat. La recoge la caja de
   * escritura de la próxima charla que se abra.
   */
  marcaParaCompartir: MarcaParaCompartir | null;
  compartirMarca: (marca: MarcaParaCompartir) => void;
  tomarMarcaParaCompartir: () => MarcaParaCompartir | null;
  descartarMarcaParaCompartir: () => void;

  /**
   * Una charla se apunta aquí mientras está en pantalla, para no avisar
   * de lo que la persona ya está viendo. Devuelve con qué borrarse.
   */
  anotarCharlaALaVista: (idDeLaConversacion: string) => () => void;
  /** Lo mismo con el chat entero (ventana o página): late más a menudo. */
  anotarChatAbierto: () => () => void;
}

const ContextoDelChat = createContext<ValorDelChat | null>(null);

const INTERVALO_EN_VIVO_MS = 30_000;
const INTERVALO_EN_VIVO_CON_EL_CHAT_ABIERTO_MS = 10_000;
const INTERVALO_SIN_TIEMPO_REAL_MS = 15_000;
const INTERVALO_CON_EL_CHAT_ABIERTO_MS = 5_000;

/** Para comparar dos latidos sin que importe el orden de los ids. */
function huellaDeQuienEsta(ids: string[]): string {
  return [...ids].sort().join(",");
}

export function ProveedorChat({ children }: { children: ReactNode }) {
  const { estadoDeLaSesion, usuario } = useSesion();
  const haySesion = estadoDeLaSesion === "conSesion" && usuario !== null;

  const clienteDeConsultas = useQueryClient();
  const { estadoDeLaConexion } = useTiempoReal();
  const enVivo = estadoDeLaConexion === "enVivo";

  const navegar = useNavigate();
  const ubicacion = useLocation();

  const [ventanaAbierta, establecerVentanaAbierta] = useState(false);
  const [conversacionDeLaVentana, establecerConversacionDeLaVentana] = useState<string | null>(null);
  const [marcaParaCompartir, establecerMarcaParaCompartir] = useState<MarcaParaCompartir | null>(null);
  const [chatsAbiertos, establecerChatsAbiertos] = useState(0);

  const charlasALaVista = useRef(new Map<string, number>());
  const ultimoLatido = useRef<LatidoDelChat | null>(null);

  const { conversaciones, datos: datosDeLasConversaciones } = useConversaciones({ habilitado: haySesion });
  const abrirDirecta = useAbrirConversacionDirecta();

  const sinLeer = conversaciones.reduce((suma, conversacion) => suma + conversacion.sinLeer, 0);

  /* ---------------------------------------------------------------- */
  /* El latido                                                        */
  /* ---------------------------------------------------------------- */

  const chatAbierto = chatsAbiertos > 0;

  useEffect(() => {
    if (!haySesion) return;

    let cancelado = false;

    const latir = async (visible: boolean) => {
      try {
        const latido = await latirEnElChat(visible);

        if (cancelado) return;

        const anterior = ultimoLatido.current;
        ultimoLatido.current = latido;
        clienteDeConsultas.setQueryData(clavesDelChat.latido, latido);

        // Algo se movió desde el latido anterior: se pide lo que falte.
        // Con Reverb esto casi nunca dispara nada, porque ya se pidió al
        // llegar el aviso; es la red por si se perdió alguno.
        if (
          anterior === null ||
          anterior.ultimoMensajeId !== latido.ultimoMensajeId ||
          anterior.sinLeer !== latido.sinLeer
        ) {
          void clienteDeConsultas.invalidateQueries({ queryKey: clavesDelChat.conversaciones });

          if (anterior !== null) {
            void clienteDeConsultas.invalidateQueries({ queryKey: clavesDelChat.todosLosMensajes });
          }
        }

        // Alguien entró o se fue: la lista del equipo trae el «visto hace…»
        // de quien se acaba de ir, y sin esto diría la hora de la vez
        // anterior hasta el siguiente refresco.
        if (anterior !== null && huellaDeQuienEsta(anterior.enLinea) !== huellaDeQuienEsta(latido.enLinea)) {
          void clienteDeConsultas.invalidateQueries({ queryKey: clavesDelChat.personas });
        }
      } catch {
        // Sin red o con el servidor reiniciándose: el latido siguiente lo
        // arregla. No se avisa de nada, no es algo que la persona haya
        // pedido.
      }
    };

    const intervalo = enVivo
      ? chatAbierto
        ? INTERVALO_EN_VIVO_CON_EL_CHAT_ABIERTO_MS
        : INTERVALO_EN_VIVO_MS
      : chatAbierto
        ? INTERVALO_CON_EL_CHAT_ABIERTO_MS
        : INTERVALO_SIN_TIEMPO_REAL_MS;

    if (document.visibilityState === "visible") {
      void latir(true);
    }

    const temporizador = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void latir(true);
      }
    }, intervalo);

    const alCambiarLaVisibilidad = () => void latir(document.visibilityState === "visible");

    document.addEventListener("visibilitychange", alCambiarLaVisibilidad);
    window.addEventListener("pagehide", despedirseDelChat);

    return () => {
      cancelado = true;
      window.clearInterval(temporizador);
      document.removeEventListener("visibilitychange", alCambiarLaVisibilidad);
      window.removeEventListener("pagehide", despedirseDelChat);
    };
  }, [haySesion, enVivo, chatAbierto, clienteDeConsultas]);

  // Al cerrar sesión se olvida todo lo del chat: la siguiente persona que
  // entre en este navegador no tiene por qué ver ni un nombre.
  useEffect(() => {
    if (haySesion) return;

    ultimoLatido.current = null;
    establecerVentanaAbierta(false);
    establecerConversacionDeLaVentana(null);
    establecerMarcaParaCompartir(null);
    clienteDeConsultas.removeQueries({ queryKey: clavesDelChat.todo });
  }, [haySesion, clienteDeConsultas]);

  /* ---------------------------------------------------------------- */
  /* En vivo                                                          */
  /* ---------------------------------------------------------------- */

  useEventoPersonal<{ tipo: string; conversacionId: string; mensajeId: number | null }>(
    ".chat",
    (aviso) => {
      void clienteDeConsultas.invalidateQueries({ queryKey: clavesDelChat.conversaciones });
      void clienteDeConsultas.invalidateQueries({ queryKey: clavesDelChat.mensajes(aviso.conversacionId) });
      void clienteDeConsultas.invalidateQueries({ queryKey: clavesDelChat.conversacion(aviso.conversacionId) });
    },
  );

  /* ---------------------------------------------------------------- */
  /* Aviso en pantalla de mensaje nuevo                               */
  /* ---------------------------------------------------------------- */

  const ultimoMensajeConocido = useRef<Map<string, number> | null>(null);

  const abrirConversacion = useCallback(
    (idDeLaConversacion: string) => {
      if (ubicacion.pathname.startsWith("/chat")) {
        navegar(`/chat/${idDeLaConversacion}`);
      } else {
        establecerConversacionDeLaVentana(idDeLaConversacion);
        establecerVentanaAbierta(true);
      }
    },
    [navegar, ubicacion.pathname],
  );

  useEffect(() => {
    if (datosDeLasConversaciones === undefined) return;

    const conocidos = ultimoMensajeConocido.current;
    const nuevosConocidos = new Map<string, number>();
    let llegoAlgoDeOtro = false;

    for (const conversacion of datosDeLasConversaciones) {
      const ultimo = conversacion.ultimoMensaje;
      nuevosConocidos.set(conversacion.id, ultimo?.id ?? 0);

      // La primera carga no avisa de nada: lo que ya estaba al entrar se
      // ve en el globo, no en un aviso por charla.
      if (conocidos === null || ultimo === null) continue;

      const esNuevo = ultimo.id > (conocidos.get(conversacion.id) ?? 0);

      // El «pop» suena también en la charla que se está mirando (el aviso
      // flotante no, que ya se lee ahí mismo): es lo que hace levantar la
      // vista cuando contestan.
      if (esNuevo && !ultimo.esMio && !ultimo.esDeSistema) {
        llegoAlgoDeOtro = true;
      }

      if (
        esNuevo &&
        !ultimo.esMio &&
        !ultimo.esDeSistema &&
        conversacion.sinLeer > 0 &&
        !charlasALaVista.current.has(conversacion.id) &&
        document.visibilityState === "visible"
      ) {
        avisarDeNotificacion(
          conversacion.esGrupo ? `${ultimo.autorNombre} · ${conversacion.nombre}` : ultimo.autorNombre,
          recortar(ultimo.texto, 120),
          () => abrirConversacion(conversacion.id),
        );
      }
    }

    ultimoMensajeConocido.current = nuevosConocidos;

    // Uno por tanda, aunque hayan llegado varios a la vez.
    if (llegoAlgoDeOtro) sonarMensaje();
  }, [datosDeLasConversaciones, abrirConversacion]);

  /* ---------------------------------------------------------------- */
  /* Lo que se ofrece a las pantallas                                 */
  /* ---------------------------------------------------------------- */

  const escribirA = useCallback(
    async (idDeLaPersona: string) => {
      try {
        const conversacion = await abrirDirecta.mutateAsync(idDeLaPersona);
        abrirConversacion(conversacion.id);
      } catch (error) {
        avisarDeError(error, "No se pudo abrir la charla");
      }
    },
    [abrirDirecta, abrirConversacion],
  );

  // Estables a propósito: las pantallas los usan dentro de efectos, y si
  // cambiaran con cada mensaje se borrarían y volverían a apuntar solas.
  const anotarCharlaALaVista = useCallback((idDeLaConversacion: string) => {
    const mapa = charlasALaVista.current;
    mapa.set(idDeLaConversacion, (mapa.get(idDeLaConversacion) ?? 0) + 1);

    return () => {
      const quedan = (mapa.get(idDeLaConversacion) ?? 1) - 1;
      if (quedan <= 0) mapa.delete(idDeLaConversacion);
      else mapa.set(idDeLaConversacion, quedan);
    };
  }, []);

  const anotarChatAbierto = useCallback(() => {
    establecerChatsAbiertos((cuantos) => cuantos + 1);

    return () => establecerChatsAbiertos((cuantos) => Math.max(0, cuantos - 1));
  }, []);

  const valor = useMemo<ValorDelChat>(
    () => ({
      sinLeer,
      ventanaAbierta,
      conversacionDeLaVentana,
      abrirVentana: (idDeLaConversacion) => {
        if (idDeLaConversacion !== undefined) {
          establecerConversacionDeLaVentana(idDeLaConversacion);
        }
        establecerVentanaAbierta(true);
      },
      cerrarVentana: () => establecerVentanaAbierta(false),
      elegirConversacionDeLaVentana: establecerConversacionDeLaVentana,
      escribirA,
      abriendoCharla: abrirDirecta.isPending,
      marcaParaCompartir,
      compartirMarca: (marca) => {
        establecerMarcaParaCompartir(marca);

        // Se abre en la lista, para elegir a quién mandársela.
        if (!ubicacion.pathname.startsWith("/chat")) {
          establecerConversacionDeLaVentana(null);
          establecerVentanaAbierta(true);
        }
      },
      tomarMarcaParaCompartir: () => {
        const pendiente = marcaParaCompartir;
        if (pendiente !== null) establecerMarcaParaCompartir(null);

        return pendiente;
      },
      descartarMarcaParaCompartir: () => establecerMarcaParaCompartir(null),
      anotarCharlaALaVista,
      anotarChatAbierto,
    }),
    [
      sinLeer,
      ventanaAbierta,
      conversacionDeLaVentana,
      escribirA,
      abrirDirecta.isPending,
      marcaParaCompartir,
      ubicacion.pathname,
      anotarCharlaALaVista,
      anotarChatAbierto,
    ],
  );

  return <ContextoDelChat.Provider value={valor}>{children}</ContextoDelChat.Provider>;
}

export function useChat(): ValorDelChat {
  const contexto = useContext(ContextoDelChat);

  if (contexto === null) {
    throw new Error("useChat debe usarse dentro de <ProveedorChat>.");
  }

  return contexto;
}

function recortar(texto: string, largo: number): string {
  return texto.length > largo ? `${texto.slice(0, largo - 1)}…` : texto;
}
