/**
 * componentes/crm/EstadoDeLaMarca.tsx
 * ---------------------------------------------------------------------
 * Todo lo que se ve del estado de una marca: caliente, tibia o fría.
 *
 *   · `DistintivoDeEstado` — el círculo que asoma en la esquina de la
 *     tarjeta. Al pulsarlo explica por qué está así y, a quien puede
 *     editar la marca, le deja fijarlo a mano o devolverlo al automático.
 *   · `LineaDelUltimoMovimiento` — «Hace 9 días · Comentario en la
 *     bitácora», o la acción agendada si hay una por delante.
 *   · `FiltroPorEstado` — la barra de «Calientes · 12» del tablero, con
 *     el ajuste de los días para el administrador.
 *
 * Aquí no se cuenta ni un día: el estado, los días y la etiqueta del
 * movimiento llegan resueltos del servidor (App\Support\EstadoDeLasMarcas).
 * Si se contaran también aquí, la tarjeta podría decir «hace 5 días» de
 * una marca que el filtro ya cuenta como tibia.
 *
 * Los colores son fijos y no salen del color de acento: el acento lo
 * elige cada persona, y un «frío» que dependiera de él podría acabar
 * siendo rojo.
 * ---------------------------------------------------------------------
 */
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from "@heroui/react";
import {
  CalendarClock,
  Flame,
  History,
  Pin,
  PinOff,
  Settings2,
  Snowflake,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useFijarEstadoDeMarca, useGuardarUmbralesDelEstado } from "@/hooks/useMarcas";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import {
  formatearDiaAgendado,
  formatearFecha,
  formatearNumero,
} from "@/utilidades/formato";
import type {
  ContadoresDeEstado,
  EstadoDeMarca,
  Marca,
  UmbralesDelEstado,
} from "@/tipos/modelos";

/**
 * Cómo se pinta cada estado. Los fondos claros llevan su pareja oscura,
 * y la transparencia va en el propio hexadecimal (ocho cifras) y no con
 * `/15`: Tailwind lo traduce a `color-mix`, que el Chrome 103 de una de
 * las vendedoras no entiende.
 */
const APARIENCIA_DE_LOS_ESTADOS: Record<
  EstadoDeMarca,
  {
    etiqueta: string;
    plural: string;
    icono: LucideIcon;
    /** El color pleno del distintivo. */
    solido: string;
    /** Fondo y texto de una pastilla, en claro y en oscuro. */
    pastilla: string;
    /** Solo el texto, para la línea del último movimiento. */
    texto: string;
  }
> = {
  caliente: {
    etiqueta: "Caliente",
    plural: "Calientes",
    icono: Flame,
    solido: "#E5484D",
    pastilla: "bg-[#FDEBEC] text-[#C5221F] dark:bg-[#E5484D26] dark:text-[#FF9592]",
    texto: "text-[#C5221F] dark:text-[#FF9592]",
  },
  tibia: {
    etiqueta: "Tibia",
    plural: "Tibias",
    icono: Sun,
    solido: "#F5A524",
    pastilla: "bg-[#FEF4E2] text-[#B06000] dark:bg-[#F5A52426] dark:text-[#FFCA6B]",
    texto: "text-[#B06000] dark:text-[#FFCA6B]",
  },
  fria: {
    etiqueta: "Fría",
    plural: "Frías",
    icono: Snowflake,
    solido: "#6B93C7",
    pastilla: "bg-[#EDF3FB] text-[#3F6690] dark:bg-[#6B93C726] dark:text-[#A9C6EC]",
    texto: "text-[#3F6690] dark:text-[#A9C6EC]",
  },
};

const ORDEN_DE_LOS_ESTADOS: EstadoDeMarca[] = ["caliente", "tibia", "fria"];

/** «Hoy», «Ayer» o «Hace 9 días», con los días que ya contó el servidor. */
function textoDeHaceDias(dias: number): string {
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";

  return `Hace ${dias} días`;
}

/** Qué significa cada estado, con los días que estén puestos. */
function explicacionDeLosUmbrales(umbrales: UmbralesDelEstado): string {
  return `Caliente: se movió en los últimos ${umbrales.diasCaliente} días o tiene una acción por delante. Tibia: hasta ${umbrales.diasTibia} días. Fría: más.`;
}

