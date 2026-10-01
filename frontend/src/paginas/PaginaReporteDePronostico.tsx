/**
 * paginas/PaginaReporteDePronostico.tsx
 * ---------------------------------------------------------------------
 * «Pronóstico por marca»: en qué marcas está el dinero que pronostica
 * el equipo (OVP). Desde el 2026-10-01.
 *
 * Nació de una pregunta de Antonio por WhatsApp: la pantalla de
 * Propiedades decía «$53,3 k pronosticados por el equipo» y para saber
 * de qué marcas salían había que entrar propiedad por propiedad. Aquí
 * está el mismo dinero leído de dos maneras:
 *
 *   · POR MARCA     → cada marca con su total, ordenadas de más a menos,
 *     y dentro lo que se le pronostica en cada propiedad.
 *   · POR PROPIEDAD → cada evento del catálogo como una tarjeta con los
 *     logos de sus marcas, que se va llenando a medida que se anotan
 *     pronósticos en las fichas. Los eventos sin ninguna todavía salen
 *     con los huecos vacíos: así se ve qué falta por vender.
 *
 * El total cuadra con el de Propiedades. Qué marcas entran lo decide el
 * servidor (ReporteDePronosticoController): la agencia entera para admin
 * y comercial, su cartera para un agente.
 *
 * No se anota en la auditoría, al revés que el de bitácora: son las
 * mismas cifras que ya enseñan el panel y Propiedades, y no saca del
 * sistema ninguna conversación con las marcas.
 * ---------------------------------------------------------------------
 */
