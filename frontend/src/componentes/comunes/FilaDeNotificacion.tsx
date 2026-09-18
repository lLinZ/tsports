/**
 * componentes/comunes/FilaDeNotificacion.tsx
 * ---------------------------------------------------------------------
 * Un aviso en una lista: el desplegable de la campanita y la página de
 * notificaciones lo pintan igual, con esta fila.
 *
 * Lo no leído se distingue por tres cosas a la vez —fondo tintado,
 * título en negrita y un punto— y no solo por el color: quien no
 * distingue bien el tono del acento tiene que poder verlo igual.
 *
 * El icono sale del tipo del aviso. Un tipo que la interfaz aún no
 * conozca (el servidor puede estrenar avisos antes que la interfaz) se
 * pinta con la campana y funciona igual.
 * ---------------------------------------------------------------------
 */
import { Bell, Globe, UserCheck, type LucideIcon } from "lucide-react";
import { formatearFechaYHora, formatearTiempoRelativo } from "@/utilidades/formato";
import type { Notificacion, TipoDeNotificacion } from "@/tipos/modelos";

const ICONOS_POR_TIPO: Partial<Record<TipoDeNotificacion, LucideIcon>> = {
  lead_nuevo: Globe,
  marca_asignada: UserCheck,
};

export function FilaDeNotificacion({
  notificacion,
  alPulsar,
}: {
  notificacion: Notificacion;
  alPulsar: (notificacion: Notificacion) => void;
}) {
  const Icono = ICONOS_POR_TIPO[notificacion.tipo] ?? Bell;
  const sinLeer = !notificacion.leida;

  return (
    <button
      className={`flex w-full min-w-0 items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-default-100 ${
        sinLeer ? "bg-primary-50/70 dark:bg-primary-100/10" : ""
      }`}
      type="button"
      onClick={() => alPulsar(notificacion)}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icono className="size-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm ${
            sinLeer ? "font-semibold text-foreground" : "font-medium text-default-600"
          }`}
        >
          {notificacion.titulo}
        </span>

        {notificacion.cuerpo && (
          <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-default-500">
            {notificacion.cuerpo}
          </span>
        )}

        <time
          className="mt-1 block text-[10px] text-default-400"
          dateTime={notificacion.creadaEn ?? undefined}
          title={formatearFechaYHora(notificacion.creadaEn)}
        >
          {formatearTiempoRelativo(notificacion.creadaEn)}
        </time>
      </span>

      {sinLeer && (
        <span aria-label="Sin leer" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
      )}
    </button>
  );
}
