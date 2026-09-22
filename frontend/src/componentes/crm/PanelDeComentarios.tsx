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
  Textarea,
  Tooltip,
} from "@heroui/react";
import {
  AtSign,
  CornerDownRight,
  Download,
  FileText,
  MessageSquarePlus,
  Pencil,
  Send,
  SmilePlus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { mensajeDeError } from "@/api/clienteHttp";
import { obtenerHistoricoDeMarca } from "@/api/marcas";
import { BarraDeScrollDibujada } from "@/componentes/comunes/BarraDeScrollDibujada";
import {
  BloqueDeCarga,
  EstadoVacio,
} from "@/componentes/comunes/EstadosDePantalla";
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
import { formatearTiempoRelativo, inicialesDe } from "@/utilidades/formato";
import type {
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

  async function publicar(datos: DatosDeComentario) {
    try {
      await crearComentario.mutateAsync({
        ...datos,
        comentarioPadreId: respondiendoA?.id ?? null,
      });

      establecerRespondiendoA(null);
    } catch (error) {
      avisarDeError(error, "No se pudo publicar el comentario");
    }
  }

  async function guardarLaCorreccion(datos: DatosDeComentario) {
    if (editando === null) return;

    try {
      await editarComentario.mutateAsync({ id: editando.id, datos });

      establecerEditando(null);
    } catch (error) {
      avisarDeError(error, "No se pudo guardar el cambio");
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
  onGuardarEdicion: (datos: DatosDeComentario) => void | Promise<void>;
  onCancelarEdicion: () => void;
  onEditarRespuesta: (respuesta: ComentarioDeMarca) => void;
  onBorrarRespuesta: (id: string) => void;
  onReaccionarARespuesta: (id: string, emoji: string) => void;
  onGuardarEdicionDeRespuesta: (datos: DatosDeComentario) => void | Promise<void>;
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
  onGuardarEdicion: (datos: DatosDeComentario) => void | Promise<void>;
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

        <time className="shrink-0 text-[10px] text-default-400">
          {formatearTiempoRelativo(entrada.creadoEn)}
          {/* Sin esta marca, corregir una frase a los tres meses deja el
              hilo diciendo algo que nadie dijo ese día. */}
          {entrada.editadoEn !== null && " · editado"}
        </time>
      </header>

      <p className="whitespace-pre-wrap break-words pl-8 text-xs leading-relaxed text-default-700">
        {entrada.cuerpo}
      </p>

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

function CajaDeEscritura({
  mencionables,
  marcadorDePosicion,
  textoDelBoton,
  estaGuardando,
  textoInicial = "",
  mencionesIniciales = [],
  onEnviar,
  onCancelar,
}: {
  mencionables: PersonaMencionable[];
  marcadorDePosicion: string;
  textoDelBoton: string;
  estaGuardando: boolean;
  textoInicial?: string;
  mencionesIniciales?: string[];
  onEnviar: (datos: DatosDeComentario) => void | Promise<void>;
  onCancelar?: () => void;
}) {
  const [texto, establecerTexto] = useState(textoInicial);
  const [etiquetados, establecerEtiquetados] = useState<string[]>(mencionesIniciales);

  const puedeEnviar = texto.trim() !== "" && !estaGuardando;

  async function enviar() {
    if (!puedeEnviar) return;

    await onEnviar({ cuerpo: texto.trim(), menciones: etiquetados });

    // Solo se limpia al crear: al corregir, el componente desaparece
    // porque la entrada vuelve a su forma normal.
    if (onCancelar === undefined) {
      establecerTexto("");
      establecerEtiquetados([]);
    }
  }

  const personasEtiquetadas = mencionables.filter((persona) =>
    etiquetados.includes(persona.id),
  );

  return (
    <div className="flex flex-col gap-2">
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
        onValueChange={establecerTexto}
      />

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

          <span className="hidden text-[10px] text-default-400 sm:inline">
            Ctrl + Enter para enviar
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