import { Button, Chip, Tab, Tabs, Tooltip } from "@heroui/react";
import { Building2, Download, LayoutGrid, List, Package, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { mensajeDeError } from "@/api/clienteHttp";
import { obtenerReporteDePronostico } from "@/api/reportes";
import { LogoPequenoDeMarca } from "@/componentes/comunes/BuscadorDeMarcas";
import { BloqueDeCarga, BloqueDeError, EstadoVacio } from "@/componentes/comunes/EstadosDePantalla";
import { PestanasDeReportes } from "@/componentes/comunes/PestanasDeReportes";
import { RejillaBento, TarjetaBento } from "@/componentes/comunes/TarjetaBento";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import { errorSoloSiNoHayNadaQueEnsenar } from "@/utilidades/consultas";
import { descargarElPronosticoEnExcel } from "@/utilidades/excelDePronostico";
import {
  formatearDinero,
  formatearDineroAbreviado,
  formatearFechaYHora,
  formatearNumero,
  inicialesDe,
} from "@/utilidades/formato";
import type { PronosticoDeUnaMarca, PronosticoDeUnaPropiedad, ReporteDePronostico } from "@/tipos/modelos";

type Vista = "porMarca" | "porPropiedad";

/**
 * Cuelga de la clave del panel a propósito: el aviso en vivo de un
 * cambio en una marca o en el catálogo ya refresca todo lo que empieza
 * por «panel» (ProveedorCambiosEnVivo).
 */
const CLAVE_DEL_REPORTE = ["panel", "pronostico-por-marca"] as const;

export function PaginaReporteDePronostico() {
  const [vista, establecerVista] = useState<Vista>("porMarca");
  const [estaDescargando, establecerDescargando] = useState(false);

  const consulta = useQuery({
    queryKey: CLAVE_DEL_REPORTE,
    queryFn: obtenerReporteDePronostico,
  });

  const reporte = consulta.data;
  const error = errorSoloSiNoHayNadaQueEnsenar(consulta);

  async function descargarEnExcel() {
    if (!reporte) return;

    establecerDescargando(true);

    try {
      await descargarElPronosticoEnExcel(reporte);
      avisarDeExito("Reporte descargado.");
    } catch (fallo) {
      avisarDeError(fallo, "No se pudo descargar el reporte");
    } finally {
      establecerDescargando(false);
    }
  }

  return (
    <div className="space-y-5">
      <PestanasDeReportes />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Pronóstico por marca</h2>
          <p className="mt-0.5 text-sm text-default-500">
            En qué marcas está el dinero pronosticado (OVP), y en qué propiedad de cada una.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            aria-label="Cómo leer el pronóstico"
            radius="lg"
            selectedKey={vista}
            size="sm"
            onSelectionChange={(clave) => establecerVista(clave as Vista)}
          >
            <Tab
              key="porMarca"
              title={
                <span className="flex items-center gap-1.5">
                  <List className="size-3.5" /> Por marca
                </span>
              }
            />
            <Tab
              key="porPropiedad"
              title={
                <span className="flex items-center gap-1.5">
                  <LayoutGrid className="size-3.5" /> Por propiedad
                </span>
              }
            />
          </Tabs>

          <Button
            isDisabled={!reporte || reporte.porMarca.length === 0}
            isLoading={estaDescargando}
            radius="lg"
            size="sm"
            startContent={!estaDescargando && <Download className="size-4" />}
            variant="flat"
            onPress={() => void descargarEnExcel()}
          >
            Hoja de cálculo
          </Button>
        </div>
      </div>

      {consulta.isLoading ? (
        <BloqueDeCarga alto="min-h-60" mensaje="Sumando los pronósticos…" />
      ) : error ? (
        <BloqueDeError alReintentar={() => void consulta.refetch()} mensaje={mensajeDeError(error)} />
      ) : reporte ? (
        <ResultadoDelPronostico reporte={reporte} vista={vista} />
      ) : null}
    </div>
  );
}

function ResultadoDelPronostico({ reporte, vista }: { reporte: ReporteDePronostico; vista: Vista }) {
  const { resumen } = reporte;
  const esSoloMio = reporte.alcance === "personal";

  return (
    <div className="space-y-4">
      <RejillaBento>
        <Cifra
          destacada
          etiqueta={esSoloMio ? "Lo que pronosticas" : "Pronosticado por el equipo (OVP)"}
          icono={<TrendingUp className="size-4" />}
          valor={formatearDinero(resumen.totalOvpUsd)}
        />
        <Cifra
          etiqueta="Marcas con pronóstico"
          icono={<Building2 className="size-4" />}
          valor={formatearNumero(resumen.totalMarcas)}
        />
        <Cifra
          etiqueta="Propiedades con pronóstico"
          icono={<Package className="size-4" />}
          valor={formatearNumero(resumen.totalPropiedades)}
        />
      </RejillaBento>

      {vista === "porMarca" ? (
        reporte.porMarca.length === 0 ? (
          <div className="bento-card">
            <EstadoVacio
              descripcion="El pronóstico se anota en la ficha de cada marca, en el checklist de propiedades."
              icono={<TrendingUp className="size-5" />}
              titulo="Todavía no hay pronósticos"
            />
          </div>
        ) : (
          <TarjetaBento
            descripcion="De más a menos. Pulsa una marca para abrir su ficha."
            icono={<Building2 className="size-4" />}
            sinRelleno
            titulo={esSoloMio ? "Tus marcas" : "Marcas"}
          >
            <ol className="divide-y divide-default-100">
              {reporte.porMarca.map((marca, posicion) => (
                <FilaDeMarca
                  key={marca.marcaId}
                  marca={marca}
                  posicion={posicion + 1}
                  total={resumen.totalOvpUsd}
                />
              ))}
            </ol>
          </TarjetaBento>
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {reporte.porPropiedad.map((propiedad) => (
            <TarjetaDePropiedad key={propiedad.propiedadId} propiedad={propiedad} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-default-400">
        Generado por {reporte.generadoPor} el {formatearFechaYHora(reporte.generadoEn)}. Solo cuentan las
        propiedades con una cifra anotada en la ficha de la marca.
      </p>
    </div>
  );
}

function Cifra({
  etiqueta,
  valor,
  icono,
  destacada = false,
}: {
  etiqueta: string;
  valor: string;
  icono: React.ReactNode;
  destacada?: boolean;
}) {
  return (
    <TarjetaBento
      className={destacada ? "border-primary bg-primary text-primary-foreground" : ""}
      columnas={4}
    >
      <div className="flex items-center gap-3">
        <span
          className={[
            "flex size-9 shrink-0 items-center justify-center rounded-xl",
            destacada ? "bg-white/20" : "bg-default-100 text-default-500",
          ].join(" ")}
        >
          {icono}
        </span>
        <div className="min-w-0">
          <p className={["text-xs", destacada ? "text-primary-foreground/80" : "text-default-500"].join(" ")}>
            {etiqueta}
          </p>
          <p className="text-2xl font-bold tracking-tight tabular-nums">{valor}</p>
        </div>
      </div>
    </TarjetaBento>
  );
}

function FilaDeMarca({
  marca,
  posicion,
  total,
}: {
  marca: PronosticoDeUnaMarca;
  posicion: number;
  total: number;
}) {
  const proporcion = total > 0 ? marca.ovpUsd / total : 0;
  const datos = [marca.agenteNombre ? `Agente: ${marca.agenteNombre}` : "Sin agente", marca.sector, marca.zona]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
      <span className="w-5 shrink-0 text-right text-xs font-bold tabular-nums text-default-400">{posicion}</span>

      <Link
        className="flex min-w-0 flex-1 basis-56 items-center gap-3 hover:text-primary"
        to={`/marcas?abrir=${marca.marcaId}`}
      >
        <LogoPequenoDeMarca marca={{ nombre: marca.nombre, logoUrl: marca.logoUrl }} tamano="size-10" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{marca.nombre}</span>
          <span className="block truncate text-[11px] text-default-500">{datos}</span>
        </span>
      </Link>

      <div className="flex min-w-0 flex-[2] basis-64 flex-wrap gap-1.5">
        {marca.propiedades.map((linea) => (
          <Chip key={linea.propiedadId} radius="lg" size="sm" variant="flat">
            {linea.nombre}
            {!linea.activa && <span className="text-default-400"> (desactivada)</span>}
            <span className="ml-1.5 font-semibold text-primary">{formatearDineroAbreviado(linea.ovpUsd)}</span>
          </Chip>
        ))}
      </div>

      <div className="w-32 shrink-0 text-right">
        <p className="text-base font-bold tabular-nums text-foreground">{formatearDinero(marca.ovpUsd)}</p>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-default-100">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(proporcion * 100, 2)}%` }} />
        </div>
        <p className="mt-0.5 text-[10px] text-default-400">{Math.round(proporcion * 100)} % del total</p>
      </div>
    </li>
  );
}

/** Cuántos huecos vacíos se dibujan en un evento sin marcas todavía. */
const HUECOS_VACIOS = 3;

function TarjetaDePropiedad({ propiedad }: { propiedad: PronosticoDeUnaPropiedad }) {
  const sinMarcas = propiedad.marcas.length === 0;

  return (
    <article className={["bento-card flex flex-col gap-4 p-5", propiedad.activa ? "" : "opacity-70"].join(" ")}>
      <header className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <h3 className="text-base font-bold leading-snug text-foreground">{propiedad.nombre}</h3>
          {!propiedad.activa && <span className="text-[11px] text-default-400">Desactivada</span>}
        </span>
        {!sinMarcas && (
          <span className="shrink-0 text-right">
            <span className="block text-base font-bold tabular-nums text-primary">
              {formatearDineroAbreviado(propiedad.ovpUsd)}
            </span>
            <span className="block text-[10px] text-default-400">
              {propiedad.marcas.length === 1 ? "1 marca" : `${propiedad.marcas.length} marcas`}
            </span>
          </span>
        )}
      </header>

      {/* Los logos de sus marcas: los círculos que dibujó Antonio. */}
      <ul className="flex flex-wrap gap-3">
        {sinMarcas
          ? Array.from({ length: HUECOS_VACIOS }, (_, hueco) => (
              <li
                key={hueco}
                aria-hidden
                className="size-14 rounded-full border-2 border-dashed border-default-200"
              />
            ))
          : propiedad.marcas.map((marca) => (
              <li key={marca.marcaId}>
                <Tooltip content={`${marca.nombre} · ${formatearDinero(marca.ovpUsd)}`}>
                  <Link className="flex w-16 flex-col items-center gap-1" to={`/marcas?abrir=${marca.marcaId}`}>
                    <span className="flex size-14 items-center justify-center overflow-hidden rounded-full border border-default-200 bg-white">
                      {marca.logoUrl ? (
                        <img alt={marca.nombre} className="size-full object-contain p-1" loading="lazy" src={marca.logoUrl} />
                      ) : (
                        <span className="text-xs font-bold text-default-500">{inicialesDe(marca.nombre)}</span>
                      )}
                    </span>
                    <span className="w-full truncate text-center text-[10px] text-default-500">{marca.nombre}</span>
                    <span className="text-[10px] font-semibold tabular-nums text-foreground">
                      {formatearDineroAbreviado(marca.ovpUsd)}
                    </span>
                  </Link>
                </Tooltip>
              </li>
            ))}
      </ul>

      {sinMarcas && <p className="text-[11px] text-default-400">Todavía ninguna marca con pronóstico.</p>}
    </article>
  );
}
