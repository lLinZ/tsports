/**
 * componentes/crm/PanelDeComentarios.tsx
 * ---------------------------------------------------------------------
 * La bitácora de una marca: la columna derecha de la ficha.
 *
 * Es el hilo donde el equipo deja constancia de las llamadas, las
 * respuestas y lo que hay que hacer después. Se lee de arriba abajo,
 * como una conversación, y se desplaza sola al final para enseñar
 * primero lo más reciente.
 *
 * Cualquiera que pueda ver la marca puede comentarla, aunque no pueda
 * editarla: si un vendedor se entera de algo de una marca que trabaja
 * otro, lo natural es que pueda avisarle por aquí.
 *
 * TRES COSAS QUE NO SE DECIDEN AQUÍ
 *
 *   · **A quién se puede etiquetar** lo dice el servidor, por marca
 *     (`useMencionablesDeMarca`). Nunca es «el equipo»: un agente solo
 *     ve lo suyo y la notificación lleva dentro el nombre de la marca.
 *   · **Quién puede editar o borrar** viene resuelto en cada entrada
 *     (`puedeEditarlo`, `puedeBorrarlo`). Aquí no se compara ni el autor
 *     ni el rol; el servidor lo vuelve a comprobar al recibir.
 *   · **Cuántas reacciones hay** viene contado. No se recuenta nada en
 *     el navegador.
 *
 * Y UNA QUE SÍ: una entrada eliminada SE SIGUE VIENDO, sin texto y
 * diciendo quién la quitó. Es lo que hace que el histórico exportado
 * valga como registro.
 *
 * LOS ADJUNTOS suben mientras se escribe, cada uno con su barra (con el
 * clip, soltándolos encima o pegando una captura), y la entrada solo dice
 * al publicarse cuáles lleva. Una entrada puede ser solo un fichero. Al
 * corregirla no se tocan: lo que se envió ese día no cambia.
 * ---------------------------------------------------------------------
 */
