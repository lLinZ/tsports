/**
 * paginas/PaginaPropiedades.tsx
 * ---------------------------------------------------------------------
 * El catálogo de productos IOP: lo que la agencia vende.
 *
 * Cada propiedad es una caja con sus tres montos puestos en la misma
 * línea de lectura:
 *
 *   MTP  → cuánto vale la propiedad entera.
 *   Meta → el porcentaje acordado sobre el MTP (20 % de partida).
 *   OVP  → lo que el equipo pronostica venderle, sumando lo anotado en
 *          todas las marcas que la llevan en su checklist.
 *
 * Y bajo ellos la barra con la proporción, que es la lectura que pidió
 * el cliente: de los 7.400 que vale la propiedad se están pronosticando
 * 500, o sea un 6,8 %.
 *
 * Arriba, tres contadores con el total del catálogo. Sirven para
 * responder de un vistazo a la única pregunta que importa aquí: cuánto
 * hay puesto a la venta y cuánto lleva pronosticado el equipo.
 * ---------------------------------------------------------------------
 */
import { Button, Chip, Tooltip } from "@heroui/react";
import {
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { mensajeDeError } from "@/api/clienteHttp";
import { BarraDeProporcion } from "@/componentes/comunes/BarraDeProporcion";
import {
  BloqueDeCarga,
  BloqueDeError,
  EstadoVacio,
} from "@/componentes/comunes/EstadosDePantalla";
import { ModalDePropiedad } from "@/componentes/crm/ModalDePropiedad";
import { useCatalogoDePropiedades } from "@/hooks/usePropiedades";
import { useUsuarioAutenticado } from "@/providers/ProveedorSesion";
import {
  formatearDineroAbreviado,
  formatearPorcentaje,
  inicialesDe,
} from "@/utilidades/formato";
import type { Propiedad } from "@/tipos/modelos";

export function PaginaPropiedades() {
  const usuario = useUsuarioAutenticado();
  const catalogo = useCatalogoDePropiedades();

  const [elModalEstaAbierto, establecerModalAbierto] = useState(false);
  const [propiedadEnEdicion, establecerPropiedadEnEdicion] =
    useState<Propiedad | null>(null);

  function abrirModalDeAlta() {
    establecerPropiedadEnEdicion(null);
    establecerModalAbierto(true);
  }

  function abrirModalDeEdicion(propiedad: Propiedad) {
    establecerPropiedadEnEdicion(propiedad);
    establecerModalAbierto(true);
  }

  const { propiedades } = catalogo;

  // Totales del catálogo. Solo cuentan las propiedades en venta: sumar
  // una retirada inflaría la meta con dinero que ya nadie persigue.
  const propiedadesEnVenta = propiedades.filter((propiedad) => propiedad.activa);

  const montoTotalDelCatalogo = propiedadesEnVenta.reduce(
    (suma, propiedad) => suma + propiedad.montoTotalUsd,
    0,
  );
  const metaTotalDelCatalogo = propiedadesEnVenta.reduce(
    (suma, propiedad) => suma + propiedad.forecastDeVentaUsd,
    0,
  );
  const pronosticoTotalDelEquipo = propiedades.reduce(
    (suma, propiedad) => suma + (propiedad.ovpAcumuladoUsd ?? 0),
    0,
  );

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Propiedades
          </h2>
          <p className="mt-0.5 text-sm text-default-500">
            {catalogo.estaCargando
              ? "Cargando el catálogo…"
              : `${propiedades.length} ${
                  propiedades.length === 1 ? "producto" : "productos"
                } IOP · ${propiedadesEnVenta.length} en venta`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            isIconOnly
            aria-label="Actualizar el catálogo"
            isLoading={catalogo.estaRefrescando}
            radius="lg"
            size="sm"
            variant="flat"
            onPress={() => void catalogo.recargar()}
          >
            {!catalogo.estaRefrescando && <RefreshCw className="size-4" />}
          </Button>

          {usuario.permisos.gestionaElCatalogoComercial && (
            <Button
              color="primary"
              radius="lg"
              size="sm"
              startContent={<Plus className="size-4" />}
              onPress={abrirModalDeAlta}
            >
              Nueva propiedad
            </Button>
          )}
        </div>
      </div>

      {/* Los tres totales del catálogo */}
      {propiedades.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TotalDelCatalogo
            ayuda="Suma del monto total de las propiedades en venta."
            etiqueta="Valor del catálogo (MTP)"
            icono={<Wallet className="size-4" />}
            valor={formatearDineroAbreviado(montoTotalDelCatalogo)}
          />
          <TotalDelCatalogo
            ayuda="Suma del porcentaje acordado sobre cada propiedad."
            etiqueta="Meta de venta"
            icono={<Target className="size-4" />}
            valor={formatearDineroAbreviado(metaTotalDelCatalogo)}
          />
          <TotalDelCatalogo
            destacada
            ayuda="Suma de los pronósticos anotados en todas las marcas."
            etiqueta="Pronosticado por el equipo (OVP)"
            icono={<TrendingUp className="size-4" />}
            valor={formatearDineroAbreviado(pronosticoTotalDelEquipo)}
          />
        </div>
      )}

      {/* El catálogo */}
      {catalogo.estaCargando ? (
        <BloqueDeCarga alto="min-h-72" mensaje="Cargando las propiedades…" />
      ) : catalogo.error ? (
        <BloqueDeError
          alReintentar={() => void catalogo.recargar()}
          mensaje={mensajeDeError(catalogo.error)}
        />
      ) : propiedades.length === 0 ? (
        <div className="bento-card">
          <EstadoVacio
            accion={
              usuario.permisos.gestionaElCatalogoComercial ? (
                <Button
                  color="primary"
                  radius="lg"
                  size="sm"
                  startContent={<Plus className="size-4" />}
                  onPress={abrirModalDeAlta}
                >
                  Crear la primera propiedad
                </Button>
              ) : undefined
            }
            descripcion="Aquí se cargan los productos que la agencia vende, con su monto total y su meta."
            icono={<Package className="size-5" />}
            titulo="Todavía no hay propiedades"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {propiedades.map((propiedad) => (
            <TarjetaDePropiedad
              key={propiedad.id}
              propiedad={propiedad}
              alEditar={abrirModalDeEdicion}
            />
          ))}
        </div>
      )}

      <ModalDePropiedad
        alCerrar={() => establecerModalAbierto(false)}
        estaAbierto={elModalEstaAbierto}
        propiedadEnEdicion={propiedadEnEdicion}
      />
    </div>
  );
}

