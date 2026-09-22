/**
 * componentes/crm/CalendarioDeCampanas.tsx
 * ---------------------------------------------------------------------
 * El calendario de acciones de campaña, en el panel de resumen.
 *
 * Cada marca con campaña y fecha genera un evento en el historial: "el
 * 10 de septiembre, visita presencial a Azúcar la Pastora". Aquí se ven
 * repartidos por día, en dos vistas:
 *
 *   · SEMANA → siete columnas, con espacio para leer el nombre de cada
 *     marca. Es la vista de trabajo: qué toca esta semana.
 *   · MES → la rejilla completa, para ver de un golpe cómo está
 *     repartido el esfuerzo del mes. Las celdas son pequeñas, así que
 *     los eventos se resumen y el detalle se abre al pulsar el día.
 *
 * AL PULSAR
 *   · un DÍA   → se abre el detalle con todos sus eventos.
 *   · un EVENTO → se navega al tablero con esa marca abierta.
 *   · una CAMPAÑA de la leyenda → se resalta en la rejilla.
 *
 * Lo segundo se hace navegando a /marcas?abrir=<id> y no montando otra
 * ficha aquí: así la ficha vive en un único sitio, y de paso la
 * dirección queda compartible.
 *
 * LA LEYENDA
 * Bajo la rejilla, un cuadrito por campaña con su nombre y sus acciones.
 * Sin ella, la vista mensual es una nube de puntos de colores que solo
 * se puede descifrar abriendo los días uno a uno.
 *
 * Al pulsar una campaña, las demás se apagan en la rejilla. RESALTA, no
 * filtra: el reporte de abajo y el Excel siguen hablando del periodo
 * entero, así que lo que se ve y lo que se descarga nunca se separan.
 * Los colores salen del resumen del servidor, que los devuelve pegados
 * a cada total.
 *
 * EL PERIODO
 * Lo calcula el servidor. Si cada navegador decidiera dónde empieza la
 * semana según su configuración regional, dos personas del equipo verían
 * periodos distintos y sus reportes no cuadrarían.
 * ---------------------------------------------------------------------
 */
import {
  Button,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Tab,
  Tabs,
  Tooltip,
} from "@heroui/react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileSpreadsheet,
  Printer,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { mensajeDeError } from "@/api/clienteHttp";
import { obtenerCalendario } from "@/api/sistema";
import {
  BloqueDeCarga,
  BloqueDeError,
} from "@/componentes/comunes/EstadosDePantalla";
import { TarjetaBento } from "@/componentes/comunes/TarjetaBento";
import { descargarElReporteEnExcel } from "@/utilidades/excelDeCampanas";
import { avisarDeError } from "@/utilidades/avisos";
import { formatearFecha, inicialesDe } from "@/utilidades/formato";
import type {
  DiaDelCalendario,
  EventoDeCalendario,
  PeriodoDelCalendario,
  ResumenDeLaSemana,
  TotalDelReporte,
  TotalPorCampanaDelReporte,
  VistaDelCalendario,
} from "@/tipos/modelos";

/** Nombres cortos de los días, de lunes a domingo. */
const DIAS_DE_LA_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/**
 * El ancla de esta caja, para que el panel pueda saltar aquí.
 *
 * La declara este fichero, que es quien pinta la caja, y no el panel:
 * así no hay dos sitios donde cambiar el nombre. La usan las cifras de
 * «acciones por delante», que no salen de ningún listado sino de esta
 * misma agenda.
 */
export const ANCLA_DE_LA_CAJA_DEL_CALENDARIO = "calendario-de-campanas";

/**
 * Si este evento tiene que verse apagado porque hay otra campaña
 * resaltada desde la leyenda.
 *
 * Sin nada resaltado no se apaga nada: la rejilla se ve entera, que es
 * su estado normal.
 */
