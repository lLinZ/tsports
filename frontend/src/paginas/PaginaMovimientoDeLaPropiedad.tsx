/**
 * paginas/PaginaMovimientoDeLaPropiedad.tsx
 * ---------------------------------------------------------------------
 * La ficha de UNA propiedad, abierta desde Propiedades › Movimiento o
 * desde el Cruce (`/propiedades/:id/movimiento`, admin y comercial).
 *
 * Arriba, cuánto vale y cuánto se pronostica, y cómo están repartidas
 * sus marcas. Debajo, esas marcas en tres columnas —calientes, tibias y
 * frías— con lo que se le pronostica a cada una EN ESTA propiedad, qué
 * pasó la última vez, la fase, quién la lleva y el siguiente paso. Las
 * que no tienen siguiente paso lo dicen en rojo: con eso se ve a quién
 * hay que llamar.
 *
 * Cada marca abre su ficha en el tablero; «Ver en el tablero» las lleva
 * todas con el filtro de esta propiedad puesto. Todo llega contado del
 * servidor (MovimientoDeLasPropiedades); aquí solo se pinta.
 * ---------------------------------------------------------------------
 */
import { Button, Chip } from "@heroui/react";
import {
  CalendarClock,
  ChevronRight,
  FileSpreadsheet,
  Globe,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { mensajeDeError } from "@/api/clienteHttp";
import { exportarMovimiento } from "@/api/movimientoDePropiedades";
import { BarraDeProporcion } from "@/componentes/comunes/BarraDeProporcion";
import {
  BloqueDeCarga,
  BloqueDeError,
} from "@/componentes/comunes/EstadosDePantalla";
import {
  APARIENCIA_DE_LOS_ESTADOS,
  ORDEN_DE_LOS_ESTADOS,
  textoDeHaceDias,
} from "@/componentes/crm/EstadoDeLaMarca";
import {
  BarraDeEstados,
  ComoSeCalculaLoCaliente,
  LogoDeLaPropiedad,
} from "@/componentes/crm/MovimientoDePropiedades";
import { useMovimientoDeLaPropiedad } from "@/hooks/useMovimientoDePropiedades";
import type { EstadoDeMarca, MarcaDeLaPropiedad } from "@/tipos/modelos";
import { avisarDeError } from "@/utilidades/avisos";
import { descargarLaFichaEnExcel } from "@/utilidades/excelDeMovimiento";
import {
  formatearDinero,
  formatearDineroAbreviado,
  formatearPorcentaje,
  formatearSiguientePaso,
  inicialesDe,
} from "@/utilidades/formato";

export function PaginaMovimientoDeLaPropiedad() {
  const { idDeLaPropiedad = "" } = useParams();
  const { ficha, estaCargando, error, recargar } =
    useMovimientoDeLaPropiedad(idDeLaPropiedad);
  const [estaDescargando, establecerDescargando] = useState(false);

  async function descargarEnExcel() {
    establecerDescargando(true);

    try {
      await descargarLaFichaEnExcel(
        await exportarMovimiento({ vista: "ficha", idDeLaPropiedad }),
      );
    } catch (errorAlDescargar) {
      avisarDeError(errorAlDescargar, "No se pudo sacar el Excel");
    } finally {
      establecerDescargando(false);
    }
  }

  if (estaCargando) {
    return (
      <BloqueDeCarga
        alto="min-h-96"
        mensaje="Cargando las marcas de la propiedad…"
      />
    );
  }

  if (error || ficha === undefined) {
    return (
      <BloqueDeError
        alReintentar={() => void recargar()}
        mensaje={mensajeDeError(error)}
      />
    );
  }

  const { propiedad, porEstado, marcas } = ficha;

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div>
        <nav
          aria-label="Dónde estás"
          className="mb-2 flex items-center gap-1 text-xs text-default-500"
        >
          <Link className="hover:text-foreground" to="/propiedades">
            Propiedades
          </Link>
          <ChevronRight className="size-3" />
          <Link
            className="hover:text-foreground"
            to="/propiedades?vista=movimiento"
          >
            Movimiento
          </Link>
          <ChevronRight className="size-3" />
          <span className="text-foreground">{propiedad.nombre}</span>
        </nav>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <LogoDeLaPropiedad
              grande
              logoUrl={propiedad.logoUrl}
              nombre={propiedad.nombre}
            />
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                {propiedad.nombre}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {!propiedad.activa && (
                  <Chip color="warning" radius="lg" size="sm" variant="flat">
                    Desactivada
                  </Chip>
                )}
                {propiedad.activa && propiedad.publicadaEnLaWeb && (
                  <Chip
                    color="success"
                    radius="lg"
                    size="sm"
                    startContent={<Globe className="ml-1 size-3" />}
                    variant="flat"
                  >
                    En la web
                  </Chip>
                )}
                <Chip
                  radius="lg"
                  size="sm"
                  startContent={<Users className="ml-1 size-3" />}
                  variant="flat"
                >
                  {propiedad.asignadaATodos
                    ? "Todo el equipo"
                    : "Con prospectores asignados"}
                </Chip>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ComoSeCalculaLoCaliente umbrales={ficha.umbrales} />
            <Button
              isLoading={estaDescargando}
              radius="full"
              size="sm"
              startContent={
                !estaDescargando && <FileSpreadsheet className="size-4" />
              }
              variant="flat"
              onPress={() => void descargarEnExcel()}
            >
              Excel
            </Button>
            {marcas.length > 0 && (
              <Button
                as={Link}
                color="primary"
                radius="full"
                size="sm"
                to={`/marcas?propiedad=${propiedad.id}&orden=ovp_propiedad`}
                variant="flat"
              >
                Ver {marcas.length === 1 ? "la marca" : `las ${marcas.length}`}{" "}
                en el tablero
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Lo que vale y cómo están sus marcas */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.35fr_1fr]">
        <div className="bento-card p-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-default-400">
            Cuánto vale y cuánto se pronostica
          </p>
          <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-default-50 p-3">
            <Monto
              etiqueta="MTP"
              valor={formatearDineroAbreviado(propiedad.montoTotalUsd)}
            />
            <Monto
              etiqueta={`Meta ${formatearPorcentaje(propiedad.porcentajeForecast)}`}
              valor={formatearDineroAbreviado(propiedad.forecastDeVentaUsd)}
            />
            <Monto
              destacado
              etiqueta="OVP"
              valor={formatearDineroAbreviado(propiedad.ovpUsd)}
            />
          </div>
          <BarraDeProporcion
            montoDeLaMeta={propiedad.forecastDeVentaUsd}
            montoPronosticado={propiedad.ovpUsd}
            montoTotal={propiedad.montoTotalUsd}
          />
        </div>

        <div className="bento-card p-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-default-400">
            Cómo están sus {marcas.length}{" "}
            {marcas.length === 1 ? "marca" : "marcas"}
          </p>
          <BarraDeEstados alta reparto={porEstado} />
          <div className="mt-4 grid grid-cols-3 gap-2">
            {ORDEN_DE_LOS_ESTADOS.map((estado) => (
              <div key={estado}>
                <p
                  className={`text-xl font-bold ${APARIENCIA_DE_LOS_ESTADOS[estado].texto}`}
                >
                  {formatearDineroAbreviado(porEstado[estado].ovpUsd)}
                </p>
                <p className="text-xs text-default-500">
                  en {porEstado[estado].marcas}{" "}
                  {porEstado[estado].marcas === 1
                    ? APARIENCIA_DE_LOS_ESTADOS[estado].etiqueta.toLowerCase()
                    : APARIENCIA_DE_LOS_ESTADOS[estado].plural.toLowerCase()}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Las marcas, por estado */}
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
        {ORDEN_DE_LOS_ESTADOS.map((estado) => (
          <ColumnaDeEstado
            key={estado}
            estado={estado}
            marcas={marcas.filter((marca) => marca.estado === estado)}
            ovpUsd={porEstado[estado].ovpUsd}
          />
        ))}
      </div>
    </div>
  );
}

/* ==================================================================== */
/* Piezas                                                              */
/* ==================================================================== */

function ColumnaDeEstado({
  estado,
  marcas,
  ovpUsd,
}: {
  estado: EstadoDeMarca;
  marcas: MarcaDeLaPropiedad[];
  ovpUsd: number;
}) {
  const {
    icono: Icono,
    plural,
    pastilla,
    texto,
  } = APARIENCIA_DE_LOS_ESTADOS[estado];

  return (
    <section className="bento-card overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3">
        <span
          className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${pastilla}`}
        >
          <Icono className="size-4" />
          {plural} · {marcas.length}
        </span>
        <span className={`text-sm font-bold ${texto}`}>
          {formatearDineroAbreviado(ovpUsd)}
        </span>
      </header>

      {/* Una lista informativa no se esconde vacía: dice que no hay. */}
      {marcas.length === 0 ? (
        <p className="border-t border-default-100 px-4 py-6 text-center text-xs text-default-400">
          Ninguna marca{" "}
          {APARIENCIA_DE_LOS_ESTADOS[estado].etiqueta.toLowerCase()} en esta
          propiedad.
        </p>
      ) : (
        marcas.map((marca) => (
          <MarcaDeLaColumna key={marca.marcaId} marca={marca} />
        ))
      )}
    </section>
  );
}

function MarcaDeLaColumna({ marca }: { marca: MarcaDeLaPropiedad }) {
  const { texto } = APARIENCIA_DE_LOS_ESTADOS[marca.estado];

  return (
    <Link
      className="block border-t border-default-100 px-4 py-3 transition-colors hover:bg-default-50"
      to={`/marcas?abrir=${marca.marcaId}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-default-100">
            {marca.logoUrl ? (
              <img
                alt=""
                className="size-full object-cover"
                loading="lazy"
                src={marca.logoUrl}
              />
            ) : (
              <span className="text-[10px] font-bold text-default-400">
                {inicialesDe(marca.nombre)}
              </span>
            )}
          </span>
          <span className="truncate text-sm font-semibold text-foreground">
            {marca.nombre}
          </span>
        </div>
        <span className="shrink-0 text-sm font-bold text-primary">
          {marca.ovpUsd > 0 ? (
            formatearDinero(marca.ovpUsd)
          ) : (
            <span className="text-xs font-medium text-default-400">
              sin cifra
            </span>
          )}
        </span>
      </div>

      <p className="mt-1.5 truncate text-xs text-default-500">
        <span className={`font-semibold ${texto}`}>
          {textoDeHaceDias(marca.ultimoMovimiento.haceDias)}
        </span>
        {" · "}
        {marca.ultimoMovimiento.etiqueta}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Chip
          color={marca.fase.valor === "propuesta" ? "success" : "default"}
          radius="full"
          size="sm"
          variant="flat"
        >
          {marca.fase.etiqueta}
        </Chip>

        {marca.siguientePaso === null ? (
          <Chip color="danger" radius="full" size="sm" variant="flat">
            Sin siguiente paso
          </Chip>
        ) : (
          <Chip
            color={marca.siguientePaso.diasHasta < 0 ? "warning" : "default"}
            radius="full"
            size="sm"
            startContent={<CalendarClock className="ml-1 size-3" />}
            variant="flat"
          >
            {formatearSiguientePaso(marca.siguientePaso)}
          </Chip>
        )}

        {marca.agente !== null ? (
          <span
            className="flex size-6 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary"
            title={marca.agente.nombre ?? undefined}
          >
            {inicialesDe(marca.agente.nombre)}
          </span>
        ) : (
          <span className="text-[11px] text-default-400">Sin agente</span>
        )}
      </div>
    </Link>
  );
}

function Monto({
  etiqueta,
  valor,
  destacado = false,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] uppercase tracking-wide text-default-400">
        {etiqueta}
      </p>
      <p
        className={[
          "truncate text-base font-bold",
          destacado ? "text-primary" : "text-foreground",
        ].join(" ")}
      >
        {valor}
      </p>
    </div>
  );
}
