/**
 * componentes/comunes/PestanasDeReportes.tsx
 * ---------------------------------------------------------------------
 * Las pestañas de la sección Reportes: la bitácora por fechas, lo que
 * viene (lo planificado), el pronóstico por marca y el brochure de
 * propiedades. Cada una es su propia ruta (/reportes/…), así que se
 * pueden enlazar y el botón «atrás» del navegador funciona.
 * ---------------------------------------------------------------------
 */
import { BookOpen, CalendarClock, NotebookPen, TrendingUp } from "lucide-react";
import { NavLink } from "react-router-dom";

const REPORTES = [
  { ruta: "/reportes/bitacora", etiqueta: "Bitácora por fechas", corta: "Bitácora", Icono: NotebookPen },
  { ruta: "/reportes/lo-que-viene", etiqueta: "Lo que viene", corta: "Agenda", Icono: CalendarClock },
  { ruta: "/reportes/pronostico", etiqueta: "Pronóstico por marca", corta: "Pronóstico", Icono: TrendingUp },
  { ruta: "/reportes/brochure", etiqueta: "Brochure de propiedades", corta: "Brochure", Icono: BookOpen },
] as const;

export function PestanasDeReportes() {
  return (
    <nav
      aria-label="Reportes"
      className="flex w-full gap-1 overflow-x-auto rounded-xl bg-default-100 p-1 sm:w-fit"
    >
      {REPORTES.map(({ ruta, etiqueta, corta, Icono }) => (
        <NavLink
          key={ruta}
          className={({ isActive }) =>
            [
              "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:flex-none",
              isActive
                ? "bg-content1 text-foreground shadow-sm"
                : "text-default-500 hover:text-foreground",
            ].join(" ")
          }
          to={ruta}
        >
          {/* En el teléfono no caben los cuatro nombres largos en una
              fila, ni con los iconos. */}
          <Icono className="hidden size-3.5 sm:block" />
          <span className="sm:hidden">{corta}</span>
          <span className="hidden sm:inline">{etiqueta}</span>
        </NavLink>
      ))}
    </nav>
  );
}