function estaApagadoPorLaLeyenda(
  evento: EventoDeCalendario,
  campanaResaltada: string | null,
): boolean {
  return campanaResaltada !== null && evento.campanaNombre !== campanaResaltada;
}

export function CalendarioDeCampanas() {
  const navegar = useNavigate();

  const [vista, establecerVista] = useState<VistaDelCalendario>("semana");

  /**
   * El día que se usa para pedir el periodo. Null = el periodo actual.
   * Se guarda un día suelto y no el rango: el servidor ya sabe
   * convertirlo en su semana o su mes, y así navegar es sumar días.
   */
  const [diaDelPeriodo, establecerDiaDelPeriodo] = useState<string | null>(null);

  /** El día cuyo detalle está abierto, si hay alguno. */
  const [diaAbierto, establecerDiaAbierto] = useState<DiaDelCalendario | null>(null);

  /**
   * La campaña resaltada desde la leyenda, si hay alguna.
   *
   * Se guarda por NOMBRE y no por id porque es lo que llevan los eventos
   * del historial: el nombre se copia dentro de cada acción justamente
   * para que siga siendo legible cuando la campaña ya no exista
   * (regla 13). Dos campañas distintas con el mismo nombre se resaltarían
   * juntas, y está bien: en la rejilla también comparten color.
   */
  const [campanaResaltada, establecerCampanaResaltada] = useState<string | null>(
    null,
  );

  const consulta = useQuery<PeriodoDelCalendario>({
    queryKey: ["panel", "calendario", vista, diaDelPeriodo],
    queryFn: () => obtenerCalendario(vista, diaDelPeriodo ?? undefined),
    // Mantiene el periodo anterior mientras llega el nuevo: al navegar,
    // el calendario no parpadea a vacío.
    placeholderData: (datosAnteriores) => datosAnteriores,
  });

  /** Salta al periodo anterior o siguiente. */
  function moverse(haciaDonde: -1 | 1) {
    const diaActual = consulta.data?.periodo.dia;

    if (diaActual === undefined) return;

    // Se construye como fecha local: `new Date("2026-09-10")` la
    // interpretaría como medianoche UTC y en Venezuela retrocedería un
    // día, con lo que saltar de mes acabaría descuadrado.
    const [anio, mes, dia] = diaActual.split("-").map(Number);
    const referencia = new Date(anio, mes - 1, dia);

    if (vista === "mes") {
      // El día 1 evita el clásico salto de "31 de enero + 1 mes".
      referencia.setDate(1);
      referencia.setMonth(referencia.getMonth() + haciaDonde);
    } else {
      referencia.setDate(referencia.getDate() + haciaDonde * 7);
    }

    const comoTexto = [
      referencia.getFullYear(),
      String(referencia.getMonth() + 1).padStart(2, "0"),
      String(referencia.getDate()).padStart(2, "0"),
    ].join("-");

    establecerDiaDelPeriodo(comoTexto);

    // El resaltado se suelta al cambiar de periodo: una campaña que no
    // tiene acciones en el mes siguiente dejaría la rejilla entera
    // apagada, y desde fuera eso se lee como "no hay nada".
    establecerCampanaResaltada(null);
  }

  /** Abre el tablero con la ficha de esa marca desplegada. */
  function abrirLaMarca(evento: EventoDeCalendario) {
    navegar(`/marcas?abrir=${evento.marcaId}`);
  }

  if (consulta.isLoading) {
    return (
      <TarjetaBento columnas={12} titulo="Calendario de campañas">
        <BloqueDeCarga mensaje="Cargando el calendario…" />
      </TarjetaBento>
    );
  }

  // Ver PaginaPanel: el refresco fallido no tapa lo ya cargado.
  if (!consulta.data) {
    return (
      <TarjetaBento columnas={12} titulo="Calendario de campañas">
        <BloqueDeError
          mensaje={mensajeDeError(consulta.error)}
          alReintentar={() => void consulta.refetch()}
        />
      </TarjetaBento>
    );
  }

  const { periodo, dias, resumen } = consulta.data;

  return (
    <>
      <TarjetaBento
        columnas={12}
        id={ANCLA_DE_LA_CAJA_DEL_CALENDARIO}
        // De quién es la agenda lo dice el servidor, que es quien la
        // filtra; aquí no se compara ningún rol.
        descripcion={
          periodo.esSoloMia
            ? "Las acciones de campaña de tus marcas. Pulsa un día para ver su detalle."
            : "Las acciones de campaña programadas. Pulsa un día para ver su detalle."
        }
        icono={<CalendarDays className="size-4" />}
        titulo="Calendario de campañas"
        accionDeCabecera={
          <div className="flex flex-wrap items-center gap-2">
            <Tabs
              aria-label="Vista del calendario"
              color="primary"
              radius="lg"
              selectedKey={vista}
              size="sm"
              onSelectionChange={(clave) => {
                establecerVista(clave as VistaDelCalendario);
                // El día elegido se conserva: al cambiar de vista se ve
                // el mes que contiene la semana que se estaba mirando.
              }}
            >
              <Tab key="semana" title="Semana" />
              <Tab key="mes" title="Mes" />
            </Tabs>

            <ControlesDelPeriodo
              esElPeriodoActual={periodo.esElPeriodoActual}
              estaRefrescando={consulta.isFetching}
              etiqueta={periodo.etiqueta}
              vista={vista}
              onIrAHoy={() => establecerDiaDelPeriodo(null)}
              onPeriodoAnterior={() => moverse(-1)}
              onPeriodoSiguiente={() => moverse(1)}
            />
          </div>
        }
      >
        <div className="space-y-5">
          {vista === "semana" ? (
            <RejillaSemanal
              campanaResaltada={campanaResaltada}
              dias={dias}
              onAbrirEvento={abrirLaMarca}
              onPulsarDia={establecerDiaAbierto}
            />
          ) : (
            <RejillaMensual
              campanaResaltada={campanaResaltada}
              dias={dias}
              onPulsarDia={establecerDiaAbierto}
            />
          )}

          <LeyendaDeCampanas
            campanaResaltada={campanaResaltada}
            campanas={resumen.porCampana}
            onResaltar={establecerCampanaResaltada}
          />

          <ReporteDelPeriodo
            etiqueta={periodo.etiqueta}
            periodo={periodo}
            reporte={consulta.data}
            resumen={resumen}
          />
        </div>
      </TarjetaBento>

      <DetalleDelDia
        dia={diaAbierto}
        onAbrirEvento={(evento) => {
          establecerDiaAbierto(null);
          abrirLaMarca(evento);
        }}
        onCerrar={() => establecerDiaAbierto(null)}
      />
    </>
  );
}

