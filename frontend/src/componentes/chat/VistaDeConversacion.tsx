/**
 * componentes/chat/VistaDeConversacion.tsx
 * ---------------------------------------------------------------------
 * Una charla abierta: cabecera, mensajes y caja de escribir. La misma
 * pieza sirve para la ventana flotante y para la página del chat.
 *
 * LO QUE SE VE, SE DA POR LEÍDO. Con la pestaña a la vista, al llegar
 * mensajes nuevos se avisa al servidor de hasta dónde se leyó; eso baja
 * el número del globo y enciende el doble check en la pantalla de quien
 * escribió. Con la pestaña escondida no: que la charla esté abierta
 * detrás de otra ventana no quiere decir que alguien la esté leyendo.
 *
 * EL DOBLE CHECK de los mensajes propios sale del servidor
 * (`leidoPorLosDemasHasta`): en una directa, cuando la otra persona lo
 * vio; en un grupo, cuando lo vio el último.
 *
 * Al subir del todo se piden los mensajes anteriores, y la vista se
 * queda donde estaba: sin corregirlo, cada tanda nueva empujaría la
 * charla hacia abajo y se perdería el sitio.
 * ---------------------------------------------------------------------
 */
import { Button, Spinner, Tooltip } from "@heroui/react";
import { ArrowDown, ArrowLeft, Check, CheckCheck, Info, Maximize2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { mensajeDeError } from "@/api/clienteHttp";
import { AvatarDeConversacion, AvatarDePersona } from "@/componentes/chat/AvataresDelChat";
import { CajaDeEscritura } from "@/componentes/chat/CajaDeEscritura";
import { TextoDelMensaje } from "@/componentes/chat/TextoDelMensaje";
import {
  useConversacion,
  useMarcarComoLeida,
  useMensajesDeLaConversacion,
  useQuienEstaEnLinea,
} from "@/hooks/useChat";
import { useChat } from "@/providers/ProveedorChat";
import { useUsuarioAutenticado } from "@/providers/ProveedorSesion";
import type { ConversacionDelChat, MensajeDeChat } from "@/tipos/modelos";
import {
  formatearDiaDelChat,
  formatearHora,
  formatearPresencia,
  sonDelMismoDia,
} from "@/utilidades/formato";

/** Dos mensajes del mismo autor con menos de esto entre medias van juntos. */
const MINUTOS_PARA_AGRUPAR = 5;

/** A menos de esto del final, lo nuevo baja la charla solo. */
const PIXELES_CERCA_DEL_FINAL = 140;

export function VistaDeConversacion({
  idDeLaConversacion,
  alVolver,
  alCerrar,
  alVerDetalles,
  enLaVentana = false,
}: {
  idDeLaConversacion: string;
  /** La flecha de volver a la lista (ventana y móvil). */
  alVolver?: () => void;
  /** La X de la ventana flotante. */
  alCerrar?: () => void;
  /** Los detalles de un grupo: quién está, nombre, salir. */
  alVerDetalles: () => void;
  enLaVentana?: boolean;
}) {
  const usuario = useUsuarioAutenticado();
  const navegar = useNavigate();
  const { anotarCharlaALaVista, cerrarVentana } = useChat();
  const enLinea = useQuienEstaEnLinea();

  const consultaDeLaConversacion = useConversacion(idDeLaConversacion);
  const conversacion = consultaDeLaConversacion.data;

  const {
    mensajes,
    hayMasAntiguos,
    leidoPorLosDemasHasta,
    estaCargando,
    error,
    cargarAnteriores,
    cargandoAnteriores,
  } = useMensajesDeLaConversacion(idDeLaConversacion);

  const marcarComoLeida = useMarcarComoLeida();

  const zonaDeMensajes = useRef<HTMLDivElement>(null);
  const alturaAntesDeCargar = useRef<number | null>(null);
  const ultimoLeidoEnviado = useRef(0);
  const ultimoIdPintado = useRef<number | null>(null);
  const [hayNuevosAbajo, establecerHayNuevosAbajo] = useState(false);

  // Mientras está en pantalla, no hace falta avisar de lo que llega aquí.
  useEffect(() => anotarCharlaALaVista(idDeLaConversacion), [anotarCharlaALaVista, idDeLaConversacion]);

  useEffect(() => {
    ultimoLeidoEnviado.current = 0;
    ultimoIdPintado.current = null;
    establecerHayNuevosAbajo(false);
  }, [idDeLaConversacion]);

  /* ---------------------------------------------------------------- */
  /* Leído                                                            */
  /* ---------------------------------------------------------------- */

  const ultimoMensaje = mensajes[mensajes.length - 1];

  useEffect(() => {
    const avisarDeLoLeido = () => {
      if (ultimoMensaje === undefined || document.visibilityState !== "visible") return;

      const yaLeido = Math.max(ultimoLeidoEnviado.current, conversacion?.miUltimoLeidoId ?? 0);

      if (ultimoMensaje.id <= yaLeido) return;

      ultimoLeidoEnviado.current = ultimoMensaje.id;
      marcarComoLeida.mutate({ idDeLaConversacion, hasta: ultimoMensaje.id });
    };

    avisarDeLoLeido();
    document.addEventListener("visibilitychange", avisarDeLoLeido);

    return () => document.removeEventListener("visibilitychange", avisarDeLoLeido);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimoMensaje?.id, conversacion?.miUltimoLeidoId, idDeLaConversacion]);

  /* ---------------------------------------------------------------- */
  /* Desplazamiento                                                   */
  /* ---------------------------------------------------------------- */

  function bajarAlFinal(suave = false) {
    const zona = zonaDeMensajes.current;

    if (zona === null) return;

    zona.scrollTo({ top: zona.scrollHeight, behavior: suave ? "smooth" : "auto" });
    establecerHayNuevosAbajo(false);
  }

  const primerId = mensajes[0]?.id;

  useLayoutEffect(() => {
    const zona = zonaDeMensajes.current;

    if (zona === null || ultimoMensaje === undefined) return;

    // Llegó una tanda ANTERIOR: se deja la vista donde estaba.
    if (alturaAntesDeCargar.current !== null) {
      zona.scrollTop = zona.scrollHeight - alturaAntesDeCargar.current;
      alturaAntesDeCargar.current = null;

      return;
    }

    const anterior = ultimoIdPintado.current;
    ultimoIdPintado.current = ultimoMensaje.id;

    // La primera vez, al final.
    if (anterior === null) {
      zona.scrollTop = zona.scrollHeight;

      return;
    }

    if (ultimoMensaje.id === anterior) return;

    const distanciaAlFinal = zona.scrollHeight - zona.scrollTop - zona.clientHeight;

    // Lo propio y lo que llega estando abajo, se enseña. Si se estaba
    // leyendo más arriba, no se arrastra a nadie: sale un botón.
    if (ultimoMensaje.esMio || distanciaAlFinal < PIXELES_CERCA_DEL_FINAL + 200) {
      zona.scrollTop = zona.scrollHeight;
    } else {
      establecerHayNuevosAbajo(true);
    }
    // Se mira solo cuándo cambian el primero o el último: es lo que dice
    // si llegó algo nuevo o una tanda anterior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimoMensaje?.id, primerId]);

  function alDesplazar() {
    const zona = zonaDeMensajes.current;

    if (zona === null) return;

    if (zona.scrollHeight - zona.scrollTop - zona.clientHeight < PIXELES_CERCA_DEL_FINAL) {
      establecerHayNuevosAbajo(false);
    }

    if (zona.scrollTop < 80 && hayMasAntiguos && !cargandoAnteriores) {
      pedirAnteriores();
    }
  }

  function pedirAnteriores() {
    const zona = zonaDeMensajes.current;

    if (zona !== null) {
      alturaAntesDeCargar.current = zona.scrollHeight - zona.scrollTop;
    }

    void cargarAnteriores().catch(() => {
      alturaAntesDeCargar.current = null;
    });
  }

  function abrirMarca(enlace: string) {
    // En el móvil la ventana tapa la pantalla entera: se cierra para que
    // se vea la ficha.
    if (enLaVentana && window.matchMedia?.("(max-width: 639px)").matches) {
      cerrarVentana();
    }

    navegar(enlace);
  }

  /* ---------------------------------------------------------------- */
  /* Interfaz                                                         */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <CabeceraDeLaCharla
        // En la página, en pantalla grande, la lista ya está al lado y la
        // flecha de volver sobra.
        volverSoloEnPantallaEstrecha={!enLaVentana}
        alCerrar={alCerrar}
        alVerDetalles={alVerDetalles}
        alVolver={alVolver}
        conversacion={conversacion}
        enLaVentana={enLaVentana}
        enLinea={enLinea}
        idPropio={usuario.id}
        onAbrirEnGrande={() => {
          cerrarVentana();
          navegar(`/chat/${idDeLaConversacion}`);
        }}
      />

      <div className="relative min-h-0 flex-1">
        <div
          ref={zonaDeMensajes}
          className="h-full overflow-y-auto px-3 py-3"
          onScroll={alDesplazar}
        >
          {estaCargando ? (
            <div className="flex h-full items-center justify-center">
              <Spinner size="sm" />
            </div>
          ) : error ? (
            <p className="m-4 rounded-xl bg-danger-50 px-3 py-2 text-xs text-danger dark:bg-danger-100/10">
              {mensajeDeError(error)}
            </p>
          ) : mensajes.length === 0 ? (
            <CharlaVacia conversacion={conversacion} />
          ) : (
            <>
              {hayMasAntiguos && (
                <div className="mb-3 flex justify-center">
                  <Button
                    isLoading={cargandoAnteriores}
                    radius="full"
                    size="sm"
                    variant="flat"
                    onPress={pedirAnteriores}
                  >
                    Ver mensajes anteriores
                  </Button>
                </div>
              )}

              <ListaDeMensajes
                alAbrirMarca={abrirMarca}
                conversacion={conversacion}
                leidoPorLosDemasHasta={leidoPorLosDemasHasta}
                mensajes={mensajes}
              />
            </>
          )}
        </div>

        {hayNuevosAbajo && (
          <Button
            className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-md"
            color="primary"
            radius="full"
            size="sm"
            startContent={<ArrowDown className="size-3.5" />}
            onPress={() => bajarAlFinal(true)}
          >
            Mensajes nuevos
          </Button>
        )}
      </div>

      <div className={enLaVentana ? "margen-seguro-inferior" : undefined}>
        <CajaDeEscritura idDeLaConversacion={idDeLaConversacion} alEnviar={() => bajarAlFinal()} />
      </div>
    </div>
  );
}

/* ==================================================================== */
/* Cabecera                                                             */
/* ==================================================================== */

function CabeceraDeLaCharla({
  conversacion,
  idPropio,
  enLinea,
  enLaVentana,
  volverSoloEnPantallaEstrecha,
  alVolver,
  alCerrar,
  alVerDetalles,
  onAbrirEnGrande,
}: {
  conversacion: ConversacionDelChat | undefined;
  idPropio: string;
  enLinea: Set<string>;
  enLaVentana: boolean;
  volverSoloEnPantallaEstrecha: boolean;
  alVolver?: () => void;
  alCerrar?: () => void;
  alVerDetalles: () => void;
  onAbrirEnGrande: () => void;
}) {
  let subtitulo = "";

  if (conversacion?.esGrupo) {
    const cuantos = conversacion.participantes.length;
    const conectados = conversacion.participantes.filter(
      (persona) => persona.id !== idPropio && enLinea.has(persona.id),
    ).length;

    subtitulo = `${cuantos} personas${conectados > 0 ? ` · ${conectados} en línea` : ""}`;
  } else if (conversacion !== undefined) {
    const otra = conversacion.participantes.find((persona) => persona.id !== idPropio);

    if (otra !== undefined) {
      subtitulo = formatearPresencia(enLinea.has(otra.id), otra.vistoPorUltimaVezEn);
    }
  }

  return (
    <header className="flex items-center gap-2 border-b border-default-100 px-2 py-2">
      {alVolver !== undefined && (
        <Button
          isIconOnly
          aria-label="Volver a las charlas"
          className={volverSoloEnPantallaEstrecha ? "lg:hidden" : undefined}
          radius="full"
          size="sm"
          variant="light"
          onPress={alVolver}
        >
          <ArrowLeft className="size-5" />
        </Button>
      )}

      <button
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 py-0.5 text-left transition hover:bg-default-100 disabled:hover:bg-transparent"
        disabled={!conversacion?.esGrupo}
        type="button"
        onClick={alVerDetalles}
      >
        {conversacion !== undefined && (
          <AvatarDeConversacion conversacion={conversacion} enLinea={enLinea} idPropio={idPropio} tamano="md" />
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">
            {conversacion?.nombre ?? "…"}
          </span>
          {subtitulo !== "" && (
            <span
              className={[
                "block truncate text-[11px]",
                subtitulo === "en línea" ? "text-success" : "text-default-500",
              ].join(" ")}
            >
              {subtitulo}
            </span>
          )}
        </span>
      </button>

      {conversacion?.esGrupo && (
        <Tooltip content="Detalles del grupo">
          <Button isIconOnly aria-label="Detalles del grupo" radius="full" size="sm" variant="light" onPress={alVerDetalles}>
            <Info className="size-4" />
          </Button>
        </Tooltip>
      )}

      {enLaVentana && (
        <Tooltip content="Abrir en pantalla completa">
          <Button
            isIconOnly
            aria-label="Abrir en pantalla completa"
            className="hidden sm:inline-flex"
            radius="full"
            size="sm"
            variant="light"
            onPress={onAbrirEnGrande}
          >
            <Maximize2 className="size-4" />
          </Button>
        </Tooltip>
      )}

      {alCerrar !== undefined && (
        <Button isIconOnly aria-label="Cerrar el chat" radius="full" size="sm" variant="light" onPress={alCerrar}>
          <X className="size-5" />
        </Button>
      )}
    </header>
  );
}

/* ==================================================================== */
/* Mensajes                                                             */
/* ==================================================================== */

function ListaDeMensajes({
  mensajes,
  conversacion,
  leidoPorLosDemasHasta,
  alAbrirMarca,
}: {
  mensajes: MensajeDeChat[];
  conversacion: ConversacionDelChat | undefined;
  leidoPorLosDemasHasta: number;
  alAbrirMarca: (enlace: string) => void;
}) {
  const esGrupo = conversacion?.esGrupo ?? false;
  const personasPorId = new Map((conversacion?.participantes ?? []).map((persona) => [persona.id, persona]));

  return (
    <ol className="flex flex-col">
      {mensajes.map((mensaje, posicion) => {
        const anterior = mensajes[posicion - 1];
        const siguiente = mensajes[posicion + 1];

        const empiezaDia = anterior === undefined || !sonDelMismoDia(anterior.creadoEn, mensaje.creadoEn);
        const vaConElAnterior = !empiezaDia && seAgrupan(anterior, mensaje);
        const vaConElSiguiente =
          siguiente !== undefined && sonDelMismoDia(mensaje.creadoEn, siguiente.creadoEn) && seAgrupan(mensaje, siguiente);

        return (
          <li key={mensaje.id}>
            {empiezaDia && (
              <div className="my-3 flex justify-center">
                <span className="rounded-full bg-default-100 px-3 py-0.5 text-[11px] font-medium capitalize text-default-500">
                  {formatearDiaDelChat(mensaje.creadoEn)}
                </span>
              </div>
            )}

            {mensaje.tipo === "sistema" ? (
              <p className="my-2 text-center text-[11px] text-default-400">{mensaje.cuerpo}</p>
            ) : (
              <Burbuja
                alAbrirMarca={alAbrirMarca}
                autor={mensaje.autorId !== null ? personasPorId.get(mensaje.autorId) : undefined}
                mensaje={mensaje}
                mostrarAutor={esGrupo && !mensaje.esMio && !vaConElAnterior}
                mostrarAvatar={esGrupo && !mensaje.esMio && !vaConElSiguiente}
                reservarHuecoDeAvatar={esGrupo && !mensaje.esMio}
                separacionArriba={!vaConElAnterior}
                visto={mensaje.esMio && mensaje.id <= leidoPorLosDemasHasta}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function seAgrupan(uno: MensajeDeChat, otro: MensajeDeChat): boolean {
  if (uno.tipo !== "texto" || otro.tipo !== "texto" || uno.autorId !== otro.autorId) return false;

  const entreMedias = new Date(otro.creadoEn ?? 0).getTime() - new Date(uno.creadoEn ?? 0).getTime();

  return entreMedias < MINUTOS_PARA_AGRUPAR * 60_000;
}

function Burbuja({
  mensaje,
  autor,
  mostrarAutor,
  mostrarAvatar,
  reservarHuecoDeAvatar,
  separacionArriba,
  visto,
  alAbrirMarca,
}: {
  mensaje: MensajeDeChat;
  autor: { nombre: string; colorAcento: string | null; urlAvatar: string | null } | undefined;
  mostrarAutor: boolean;
  mostrarAvatar: boolean;
  reservarHuecoDeAvatar: boolean;
  separacionArriba: boolean;
  visto: boolean;
  alAbrirMarca: (enlace: string) => void;
}) {
  const esMio = mensaje.esMio;

  return (
    <div className={["flex items-end gap-1.5", esMio ? "justify-end" : "justify-start", separacionArriba ? "mt-2" : "mt-0.5"].join(" ")}>
      {/* En un grupo, el hueco del avatar se guarda siempre, para que las
          burbujas de una misma persona queden alineadas; la cara sale
          solo junto a la última de cada tanda. */}
      {reservarHuecoDeAvatar && (
        <span className={mostrarAvatar ? "" : "invisible"}>
          <AvatarDePersona
            persona={autor ?? { nombre: mensaje.autorNombre, colorAcento: null, urlAvatar: null }}
            tamano="sm"
          />
        </span>
      )}

      <div
        className={[
          "max-w-[82%] rounded-2xl px-3 py-1.5 text-sm leading-relaxed",
          esMio
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md bg-default-100 text-foreground",
        ].join(" ")}
      >
        {mostrarAutor && (
          // El color de perfil va en un punto y no en el nombre: un
          // amarillo sobre el gris de la burbuja no se leería.
          <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-default-600">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: autor?.colorAcento ?? "#94a3b8" }}
            />
            {mensaje.autorNombre}
          </p>
        )}

        <TextoDelMensaje alAbrirMarca={alAbrirMarca} mensaje={mensaje} />

        <p
          className={[
            "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
            esMio ? "text-primary-foreground/70" : "text-default-400",
          ].join(" ")}
        >
          {formatearHora(mensaje.creadoEn)}
          {esMio &&
            (visto ? (
              <CheckCheck aria-label="Visto" className="size-3.5" />
            ) : (
              <Check aria-label="Enviado" className="size-3.5" />
            ))}
        </p>
      </div>
    </div>
  );
}

function CharlaVacia({ conversacion }: { conversacion: ConversacionDelChat | undefined }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
      <span className="text-4xl">👋</span>
      <p className="text-sm font-semibold text-foreground">
        {conversacion?.esGrupo ? "El grupo está listo" : `Escríbele a ${conversacion?.nombre ?? "esta persona"}`}
      </p>
      <p className="text-xs text-default-500">
        Puedes etiquetar una marca con <strong>#</strong> para que la abran desde aquí.
      </p>
    </div>
  );
}
