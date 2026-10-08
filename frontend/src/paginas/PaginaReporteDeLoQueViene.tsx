/**
 * paginas/PaginaReporteDeLoQueViene.tsx
 * ---------------------------------------------------------------------
 * «Lo que viene»: lo planificado, día por día. Desde el 2026-10-07.
 *
 * LinZ lo pidió así: el administrador tiene que poder saber qué hay
 * planificado la semana que viene, el mes que viene o cuando sea, y
 * sacar un reporte completo. Hasta ahora eso estaba en tres sitios que
 * nunca se veían juntos —el calendario de campañas, el «Para hoy» de cada
 * quien y los recordatorios de cada ficha— y ninguno enseñaba el del
 * equipo entero.
 *
 * Aquí se ve todo de una vez:
 *
 *   · Las cifras del periodo: cuánto hay por hacer (por tipo: reuniones,
 *     llamadas…), cuántas acciones de campaña, cuántas marcas y cuánto
 *     se quedó atrasado de antes.
 *   · Quién tiene qué, persona por persona (solo a quien ve el equipo).
 *   · Cuántas marcas no tienen NADA por delante, con el enlace al tablero.
 *   · El día por día: las acciones de campaña, los recordatorios (los que
 *     deja «Contacté» como siguiente paso, también) con su hora.
 *
 * Los días de cada periodo los cuenta el servidor con el calendario de
 * Caracas (aquí solo se dice «esta semana» o «el próximo mes»), y qué
 * entra lo decide también él: la agencia entera para admin y comercial,
 * la cartera para un agente. El PDF y la hoja de cálculo salen de lo
 * mismo que se ve (utilidades/exportarLoQueViene.ts).
 *
 * Al revés que el reporte de bitácora, este se pide solo al cambiar un
 * filtro: no queda anotado en la auditoría (no saca conversaciones ni
 * datos de contacto), así que no hay por qué esperar a un botón. Y cuelga
 * de la clave del panel: un recordatorio nuevo o una acción anotada en
 * otra pestaña lo refrescan solos (regla 22).
 * ---------------------------------------------------------------------
 */
import { Button, Chip, Input, Select, SelectItem } from "@heroui/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  AlarmClock,
  CalendarClock,
  CalendarRange,
  Check,
  Download,
  FileText,
  Flag,
  Megaphone,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { mensajeDeError } from "@/api/clienteHttp";
import { obtenerLoQueViene, type PeticionDeLoQueViene } from "@/api/reportes";
import { LogoPequenoDeMarca } from "@/componentes/comunes/BuscadorDeMarcas";
import { BloqueDeCarga, BloqueDeError, EstadoVacio } from "@/componentes/comunes/EstadosDePantalla";
import { PestanasDeReportes } from "@/componentes/comunes/PestanasDeReportes";
import { RejillaBento, TarjetaBento } from "@/componentes/comunes/TarjetaBento";
import { IconoDelTipo } from "@/componentes/crm/TiposDeContacto";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import { errorSoloSiNoHayNadaQueEnsenar } from "@/utilidades/consultas";
import {
  deQuienEsElReporte,
  descargarLoQueVieneEnExcel,
  estadoDe,
  imprimirLoQueViene,
  porTipoEnUnaFrase,
  queEs,
  quienLaHace,
} from "@/utilidades/exportarLoQueViene";
import { formatearFechaYHora, formatearNumero } from "@/utilidades/formato";
import type {
  CosaDeLoQueViene,
  PeriodoDeLoQueViene,
  ReporteDeLoQueViene,
  TipoDeContacto,
} from "@/tipos/modelos";

const PERIODOS: Array<{ clave: PeriodoDeLoQueViene; etiqueta: string }> = [
  { clave: "esta_semana", etiqueta: "Esta semana" },
  { clave: "proxima_semana", etiqueta: "Próxima semana" },
  { clave: "este_mes", etiqueta: "Este mes" },
  { clave: "proximo_mes", etiqueta: "Próximo mes" },
  { clave: "otro", etiqueta: "Otras fechas" },
];

/** El ancla de la caja de lo atrasado, para llegar desde su cifra. */
const ANCLA_DE_LO_ATRASADO = "atrasado";

