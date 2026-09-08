/**
 * paginas/PaginaAuditoria.tsx
 * ---------------------------------------------------------------------
 * El historial de lo que hace el equipo: quién creó, editó o borró qué,
 * y cuándo.
 *
 * No existía en la versión anterior sobre Supabase, y es la respuesta a
 * la pregunta que más se repite cuando varias personas trabajan sobre
 * las mismas marcas: "¿quién cambió esto?".
 *
 * El historial crece con cada guardado, así que la pantalla vive de sus
 * filtros: fecha, persona, acción y tipo de cosa, combinables entre sí.
 * Los cuatro los aplica el SERVIDOR y no el navegador, porque aquí solo
 * llega una página de cincuenta líneas: filtrar lo que ya se descargó
 * daría resultados que dependen de por dónde iba el listado.
 *
 * Las fechas viajan como AAAA-MM-DD y se comparan por día, así que
 * "hasta el 8" incluye todo el día 8. No se construye ningún `Date` con
 * ellas en el navegador (ver regla de fechas del CLAUDE.md).
 *
 * Solo lo ve un administrador.
 * ---------------------------------------------------------------------
 */
import { Button, Chip, Input, Select, SelectItem } from "@heroui/react";
import { ScrollText, X } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { mensajeDeError } from "@/api/clienteHttp";
import { listarPersonasDeAuditoria, obtenerAuditoria } from "@/api/sistema";
import {
  BloqueDeCarga,
  BloqueDeError,
  EstadoVacio,
} from "@/componentes/comunes/EstadosDePantalla";
import {
  formatearFechaYHora,
  formatearNumero,
  inicialesDe,
} from "@/utilidades/formato";

/** Color del distintivo según lo que se hizo. */
const COLOR_DE_LA_ACCION: Record<string, "success" | "primary" | "danger" | "default"> = {
  creo: "success",
  actualizo: "primary",
  elimino: "danger",
  comento: "default",
  inicio_sesion: "default",
  publico_web: "primary",
};

/** Nombre legible de cada acción. */
const ETIQUETA_DE_LA_ACCION: Record<string, string> = {
  creo: "Creó",
  actualizo: "Editó",
  elimino: "Eliminó",
  comento: "Comentó",
  inicio_sesion: "Entró",
  publico_web: "Publicó",
};

/** Las acciones del filtro, en el orden en que se suelen buscar. */
const OPCIONES_DE_ACCION = [
  { valor: "", etiqueta: "Todas las acciones" },
  { valor: "creo", etiqueta: "Creó" },
  { valor: "actualizo", etiqueta: "Editó" },
  { valor: "elimino", etiqueta: "Eliminó" },
  { valor: "comento", etiqueta: "Comentó" },
  { valor: "publico_web", etiqueta: "Publicó la web" },
  { valor: "inicio_sesion", etiqueta: "Entró" },
];

/** Los tipos de cosa sobre los que se puede haber actuado. */
const OPCIONES_DE_ENTIDAD = [
  { valor: "", etiqueta: "Todo" },
  { valor: "marca", etiqueta: "Marcas" },
  { valor: "usuario", etiqueta: "Cuentas" },
  { valor: "contenido_sitio", etiqueta: "Web pública" },
];

/** Lo que se puede acotar. Vacío significa "sin filtrar por esto". */
interface FiltrosDeAuditoria {
  desde: string;
  hasta: string;
  usuario: string;
  accion: string;
  entidad: string;
}

const SIN_FILTROS: FiltrosDeAuditoria = {
  desde: "",
  hasta: "",
  usuario: "",
  accion: "",
  entidad: "",
};

