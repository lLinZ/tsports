/**
 * componentes/comunes/SeccionDeDesactivadas.tsx
 * ---------------------------------------------------------------------
 * La parte de abajo de los catálogos de propiedades y campañas, con lo
 * que está desactivado.
 *
 * Va aparte para que no se mezcle con lo que se ofrece hoy, y a la vista
 * —no escondida tras un filtro— porque desactivar solo sirve si luego se
 * encuentra fácil para reactivarlo: la carrera de este año es la de
 * septiembre del que viene.
 * ---------------------------------------------------------------------
 */
import { Archive } from "lucide-react";
import type { ReactNode } from "react";

export function SeccionDeDesactivadas({
  cantidad,
  explicacion,
  children,
}: {
  cantidad: number;
  explicacion: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 pt-2">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-default-600">
          <Archive className="size-4" />
          Desactivadas · {cantidad}
        </h3>
        <p className="mt-0.5 text-xs text-default-500">{explicacion}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}
