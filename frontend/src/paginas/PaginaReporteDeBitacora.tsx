/**
 * paginas/PaginaReporteDeBitacora.tsx
 * ---------------------------------------------------------------------
 * El reporte de bitácora: todo lo que se escribió entre dos fechas,
 * agrupado por marca. Se ve en pantalla y se saca en documento (para
 * guardarlo en PDF) o en hoja de cálculo.
 *
 * Es la pregunta de los lunes —«¿qué se hizo la semana pasada con cada
 * marca?»—, que hasta ahora obligaba a abrir las fichas una por una.
 *
 * QUIÉN PUEDE QUÉ lo decide el servidor, y aquí solo se enseña:
 *
 *   · Sin marcas elegidas es la bitácora de toda la agencia en ese
 *     periodo. Lo saca el administrador (regla 19): con un rango largo
 *     sería el histórico completo.
 *   · Eligiendo marcas, quien pueda verlas. El buscador ya solo ofrece
 *     esas, y el servidor lo vuelve a comprobar al pedir el reporte.
 *
 * El reporte NO se pide solo al cambiar un filtro: se pide al pulsar.
 * Cada petición queda anotada en la auditoría como una salida de datos,
 * y pedirlo con cada fecha a medio escribir llenaría la auditoría de
 * reportes que nadie leyó.
 * ---------------------------------------------------------------------
 */