/* ==================================================================== */
/* Piezas                                                              */
/* ==================================================================== */

function TotalDelCatalogo({
  etiqueta,
  valor,
  icono,
  ayuda,
  destacada = false,
}: {
  etiqueta: string;
  valor: string;
  icono: React.ReactNode;
  ayuda: string;
  destacada?: boolean;
}) {
  return (
    <Tooltip content={ayuda}>
      <div
        className={[
          "bento-card flex items-center gap-3 p-4",
          destacada ? "border-primary bg-primary text-primary-foreground" : "",
        ].join(" ")}
      >
        <span
          className={[
            "flex size-9 shrink-0 items-center justify-center rounded-xl",
            destacada ? "bg-white/20" : "bg-default-100 text-default-500",
          ].join(" ")}
        >
          {icono}
        </span>

        <div className="min-w-0">
          <p className="text-lg font-bold leading-none tracking-tight">{valor}</p>
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
    </Tooltip>
  );
}

/**
 * Una propiedad del catálogo.
 *
 * La caja entera es pulsable solo si esta persona puede editarla; si no,
 * se queda como una ficha de consulta. Es la misma regla que en el
 * tablero de marcas: la interfaz no ofrece lo que el servidor va a
 * rechazar.
 */
function TarjetaDePropiedad({
  propiedad,
  alEditar,
}: {
  propiedad: Propiedad;
  alEditar: (propiedad: Propiedad) => void;
}) {
  const pronosticado = propiedad.ovpAcumuladoUsd ?? 0;
  const marcasQueLaOfrecen = propiedad.totalMarcas ?? 0;

  return (
    <article
      className={[
        "bento-card flex flex-col gap-3 p-4",
        propiedad.puedoEditarla ? "bento-card-interactive" : "",
        propiedad.activa ? "" : "opacity-70",
      ].join(" ")}
      role={propiedad.puedoEditarla ? "button" : undefined}
      tabIndex={propiedad.puedoEditarla ? 0 : undefined}
      onClick={propiedad.puedoEditarla ? () => alEditar(propiedad) : undefined}
      onKeyDown={(evento) => {
        if (propiedad.puedoEditarla && evento.key === "Enter") alEditar(propiedad);
      }}
    >
      {/* Logo, nombre y distintivos */}
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-default-100">
          {propiedad.logoUrl ? (
            <img
              alt={propiedad.nombre}
              className="size-full object-cover"
              src={propiedad.logoUrl}
            />
          ) : (
            <span className="text-xs font-bold text-default-400">
              {inicialesDe(propiedad.nombre)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold leading-snug text-foreground">
            {propiedad.nombre}
          </h3>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {!propiedad.activa && (
              <Chip color="warning" radius="lg" size="sm" variant="flat">
                Retirada
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
                : `${propiedad.prospectores?.length ?? 0} ${
                    (propiedad.prospectores?.length ?? 0) === 1
                      ? "prospector"
                      : "prospectores"
                  }`}
            </Chip>
          </div>
        </div>

        {propiedad.puedoEditarla && (
          <Pencil className="size-4 shrink-0 text-default-300" />
        )}
      </div>

      {/* Quiénes la trabajan, cuando no es de todos. */}
      {!propiedad.asignadaATodos && (propiedad.prospectores?.length ?? 0) > 0 && (
        <p className="truncate text-[11px] text-default-500">
          {propiedad.prospectores?.map((prospector) => prospector.nombre).join(", ")}
        </p>
      )}

      {/* Los tres montos */}
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-default-50 p-2.5">
        <MontoDeLaPropiedad
          etiqueta="MTP"
          valor={formatearDineroAbreviado(propiedad.montoTotalUsd)}
        />
        <MontoDeLaPropiedad
          etiqueta={`Meta ${formatearPorcentaje(propiedad.porcentajeForecast)}`}
          valor={formatearDineroAbreviado(propiedad.forecastDeVentaUsd)}
        />
        <MontoDeLaPropiedad
          destacado
          etiqueta="OVP"
          valor={formatearDineroAbreviado(pronosticado)}
        />
      </div>

      {/* La proporción pronosticada sobre el valor de la propiedad */}
      <BarraDeProporcion
        montoDeLaMeta={propiedad.forecastDeVentaUsd}
        montoPronosticado={pronosticado}
        montoTotal={propiedad.montoTotalUsd}
      />

      {/* Pie: en cuántas marcas está */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-default-100 pt-3">
        <span className="text-[11px] text-default-500">
          {marcasQueLaOfrecen === 0
            ? "Sin marcas todavía"
            : `En ${marcasQueLaOfrecen} ${
                marcasQueLaOfrecen === 1 ? "marca" : "marcas"
              }`}
        </span>

        {marcasQueLaOfrecen > 0 && (
          <Link
            className="text-[11px] font-semibold text-primary hover:underline"
            to={`/marcas?propiedad=${propiedad.id}`}
            onClick={(evento) => evento.stopPropagation()}
          >
            Ver las marcas
          </Link>
        )}
      </div>
    </article>
  );
}

function MontoDeLaPropiedad({
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
          "truncate text-xs font-bold",
          destacado ? "text-primary" : "text-foreground",
        ].join(" ")}
      >
        {valor}
      </p>
    </div>
  );
}