export function PaginaAuditoria() {
  const [filtros, establecerFiltros] = useState<FiltrosDeAuditoria>(SIN_FILTROS);

  function cambiarFiltro(clave: keyof FiltrosDeAuditoria, valor: string) {
    establecerFiltros((anteriores) => ({ ...anteriores, [clave]: valor }));
  }

  const hayFiltrosActivos = Object.values(filtros).some((valor) => valor !== "");

  const consultaDeAuditoria = useQuery({
    // Los filtros entran enteros en la clave: cambiar cualquiera pide de
    // nuevo, y volver a una combinación ya vista la saca de la caché.
    queryKey: ["auditoria", filtros],
    queryFn: () => obtenerAuditoria(filtros),
  });

  /**
   * Quién sale en el filtro por persona.
   *
   * Viene del propio historial y no de la lista de cuentas: el registro
   * guarda el nombre además del id, así que aquí siguen apareciendo
   * quienes ya no tienen cuenta. Con la lista de cuentas, sus movimientos
   * se quedarían en el historial sin forma de pedirlos.
   */
  const consultaDePersonas = useQuery({
    queryKey: ["auditoria", "personas"],
    queryFn: listarPersonasDeAuditoria,
    staleTime: 5 * 60 * 1000,
  });

  const personas = consultaDePersonas.data ?? [];
  const registros = consultaDeAuditoria.data?.registros ?? [];
  const total = consultaDeAuditoria.data?.total ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Auditoría
          </h2>
          <p className="mt-0.5 text-sm text-default-500">
            {consultaDeAuditoria.isLoading
              ? "Cargando…"
              : `${formatearNumero(total)} ${
                  total === 1 ? "movimiento" : "movimientos"
                }${hayFiltrosActivos ? " con los filtros aplicados" : ""}`}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bento-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Desde qué día"
            className="w-40"
            labelPlacement="outside-left"
            max={filtros.hasta || undefined}
            radius="lg"
            size="sm"
            startContent={
              <span className="shrink-0 text-[11px] text-default-400">Desde</span>
            }
            type="date"
            value={filtros.desde}
            variant="bordered"
            onValueChange={(valor) => cambiarFiltro("desde", valor)}
          />

          <Input
            aria-label="Hasta qué día"
            className="w-40"
            min={filtros.desde || undefined}
            radius="lg"
            size="sm"
            startContent={
              <span className="shrink-0 text-[11px] text-default-400">Hasta</span>
            }
            type="date"
            value={filtros.hasta}
            variant="bordered"
            onValueChange={(valor) => cambiarFiltro("hasta", valor)}
          />

          <Select
            aria-label="Filtrar por persona"
            className="w-52"
            placeholder="Todas las personas"
            radius="lg"
            selectedKeys={filtros.usuario ? [filtros.usuario] : []}
            size="sm"
            variant="bordered"
            onSelectionChange={(seleccion) =>
              cambiarFiltro("usuario", String(Array.from(seleccion)[0] ?? ""))
            }
          >
            {[
              <SelectItem key="">Todas las personas</SelectItem>,
              ...personas.map((persona) => (
                <SelectItem key={persona.id} textValue={persona.nombre}>
                  {persona.nombre} ({formatearNumero(persona.totalMovimientos)})
                </SelectItem>
              )),
            ]}
          </Select>

          <Select
            aria-label="Filtrar por acción"
            className="w-44"
            radius="lg"
            selectedKeys={[filtros.accion]}
            size="sm"
            variant="bordered"
            onSelectionChange={(seleccion) =>
              cambiarFiltro("accion", String(Array.from(seleccion)[0] ?? ""))
            }
          >
            {OPCIONES_DE_ACCION.map((opcion) => (
              <SelectItem key={opcion.valor}>{opcion.etiqueta}</SelectItem>
            ))}
          </Select>

          <Select
            aria-label="Filtrar por tipo"
            className="w-40"
            radius="lg"
            selectedKeys={[filtros.entidad]}
            size="sm"
            variant="bordered"
            onSelectionChange={(seleccion) =>
              cambiarFiltro("entidad", String(Array.from(seleccion)[0] ?? ""))
            }
          >
            {OPCIONES_DE_ENTIDAD.map((opcion) => (
              <SelectItem key={opcion.valor}>{opcion.etiqueta}</SelectItem>
            ))}
          </Select>

          {hayFiltrosActivos && (
            <Button
              radius="lg"
              size="sm"
              startContent={<X className="size-3.5" />}
              variant="light"
              onPress={() => establecerFiltros(SIN_FILTROS)}
            >
              Limpiar
            </Button>
          )}
        </div>
      </div>

      <div className="bento-card p-4 sm:p-5">
        {consultaDeAuditoria.isLoading ? (
          <BloqueDeCarga mensaje="Cargando el historial…" />
        ) : consultaDeAuditoria.error ? (
          <BloqueDeError
            mensaje={mensajeDeError(consultaDeAuditoria.error)}
            alReintentar={() => void consultaDeAuditoria.refetch()}
          />
        ) : registros.length === 0 ? (
          <EstadoVacio
            accion={
              hayFiltrosActivos ? (
                <Button
                  radius="lg"
                  size="sm"
                  variant="flat"
                  onPress={() => establecerFiltros(SIN_FILTROS)}
                >
                  Quitar los filtros
                </Button>
              ) : undefined
            }
            descripcion={
              hayFiltrosActivos
                ? "Prueba con otro periodo o con otra persona."
                : "En cuanto el equipo empiece a trabajar, aquí quedará constancia."
            }
            icono={<ScrollText className="size-5" />}
            titulo={
              hayFiltrosActivos
                ? "Ningún movimiento coincide"
                : "Todavía no hay movimientos registrados"
            }
          />
        ) : (
          <ol className="space-y-1">
            {registros.map((registro) => (
              <li
                key={registro.id}
                className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition hover:bg-default-50"
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-default-100 text-[10px] font-bold text-default-600">
                  {inicialesDe(registro.usuarioNombre)}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-foreground">
                    {registro.descripcion}
                  </p>

                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-default-400">
                    <span>{registro.usuarioNombre}</span>
                    <span>·</span>
                    <time>{formatearFechaYHora(registro.creadoEn)}</time>
                  </p>
                </div>

                <Chip
                  className="shrink-0"
                  color={COLOR_DE_LA_ACCION[registro.accion] ?? "default"}
                  radius="lg"
                  size="sm"
                  variant="flat"
                >
                  {ETIQUETA_DE_LA_ACCION[registro.accion] ?? registro.accion}
                </Chip>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