/* ==================================================================== */
/* El distintivo de la tarjeta                                          */
/* ==================================================================== */

export function DistintivoDeEstado({
  marca,
  umbrales,
}: {
  marca: Marca;
  /** Para explicar los días en la ventanita. Sin ellos, no se explican. */
  umbrales?: UmbralesDelEstado | null;
}) {
  const [estaAbierto, establecerAbierto] = useState(false);
  const fijarEstado = useFijarEstadoDeMarca();

  const apariencia = APARIENCIA_DE_LOS_ESTADOS[marca.estado];
  const Icono = apariencia.icono;
  const estaFijado = marca.estadoFijado !== null;

  function fijar(estado: EstadoDeMarca | null) {
    fijarEstado.mutate(
      { idDeLaMarca: marca.id, estado },
      {
        onSuccess: () => {
          establecerAbierto(false);
          avisarDeExito(
            estado === null
              ? "La marca vuelve al estado automático"
              : `Marca fijada como ${APARIENCIA_DE_LOS_ESTADOS[estado].etiqueta.toLowerCase()}`,
          );
        },
        onError: (error) => avisarDeError(error, "No se pudo cambiar el estado"),
      },
    );
  }

  return (
    <Popover isOpen={estaAbierto} placement="bottom-end" onOpenChange={establecerAbierto}>
      <PopoverTrigger>
        {/* El clic no llega a la tarjeta, que abriría la ficha. */}
        <button
          aria-label={`${apariencia.etiqueta}${estaFijado ? ", fijada a mano" : ""}. Pulsa para ver por qué`}
          className="absolute -right-2.5 -top-2.5 z-10 flex size-8 items-center justify-center rounded-full text-white shadow-sm ring-[3px] ring-background transition hover:scale-110"
          style={{ backgroundColor: apariencia.solido }}
          type="button"
          onClick={(evento) => evento.stopPropagation()}
          onKeyDown={(evento) => evento.stopPropagation()}
        >
          <Icono className="size-4" strokeWidth={2.4} />

          {/* Un alfiler pequeño dice que no es el cálculo del sistema. */}
          {estaFijado && (
            <span className="absolute -bottom-1 -left-1 flex size-4 items-center justify-center rounded-full bg-content1 text-foreground ring-1 ring-default-200">
              <Pin className="size-2.5" strokeWidth={2.6} />
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-72 p-0">
        {/* Lo de dentro tampoco puede abrir la ficha: los eventos de un
            portal suben igualmente por el árbol de React. */}
        <div
          className="w-full space-y-3 p-3"
          role="presentation"
          onClick={(evento) => evento.stopPropagation()}
          onKeyDown={(evento) => evento.stopPropagation()}
        >
          <div className="flex items-start gap-2.5">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: apariencia.solido }}
            >
              <Icono className="size-4" strokeWidth={2.4} />
            </span>

            <div className="min-w-0">
              <p className={`text-sm font-semibold ${apariencia.texto}`}>{apariencia.etiqueta}</p>
              <p className="text-[11px] text-default-500">
                {estaFijado
                  ? `Fijada a mano${marca.estadoFijado?.porNombre ? ` por ${marca.estadoFijado.porNombre}` : ""}${
                      marca.estadoFijado?.en ? ` el ${formatearFecha(marca.estadoFijado.en)}` : ""
                    }`
                  : "Calculado por el sistema"}
              </p>
            </div>
          </div>

          <LineaDelUltimoMovimiento conDetalle marca={marca} />

          {marca.puedeEditarla && (
            <div className="space-y-2 border-t border-default-100 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-default-400">
                Fijar a mano
              </p>

              <div className="grid grid-cols-3 gap-1.5">
                {ORDEN_DE_LOS_ESTADOS.map((estado) => {
                  const deEseEstado = APARIENCIA_DE_LOS_ESTADOS[estado];
                  const IconoDelEstado = deEseEstado.icono;
                  const esElFijado = estaFijado && marca.estado === estado;

                  return (
                    <button
                      key={estado}
                      className={[
                        "flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition",
                        deEseEstado.pastilla,
                        esElFijado ? "ring-2 ring-current" : "opacity-80 hover:opacity-100",
                      ].join(" ")}
                      disabled={fijarEstado.isPending}
                      type="button"
                      onClick={() => fijar(estado)}
                    >
                      <IconoDelEstado className="size-4" />
                      {deEseEstado.etiqueta}
                    </button>
                  );
                })}
              </div>

              {estaFijado && (
                <Button
                  fullWidth
                  isLoading={fijarEstado.isPending}
                  radius="lg"
                  size="sm"
                  startContent={<PinOff className="size-3.5" />}
                  variant="flat"
                  onPress={() => fijar(null)}
                >
                  Volver a automático (sería {APARIENCIA_DE_LOS_ESTADOS[marca.estadoAutomatico].etiqueta.toLowerCase()})
                </Button>
              )}

              <p className="text-[11px] leading-snug text-default-400">
                Queda fijo hasta que alguien lo suelte, aunque la marca se mueva.
              </p>
            </div>
          )}

          {umbrales && (
            <p className="border-t border-default-100 pt-2 text-[11px] leading-snug text-default-400">
              {explicacionDeLosUmbrales(umbrales)}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ==================================================================== */
/* La línea del último movimiento                                       */
/* ==================================================================== */

/**
 * Lo que explica el estado en una línea. Con una acción por delante dice
 * esa acción, que es lo que la mantiene caliente; si no, cuándo se movió
 * por última vez y por qué.
 *
 * `conDetalle` enseña las dos cosas, para la ventanita del distintivo.
 */
export function LineaDelUltimoMovimiento({
  marca,
  conDetalle = false,
}: {
  marca: Marca;
  conDetalle?: boolean;
}) {
  const apariencia = APARIENCIA_DE_LOS_ESTADOS[marca.estado];
  const movimiento = marca.ultimoMovimiento;

  const lineaDeLaAccion = marca.proximaAccionEl !== null && (
    <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-default-500">
      <CalendarClock className={`size-3.5 shrink-0 ${apariencia.texto}`} />
      <span className={`shrink-0 font-semibold ${apariencia.texto}`}>Acción agendada</span>
      <span className="truncate">
        para {formatearDiaAgendado(marca.proximaAccionEl, marca.proximaAccionEnDias ?? Number.NaN)}
      </span>
    </p>
  );

  const lineaDelMovimiento = (
    <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-default-500">
      <History className={`size-3.5 shrink-0 ${apariencia.texto}`} />
      <span className={`shrink-0 font-semibold ${apariencia.texto}`}>
        {textoDeHaceDias(movimiento.haceDias)}
      </span>
      <span className="truncate">· {movimiento.etiqueta}</span>
    </p>
  );

  if (conDetalle) {
    return (
      <div className="space-y-1">
        {lineaDelMovimiento}
        {lineaDeLaAccion}
      </div>
    );
  }

  return lineaDeLaAccion || lineaDelMovimiento;
}

/* ==================================================================== */
/* El filtro del tablero                                                */
/* ==================================================================== */

export function FiltroPorEstado({
  contadores,
  umbrales,
  elegido,
  puedeAjustarLosDias,
  alElegir,
}: {
  contadores: ContadoresDeEstado | null;
  umbrales: UmbralesDelEstado | null;
  elegido: EstadoDeMarca | "";
  puedeAjustarLosDias: boolean;
  alElegir: (estado: EstadoDeMarca | "") => void;
}) {
  // «Todas» son las que salen con los demás filtros, sin mirar el estado.
  const todas = contadores === null ? null : contadores.caliente + contadores.tibia + contadores.fria;

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por estado">
      <button
        aria-pressed={elegido === ""}
        className={[
          "flex h-8 items-center rounded-full px-3 text-xs font-semibold transition",
          elegido === ""
            ? "bg-foreground text-background"
            : "bg-default-100 text-default-600 hover:bg-default-200",
        ].join(" ")}
        type="button"
        onClick={() => alElegir("")}
      >
        Todas{todas === null ? "" : ` · ${formatearNumero(todas)}`}
      </button>

      {ORDEN_DE_LOS_ESTADOS.map((estado) => {
        const apariencia = APARIENCIA_DE_LOS_ESTADOS[estado];
        const Icono = apariencia.icono;
        const estaElegido = elegido === estado;

        return (
          <button
            key={estado}
            aria-pressed={estaElegido}
            className={[
              "flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition",
              apariencia.pastilla,
              // Elegido: con su borde. Sin elegir, un poco apagado, para
              // que se vea cuál manda sin perder los números de los demás.
              estaElegido ? "ring-2 ring-current" : "opacity-75 hover:opacity-100",
            ].join(" ")}
            type="button"
            // Pulsar el que ya está elegido lo quita.
            onClick={() => alElegir(estaElegido ? "" : estado)}
          >
            <Icono className="size-3.5" />
            {apariencia.plural}
            {contadores !== null && ` · ${formatearNumero(contadores[estado])}`}
          </button>
        );
      })}

      {umbrales && (
        <AjusteDeLosDias puedeAjustar={puedeAjustarLosDias} umbrales={umbrales} />
      )}
    </div>
  );
}

/**
 * Qué significa cada estado y, para el administrador, dónde se cambian
 * los días. Los demás ven la explicación sin el formulario.
 */
function AjusteDeLosDias({
  umbrales,
  puedeAjustar,
}: {
  umbrales: UmbralesDelEstado;
  puedeAjustar: boolean;
}) {
  const [estaAbierto, establecerAbierto] = useState(false);
  const [diasCaliente, establecerDiasCaliente] = useState(String(umbrales.diasCaliente));
  const [diasTibia, establecerDiasTibia] = useState(String(umbrales.diasTibia));
  const guardarUmbrales = useGuardarUmbralesDelEstado();

  // Al abrirlo, lo que está puesto ahora: otro administrador puede
  // haberlo cambiado mientras tanto.
  useEffect(() => {
    if (!estaAbierto) return;

    establecerDiasCaliente(String(umbrales.diasCaliente));
    establecerDiasTibia(String(umbrales.diasTibia));
  }, [estaAbierto, umbrales.diasCaliente, umbrales.diasTibia]);

  if (!puedeAjustar) {
    return (
      <Tooltip className="max-w-64" content={explicacionDeLosUmbrales(umbrales)}>
        <span className="ml-1 cursor-help text-[11px] text-default-400 underline decoration-dotted underline-offset-2">
          ¿Qué es cada una?
        </span>
      </Tooltip>
    );
  }

  function guardar() {
    guardarUmbrales.mutate(
      { diasCaliente: Number(diasCaliente), diasTibia: Number(diasTibia) },
      {
        onSuccess: () => {
          establecerAbierto(false);
          avisarDeExito("Días guardados: el tablero se recolorea para todo el equipo");
        },
        onError: (error) => avisarDeError(error, "No se pudieron guardar los días"),
      },
    );
  }

  return (
    <Popover isOpen={estaAbierto} placement="bottom-start" onOpenChange={establecerAbierto}>
      <PopoverTrigger>
        <Button
          className="ml-1 h-8"
          radius="full"
          size="sm"
          startContent={<Settings2 className="size-3.5" />}
          variant="light"
        >
          Días
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-72 p-0">
        <form
          className="w-full space-y-3 p-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            guardar();
          }}
        >
          <div>
            <p className="text-sm font-semibold text-foreground">¿Cuándo se enfría una marca?</p>
            <p className="mt-0.5 text-[11px] leading-snug text-default-500">
              Cuenta desde su último movimiento: alta, fase, valor de la propuesta, comentario o
              acción de campaña. Cambiarlo recolorea el tablero de todo el equipo.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Input
              endContent={<span className="text-[11px] text-default-400">días</span>}
              label="Caliente hasta"
              labelPlacement="outside"
              min={1}
              radius="lg"
              size="sm"
              type="number"
              value={diasCaliente}
              variant="bordered"
              onValueChange={establecerDiasCaliente}
            />
            <Input
              endContent={<span className="text-[11px] text-default-400">días</span>}
              label="Tibia hasta"
              labelPlacement="outside"
              min={2}
              radius="lg"
              size="sm"
              type="number"
              value={diasTibia}
              variant="bordered"
              onValueChange={establecerDiasTibia}
            />
          </div>

          <p className="text-[11px] text-default-400">Pasado eso, fría.</p>

          <Button
            fullWidth
            color="primary"
            isLoading={guardarUmbrales.isPending}
            radius="lg"
            size="sm"
            type="submit"
          >
            Guardar
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