import { Button, Chip, Input } from "@heroui/react";
import {
  CalendarRange,
  CornerDownRight,
  Download,
  FileText,
  MessagesSquare,
  NotebookPen,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { mensajeDeError } from "@/api/clienteHttp";
import { obtenerReporteDeBitacora } from "@/api/marcas";
import {
  BuscadorDeMarcas,
  LogoPequenoDeMarca,
} from "@/componentes/comunes/BuscadorDeMarcas";
import {
  BloqueDeCarga,
  BloqueDeError,
  EstadoVacio,
} from "@/componentes/comunes/EstadosDePantalla";
import { RejillaBento, TarjetaBento } from "@/componentes/comunes/TarjetaBento";
import { useUsuarioAutenticado } from "@/providers/ProveedorSesion";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import { errorSoloSiNoHayNadaQueEnsenar } from "@/utilidades/consultas";
import {
  descargarElReporteEnExcel,
  imprimirElReporteDeBitacora,
} from "@/utilidades/exportarBitacora";
import {
  formatearFecha,
  formatearFechaYHora,
  formatearNumero,
  formatearPeriodo,
  inicialesDe,
} from "@/utilidades/formato";
import type {
  EntradaDelReporte,
  MarcaDelReporte,
  ReporteDeBitacora,
  SugerenciaDeMarca,
} from "@/tipos/modelos";

/** Lo que se le pide al servidor al pulsar «Ver el reporte». */
interface PeticionDelReporte {
  desde: string;
  hasta: string;
  idsDeMarcas: string[];
}

export function PaginaReporteDeBitacora() {
  const usuario = useUsuarioAutenticado();
  const puedeVerTodas = usuario.permisos.sacaLaBitacoraCompleta;

  const [desde, establecerDesde] = useState(() => primerDiaDelMes(new Date()));
  const [hasta, establecerHasta] = useState(() => diaLocal(new Date()));
  const [marcasElegidas, establecerMarcasElegidas] = useState<SugerenciaDeMarca[]>([]);

  const [peticion, establecerPeticion] = useState<PeticionDelReporte | null>(null);

  const consulta = useQuery({
    queryKey: ["bitacora", "reporte", peticion],
    queryFn: () => obtenerReporteDeBitacora(peticion as PeticionDelReporte),
    enabled: peticion !== null,
    // Un reporte es una foto del momento en que se pidió, y cada petición
    // se anota en la auditoría: no se rehace solo al volver a la pestaña.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
    meta: { sinCopiaLocal: true },
  });

  const reporte = consulta.data;
  const error = errorSoloSiNoHayNadaQueEnsenar(consulta);

  const fechasValidas = desde !== "" && hasta !== "" && desde <= hasta;
  const faltanMarcas = !puedeVerTodas && marcasElegidas.length === 0;

  function pedirElReporte() {
    if (!fechasValidas || faltanMarcas) return;

    const nueva: PeticionDelReporte = {
      desde,
      hasta,
      idsDeMarcas: marcasElegidas.map((marca) => marca.id),
    };

    // Pedir lo mismo otra vez vuelve a preguntar al servidor: puede que
    // se haya escrito algo desde la última vez.
    if (JSON.stringify(nueva) === JSON.stringify(peticion)) {
      void consulta.refetch();
    } else {
      establecerPeticion(nueva);
    }
  }

  function aplicarAtajo(rango: { desde: string; hasta: string }) {
    establecerDesde(rango.desde);
    establecerHasta(rango.hasta);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Reporte de bitácora
        </h2>
        <p className="mt-0.5 text-sm text-default-500">
          Lo que se escribió en la bitácora entre dos fechas, marca por marca.
        </p>
      </div>

      <TarjetaBento
        descripcion={
          puedeVerTodas
            ? "Sin marcas elegidas, el reporte recoge todas las marcas de la agencia."
            : "Elige las marcas del reporte. Solo aparecen las que puedes ver."
        }
        icono={<CalendarRange className="size-4" />}
        titulo="Qué quieres ver"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <Input
              className="w-44"
              label="Desde"
              labelPlacement="outside"
              max={hasta || undefined}
              radius="lg"
              size="sm"
              type="date"
              value={desde}
              variant="bordered"
              onValueChange={establecerDesde}
            />
            <Input
              className="w-44"
              label="Hasta"
              labelPlacement="outside"
              min={desde || undefined}
              radius="lg"
              size="sm"
              type="date"
              value={hasta}
              variant="bordered"
              onValueChange={establecerHasta}
            />

            <div className="flex flex-wrap gap-1.5 pb-0.5">
              {ATAJOS_DE_FECHAS.map((atajo) => (
                <Chip
                  key={atajo.etiqueta}
                  as="button"
                  className="cursor-pointer"
                  radius="lg"
                  size="sm"
                  variant="flat"
                  onClick={() => aplicarAtajo(atajo.rango(new Date()))}
                >
                  {atajo.etiqueta}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-foreground">
              Marcas {puedeVerTodas && <span className="font-normal text-default-400">(opcional)</span>}
            </span>

            <div className="max-w-md">
              <BuscadorDeMarcas
                idsYaElegidos={marcasElegidas.map((marca) => marca.id)}
                marcadorDePosicion={puedeVerTodas ? "Todas las marcas — o busca una…" : "Busca una marca…"}
                alElegir={(marca) =>
                  establecerMarcasElegidas((actuales) => [...actuales, marca])
                }
              />
            </div>

            {marcasElegidas.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {marcasElegidas.map((marca) => (
                  <Chip
                    key={marca.id}
                    avatar={<LogoPequenoDeMarca marca={marca} tamano="size-5" />}
                    radius="lg"
                    size="sm"
                    variant="flat"
                    onClose={() =>
                      establecerMarcasElegidas((actuales) =>
                        actuales.filter((elegida) => elegida.id !== marca.id),
                      )
                    }
                  >
                    {marca.nombre}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              color="primary"
              isDisabled={!fechasValidas || faltanMarcas}
              isLoading={consulta.isFetching}
              radius="lg"
              startContent={!consulta.isFetching && <NotebookPen className="size-4" />}
              onPress={pedirElReporte}
            >
              Ver el reporte
            </Button>

            {!fechasValidas && (
              <span className="text-xs text-warning">
                La fecha final no puede ser anterior a la inicial.
              </span>
            )}
            {fechasValidas && faltanMarcas && (
              <span className="text-xs text-default-500">Elige al menos una marca.</span>
            )}
            {fechasValidas && !faltanMarcas && (
              <span className="text-xs text-default-500">
                {formatearPeriodo(desde, hasta).replace(/^./, (letra) => letra.toUpperCase())}
                {" · "}
                {marcasElegidas.length === 0
                  ? "todas las marcas"
                  : marcasElegidas.length === 1
                    ? "1 marca"
                    : `${marcasElegidas.length} marcas`}
              </span>
            )}
          </div>
        </div>
      </TarjetaBento>

      {peticion === null ? null : consulta.isLoading ? (
        <BloqueDeCarga alto="min-h-60" mensaje="Armando el reporte…" />
      ) : error ? (
        <BloqueDeError mensaje={mensajeDeError(error)} alReintentar={() => void consulta.refetch()} />
      ) : reporte ? (
        <ResultadoDelReporte reporte={reporte} />
      ) : null}
    </div>
  );
}

/* ==================================================================== */
/* El reporte en pantalla                                               */
/* ==================================================================== */

function ResultadoDelReporte({ reporte }: { reporte: ReporteDeBitacora }) {
  const [estaDescargando, establecerDescargando] = useState(false);
  const periodo = formatearPeriodo(reporte.desde, reporte.hasta);

  async function descargarEnExcel() {
    establecerDescargando(true);

    try {
      await descargarElReporteEnExcel(reporte);
      avisarDeExito("Reporte descargado.");
    } catch (error) {
      avisarDeError(error, "No se pudo descargar el reporte");
    } finally {
      establecerDescargando(false);
    }
  }

  if (reporte.marcas.length === 0) {
    return (
      <div className="bento-card">
        <EstadoVacio
          descripcion={`Nadie escribió en la bitácora ${periodo}${
            reporte.alcance === "seleccion" ? " en las marcas elegidas" : ""
          }.`}
          icono={<MessagesSquare className="size-5" />}
          titulo="Sin entradas en este periodo"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-default-500">
          Bitácora <strong className="text-foreground">{periodo}</strong> · generado por{" "}
          {reporte.generadoPor} el {formatearFechaYHora(reporte.generadoEn)}
        </p>

        <div className="flex gap-2">
          <Button
            radius="lg"
            size="sm"
            startContent={<FileText className="size-4" />}
            variant="flat"
            onPress={() => imprimirElReporteDeBitacora(reporte)}
          >
            Documento (PDF)
          </Button>
          <Button
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

      <RejillaBento>
        <CifraDelReporte columnas={4} etiqueta="Entradas" valor={reporte.resumen.totalEntradas} />
        <CifraDelReporte columnas={4} etiqueta="Marcas con movimiento" valor={reporte.resumen.totalMarcas} />
        <CifraDelReporte columnas={4} etiqueta="Personas que escribieron" valor={reporte.resumen.totalAutores} />

        <TarjetaBento
          columnas={8}
          descripcion="Primero las que más movimiento tuvieron. Pulsa una para ir a ella."
          icono={<NotebookPen className="size-4" />}
          titulo="Marcas del periodo"
        >
          <ul className="grid gap-1 sm:grid-cols-2">
            {reporte.marcas.map((marca) => (
              <li key={marca.marcaId}>
                <a
                  className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-default-100"
                  href={`#marca-${marca.marcaId}`}
                >
                  <LogoPequenoDeMarca marca={{ nombre: marca.marcaNombre, logoUrl: marca.logoUrl }} />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {marca.marcaNombre}
                  </span>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-primary">
                    {marca.totalEntradas}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </TarjetaBento>

        <TarjetaBento columnas={4} icono={<Users className="size-4" />} titulo="Quién escribió">
          <ul className="space-y-1.5">
            {reporte.resumen.porAutor.map((autor) => (
              <li key={autor.nombre} className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-[10px] font-bold text-primary-700">
                  {inicialesDe(autor.nombre)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{autor.nombre}</span>
                <span className="shrink-0 text-xs font-bold tabular-nums text-default-600">
                  {formatearNumero(autor.total)}
                </span>
              </li>
            ))}
          </ul>
        </TarjetaBento>
      </RejillaBento>

      {reporte.marcas.map((marca) => (
        <MarcaEnElReporte key={marca.marcaId} marca={marca} />
      ))}
    </div>
  );
}

function CifraDelReporte({
  etiqueta,
  valor,
  columnas,
}: {
  etiqueta: string;
  valor: number;
  columnas: 4;
}) {
  return (
    <TarjetaBento columnas={columnas}>
      <p className="text-xs text-default-500">{etiqueta}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-foreground tabular-nums">
        {formatearNumero(valor)}
      </p>
    </TarjetaBento>
  );
}

function MarcaEnElReporte({ marca }: { marca: MarcaDelReporte }) {
  const datos = [marca.sector, marca.zona, marca.agenteNombre ? `Agente: ${marca.agenteNombre}` : "Sin agente"]
    .filter(Boolean)
    .join(" · ");

  return (
    <TarjetaBento id={`marca-${marca.marcaId}`} sinRelleno>
      <div className="flex items-center gap-3 border-b border-default-100 px-5 py-4">
        <LogoPequenoDeMarca marca={{ nombre: marca.marcaNombre, logoUrl: marca.logoUrl }} tamano="size-11" />

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-foreground">{marca.marcaNombre}</h3>
          <p className="truncate text-xs text-default-500">{datos}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-xl font-bold leading-none text-primary tabular-nums">{marca.totalEntradas}</p>
          <p className="text-[11px] text-default-500">
            {marca.totalEntradas === 1 ? "entrada" : "entradas"}
          </p>
        </div>
      </div>

      <ol className="divide-y divide-default-100 px-5">
        {marca.entradas.map((entrada) => (
          <EntradaEnElReporte key={entrada.id} entrada={entrada} />
        ))}
      </ol>
    </TarjetaBento>
  );
}

function EntradaEnElReporte({ entrada }: { entrada: EntradaDelReporte }) {
  // La respuesta que cuelga de una entrada del periodo va sangrada debajo
  // de ella; la que responde a algo de antes va suelta, con su contexto.
  const vaSangrada = entrada.esRespuesta && entrada.respondeA === null;

  return (
    <li className={["flex gap-3 py-3", vaSangrada ? "ml-6 border-l-2 border-default-200 pl-3" : ""].join(" ")}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-[10px] font-bold text-primary-foreground">
        {inicialesDe(entrada.autorNombre)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="font-semibold text-foreground">{entrada.autorNombre}</span>
          <time className="text-default-400">{formatearFechaYHora(entrada.fecha)}</time>
          {entrada.editado && <span className="italic text-default-400">editada</span>}
        </p>

        {entrada.respondeA !== null && (
          <p className="mt-1 flex items-start gap-1.5 rounded-lg bg-default-100 px-2 py-1 text-[11px] text-default-600">
            <CornerDownRight className="mt-0.5 size-3 shrink-0" />
            <span>
              En respuesta a {entrada.respondeA.autorNombre} ({formatearFecha(entrada.respondeA.fecha)})
              {entrada.respondeA.extracto !== null
                ? `: «${entrada.respondeA.extracto}»`
                : ", una entrada que después se eliminó"}
            </span>
          </p>
        )}

        {entrada.eliminado ? (
          <p className="mt-1 text-xs italic text-default-400">
            Entrada eliminada por {entrada.eliminadoPorNombre ?? "alguien"}.
          </p>
        ) : (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-default-700">
            {entrada.cuerpo}
          </p>
        )}

        {entrada.mencionados.length > 0 && (
          <p className="mt-1 text-[11px] text-default-500">
            Etiquetados: {entrada.mencionados.join(", ")}
          </p>
        )}
      </div>
    </li>
  );
}

/* ==================================================================== */
/* Fechas                                                               */
/* ==================================================================== */

/**
 * Un día del calendario LOCAL como AAAA-MM-DD. No se usa toISOString():
 * da el día en UTC, y a las nueve de la noche en Caracas ya sería mañana.
 */
function diaLocal(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");

  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

function primerDiaDelMes(fecha: Date): string {
  return diaLocal(new Date(fecha.getFullYear(), fecha.getMonth(), 1));
}

const ATAJOS_DE_FECHAS: Array<{
  etiqueta: string;
  rango: (hoy: Date) => { desde: string; hasta: string };
}> = [
  { etiqueta: "Hoy", rango: (hoy) => ({ desde: diaLocal(hoy), hasta: diaLocal(hoy) }) },
  {
    etiqueta: "Últimos 7 días",
    rango: (hoy) => ({
      desde: diaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 6)),
      hasta: diaLocal(hoy),
    }),
  },
  { etiqueta: "Este mes", rango: (hoy) => ({ desde: primerDiaDelMes(hoy), hasta: diaLocal(hoy) }) },
  {
    etiqueta: "Mes pasado",
    rango: (hoy) => ({
      desde: diaLocal(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
      // El día 0 de un mes es el último del anterior.
      hasta: diaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 0)),
    }),
  },
];