/* ==================================================================== */
/* Navegación                                                          */
/* ==================================================================== */

function ControlesDelPeriodo({
  etiqueta,
  vista,
  esElPeriodoActual,
  estaRefrescando,
  onPeriodoAnterior,
  onPeriodoSiguiente,
  onIrAHoy,
}: {
  etiqueta: string;
  vista: VistaDelCalendario;
  esElPeriodoActual: boolean;
  estaRefrescando: boolean;
  onPeriodoAnterior: () => void;
  onPeriodoSiguiente: () => void;
  onIrAHoy: () => void;
}) {
  const nombreDelPeriodo = vista === "mes" ? "mes" : "semana";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        isIconOnly
        aria-label={`${nombreDelPeriodo === "mes" ? "Mes" : "Semana"} anterior`}
        isDisabled={estaRefrescando}
        radius="lg"
        size="sm"
        variant="flat"
        onPress={onPeriodoAnterior}
      >
        <ChevronLeft className="size-4" />
      </Button>

      <span className="min-w-44 text-center text-xs font-semibold text-foreground">
        {etiqueta}
      </span>

      <Button
        isIconOnly
        aria-label={`${nombreDelPeriodo === "mes" ? "Mes" : "Semana"} siguiente`}
        isDisabled={estaRefrescando}
        radius="lg"
        size="sm"
        variant="flat"
        onPress={onPeriodoSiguiente}
      >
        <ChevronRight className="size-4" />
      </Button>

      {/* Solo aparece cuando de verdad sirve para algo. */}
      {!esElPeriodoActual && (
        <Button radius="lg" size="sm" variant="light" onPress={onIrAHoy}>
          Hoy
        </Button>
      )}
    </div>
  );
}