export function PaginaReporteDeLoQueViene() {
  const [periodo, establecerPeriodo] = useState<PeriodoDeLoQueViene>("esta_semana");
  const [desde, establecerDesde] = useState("");
  const [hasta, establecerHasta] = useState("");
  const [idDeLaPersona, establecerIdDeLaPersona] = useState("");
  const [estaDescargando, establecerDescargando] = useState(false);

  const fechasValidas = periodo !== "otro" || (desde !== "" && hasta !== "" && desde <= hasta);

  const peticion: PeticionDeLoQueViene = {
    periodo,
    desde,
    hasta,
    persona: idDeLaPersona || null,
  };

  const consulta = useQuery({
    // Cuelga de «panel»: los cambios en vivo de una marca lo refrescan.
    queryKey: ["panel", "lo-que-viene", peticion],
    queryFn: () => obtenerLoQueViene(peticion),
    enabled: fechasValidas,
    // Al cambiar de periodo se queda lo anterior en pantalla hasta que
    // llega lo nuevo, en vez de parpadear con el «cargando».
    placeholderData: keepPreviousData,
    meta: { sinCopiaLocal: true },
  });

  const reporte = consulta.data;
  const error = errorSoloSiNoHayNadaQueEnsenar(consulta);

  function elegirPeriodo(clave: PeriodoDeLoQueViene) {
    // «Otras fechas» arranca con los días que se estaban viendo, que ya
    // son los de Caracas: el reloj de este ordenador no decide nada.
    if (clave === "otro" && reporte && desde === "") {
      establecerDesde(reporte.periodo.desde);
      establecerHasta(reporte.periodo.hasta);
    }

    establecerPeriodo(clave);
  }

  async function descargarEnExcel() {
    if (!reporte) return;

    establecerDescargando(true);

    try {
      await descargarLoQueVieneEnExcel(reporte);
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
          <h2 className="text-xl font-bold tracking-tight text-foreground">Lo que viene</h2>
          <p className="mt-0.5 text-sm text-default-500">
            Lo planificado día por día: los recordatorios (también los que deja «Contacté») y las
            acciones de campaña.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            isDisabled={!reporte}
            radius="lg"
            size="sm"
            startContent={<FileText className="size-4" />}
            variant="flat"
            onPress={() => reporte && void imprimirLoQueViene(reporte)}
          >
            Documento (PDF)
          </Button>
          <Button
            isDisabled={!reporte}
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

      <TarjetaBento icono={<CalendarRange className="size-4" />} titulo="Qué quieres ver">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-foreground">Periodo</span>
            <div aria-label="Periodo" className="flex flex-wrap gap-1.5" role="group">
              {PERIODOS.map((opcion) => (
                <Chip
                  key={opcion.clave}
                  aria-pressed={periodo === opcion.clave}
                  as="button"
                  className="cursor-pointer"
                  color={periodo === opcion.clave ? "primary" : "default"}
                  radius="lg"
                  size="sm"
                  variant={periodo === opcion.clave ? "solid" : "flat"}
                  onClick={() => elegirPeriodo(opcion.clave)}
                >
                  {opcion.etiqueta}
                </Chip>
              ))}
            </div>
          </div>

          {periodo === "otro" && (
            <div className="flex flex-wrap items-end gap-3">
              <Input
                className="w-40"
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
                className="w-40"
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
            </div>
          )}

          {/* La lista de personas la manda el servidor solo a quien puede
              pedir la agenda de otra: aquí no se mira el rol. */}
          {reporte && reporte.personas.length > 0 && (
            <Select
              aria-label="De quién"
              className="w-64"
              label="De quién"
              labelPlacement="outside"
              radius="lg"
              selectedKeys={[idDeLaPersona || "todos"]}
              size="sm"
              variant="bordered"
              onSelectionChange={(seleccion) => {
                const elegida = String(Array.from(seleccion)[0] ?? "todos");

                establecerIdDeLaPersona(elegida === "todos" ? "" : elegida);
              }}
            >
              {[
                <SelectItem key="todos" textValue="Todo el equipo">
                  Todo el equipo
                </SelectItem>,
                ...reporte.personas.map((persona) => (
                  <SelectItem key={persona.id} textValue={persona.nombre}>
                    {persona.nombre} <span className="text-default-400">· {persona.rol}</span>
                  </SelectItem>
                )),
              ]}
            </Select>
          )}
        </div>

        {!fechasValidas && (
          <p className="mt-3 text-xs text-warning">Elige las dos fechas; la final no puede ser anterior a la inicial.</p>
        )}
      </TarjetaBento>

      {consulta.isLoading ? (
        <BloqueDeCarga alto="min-h-60" mensaje="Juntando lo planificado…" />
      ) : error ? (
        <BloqueDeError alReintentar={() => void consulta.refetch()} mensaje={mensajeDeError(error)} />
      ) : reporte ? (
        <ResultadoDeLoQueViene reporte={reporte} />
      ) : null}
    </div>
  );
}

/* ==================================================================== */
/* El reporte en pantalla                                               */
/* ==================================================================== */

function ResultadoDeLoQueViene({ reporte }: { reporte: ReporteDeLoQueViene }) {
  const { resumen } = reporte;
  const conReparto = reporte.alcance === "empresa" && reporte.persona === null && resumen.porPersona.length > 0;

  const porTipo = porTipoEnUnaFrase(resumen.porTipo);

  // El enlace del tablero con la misma persona del filtro (por id, como
  // «Carga por agente»).
  const enlaceSinPaso = reporte.persona
    ? `/marcas?vendedor=${reporte.persona.id}&siguientePaso=sin`
    : "/marcas?siguientePaso=sin";

  return (
    <div className="space-y-4">
      <p className="text-sm text-default-500">
        <strong className="text-foreground">{mayuscula(reporte.periodo.etiqueta)}</strong> ·{" "}
        {deQuienEsElReporte(reporte)} ·{" "}
        {resumen.marcas === 1 ? "1 marca" : `${formatearNumero(resumen.marcas)} marcas`} con algo planificado
        {resumen.hechos > 0 && ` · ${formatearNumero(resumen.hechos)} ya ${resumen.hechos === 1 ? "hecho" : "hechos"}`}
        <span className="block text-[11px] text-default-400">
          Generado por {reporte.generadoPor} el {formatearFechaYHora(reporte.generadoEn)}
        </span>
      </p>

      <RejillaBento>
        <Cifra
          destacada
          detalle={
            porTipo !== ""
              ? porTipo
              : resumen.hechos > 0
                ? "Todo lo del periodo ya está hecho"
                : "Ningún recordatorio en el periodo"
          }
          etiqueta="Por hacer"
          icono={<AlarmClock className="size-4" />}
          valor={resumen.porHacer}
        />
        <Cifra
          detalle="Del calendario de campañas"
          etiqueta="Acciones de campaña"
          icono={<Megaphone className="size-4" />}
          valor={resumen.acciones}
        />
        <Cifra
          alerta={resumen.atrasados > 0}
          detalle={resumen.atrasados > 0 ? "Sigue pendiente de antes" : "Nada pendiente de antes"}
          enlace={resumen.atrasados > 0 ? `#${ANCLA_DE_LO_ATRASADO}` : undefined}
          etiqueta="Atrasado"
          icono={<CalendarClock className="size-4" />}
          valor={resumen.atrasados}
        />
        {/* Lo contrario de lo planificado: las marcas que nadie va a
            volver a tocar. La misma cifra del resumen, y lleva al tablero. */}
        <Cifra
          alerta={resumen.sinSiguientePaso > 0}
          detalle={resumen.sinSiguientePaso > 0 ? "Marcas sin nada por delante · verlas" : "Todas tienen algo por delante"}
          enlace={resumen.sinSiguientePaso > 0 ? enlaceSinPaso : undefined}
          etiqueta="Sin siguiente paso"
          icono={<Flag className="size-4" />}
          valor={resumen.sinSiguientePaso}
        />

        {conReparto && (
          <TarjetaBento
            descripcion="Lo que tiene por hacer cada persona en el periodo, y las acciones de campaña de las marcas que lleva."
            icono={<Users className="size-4" />}
            sinRelleno
            titulo="Quién tiene qué"
          >
            <RepartoPorPersona reporte={reporte} />
          </TarjetaBento>
        )}
      </RejillaBento>

      {reporte.atrasados.length > 0 && (
        <TarjetaBento
          descripcion="Recordatorios de días anteriores que nadie ha dado por hechos."
          icono={<CalendarClock className="size-4 text-danger" />}
          id={ANCLA_DE_LO_ATRASADO}
          sinRelleno
          titulo={`Atrasado (${formatearNumero(reporte.atrasados.length)})`}
        >
          <ol className="divide-y divide-default-100">
            {reporte.atrasados.map((cosa) => (
              <FilaDeCosa key={cosa.id} conFecha cosa={cosa} />
            ))}
          </ol>
        </TarjetaBento>
      )}

      {reporte.dias.length === 0 ? (
        <div className="bento-card">
          <EstadoVacio
            descripcion="Lo planificado sale de los recordatorios de las fichas, del siguiente paso de «Contacté» y de las acciones de campaña."
            icono={<CalendarRange className="size-5" />}
            titulo={`Nada planificado ${reporte.periodo.etiqueta}`}
          />
        </div>
      ) : (
        reporte.dias.map((dia) => (
          <TarjetaBento
            key={dia.fecha}
            accionDeCabecera={
              <span className="text-xs text-default-400">
                {dia.cosas.length === 1 ? "1 cosa" : `${formatearNumero(dia.cosas.length)} cosas`}
              </span>
            }
            icono={
              dia.esHoy ? (
                <Chip color="primary" radius="full" size="sm" variant="solid">
                  Hoy
                </Chip>
              ) : (
                <CalendarRange className="size-4" />
              )
            }
            sinRelleno
            titulo={mayuscula(dia.etiqueta)}
          >
            <ol className="divide-y divide-default-100">
              {dia.cosas.map((cosa) => (
                <FilaDeCosa key={`${cosa.clase}-${cosa.id}`} cosa={cosa} />
              ))}
            </ol>
          </TarjetaBento>
        ))
      )}
    </div>
  );
}

function Cifra({
  etiqueta,
  valor,
  detalle,
  icono,
  destacada = false,
  alerta = false,
  enlace,
}: {
  etiqueta: string;
  valor: number;
  detalle: string;
  icono: React.ReactNode;
  destacada?: boolean;
  alerta?: boolean;
  /** Un ancla a la caja de su detalle («#…») o una pantalla («/marcas…»). */
  enlace?: string;
}) {
  const contenido = (
    <div className="flex items-start gap-3">
      <span
        className={[
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          destacada ? "bg-white/20" : alerta ? "bg-danger-50 text-danger" : "bg-default-100 text-default-500",
        ].join(" ")}
      >
        {icono}
      </span>
      <div className="min-w-0">
        <p className={["text-xs", destacada ? "text-primary-foreground/80" : "text-default-500"].join(" ")}>{etiqueta}</p>
        <p className={["text-2xl font-bold tracking-tight tabular-nums", alerta ? "text-danger" : ""].join(" ")}>
          {formatearNumero(valor)}
        </p>
        <p className={["mt-0.5 text-[11px]", destacada ? "text-primary-foreground/80" : "text-default-400"].join(" ")}>
          {detalle}
        </p>
      </div>
    </div>
  );

  return (
    <TarjetaBento className={destacada ? "border-primary bg-primary text-primary-foreground" : ""} columnas={3}>
      {enlace?.startsWith("/") ? (
        <Link className="block" to={enlace}>
          {contenido}
        </Link>
      ) : enlace ? (
        <a className="block" href={enlace}>
          {contenido}
        </a>
      ) : (
        contenido
      )}
    </TarjetaBento>
  );
}

/** Las columnas del reparto, en el orden en que se leen. */
const COLUMNAS_POR_TIPO: Array<{ tipo: TipoDeContacto; titulo: string }> = [
  { tipo: "reunion", titulo: "Reuniones" },
  { tipo: "llamada", titulo: "Llamadas" },
  { tipo: "whatsapp", titulo: "WhatsApp" },
  { tipo: "correo", titulo: "Correos" },
];

function RepartoPorPersona({ reporte }: { reporte: ReporteDeLoQueViene }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[38rem] text-sm">
        <thead>
          <tr className="whitespace-nowrap text-[11px] uppercase tracking-wide text-default-400">
            <th className="px-5 py-2 text-left font-semibold">Persona</th>
            <th className="px-2 py-2 text-right font-semibold">Por hacer</th>
            {COLUMNAS_POR_TIPO.map((columna) => (
              <th key={columna.tipo} className="px-2 py-2 text-right font-semibold">
                {columna.titulo}
              </th>
            ))}
            <th className="px-2 py-2 text-right font-semibold">Campaña</th>
            <th className="px-5 py-2 text-right font-semibold">Atrasado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-default-100">
          {reporte.resumen.porPersona.map((persona) => (
            <tr key={persona.personaId ?? "sin-agente"}>
              <td className="whitespace-nowrap px-5 py-2.5 font-medium text-foreground">{persona.nombre}</td>
              <td className="px-2 py-2.5 text-right font-bold tabular-nums">{persona.porHacer}</td>
              {COLUMNAS_POR_TIPO.map((columna) => (
                <td key={columna.tipo} className="px-2 py-2.5 text-right tabular-nums text-default-600">
                  {persona.porTipo[columna.tipo] || <span className="text-default-300">—</span>}
                </td>
              ))}
              <td className="px-2 py-2.5 text-right tabular-nums text-default-600">
                {persona.acciones || <span className="text-default-300">—</span>}
              </td>
              <td
                className={[
                  "px-5 py-2.5 text-right tabular-nums",
                  persona.atrasados > 0 ? "font-semibold text-danger" : "text-default-300",
                ].join(" ")}
              >
                {persona.atrasados || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Una cosa planificada: la hora (o «todo el día» si es una acción de
 * campaña), qué es, la marca, la nota y quién la hace.
 */
function FilaDeCosa({ cosa, conFecha = false }: { cosa: CosaDeLoQueViene; conFecha?: boolean }) {
  const estado = estadoDe(cosa);
  const hecho = estado === "Hecho";

  const cuando = conFecha
    ? cosa.fecha.split("-").reverse().slice(0, 2).join("/")
    : cosa.clase === "campana"
      ? "Todo el día"
      : (cosa.hora ?? "—");

  return (
    <li className={["flex items-start gap-3 px-5 py-3", hecho ? "opacity-60" : ""].join(" ")}>
      <span className="w-12 shrink-0 pt-1 text-xs font-semibold leading-tight tabular-nums text-default-500">{cuando}</span>

      {cosa.clase === "campana" ? (
        <span
          aria-hidden
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${cosa.campana.color}26`, color: cosa.campana.color }}
        >
          <Megaphone className="size-3.5" />
        </span>
      ) : (
        <span
          aria-hidden
          className={[
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
            estado === "Atrasado" ? "bg-danger-50 text-danger" : "bg-primary-50 text-primary",
          ].join(" ")}
        >
          {hecho ? (
            <Check className="size-3.5" />
          ) : cosa.tipo ? (
            <IconoDelTipo tipo={cosa.tipo.valor} />
          ) : (
            <AlarmClock className="size-3.5" />
          )}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className={["text-sm text-foreground", hecho ? "line-through" : ""].join(" ")}>
          <span className="font-semibold">{queEs(cosa)}</span>
          <span className="text-default-400"> · </span>
          <Link className="inline-flex items-center gap-1.5 align-middle hover:text-primary hover:underline" to={`/marcas?abrir=${cosa.marca.id}`}>
            <LogoPequenoDeMarca marca={cosa.marca} tamano="size-5" />
            {cosa.marca.nombre}
          </Link>
        </p>
        {cosa.nota && <p className="mt-0.5 break-words text-xs text-default-600">{cosa.nota}</p>}
        <p className="mt-0.5 text-[11px] text-default-400 sm:hidden">{quienLaHace(cosa)}</p>
      </div>

      <div className="hidden shrink-0 text-right sm:block">
        <p className="text-xs text-default-600">{quienLaHace(cosa)}</p>
        {estado === "Hecho" && (
          <p className="text-[10px] font-semibold text-success">
            Hecho{cosa.clase === "recordatorio" && cosa.cumplidoPorNombre ? ` por ${cosa.cumplidoPorNombre}` : ""}
          </p>
        )}
        {estado === "Atrasado" && <p className="text-[10px] font-semibold text-danger">Atrasado</p>}
      </div>
    </li>
  );
}

function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