import {
  Button,
  Chip,
  Listbox,
  ListboxItem,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  Textarea,
  Tooltip,
} from "@heroui/react";
import {
  AlertTriangle,
  AtSign,
  CornerDownRight,
  Download,
  FileText,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  PhoneCall,
  RotateCw,
  Send,
  SmilePlus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { mensajeDeError } from "@/api/clienteHttp";
import { obtenerHistoricoDeMarca, subirAdjunto } from "@/api/marcas";
import { BarraDeScrollDibujada } from "@/componentes/comunes/BarraDeScrollDibujada";
import {
  BloqueDeCarga,
  EstadoVacio,
} from "@/componentes/comunes/EstadosDePantalla";
import { VisorDeGaleria } from "@/componentes/comunes/VisorDeGaleria";
import { useCatalogos } from "@/hooks/useCatalogos";
import {
  useComentariosDeMarca,
  useCrearComentario,
  useEditarComentario,
  useEliminarComentario,
  useMencionablesDeMarca,
  useReaccionarAComentario,
} from "@/hooks/useMarcas";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import {
  descargarLaBitacoraEnExcel,
  imprimirLaBitacora,
} from "@/utilidades/exportarBitacora";
import {
  TIPOS_ADMITIDOS_EN_GALERIA_Y_BITACORA,
  esImagen,
  generarMiniatura,
  motivoParaNoSubir,
} from "@/utilidades/ficheros";
import {
  formatearTamanoDeFichero,
  formatearTiempoRelativo,
  inicialesDe,
} from "@/utilidades/formato";
import { elementosDeLosAdjuntos } from "@/utilidades/galeria";
import type {
  AdjuntoDeComentario,
  ComentarioDeMarca,
  DatosDeComentario,
  PersonaMencionable,
} from "@/tipos/modelos";

/**
 * Las reacciones que se ofrecen.
 *
 * Una lista corta y a propósito: un selector de emoji entero es una
 * dependencia de cientos de kilobytes para que el equipo acabe usando
 * estos cinco. Si algún día hace falta otro, se añade aquí.
 */
const REACCIONES_OFRECIDAS = ["👍", "🎉", "✅", "👀", "❤️"] as const;

export function PanelDeComentarios({ idDeLaMarca }: { idDeLaMarca: string }) {
  const consultaDeComentarios = useComentariosDeMarca(idDeLaMarca);
  const consultaDeMencionables = useMencionablesDeMarca(idDeLaMarca);

  const crearComentario = useCrearComentario(idDeLaMarca);
  const editarComentario = useEditarComentario(idDeLaMarca);
  const eliminarComentario = useEliminarComentario(idDeLaMarca);
  const reaccionar = useReaccionarAComentario(idDeLaMarca);

  const referenciaAlFinalDelHilo = useRef<HTMLDivElement>(null);
  const zonaDelHilo = useRef<HTMLDivElement>(null);

  /** A qué entrada se está respondiendo, si a alguna. */
  const [respondiendoA, establecerRespondiendoA] = useState<ComentarioDeMarca | null>(null);
  /** Qué entrada se está corrigiendo, si alguna. */
  const [editando, establecerEditando] = useState<ComentarioDeMarca | null>(null);

  const hilo = consultaDeComentarios.data ?? [];
  const mencionables = consultaDeMencionables.data ?? [];

  // Al abrir la ficha o al añadir una entrada, se baja al final del
  // hilo: lo último es lo que interesa leer.
  useEffect(() => {
    referenciaAlFinalDelHilo.current?.scrollIntoView({ block: "end" });
  }, [hilo.length]);

  /**
   * Devuelven si se guardó. La caja solo se vacía cuando sí: si falla,
   * lo escrito y los adjuntos ya subidos se quedan para reintentar.
   */
  async function publicar(datos: DatosDeComentario): Promise<boolean> {
    try {
      await crearComentario.mutateAsync({
        ...datos,
        comentarioPadreId: respondiendoA?.id ?? null,
      });

      establecerRespondiendoA(null);

      return true;
    } catch (error) {
      avisarDeError(error, "No se pudo publicar el comentario");

      return false;
    }
  }

  async function guardarLaCorreccion(datos: DatosDeComentario): Promise<boolean> {
    if (editando === null) return false;

    try {
      await editarComentario.mutateAsync({ id: editando.id, datos });

      establecerEditando(null);

      return true;
    } catch (error) {
      avisarDeError(error, "No se pudo guardar el cambio");

      return false;
    }
  }

  async function borrar(idDelComentario: string) {
    try {
      await eliminarComentario.mutateAsync(idDelComentario);
    } catch (error) {
      avisarDeError(error, "No se pudo eliminar el comentario");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="flex flex-1 items-center gap-2 text-sm font-semibold text-foreground">
          <MessageSquarePlus className="size-4 text-primary" />
          Actividad y comentarios
        </h3>

        <MenuDeExportacion idDeLaMarca={idDeLaMarca} hayEntradas={hilo.length > 0} />
      </div>

      {/* Hilo. Con la barra fija, como el resto de la ficha de la marca.
          El margen derecho es el sitio de esa barra, que se dibuja encima
          del borde de la zona y taparía el final de cada comentario. */}
      <div ref={zonaDelHilo} className="barra-de-scroll-fija min-h-0 flex-1 space-y-3 pr-4">
        {consultaDeComentarios.isLoading ? (
          <BloqueDeCarga alto="min-h-32" mensaje="Cargando la bitácora…" />
        ) : consultaDeComentarios.error ? (
          <p className="rounded-xl bg-danger-50 px-3 py-2 text-xs text-danger dark:bg-danger-100/10">
            {mensajeDeError(consultaDeComentarios.error)}
          </p>
        ) : hilo.length === 0 ? (
          <EstadoVacio
            descripcion="Anota aquí las llamadas, las respuestas y lo que haya que hacer después."
            titulo="Todavía no hay comentarios"
          />
        ) : (
          hilo.map((entrada) => (
            <EntradaDeLaBitacora
              key={entrada.id}
              entrada={entrada}
              estaEditandose={editando?.id === entrada.id}
              mencionables={mencionables}
              seEstaRespondiendo={respondiendoA?.id === entrada.id}
              onBorrar={() => void borrar(entrada.id)}
              onCancelarEdicion={() => establecerEditando(null)}
              onEditar={() => {
                establecerRespondiendoA(null);
                establecerEditando(entrada);
              }}
              onGuardarEdicion={guardarLaCorreccion}
              onReaccionar={(emoji) => reaccionar.mutate({ id: entrada.id, emoji })}
              onResponder={() => {
                establecerEditando(null);
                establecerRespondiendoA(entrada);
              }}
              // Las respuestas se editan, se borran y reaccionan igual,
              // pero no se les responde: un solo nivel.
              onBorrarRespuesta={(id) => void borrar(id)}
              onEditarRespuesta={(respuesta) => {
                establecerRespondiendoA(null);
                establecerEditando(respuesta);
              }}
              onReaccionarARespuesta={(id, emoji) => reaccionar.mutate({ id, emoji })}
              idEnEdicion={editando?.id ?? null}
              onGuardarEdicionDeRespuesta={guardarLaCorreccion}
            />
          ))
        )}

        <div ref={referenciaAlFinalDelHilo} />
      </div>

      <BarraDeScrollDibujada zona={zonaDelHilo} />

      {/* Caja de escritura. No sale mientras se corrige una entrada: la
          corrección se escribe en su sitio, dentro del hilo, para no
          dejar dos cajas abiertas a la vez. */}
      {editando === null && (
        <div className="mt-3 flex flex-col gap-2 border-t border-default-100 pt-3">
          {respondiendoA !== null && (
            <div className="flex items-center gap-2 rounded-xl bg-default-100 px-3 py-1.5">
              <CornerDownRight className="size-3.5 shrink-0 text-default-500" />
              <span className="min-w-0 flex-1 truncate text-[11px] text-default-600">
                Respondiendo a {respondiendoA.autorNombre}
              </span>
              <button
                aria-label="Dejar de responder"
                className="shrink-0 text-default-400 transition hover:text-foreground"
                type="button"
                onClick={() => establecerRespondiendoA(null)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          <CajaDeEscritura
            estaGuardando={crearComentario.isPending}
            idDeLaMarcaParaAdjuntar={idDeLaMarca}
            mencionables={mencionables}
            textoDelBoton={respondiendoA === null ? "Comentar" : "Responder"}
            marcadorDePosicion={
              respondiendoA === null
                ? "Escribe qué ha pasado con esta marca…"
                : `Responde a ${respondiendoA.autorNombre}…`
            }
            onEnviar={publicar}
          />
        </div>
      )}
    </div>
  );
}

/* ==================================================================== */
/* Una entrada del hilo                                                 */
/* ==================================================================== */

function EntradaDeLaBitacora({
  entrada,
  mencionables,
  seEstaRespondiendo,
  estaEditandose,
  idEnEdicion,
  onResponder,
  onEditar,
  onBorrar,
  onReaccionar,
  onGuardarEdicion,
  onCancelarEdicion,
  onEditarRespuesta,
  onBorrarRespuesta,
  onReaccionarARespuesta,
  onGuardarEdicionDeRespuesta,
}: {
  entrada: ComentarioDeMarca;
  mencionables: PersonaMencionable[];
  seEstaRespondiendo: boolean;
  estaEditandose: boolean;
  idEnEdicion: string | null;
  onResponder: () => void;
  onEditar: () => void;
  onBorrar: () => void;
  onReaccionar: (emoji: string) => void;
  onGuardarEdicion: (datos: DatosDeComentario) => Promise<boolean>;
  onCancelarEdicion: () => void;
  onEditarRespuesta: (respuesta: ComentarioDeMarca) => void;
  onBorrarRespuesta: (id: string) => void;
  onReaccionarARespuesta: (id: string, emoji: string) => void;
  onGuardarEdicionDeRespuesta: (datos: DatosDeComentario) => Promise<boolean>;
}) {
  return (
    <div className="space-y-2">
      <CuerpoDeLaEntrada
        entrada={entrada}
        estaEditandose={estaEditandose}
        estaResaltada={seEstaRespondiendo}
        mencionables={mencionables}
        puedeResponder
        onBorrar={onBorrar}
        onCancelarEdicion={onCancelarEdicion}
        onEditar={onEditar}
        onGuardarEdicion={onGuardarEdicion}
        onReaccionar={onReaccionar}
        onResponder={onResponder}
      />

      {entrada.respuestas.length > 0 && (
        <div className="space-y-2 border-l-2 border-default-200 pl-3 ml-4">
          {entrada.respuestas.map((respuesta) => (
            <CuerpoDeLaEntrada
              key={respuesta.id}
              entrada={respuesta}
              estaEditandose={idEnEdicion === respuesta.id}
              estaResaltada={false}
              mencionables={mencionables}
              puedeResponder={false}
              onBorrar={() => onBorrarRespuesta(respuesta.id)}
              onCancelarEdicion={onCancelarEdicion}
              onEditar={() => onEditarRespuesta(respuesta)}
              onGuardarEdicion={onGuardarEdicionDeRespuesta}
              onReaccionar={(emoji) => onReaccionarARespuesta(respuesta.id, emoji)}
              onResponder={() => undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CuerpoDeLaEntrada({
  entrada,
  mencionables,
  puedeResponder,
  estaResaltada,
  estaEditandose,
  onResponder,
  onEditar,
  onBorrar,
  onReaccionar,
  onGuardarEdicion,
  onCancelarEdicion,
}: {
  entrada: ComentarioDeMarca;
  mencionables: PersonaMencionable[];
  puedeResponder: boolean;
  estaResaltada: boolean;
  estaEditandose: boolean;
  onResponder: () => void;
  onEditar: () => void;
  onBorrar: () => void;
  onReaccionar: (emoji: string) => void;
  onGuardarEdicion: (datos: DatosDeComentario) => Promise<boolean>;
  onCancelarEdicion: () => void;
}) {
  // Una entrada eliminada deja su hueco, sin texto y con el rastro de
  // quién la quitó. No se esconde: si desapareciera, bastaría con
  // borrar lo incómodo antes de exportar el histórico.
  if (entrada.eliminado) {
    return (
      <article className="rounded-2xl border border-dashed border-default-200 px-3 py-2">
        <p className="text-[11px] italic text-default-400">
          Entrada eliminada por {entrada.eliminadoPorNombre ?? "alguien"}
          {entrada.eliminadoEn !== null && ` · ${formatearTiempoRelativo(entrada.eliminadoEn)}`}
        </p>
      </article>
    );
  }

  if (estaEditandose) {
    return (
      <article className="rounded-2xl bg-default-100 px-3 py-2.5">
        <p className="mb-2 text-[11px] font-semibold text-default-600">
          Corrigiendo tu comentario
        </p>

        <CajaDeEscritura
          estaGuardando={false}
          mencionables={mencionables}
          marcadorDePosicion="Corrige lo que escribiste…"
          // Una entrada que lleva un fichero se entiende sin texto.
          permiteTextoVacio={entrada.adjuntos.length > 0}
          textoDelBoton="Guardar"
          textoInicial={entrada.cuerpo}
          mencionesIniciales={entrada.mencionados.map((persona) => persona.id)}
          onCancelar={onCancelarEdicion}
          onEnviar={onGuardarEdicion}
        />
      </article>
    );
  }

  return (
    <article
      className={[
        "group rounded-2xl px-3 py-2.5 transition",
        estaResaltada ? "bg-primary-50 ring-1 ring-primary-200" : "bg-default-50",
      ].join(" ")}
    >
      <header className="mb-1 flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary text-[10px] font-bold text-primary-foreground">
          {inicialesDe(entrada.autorNombre)}
        </span>

        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">
          {entrada.autorNombre}
        </span>

        {/* Las que dejó «Contacté» dicen cómo fue: llamada, WhatsApp… */}
        {entrada.tipoDeContacto !== null && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700 dark:bg-primary-100/20 dark:text-primary-400">
            <PhoneCall className="size-2.5" />
            {entrada.tipoDeContacto.etiqueta}
          </span>
        )}

        <time className="shrink-0 text-[10px] text-default-400">
          {formatearTiempoRelativo(entrada.creadoEn)}
          {/* Sin esta marca, corregir una frase a los tres meses deja el
              hilo diciendo algo que nadie dijo ese día. */}
          {entrada.editadoEn !== null && " · editado"}
        </time>
      </header>

      {entrada.cuerpo !== "" && (
        <p className="whitespace-pre-wrap break-words pl-8 text-xs leading-relaxed text-default-700">
          {entrada.cuerpo}
        </p>
      )}

      {entrada.adjuntos.length > 0 && <AdjuntosDeLaEntrada adjuntos={entrada.adjuntos} />}

      {entrada.mencionados.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1 pl-8">
          {entrada.mencionados.map((persona) => (
            <Chip key={persona.id} color="primary" radius="full" size="sm" variant="flat">
              @{persona.nombre}
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1 pl-8">
        {entrada.reacciones.map((reaccion) => (
          <Tooltip
            key={reaccion.emoji}
            content={reaccion.quienes.join(", ")}
            placement="top"
          >
            <button
              className={[
                "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition",
                reaccion.laMia
                  ? "bg-primary-100 text-primary-700 ring-1 ring-primary-300"
                  : "bg-default-100 text-default-600 hover:bg-default-200",
              ].join(" ")}
              type="button"
              onClick={() => onReaccionar(reaccion.emoji)}
            >
              <span>{reaccion.emoji}</span>
              <span className="font-semibold">{reaccion.total}</span>
            </button>
          </Tooltip>
        ))}

        <SelectorDeReaccion onElegir={onReaccionar} />

        <div className="flex flex-1 justify-end gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          {puedeResponder && (
            <BotonDeAccion etiqueta="Responder" onPulsar={onResponder}>
              <CornerDownRight className="size-3.5" />
            </BotonDeAccion>
          )}

          {entrada.puedeEditarlo && (
            <BotonDeAccion etiqueta="Editar" onPulsar={onEditar}>
              <Pencil className="size-3.5" />
            </BotonDeAccion>
          )}

          {entrada.puedeBorrarlo && (
            <BotonDeAccion esPeligrosa etiqueta="Eliminar" onPulsar={onBorrar}>
              <Trash2 className="size-3.5" />
            </BotonDeAccion>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Lo que se envió con una entrada: las fotos en pequeño, que se abren en
 * el visor, y los PDF como una línea que se abre en otra pestaña.
 *
 * Las direcciones vienen firmadas y caducan en uno o dos días; se
 * renuevan solas cada vez que se vuelve a pedir la bitácora.
 */
function AdjuntosDeLaEntrada({ adjuntos }: { adjuntos: AdjuntoDeComentario[] }) {
  const [posicionEnElVisor, establecerPosicionEnElVisor] = useState<number | null>(null);

  const fotos = adjuntos
    .map((adjunto, posicion) => ({ adjunto, posicion }))
    .filter(({ adjunto }) => adjunto.tipo === "imagen");
  const documentos = adjuntos.filter((adjunto) => adjunto.tipo === "documento");

  return (
    <div className="mt-2 space-y-1.5 pl-8">
      {fotos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {fotos.map(({ adjunto, posicion }) => (
            <button
              key={adjunto.id}
              aria-label={`Ver ${adjunto.nombre}`}
              className="size-20 overflow-hidden rounded-xl bg-default-100 transition hover:opacity-85"
              type="button"
              onClick={() => establecerPosicionEnElVisor(posicion)}
            >
              <img
                alt={adjunto.nombre}
                className="size-full object-cover"
                loading="lazy"
                src={adjunto.urlMiniatura ?? adjunto.url}
              />
            </button>
          ))}
        </div>
      )}

      {documentos.map((adjunto) => (
        <div
          key={adjunto.id}
          className="flex items-center gap-2 rounded-xl bg-default-100 px-2.5 py-1.5"
        >
          <FileText className="size-4 shrink-0 text-default-500" />

          <a
            className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground hover:underline"
            href={adjunto.url}
            rel="noreferrer"
            target="_blank"
          >
            {adjunto.nombre}
          </a>

          <span className="shrink-0 text-[10px] text-default-400">
            {formatearTamanoDeFichero(adjunto.tamanoBytes)}
          </span>

          <a
            aria-label={`Descargar ${adjunto.nombre}`}
            className="shrink-0 rounded-lg p-0.5 text-default-400 transition hover:text-foreground"
            download={adjunto.nombre}
            href={adjunto.urlDescarga}
          >
            <Download className="size-3.5" />
          </a>
        </div>
      ))}

      <VisorDeGaleria
        elementos={elementosDeLosAdjuntos(adjuntos)}
        estaAbierto={posicionEnElVisor !== null}
        posicionInicial={posicionEnElVisor ?? 0}
        alCerrar={() => establecerPosicionEnElVisor(null)}
      />
    </div>
  );
}

function BotonDeAccion({
  etiqueta,
  esPeligrosa,
  onPulsar,
  children,
}: {
  etiqueta: string;
  esPeligrosa?: boolean;
  onPulsar: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={etiqueta} placement="top">
      <button
        aria-label={etiqueta}
        className={[
          "rounded-lg p-1 text-default-400 transition",
          esPeligrosa ? "hover:text-danger" : "hover:text-foreground",
        ].join(" ")}
        type="button"
        onClick={onPulsar}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function SelectorDeReaccion({ onElegir }: { onElegir: (emoji: string) => void }) {
  const [estaAbierto, establecerAbierto] = useState(false);

  return (
    <Popover isOpen={estaAbierto} placement="top" onOpenChange={establecerAbierto}>
      <PopoverTrigger>
        <button
          aria-label="Reaccionar"
          className="rounded-full p-1 text-default-400 transition hover:bg-default-100 hover:text-foreground"
          type="button"
        >
          <SmilePlus className="size-3.5" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="flex-row gap-1 px-2 py-1.5">
        {REACCIONES_OFRECIDAS.map((emoji) => (
          <button
            key={emoji}
            aria-label={`Reaccionar con ${emoji}`}
            className="rounded-lg px-1.5 py-1 text-base transition hover:bg-default-100"
            type="button"
            onClick={() => {
              onElegir(emoji);
              establecerAbierto(false);
            }}
          >
            {emoji}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/* ==================================================================== */
/* Caja de escritura, con el selector de personas                       */
/* ==================================================================== */

/** Un fichero adjunto en la caja, antes de publicar la entrada. */
interface AdjuntoEnLaCaja {
  idLocal: string;
  fichero: File;
  /** Para enseñar la foto al momento, sin esperar a que suba. */
  vistaPrevia: string | null;
  progreso: number;
  /** Lo que devolvió el servidor al subirlo; null mientras sube. */
  subido: AdjuntoDeComentario | null;
  fallo: string | null;
}

function CajaDeEscritura({
  mencionables,
  marcadorDePosicion,
  textoDelBoton,
  estaGuardando,
  textoInicial = "",
  mencionesIniciales = [],
  idDeLaMarcaParaAdjuntar,
  permiteTextoVacio = false,
  onEnviar,
  onCancelar,
}: {
  mencionables: PersonaMencionable[];
  marcadorDePosicion: string;
  textoDelBoton: string;
  estaGuardando: boolean;
  textoInicial?: string;
  mencionesIniciales?: string[];
  /** Con ella se puede adjuntar. Al corregir no se pasa: los adjuntos no cambian. */
  idDeLaMarcaParaAdjuntar?: string;
  /** Al corregir una entrada que lleva ficheros, que se entiende sin texto. */
  permiteTextoVacio?: boolean;
  /** Devuelve si se guardó: si no, la caja conserva lo escrito y lo adjuntado. */
  onEnviar: (datos: DatosDeComentario) => Promise<boolean>;
  onCancelar?: () => void;
}) {
  const { catalogos } = useCatalogos();

  const [texto, establecerTexto] = useState(textoInicial);
  const [etiquetados, establecerEtiquetados] = useState<string[]>(mencionesIniciales);
  const [adjuntos, establecerAdjuntos] = useState<AdjuntoEnLaCaja[]>([]);
  const [estaArrastrandoEncima, establecerArrastrandoEncima] = useState(false);

  const selectorDeFicheros = useRef<HTMLInputElement>(null);

  // Las vistas previas ocupan memoria hasta que se sueltan: al cerrar la
  // ficha se sueltan las que queden. El efecto de cierre no ve el estado
  // último, así que lo lee de una referencia que va al día.
  const adjuntosVivos = useRef<AdjuntoEnLaCaja[]>([]);

  useEffect(() => {
    adjuntosVivos.current = adjuntos;
  }, [adjuntos]);

  useEffect(
    () => () => {
      adjuntosVivos.current.forEach((adjunto) => {
        if (adjunto.vistaPrevia) URL.revokeObjectURL(adjunto.vistaPrevia);
      });
    },
    [],
  );

  const sePuedeAdjuntar = idDeLaMarcaParaAdjuntar !== undefined;
  const adjuntosListos = adjuntos.filter((adjunto) => adjunto.subido !== null);
  const quedaAlgunoSubiendo = adjuntos.some((adjunto) => adjunto.subido === null && adjunto.fallo === null);
  const hayAlgunoQueFallo = adjuntos.some((adjunto) => adjunto.fallo !== null);

  const tieneContenido = texto.trim() !== "" || adjuntosListos.length > 0 || permiteTextoVacio;
  const puedeEnviar = tieneContenido && !estaGuardando && !quedaAlgunoSubiendo && !hayAlgunoQueFallo;

  function cambiarAdjunto(idLocal: string, cambios: Partial<AdjuntoEnLaCaja>) {
    establecerAdjuntos((actuales) =>
      actuales.map((adjunto) => (adjunto.idLocal === idLocal ? { ...adjunto, ...cambios } : adjunto)),
    );
  }

  async function subirUno(adjunto: AdjuntoEnLaCaja) {
    if (idDeLaMarcaParaAdjuntar === undefined) return;

    cambiarAdjunto(adjunto.idLocal, { fallo: null, progreso: 0 });

    try {
      const miniatura = await generarMiniatura(adjunto.fichero);
      const subido = await subirAdjunto(idDeLaMarcaParaAdjuntar, adjunto.fichero, {
        miniatura,
        alProgresar: (fraccion) => cambiarAdjunto(adjunto.idLocal, { progreso: fraccion }),
      });

      cambiarAdjunto(adjunto.idLocal, { subido, progreso: 1 });
    } catch (error) {
      cambiarAdjunto(adjunto.idLocal, { fallo: mensajeDeError(error) });
    }
  }

  function adjuntar(ficheros: File[]) {
    if (!sePuedeAdjuntar) return;

    const tamanoMaximoMb = catalogos?.tamanoMaximoDeArchivoMb ?? 20;

    const nuevos = ficheros.flatMap((fichero): AdjuntoEnLaCaja[] => {
      const motivo = motivoParaNoSubir(fichero, tamanoMaximoMb);

      if (motivo !== null) {
        avisarDeError(motivo, "No se puede adjuntar");

        return [];
      }

      return [
        {
          idLocal: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          fichero,
          vistaPrevia: esImagen(fichero) ? URL.createObjectURL(fichero) : null,
          progreso: 0,
          subido: null,
          fallo: null,
        },
      ];
    });

    establecerAdjuntos((actuales) => [...actuales, ...nuevos]);
    nuevos.forEach((adjunto) => void subirUno(adjunto));
  }

  function quitarAdjunto(idLocal: string) {
    establecerAdjuntos((actuales) => {
      const quitado = actuales.find((adjunto) => adjunto.idLocal === idLocal);

      if (quitado?.vistaPrevia) URL.revokeObjectURL(quitado.vistaPrevia);

      // El fichero ya subido se queda en el servidor sin entrada, y el
      // servidor lo barre solo pasadas unas horas.
      return actuales.filter((adjunto) => adjunto.idLocal !== idLocal);
    });
  }

  async function enviar() {
    if (!puedeEnviar) return;

    const salioBien = await onEnviar({
      cuerpo: texto.trim(),
      menciones: etiquetados,
      ...(sePuedeAdjuntar
        ? { adjuntos: adjuntosListos.map((adjunto) => (adjunto.subido as AdjuntoDeComentario).id) }
        : {}),
    });

    // Si no se guardó, lo escrito y lo adjuntado se quedan donde estaban.
    // Solo se limpia al crear: al corregir, el componente desaparece
    // porque la entrada vuelve a su forma normal.
    if (!salioBien || onCancelar !== undefined) return;

    adjuntos.forEach((adjunto) => {
      if (adjunto.vistaPrevia) URL.revokeObjectURL(adjunto.vistaPrevia);
    });

    establecerTexto("");
    establecerEtiquetados([]);
    establecerAdjuntos([]);
  }

  /** Una captura pegada se adjunta, salvo que venga con texto: entonces se pega el texto. */
  function alPegar(evento: ClipboardEvent) {
    if (!sePuedeAdjuntar) return;

    const ficherosPegados = Array.from(evento.clipboardData.files);

    if (ficherosPegados.length === 0 || evento.clipboardData.getData("text/plain") !== "") {
      return;
    }

    evento.preventDefault();
    adjuntar(ficherosPegados);
  }

  function alSoltar(evento: DragEvent) {
    if (!sePuedeAdjuntar || !evento.dataTransfer.types.includes("Files")) return;

    evento.preventDefault();
    establecerArrastrandoEncima(false);
    adjuntar(Array.from(evento.dataTransfer.files));
  }

  const personasEtiquetadas = mencionables.filter((persona) =>
    etiquetados.includes(persona.id),
  );

  return (
    <div
      className={[
        "flex flex-col gap-2 rounded-2xl transition",
        estaArrastrandoEncima ? "bg-primary-50 ring-2 ring-primary/40 dark:bg-primary-100/10" : "",
      ].join(" ")}
      onDragLeave={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) {
          establecerArrastrandoEncima(false);
        }
      }}
      onDragOver={(evento) => {
        if (sePuedeAdjuntar && evento.dataTransfer.types.includes("Files")) {
          evento.preventDefault();
          establecerArrastrandoEncima(true);
        }
      }}
      onDrop={alSoltar}
    >
      <Textarea
        maxRows={5}
        minRows={2}
        placeholder={marcadorDePosicion}
        radius="lg"
        value={texto}
        variant="bordered"
        onKeyDown={(evento) => {
          // Ctrl/Cmd + Enter envía, que es lo que espera quien escribe
          // mucho; Enter a secas sigue haciendo salto de línea.
          if ((evento.ctrlKey || evento.metaKey) && evento.key === "Enter") {
            evento.preventDefault();
            void enviar();
          }
        }}
        onPaste={alPegar}
        onValueChange={establecerTexto}
      />

      {adjuntos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {adjuntos.map((adjunto) => (
            <AdjuntoPendiente
              key={adjunto.idLocal}
              adjunto={adjunto}
              alQuitar={() => quitarAdjunto(adjunto.idLocal)}
              alReintentar={() => void subirUno(adjunto)}
            />
          ))}
        </div>
      )}

      {personasEtiquetadas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {personasEtiquetadas.map((persona) => (
            <Chip
              key={persona.id}
              color="primary"
              radius="full"
              size="sm"
              variant="flat"
              onClose={() =>
                establecerEtiquetados((actuales) =>
                  actuales.filter((id) => id !== persona.id),
                )
              }
            >
              @{persona.nombre}
            </Chip>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <SelectorDePersonas
            mencionables={mencionables}
            yaEtiquetados={etiquetados}
            onElegir={(persona) => {
              establecerEtiquetados((actuales) =>
                actuales.includes(persona.id) ? actuales : [...actuales, persona.id],
              );

              // El nombre también se mete en el texto: quien lo lea seis
              // meses después tiene que entender a quién se le decía
              // aquello sin mirar ninguna etiqueta aparte.
              establecerTexto((actual) =>
                actual === "" ? `@${persona.nombre} ` : `${actual.trimEnd()} @${persona.nombre} `,
              );
            }}
          />

          {sePuedeAdjuntar && (
            <Tooltip content="Adjuntar fotos o PDF" placement="top">
              <Button
                isIconOnly
                aria-label="Adjuntar fotos o PDF"
                radius="full"
                size="sm"
                variant="light"
                onPress={() => selectorDeFicheros.current?.click()}
              >
                <Paperclip className="size-4" />
              </Button>
            </Tooltip>
          )}

          <span className="hidden text-[10px] text-default-400 sm:inline">
            {quedaAlgunoSubiendo
              ? "Esperando a que terminen de subir…"
              : hayAlgunoQueFallo
                ? "Quita o reintenta el adjunto que falló"
                : "Ctrl + Enter para enviar"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onCancelar !== undefined && (
            <Button radius="lg" size="sm" variant="light" onPress={onCancelar}>
              Cancelar
            </Button>
          )}

          <Button
            color="primary"
            isDisabled={!puedeEnviar}
            isLoading={estaGuardando}
            radius="lg"
            size="sm"
            startContent={!estaGuardando && <Send className="size-3.5" />}
            onPress={() => void enviar()}
          >
            {textoDelBoton}
          </Button>
        </div>
      </div>

      {sePuedeAdjuntar && (
        <input
          ref={selectorDeFicheros}
          multiple
          accept={TIPOS_ADMITIDOS_EN_GALERIA_Y_BITACORA}
          className="hidden"
          type="file"
          onChange={(evento) => {
            const elegidos = Array.from(evento.target.files ?? []);

            // Se limpia para que elegir otra vez el mismo vuelva a adjuntarlo.
            evento.target.value = "";

            if (elegidos.length > 0) adjuntar(elegidos);
          }}
        />
      )}
    </div>
  );
}

/**
 * Un adjunto en la caja: la foto en pequeño o el nombre del PDF, con su
 * progreso mientras sube, y la cruz para quitarlo antes de publicar.
 */
function AdjuntoPendiente({
  adjunto,
  alQuitar,
  alReintentar,
}: {
  adjunto: AdjuntoEnLaCaja;
  alQuitar: () => void;
  alReintentar: () => void;
}) {
  const estaSubiendo = adjunto.subido === null && adjunto.fallo === null;

  return (
    <div
      className={[
        "relative flex h-14 items-center overflow-hidden rounded-xl border",
        adjunto.fallo !== null ? "border-danger-300 bg-danger-50 dark:bg-danger-100/10" : "border-default-200 bg-default-50",
        // La foto ocupa la pieza entera; el PDF deja sitio a la cruz.
        adjunto.vistaPrevia ? "w-14" : "max-w-56 gap-2 pl-2 pr-7",
      ].join(" ")}
      title={adjunto.fallo ?? adjunto.fichero.name}
    >
      {adjunto.vistaPrevia ? (
        <img alt={adjunto.fichero.name} className="size-full object-cover" src={adjunto.vistaPrevia} />
      ) : (
        <>
          <FileText className="size-4 shrink-0 text-default-500" />
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold text-foreground">{adjunto.fichero.name}</p>
            <p className="text-[10px] text-default-400">{formatearTamanoDeFichero(adjunto.fichero.size)}</p>
          </div>
        </>
      )}

      {/* Mientras sube: el velo con el porcentaje. Si falló: reintentar. */}
      {estaSubiendo && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[10px] font-bold text-white">
          {adjunto.progreso > 0 ? `${Math.round(adjunto.progreso * 100)} %` : <Spinner color="white" size="sm" />}
        </span>
      )}

      {adjunto.fallo !== null && (
        <button
          aria-label={`Reintentar ${adjunto.fichero.name}`}
          className="absolute inset-0 flex items-center justify-center gap-1 bg-danger-500/80 text-[10px] font-bold text-white"
          type="button"
          onClick={alReintentar}
        >
          <AlertTriangle className="size-3.5" />
          <RotateCw className="size-3.5" />
        </button>
      )}

      <button
        aria-label={`Quitar ${adjunto.fichero.name}`}
        className="absolute right-0.5 top-0.5 z-10 rounded-full bg-black/55 p-0.5 text-white transition hover:bg-black/80"
        type="button"
        onClick={alQuitar}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

/**
 * El desplegable de a quién etiquetar.
 *
 * La lista viene del servidor y son SOLO las personas que ya pueden ver
 * esta marca. No se filtra aquí por rol ni por nada: si esta lista
 * ofreciera de más, etiquetar a alguien le filtraría por la notificación
 * el nombre de una marca que no puede ver (regla 6).
 */
function SelectorDePersonas({
  mencionables,
  yaEtiquetados,
  onElegir,
}: {
  mencionables: PersonaMencionable[];
  yaEtiquetados: string[];
  onElegir: (persona: PersonaMencionable) => void;
}) {
  const [estaAbierto, establecerAbierto] = useState(false);

  const disponibles = mencionables.filter(
    (persona) => !yaEtiquetados.includes(persona.id),
  );

  return (
    <Popover isOpen={estaAbierto} placement="top-start" onOpenChange={establecerAbierto}>
      <PopoverTrigger>
        <Button
          isIconOnly
          aria-label="Etiquetar a alguien"
          isDisabled={mencionables.length === 0}
          radius="full"
          size="sm"
          variant="light"
        >
          <AtSign className="size-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="max-h-64 w-56 overflow-y-auto px-1 py-1">
        {disponibles.length === 0 ? (
          <p className="px-2 py-3 text-tiny text-default-500">
            No queda nadie más a quien etiquetar en esta marca.
          </p>
        ) : (
          <Listbox
            aria-label="A quién etiquetar"
            onAction={(clave) => {
              const persona = disponibles.find((candidata) => candidata.id === clave);

              if (persona !== undefined) {
                onElegir(persona);
                establecerAbierto(false);
              }
            }}
          >
            {disponibles.map((persona) => (
              <ListboxItem key={persona.id} description={persona.rolEtiqueta}>
                {persona.nombre}
              </ListboxItem>
            ))}
          </Listbox>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ==================================================================== */
/* Exportar                                                             */
/* ==================================================================== */

/**
 * Sacar el histórico de esta marca.
 *
 * Pide el documento al servidor aunque el hilo ya esté en pantalla, y no
 * es un viaje de más: exportar una bitácora es sacar del sistema toda la
 * relación comercial con esa marca, y el servidor lo anota en la
 * auditoría antes de devolver nada.
 */
function MenuDeExportacion({
  idDeLaMarca,
  hayEntradas,
}: {
  idDeLaMarca: string;
  hayEntradas: boolean;
}) {
  const [estaGenerando, establecerGenerando] = useState(false);
  const [estaAbierto, establecerAbierto] = useState(false);

  async function exportar(formato: "excel" | "documento") {
    establecerGenerando(true);
    establecerAbierto(false);

    try {
      const historico = await obtenerHistoricoDeMarca(idDeLaMarca);

      if (formato === "excel") {
        await descargarLaBitacoraEnExcel(historico);
        avisarDeExito("Bitácora descargada.");
      } else {
        imprimirLaBitacora(historico);
      }
    } catch (error) {
      avisarDeError(error, "No se pudo exportar la bitácora");
    } finally {
      establecerGenerando(false);
    }
  }

  return (
    <Popover isOpen={estaAbierto} placement="bottom-end" onOpenChange={establecerAbierto}>
      <PopoverTrigger>
        <Button
          isDisabled={!hayEntradas}
          isLoading={estaGenerando}
          radius="full"
          size="sm"
          startContent={!estaGenerando && <Download className="size-3.5" />}
          variant="flat"
        >
          Exportar
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-60 px-1 py-1">
        <Listbox
          aria-label="En qué formato exportar"
          onAction={(clave) => void exportar(clave as "excel" | "documento")}
        >
          <ListboxItem
            key="documento"
            description="Para leerlo o guardarlo en PDF"
            startContent={<FileText className="size-4 text-default-500" />}
          >
            Documento
          </ListboxItem>
          <ListboxItem
            key="excel"
            description="Una fila por entrada, para cruzar datos"
            startContent={<Download className="size-4 text-default-500" />}
          >
            Hoja de cálculo
          </ListboxItem>
        </Listbox>
      </PopoverContent>
    </Popover>
  );
}
