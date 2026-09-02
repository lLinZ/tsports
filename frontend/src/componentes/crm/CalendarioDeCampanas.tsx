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
 *
 * Lo segundo se hace navegando a /marcas?abrir=<id> y no montando otra
 * ficha aquí: así la ficha vive en un único sitio, y de paso la
 * dirección queda compartible.
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
  Download,
  ExternalLink,
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
import { formatearFecha, inicialesDe } from "@/utilidades/formato";
import type {
  DiaDelCalendario,
  EventoDeCalendario,
  PeriodoDelCalendario,
  ResumenDeLaSemana,
  VistaDelCalendario,
} from "@/tipos/modelos";

/** Nombres cortos de los días, de lunes a domingo. */
const DIAS_DE_LA_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

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

  if (consulta.error || !consulta.data) {
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
        descripcion="Las acciones de campaña programadas. Pulsa un día para ver su detalle."
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
              dias={dias}
              onAbrirEvento={abrirLaMarca}
              onPulsarDia={establecerDiaAbierto}
            />
          ) : (
            <RejillaMensual dias={dias} onPulsarDia={establecerDiaAbierto} />
          )}

          <ReporteDelPeriodo
            dias={dias}
            etiqueta={periodo.etiqueta}
            periodo={periodo}
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
  onPulsarDia,
  onAbrirEvento,
}: {
  dias: DiaDelCalendario[];
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
  onPulsarDia,
  onAbrirEvento,
}: {
  dia: DiaDelCalendario;
  nombreCorto: string;
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
  onPulsarDia,
}: {
  dias: DiaDelCalendario[];
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
          <CeldaMensual key={dia.fecha} dia={dia} onPulsar={onPulsarDia} />
        ))}
      </div>
    </div>
  );
}

function CeldaMensual({
  dia,
  onPulsar,
}: {
  dia: DiaDelCalendario;
  onPulsar: (dia: DiaDelCalendario) => void;
}) {
  const tieneEventos = dia.eventos.length > 0;

  // Como mucho tres puntos; a partir de ahí, un "+N" que no rompe la
  // altura de la celda.
  const puntosVisibles = dia.eventos.slice(0, 3);
  const cuantosSobran = dia.eventos.length - puntosVisibles.length;

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
              className="size-2 rounded-full"
              style={{ backgroundColor: evento.campanaColor }}
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
  dias,
}: {
  resumen: ResumenDeLaSemana;
  etiqueta: string;
  periodo: PeriodoDelCalendario["periodo"];
  dias: DiaDelCalendario[];
}) {
  /**
   * Arma el CSV y lo descarga.
   *
   * Se construye aquí con los datos que ya están en pantalla: pedirle al
   * servidor que genere el fichero obligaría a repetir la consulta y a
   * mantener el mismo cálculo en dos sitios.
   */
  function descargarElCsv() {
    const escaparCampo = (valor: string | null): string => {
      const texto = valor ?? "";

      // Comillas dobles alrededor y las de dentro duplicadas: es lo que
      // espera Excel cuando el texto lleva comas, y los nombres de
      // campaña las llevan.
      return `"${texto.replace(/"/g, '""')}"`;
    };

    const filas = [
      ["Fecha", "Marca", "Campaña", "Zona", "Sector", "Vendedor"]
        .map(escaparCampo)
        .join(","),
      ...dias.flatMap((dia) =>
        dia.eventos.map((evento) =>
          [
            dia.fecha,
            evento.marcaNombre,
            evento.campanaNombre,
            evento.zona,
            evento.sector,
            evento.vendedorNombre,
          ]
            .map(escaparCampo)
            .join(","),
        ),
      ),
    ];

    // El BOM al principio es lo que hace que Excel en Windows abra el
    // fichero como UTF-8; sin él, las tildes y la eñe salen rotas.
    const contenido = `﻿${filas.join("\r\n")}`;

    const enlace = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([contenido], { type: "text/csv;charset=utf-8;" }),
    );

    enlace.href = url;
    enlace.download = `TS-Sports-campanas-${periodo.desde}-a-${periodo.hasta}.csv`;
    enlace.click();

    URL.revokeObjectURL(url);
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
            radius="lg"
            size="sm"
            startContent={<Download className="size-3.5" />}
            variant="flat"
            onPress={descargarElCsv}
          >
            Descargar CSV
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

          <div className="grid gap-4 sm:grid-cols-3">
            <ListaDeTotales titulo="Por campaña" totales={resumen.porCampana} />
            <ListaDeTotales titulo="Por zona" totales={resumen.porZona} />
            <ListaDeTotales titulo="Por vendedor" totales={resumen.porVendedor} />
          </div>
        </>
      )}
    </div>
  );
}

function ListaDeTotales({
  titulo,
  totales,
}: {
  titulo: string;
  totales: ResumenDeLaSemana["porCampana"];
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
            <span className="min-w-0 truncate text-default-600">
              {fila.etiqueta}
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