/* ==================================================================== */
/* Vista semanal                                                       */
/* ==================================================================== */

function RejillaSemanal({
  dias,
  campanaResaltada,
  onPulsarDia,
  onAbrirEvento,
}: {
  dias: DiaDelCalendario[];
  campanaResaltada: string | null;
  onPulsarDia: (dia: DiaDelCalendario) => void;
  onAbrirEvento: (evento: EventoDeCalendario) => void;
}) {
  return (
    // Siete columnas en pantalla grande; en móvil se apilan, porque
    // siete columnas de 50 px no dejan leer ni el nombre de la marca.
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
      {dias.map((dia, posicion) => (
        <ColumnaSemanal
          key={dia.fecha}
          campanaResaltada={campanaResaltada}
          dia={dia}
          nombreCorto={DIAS_DE_LA_SEMANA[posicion % 7]}
          onAbrirEvento={onAbrirEvento}
          onPulsarDia={onPulsarDia}
        />
      ))}
    </div>
  );
}

function ColumnaSemanal({
  dia,
  nombreCorto,
  campanaResaltada,
  onPulsarDia,
  onAbrirEvento,
}: {
  dia: DiaDelCalendario;
  nombreCorto: string;
  campanaResaltada: string | null;
  onPulsarDia: (dia: DiaDelCalendario) => void;
  onAbrirEvento: (evento: EventoDeCalendario) => void;
}) {
  return (
    <div
      className={[
        "flex min-h-32 flex-col rounded-2xl border p-2 transition",
        dia.esHoy
          ? "border-primary bg-primary-50/50 dark:bg-primary-100/5"
          : "border-default-200",
        dia.eventos.length > 0 ? "hover:border-primary/50" : "",
      ].join(" ")}
    >
      {/* La cabecera del día es lo pulsable para abrir su detalle. Se
          deja como botón solo cuando hay algo que enseñar. */}
      <button
        className={[
          "mb-2 flex items-baseline justify-between gap-1 rounded-lg px-1 py-0.5 text-left transition",
          dia.eventos.length > 0 ? "hover:bg-default-100" : "cursor-default",
        ].join(" ")}
        disabled={dia.eventos.length === 0}
        type="button"
        onClick={() => onPulsarDia(dia)}
      >
        <span
          className={[
            "text-[11px] font-semibold uppercase tracking-wide",
            dia.esHoy ? "text-primary" : "text-default-400",
          ].join(" ")}
        >
          {nombreCorto}
        </span>

        <span
          className={[
            "text-sm font-bold tabular-nums",
            dia.esHoy ? "text-primary" : "text-default-600",
          ].join(" ")}
        >
          {dia.diaDelMes}
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-1.5">
        {dia.eventos.length === 0 ? (
          <span className="px-1 text-[11px] text-default-300">—</span>
        ) : (
          dia.eventos.map((evento) => (
            <Tooltip
              key={evento.eventoId}
              content={
                <div className="max-w-56 px-1 py-0.5">
                  <p className="text-xs font-semibold">{evento.marcaNombre}</p>
                  <p className="text-[11px] text-default-500">
                    {evento.campanaNombre}
                  </p>
                  <p className="mt-1 text-[11px] text-default-400">
                    {evento.zona ?? "Sin zona"} ·{" "}
                    {evento.vendedorNombre ?? "Sin asignar"}
                  </p>
                  <p className="mt-1 text-[11px] text-primary">
                    Pulsa para abrir la marca
                  </p>
                </div>
              }
              placement="top"
            >
              <button
                className="flex w-full items-center gap-1.5 rounded-xl px-1.5 py-1 text-left transition hover:brightness-125"
                style={{
                  // El color de la campaña, muy diluido de fondo y
                  // saturado en la barra lateral: así se distinguen las
                  // campañas sin que el día se vuelva un arcoíris.
                  backgroundColor: `${evento.campanaColor}1a`,
                  borderLeft: `3px solid ${evento.campanaColor}`,
                  opacity: estaApagadoPorLaLeyenda(evento, campanaResaltada)
                    ? 0.25
                    : 1,
                }}
                type="button"
                onClick={() => onAbrirEvento(evento)}
              >
                {evento.logoUrl ? (
                  <img
                    alt=""
                    className="size-4 shrink-0 rounded object-cover"
                    src={evento.logoUrl}
                  />
                ) : (
                  <span className="flex size-4 shrink-0 items-center justify-center rounded bg-default-200 text-[8px] font-bold text-default-500">
                    {inicialesDe(evento.marcaNombre)}
                  </span>
                )}

                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
                  {evento.marcaNombre}
                </span>
              </button>
            </Tooltip>
          ))
        )}
      </div>
    </div>
  );
}

