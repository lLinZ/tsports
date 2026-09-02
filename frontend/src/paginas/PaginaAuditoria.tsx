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
 * Solo lo ve un administrador.
 * ---------------------------------------------------------------------
 */
import { Chip, Select, SelectItem } from "@heroui/react";
import { ScrollText } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { mensajeDeError } from "@/api/clienteHttp";
import { obtenerAuditoria } from "@/api/sistema";
import {
  BloqueDeCarga,
  BloqueDeError,
  EstadoVacio,
} from "@/componentes/comunes/EstadosDePantalla";
import { formatearFechaYHora, inicialesDe } from "@/utilidades/formato";

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

/** Los tipos de cosa sobre los que se puede haber actuado. */
const OPCIONES_DE_ENTIDAD = [
  { valor: "", etiqueta: "Todo" },
  { valor: "marca", etiqueta: "Marcas" },
  { valor: "usuario", etiqueta: "Cuentas" },
  { valor: "contenido_sitio", etiqueta: "Web pública" },
];

export function PaginaAuditoria() {
  const [entidadFiltrada, establecerEntidadFiltrada] = useState("");

  const consultaDeAuditoria = useQuery({
    queryKey: ["auditoria", entidadFiltrada],
    queryFn: () =>
      obtenerAuditoria(entidadFiltrada ? { entidad: entidadFiltrada } : undefined),
  });

  const registros = consultaDeAuditoria.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Auditoría
          </h2>
          <p className="mt-0.5 text-sm text-default-500">
            Todo lo que ha hecho el equipo, en orden inverso.
          </p>
        </div>

        <Select
          aria-label="Filtrar por tipo"
          className="w-44"
          radius="lg"
          selectedKeys={[entidadFiltrada]}
          size="sm"
          variant="bordered"
          onSelectionChange={(seleccion) =>
            establecerEntidadFiltrada(String(Array.from(seleccion)[0] ?? ""))
          }
        >
          {OPCIONES_DE_ENTIDAD.map((opcion) => (
            <SelectItem key={opcion.valor}>{opcion.etiqueta}</SelectItem>
          ))}
        </Select>
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
            descripcion="En cuanto el equipo empiece a trabajar, aquí quedará constancia."
            icono={<ScrollText className="size-5" />}
            titulo="Todavía no hay movimientos registrados"
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
