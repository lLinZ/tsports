/**
 * componentes/crm/MovimientoDePropiedades.tsx
 * ---------------------------------------------------------------------
 * Propiedades › Movimiento: qué propiedades se están moviendo.
 *
 * Una fila por propiedad con las marcas que la llevan repartidas en
 * calientes, tibias y frías, el pronóstico sobre el MTP, cuánto de ese
 * pronóstico está en las calientes y su último movimiento. Pulsar una
 * fila abre la ficha de la propiedad con esas marcas.
 *
 * NO HAY ESTADO DE LA PROPIEDAD: se cuenta cuántas marcas hay de cada
 * uno. Dos calientes y dos frías no son una «tibia», y el ranking ordena
 * por cuántas calientes tiene cada propiedad (y, si empatan, por el
 * dinero que está en ellas).
 *
 * Aquí no se cuenta nada: los repartos, los días y los porcentajes
 * llegan del servidor (MovimientoDeLasPropiedades). Lo único que se
 * calcula es el ancho de cada tramo de la barra, como en
 * BarraDeProporcion.
 *
 * Lo usa PaginaPropiedades, en la pestaña «Movimiento», y solo para quien
 * tiene `veElMovimientoDeLasPropiedades` (admin y comercial).
 *
 * También exporta las dos piezas que repite la ficha de una propiedad:
 * la barra de tres colores y las cuentas por estado.
 * ---------------------------------------------------------------------
 */
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tab,
  Tabs,
} from "@heroui/react";
import {
  ChevronRight,
  FileSpreadsheet,
  Flame,
  Package,
  Snowflake,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { mensajeDeError } from "@/api/clienteHttp";
import { exportarMovimiento } from "@/api/movimientoDePropiedades";
import { BarraDeProporcion } from "@/componentes/comunes/BarraDeProporcion";
import {
  BloqueDeCarga,
  BloqueDeError,
  EstadoVacio,
} from "@/componentes/comunes/EstadosDePantalla";
import {
  APARIENCIA_DE_LOS_ESTADOS,
  ORDEN_DE_LOS_ESTADOS,
  explicacionDeLosUmbrales,
  textoDeHaceDias,
} from "@/componentes/crm/EstadoDeLaMarca";
import { useMovimientoDePropiedades } from "@/hooks/useMovimientoDePropiedades";
import type {
  OrdenDelMovimiento,
  PropiedadEnMovimiento,
  RepartoDeMarcasPorEstado,
  UmbralesDelEstado,
} from "@/tipos/modelos";
import { avisarDeError } from "@/utilidades/avisos";
import { descargarElRankingEnExcel } from "@/utilidades/excelDeMovimiento";
import {
  formatearDineroAbreviado,
  formatearPorcentaje,
  inicialesDe,
} from "@/utilidades/formato";

const ORDENES: { clave: OrdenDelMovimiento; titulo: string }[] = [
  { clave: "calientes", titulo: "Más calientes" },
  { clave: "marcas", titulo: "Más marcas" },
  { clave: "pronostico", titulo: "Más pronóstico" },
  { clave: "avance", titulo: "Más avance sobre el MTP" },
];

function esUnOrden(valor: string | null): valor is OrdenDelMovimiento {
  return ORDENES.some((orden) => orden.clave === valor);
}

export function MovimientoDePropiedades() {
  const [parametros, establecerParametros] = useSearchParams();
  const ordenDeLaDireccion = parametros.get("orden");
  const orden: OrdenDelMovimiento = esUnOrden(ordenDeLaDireccion)
    ? ordenDeLaDireccion
    : "calientes";
  const { movimiento, estaCargando, error, recargar } =
    useMovimientoDePropiedades(orden);
  const [estaDescargando, establecerDescargando] = useState(false);

  // El orden va en la dirección: al volver de la ficha de una propiedad
  // la lista sigue ordenada como estaba.
  function cambiarOrden(nuevo: OrdenDelMovimiento) {
    const siguientes = new URLSearchParams(parametros);
    siguientes.set("orden", nuevo);
    establecerParametros(siguientes, { replace: true });
  }

  async function descargarEnExcel() {
    establecerDescargando(true);

    try {
      await descargarElRankingEnExcel(
        await exportarMovimiento({ vista: "ranking", orden }),
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
        alto="min-h-72"
        mensaje="Contando las marcas de cada propiedad…"
      />
    );
  }

  if (error || movimiento === undefined) {
    return (
      <BloqueDeError
        alReintentar={() => void recargar()}
        mensaje={mensajeDeError(error)}
      />
    );
  }

  const { totales } = movimiento;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CifraDelMovimiento
          etiqueta="Valor del catálogo (MTP)"
          icono={<Wallet className="size-4" />}
          valor={formatearDineroAbreviado(totales.montoTotalUsd)}
        />
        <CifraDelMovimiento
          etiqueta="Meta de venta"
          icono={<Target className="size-4" />}
          valor={formatearDineroAbreviado(totales.forecastDeVentaUsd)}
        />
        <CifraDelMovimiento
          destacada
          etiqueta="Pronosticado por el equipo (OVP)"
          icono={<TrendingUp className="size-4" />}
          valor={formatearDineroAbreviado(totales.ovpUsd)}
        />
        <CifraDelMovimiento
          caliente
          etiqueta={
            totales.porcentajeEnCalientes === null
              ? "En marcas calientes"
              : `En marcas calientes (${formatearPorcentaje(totales.porcentajeEnCalientes)})`
          }
          icono={<Flame className="size-4" />}
          valor={formatearDineroAbreviado(totales.ovpEnCalientesUsd)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <span className="text-xs text-default-500">Ordenar por</span>
          <Tabs
            aria-label="Orden de las propiedades"
            // En el móvil no caben las cuatro: se desplazan en su sitio.
            classNames={{ base: "max-w-full overflow-x-auto" }}
            radius="full"
            selectedKey={orden}
            size="sm"
            onSelectionChange={(clave) =>
              cambiarOrden(clave as OrdenDelMovimiento)
            }
          >
            {ORDENES.map((opcion) => (
              <Tab key={opcion.clave} title={opcion.titulo} />
            ))}
          </Tabs>
        </div>

        <div className="flex items-center gap-2">
          <ComoSeCalculaLoCaliente umbrales={movimiento.umbrales} />
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
        </div>
      </div>

      {movimiento.propiedades.length === 0 ? (
        <div className="bento-card">
          <EstadoVacio
            descripcion="Cuando el equipo añada propiedades al checklist de sus marcas, aquí se verá cuáles se mueven."
            icono={<Package className="size-5" />}
            titulo="Ninguna marca lleva propiedades todavía"
          />
        </div>
      ) : (
        <div className="bento-card px-4 py-1 sm:px-5">
          <div className="hidden grid-cols-[minmax(0,1.15fr)_minmax(0,1.1fr)_minmax(0,1fr)_6rem_minmax(0,1.1fr)_1rem] gap-5 border-b border-default-100 py-3 text-[10px] font-semibold uppercase tracking-wide text-default-400 lg:grid">
            <span className="pl-7">Propiedad</span>
            <span>Marcas que la llevan</span>
            <span>Pronóstico sobre el MTP</span>
            <span>En calientes</span>
            <span>Último movimiento</span>
            <span />
          </div>

          {movimiento.propiedades.map((propiedad, posicion) => (
            <FilaDelRanking
              key={propiedad.propiedadId}
              posicion={posicion + 1}
              propiedad={propiedad}
            />
          ))}

          {movimiento.sinMarcas.length > 0 && (
            <p className="flex items-start gap-2 border-t border-default-100 py-3 text-xs text-default-500">
              <Package className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <span className="font-semibold text-foreground">
                  Sin marcas todavía:{" "}
                </span>
                {movimiento.sinMarcas
                  .map((propiedad) =>
                    propiedad.tieneMtp
                      ? propiedad.nombre
                      : `${propiedad.nombre} (sin MTP cargado)`,
                  )
                  .join(" · ")}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ==================================================================== */
/* Piezas                                                              */
/* ==================================================================== */

function FilaDelRanking({
  propiedad,
  posicion,
}: {
  propiedad: PropiedadEnMovimiento;
  posicion: number;
}) {
  const ultimo = propiedad.ultimoMovimiento;
  const seQuedoQuieta =
    ultimo !== null &&
    propiedad.porEstado.caliente.marcas === 0 &&
    propiedad.porEstado.tibia.marcas === 0;

  return (
    <Link
      className="grid grid-cols-1 items-center gap-3 border-b border-default-100 py-4 transition-colors last:border-b-0 hover:bg-default-50 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.1fr)_minmax(0,1fr)_6rem_minmax(0,1.1fr)_1rem] lg:gap-5 lg:py-3.5"
      to={`/propiedades/${propiedad.propiedadId}/movimiento`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="w-4 shrink-0 text-right text-xs font-bold text-default-400">
          {posicion}
        </span>
        <LogoDeLaPropiedad
          logoUrl={propiedad.logoUrl}
          nombre={propiedad.nombre}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {propiedad.nombre}
            {!propiedad.activa && (
              <span className="ml-1.5 text-[11px] font-normal text-warning-600">
                · desactivada
              </span>
            )}
          </p>
          <p className="truncate text-xs text-default-500">
            MTP {formatearDineroAbreviado(propiedad.montoTotalUsd)} · Meta{" "}
            {formatearDineroAbreviado(propiedad.forecastDeVentaUsd)}
          </p>
        </div>
      </div>

      <div className="min-w-0">
        <BarraDeEstados reparto={propiedad.porEstado} />
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          <CuentasPorEstado reparto={propiedad.porEstado} />
          <span className="text-default-500">
            {propiedad.marcas} {propiedad.marcas === 1 ? "marca" : "marcas"}
          </span>
          {propiedad.nuevasEsteMes > 0 && (
            <span className="font-semibold text-success-600">
              +{propiedad.nuevasEsteMes} este mes
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <BarraDeProporcion
          compacta
          montoDeLaMeta={propiedad.forecastDeVentaUsd}
          montoPronosticado={propiedad.ovpUsd}
          montoTotal={propiedad.montoTotalUsd}
        />
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wide text-default-400 lg:hidden">
          En calientes
        </p>
        {propiedad.ovpEnCalientesUsd > 0 ? (
          <p
            className={`text-sm font-bold ${APARIENCIA_DE_LOS_ESTADOS.caliente.texto}`}
          >
            {formatearDineroAbreviado(propiedad.ovpEnCalientesUsd)}
          </p>
        ) : (
          <p className="text-sm text-default-300">—</p>
        )}
      </div>

      <div className="min-w-0 text-xs">
        {ultimo === null ? (
          <span className="text-default-400">Sin movimiento</span>
        ) : (
          <>
            <p className="truncate">
              <span
                className={`font-semibold ${APARIENCIA_DE_LOS_ESTADOS[ultimo.estado].texto}`}
              >
                {textoDeHaceDias(ultimo.haceDias)}
              </span>
              <span className="text-foreground"> · {ultimo.marcaNombre}</span>
            </p>
            {seQuedoQuieta ? (
              <span
                className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${APARIENCIA_DE_LOS_ESTADOS.fria.pastilla}`}
              >
                <Snowflake className="size-3" />
                Ninguna se mueve desde hace {ultimo.haceDias} días
              </span>
            ) : (
              <p className="truncate text-default-500">{ultimo.etiqueta}</p>
            )}
          </>
        )}
      </div>

      <ChevronRight className="hidden size-4 text-default-300 lg:block" />
    </Link>
  );
}

/**
 * La barra de tres colores: cuántas de sus marcas están calientes,
 * tibias y frías. Cada tramo mide lo que su número sobre el total.
 */
export function BarraDeEstados({
  reparto,
  alta = false,
}: {
  reparto: RepartoDeMarcasPorEstado;
  alta?: boolean;
}) {
  const total = ORDEN_DE_LOS_ESTADOS.reduce(
    (suma, estado) => suma + reparto[estado].marcas,
    0,
  );

  return (
    <div
      aria-label={ORDEN_DE_LOS_ESTADOS.map(
        (estado) =>
          `${reparto[estado].marcas} ${APARIENCIA_DE_LOS_ESTADOS[estado].plural.toLowerCase()}`,
      ).join(", ")}
      className={`flex gap-0.5 overflow-hidden rounded-full bg-default-100 ${alta ? "h-4" : "h-2.5"}`}
      role="img"
    >
      {total > 0 &&
        ORDEN_DE_LOS_ESTADOS.filter((estado) => reparto[estado].marcas > 0).map(
          (estado) => (
            <span
              key={estado}
              className="h-full"
              style={{
                flexGrow: reparto[estado].marcas,
                backgroundColor: APARIENCIA_DE_LOS_ESTADOS[estado].solido,
              }}
            />
          ),
        )}
    </div>
  );
}

/** «🔥 5 ☀ 3 ❄ 1», con los colores de cada estado. */
export function CuentasPorEstado({
  reparto,
}: {
  reparto: RepartoDeMarcasPorEstado;
}) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold">
      {ORDEN_DE_LOS_ESTADOS.map((estado) => {
        const {
          icono: Icono,
          texto,
          plural,
        } = APARIENCIA_DE_LOS_ESTADOS[estado];

        return (
          <span
            key={estado}
            className={`inline-flex items-center gap-0.5 ${texto}`}
            title={plural}
          >
            <Icono className="size-3.5" />
            {reparto[estado].marcas}
          </span>
        );
      })}
    </span>
  );
}

export function LogoDeLaPropiedad({
  logoUrl,
  nombre,
  grande = false,
}: {
  logoUrl: string | null;
  nombre: string;
  grande?: boolean;
}) {
  return (
    <span
      className={[
        "flex shrink-0 items-center justify-center overflow-hidden bg-default-100",
        grande ? "size-12 rounded-2xl" : "size-9 rounded-xl",
      ].join(" ")}
    >
      {logoUrl ? (
        <img alt="" className="size-full object-cover" src={logoUrl} />
      ) : (
        <span className="text-[11px] font-bold text-default-400">
          {inicialesDe(nombre)}
        </span>
      )}
    </span>
  );
}

/**
 * «¿Cómo se calcula lo caliente?»: un Popover y no un Tooltip, para que
 * se abra con el dedo (como la ayuda de las cajas, ver 4.8).
 */
export function ComoSeCalculaLoCaliente({
  umbrales,
}: {
  umbrales: UmbralesDelEstado;
}) {
  return (
    <Popover placement="bottom-end" radius="lg">
      <PopoverTrigger>
        <button
          className="text-xs text-default-500 underline decoration-dotted underline-offset-4 hover:text-foreground"
          type="button"
        >
          ¿Cómo se calcula lo caliente?
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-xs p-3">
        <div className="space-y-2 text-xs leading-relaxed text-default-600">
          <p>
            Cada propiedad toma el estado de las marcas que la llevan en su
            checklist, el mismo del tablero, y se cuenta cuántas hay de cada
            uno. No se promedia.
          </p>
          <p>{explicacionDeLosUmbrales(umbrales)}</p>
          <p>
            El estado es de la marca: si se le llamó por una propiedad, todas
            las que lleva cuentan como calientes en ella.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CifraDelMovimiento({
  etiqueta,
  valor,
  icono,
  destacada = false,
  caliente = false,
}: {
  etiqueta: string;
  valor: string;
  icono: React.ReactNode;
  destacada?: boolean;
  caliente?: boolean;
}) {
  return (
    <div
      className={[
        "bento-card flex items-center gap-3 p-4",
        destacada ? "border-primary bg-primary text-primary-foreground" : "",
      ].join(" ")}
    >
      <span
        className={[
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          destacada
            ? "bg-white/20"
            : caliente
              ? APARIENCIA_DE_LOS_ESTADOS.caliente.pastilla
              : "bg-default-100 text-default-500",
        ].join(" ")}
      >
        {icono}
      </span>
      <div className="min-w-0">
        <p
          className={[
            "text-lg font-bold leading-none tracking-tight",
            caliente ? APARIENCIA_DE_LOS_ESTADOS.caliente.texto : "",
          ].join(" ")}
        >
          {valor}
        </p>
        <p
          className={[
            "mt-1 truncate text-[11px]",
            destacada ? "text-primary-foreground/80" : "text-default-500",
          ].join(" ")}
        >
          {etiqueta}
        </p>
      </div>
    </div>
  );
}