/* ==================================================================== */
/* Vista mensual                                                       */
/* ==================================================================== */

function RejillaMensual({
  dias,
  campanaResaltada,
  onPulsarDia,
}: {
  dias: DiaDelCalendario[];
  campanaResaltada: string | null;
  onPulsarDia: (dia: DiaDelCalendario) => void;
}) {
  return (
    <div>
      {/* Cabecera con los días de la semana, una sola vez arriba. */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {DIAS_DE_LA_SEMANA.map((nombre) => (
          <span
            key={nombre}
            className="px-1 text-center text-[10px] font-bold uppercase tracking-wide text-default-400"
          >
            {nombre}
          </span>
        ))}
      </div>

      {/* En el mes las celdas son pequeñas: no cabe el nombre de cada
          marca, así que se resumen en puntos de color y un contador, y
          el detalle se abre al pulsar el día. */}
      <div className="grid grid-cols-7 gap-1">
        {dias.map((dia) => (
          <CeldaMensual
            key={dia.fecha}
            campanaResaltada={campanaResaltada}
            dia={dia}
            onPulsar={onPulsarDia}
          />
        ))}
      </div>
    </div>
  );
}

function CeldaMensual({
  dia,
  campanaResaltada,
  onPulsar,
}: {
  dia: DiaDelCalendario;
  campanaResaltada: string | null;
  onPulsar: (dia: DiaDelCalendario) => void;
}) {
  const tieneEventos = dia.eventos.length > 0;

  /**
   * Con una campaña resaltada, sus acciones se ponen delante.
   *
   * Es necesario: solo caben tres puntos, y si la campaña resaltada cae
   * la cuarta del día, el día entero se vería apagado aunque sí tenga
   * una acción suya. El orden solo cambia mientras dura el resaltado.
   */
  const eventosOrdenados =
    campanaResaltada === null
      ? dia.eventos
      : [
          ...dia.eventos.filter((evento) => evento.campanaNombre === campanaResaltada),
          ...dia.eventos.filter((evento) => evento.campanaNombre !== campanaResaltada),
        ];

  // Como mucho tres puntos; a partir de ahí, un "+N" que no rompe la
  // altura de la celda.
  const puntosVisibles = eventosOrdenados.slice(0, 3);
  const cuantosSobran = eventosOrdenados.length - puntosVisibles.length;

  return (
    <button
      className={[
        "flex min-h-16 flex-col items-start gap-1 rounded-xl border p-1.5 text-left transition",
        dia.esHoy
          ? "border-primary bg-primary-50/50 dark:bg-primary-100/5"
          : "border-default-200",
        dia.esDeOtroMes ? "opacity-40" : "",
        tieneEventos ? "hover:border-primary hover:bg-default-50" : "cursor-default",
      ].join(" ")}
      disabled={!tieneEventos}
      type="button"
      onClick={() => onPulsar(dia)}
    >
      <span
        className={[
          "text-xs font-bold tabular-nums",
          dia.esHoy ? "text-primary" : "text-default-600",
        ].join(" ")}
      >
        {dia.diaDelMes}
      </span>

      {tieneEventos && (
        <div className="flex flex-wrap items-center gap-1">
          {puntosVisibles.map((evento) => (
            <span
              key={evento.eventoId}
              className="size-2 rounded-full transition-opacity"
              style={{
                backgroundColor: evento.campanaColor,
                opacity: estaApagadoPorLaLeyenda(evento, campanaResaltada)
                  ? 0.2
                  : 1,
              }}
              title={`${evento.marcaNombre} — ${evento.campanaNombre}`}
            />
          ))}

          {cuantosSobran > 0 && (
            <span className="text-[9px] font-semibold text-default-500">
              +{cuantosSobran}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

/* ==================================================================== */
/* La leyenda                                                          */
/* ==================================================================== */

/**
 * Qué significa cada color de la rejilla.
 *
 * En la vista mensual el calendario es una nube de puntos de colores, y
 * sin esta lista la única forma de saber de qué campaña es cada punto es
 * abrir los días uno a uno.
 *
 * Al pulsar una campaña se RESALTA: las demás se apagan en la rejilla,
 * pero ni el reporte de abajo ni el Excel cambian. Resaltar y no filtrar
 * es lo que evita que lo que se ve y lo que se descarga digan cosas
 * distintas.
 *
 * Los colores llegan del servidor pegados a cada total; no se rebuscan
 * aquí entre los eventos del periodo.
 */
function LeyendaDeCampanas({
  campanas,
  campanaResaltada,
  onResaltar,
}: {
  campanas: TotalPorCampanaDelReporte[];
  campanaResaltada: string | null;
  onResaltar: (campana: string | null) => void;
}) {
  // Un periodo sin acciones no tiene colores que explicar.
  if (campanas.length === 0) return null;

  return (
    <div className="rounded-2xl border border-default-200 px-4 py-3">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-default-500">
          Qué significa cada color
        </h3>

        {campanaResaltada === null ? (
          <span className="text-[11px] text-default-400">
            Pulsa una campaña para resaltarla
          </span>
        ) : (
          <Button
            className="h-6 min-w-0 px-2 text-[11px]"
            radius="lg"
            size="sm"
            variant="light"
            onPress={() => onResaltar(null)}
          >
            Ver todas
          </Button>
        )}
      </div>

      <ul className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {campanas.map((campana) => {
          const estaResaltada = campanaResaltada === campana.etiqueta;

          return (
            <li key={campana.etiqueta}>
              <button
                aria-pressed={estaResaltada}
                className={[
                  "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-left transition",
                  estaResaltada
                    ? "border-primary bg-primary-50/60 dark:bg-primary-100/10"
                    : "border-transparent hover:bg-default-100",
                  // Las no elegidas se apagan igual que sus eventos en la
                  // rejilla, para que se lea que son lo mismo.
                  campanaResaltada !== null && !estaResaltada ? "opacity-40" : "",
                ].join(" ")}
                type="button"
                onClick={() =>
                  onResaltar(estaResaltada ? null : campana.etiqueta)
                }
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: campana.color }}
                />

                <span className="text-[11px] font-medium text-foreground">
                  {campana.etiqueta}
                </span>

                <span className="text-[11px] font-semibold tabular-nums text-default-500">
                  {campana.total}
                </span>
              </button>
            </li>
          );
        })}

        {/* Lo otro que la rejilla dice con color y no con palabras. */}
        <li className="mx-1 h-4 w-px bg-default-200" role="separator" />

        <li className="flex items-center gap-1.5 px-1 text-[11px] text-default-400">
          <span className="size-2.5 shrink-0 rounded-[4px] border-2 border-primary" />
          Hoy
        </li>
      </ul>
    </div>
  );
}

/* ==================================================================== */
/* Detalle de un día                                                   */
/* ==================================================================== */

function DetalleDelDia({
  dia,
  onCerrar,
  onAbrirEvento,
}: {
  dia: DiaDelCalendario | null;
  onCerrar: () => void;
  onAbrirEvento: (evento: EventoDeCalendario) => void;
}) {
  return (
    <Modal
      isOpen={dia !== null}
      scrollBehavior="inside"
      size="lg"
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="text-lg font-bold tracking-tight">
            {dia ? formatearFecha(dia.fecha) : ""}
          </span>
          <span className="text-xs font-normal text-default-500">
            {dia?.eventos.length ?? 0}{" "}
            {(dia?.eventos.length ?? 0) === 1 ? "acción" : "acciones"} de campaña
          </span>
        </ModalHeader>

        <ModalBody className="pb-6">
          <ul className="space-y-2">
            {dia?.eventos.map((evento) => (
              <li key={evento.eventoId}>
                <button
                  className="flex w-full items-center gap-3 rounded-2xl border border-default-200 p-3 text-left transition hover:border-primary hover:bg-default-50"
                  type="button"
                  onClick={() => onAbrirEvento(evento)}
                >
                  <span
                    className="h-10 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: evento.campanaColor }}
                  />

                  {evento.logoUrl ? (
                    <img
                      alt=""
                      className="size-10 shrink-0 rounded-xl object-cover"
                      src={evento.logoUrl}
                    />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-default-100 text-xs font-bold text-default-500">
                      {inicialesDe(evento.marcaNombre)}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {evento.marcaNombre}
                    </p>

                    <p className="truncate text-xs" style={{ color: evento.campanaColor }}>
                      {evento.campanaNombre}
                    </p>

                    <p className="mt-0.5 truncate text-[11px] text-default-400">
                      {[evento.zona, evento.sector, evento.vendedorNombre]
                        .filter(Boolean)
                        .join(" · ") || "Sin datos de asignación"}
                    </p>
                  </div>

                  <ExternalLink className="size-4 shrink-0 text-default-400" />
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-center text-[11px] text-default-400">
            Pulsa una marca para abrir su ficha.
          </p>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

/* ==================================================================== */
/* El reporte del periodo                                              */
/* ==================================================================== */

function ReporteDelPeriodo({
  resumen,
  etiqueta,
  periodo,
  reporte,
}: {
  resumen: ResumenDeLaSemana;
  etiqueta: string;
  periodo: PeriodoDelCalendario["periodo"];
  /** La respuesta entera: es lo que se vuelca al libro de Excel. */
  reporte: PeriodoDelCalendario;
}) {
  /**
   * Mientras se escribe el .xlsx. Un mes cargado tarda lo suyo, y un
   * botón que no responde se pulsa dos veces.
   */
  const [estaGenerando, establecerGenerando] = useState(false);

  /**
   * Arma el libro de Excel y lo descarga.
   *
   * La maquetación vive en `utilidades/excelDeCampanas`, no aquí: este
   * componente pinta un calendario y no tiene por qué saber de anchos de
   * columna ni de formatos de celda.
   *
   * Se genera con los datos que ya están en pantalla y no se le pide al
   * servidor: así el fichero dice exactamente lo mismo que el calendario
   * que se estaba mirando, sin una consulta más ni una segunda versión
   * del mismo cálculo.
   */
  async function descargarElExcel() {
    establecerGenerando(true);

    try {
      await descargarElReporteEnExcel(reporte);
    } catch (error) {
      // Sin esto, un fallo al escribir el fichero no deja ni rastro: el
      // botón vuelve a su sitio y parece que no se llegó a pulsar.
      avisarDeError(error, "No se pudo generar el reporte");
    } finally {
      establecerGenerando(false);
    }
  }

  const noHayNadaEnElPeriodo = resumen.totalDeAcciones === 0;

  return (
    <div className="rounded-2xl border border-default-200 bg-default-50/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Reporte {periodo.vista === "mes" ? "del mes" : "de la semana"}
          </h3>
          <p className="text-[11px] text-default-500">{etiqueta}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            isDisabled={noHayNadaEnElPeriodo}
            isLoading={estaGenerando}
            radius="lg"
            size="sm"
            startContent={
              estaGenerando ? undefined : <FileSpreadsheet className="size-3.5" />
            }
            variant="flat"
            onPress={() => void descargarElExcel()}
          >
            {estaGenerando ? "Generando…" : "Descargar Excel"}
          </Button>

          <Button
            isDisabled={noHayNadaEnElPeriodo}
            radius="lg"
            size="sm"
            startContent={<Printer className="size-3.5" />}
            variant="light"
            onPress={() => window.print()}
          >
            Imprimir
          </Button>
        </div>
      </div>

      {noHayNadaEnElPeriodo ? (
        <p className="py-4 text-center text-xs text-default-400">
          No hay ninguna acción de campaña programada en este periodo.
        </p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Chip color="primary" radius="lg" size="sm" variant="flat">
              {resumen.totalDeAcciones}{" "}
              {resumen.totalDeAcciones === 1 ? "acción" : "acciones"}
            </Chip>

            <Chip radius="lg" size="sm" variant="flat">
              {resumen.marcasDistintas}{" "}
              {resumen.marcasDistintas === 1 ? "marca" : "marcas"}
            </Chip>
          </div>

          {/* El desglose por agente sobra cuando la agenda ya es de una
              sola persona: sería una lista de un elemento repitiendo el
              total que está tres líneas más arriba. */}
          <div
            className={[
              "grid gap-4",
              periodo.esSoloMia ? "sm:grid-cols-2" : "sm:grid-cols-3",
            ].join(" ")}
          >
            <ListaDeTotales titulo="Por campaña" totales={resumen.porCampana} />
            <ListaDeTotales titulo="Por zona" totales={resumen.porZona} />

            {!periodo.esSoloMia && (
              <ListaDeTotales titulo="Por agente" totales={resumen.porVendedor} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Uno de los desgloses del reporte.
 *
 * Las filas que traen color —las de campaña— lo pintan. La leyenda de
 * arriba es la CLAVE de los colores y esto es el DESGLOSE del periodo;
 * repiten cifra a propósito, porque el reporte es lo que se imprime y
 * tiene que entenderse solo, sin la rejilla al lado.
 */
function ListaDeTotales({
  titulo,
  totales,
}: {
  titulo: string;
  /** El color solo lo traen los totales por campaña. */
  totales: (TotalDelReporte & { color?: string })[];
}) {
  return (
    <div>
      <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-default-500">
        {titulo}
      </h4>

      <ul className="space-y-1">
        {totales.map((fila) => (
          <li
            key={fila.etiqueta}
            className="flex items-baseline justify-between gap-2 text-xs"
          >
            <span className="flex min-w-0 items-baseline gap-1.5">
              {fila.color !== undefined && (
                <span
                  className="size-2 shrink-0 translate-y-px rounded-full"
                  style={{ backgroundColor: fila.color }}
                />
              )}

              <span className="min-w-0 truncate text-default-600">
                {fila.etiqueta}
              </span>
            </span>

            <span className="shrink-0 font-semibold tabular-nums text-foreground">
              {fila.total}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
