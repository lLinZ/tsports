/**
 * componentes/comunes/PestanasDeReportes.tsx
 * ---------------------------------------------------------------------
 * Las pestañas de la sección Reportes: la bitácora por fechas y el
 * brochure de propiedades. Cada una es su propia ruta (/reportes/…),
 * así que se pueden enlazar y el botón «atrás» del navegador funciona.
 * ---------------------------------------------------------------------
 */
import { BookOpen, NotebookPen } from "lucide-react";
import { NavLink } from "react-router-dom";

const REPORTES = [
  { ruta: "/reportes/bitacora", etiqueta: "Bitácora por fechas", Icono: NotebookPen },
  { ruta: "/reportes/brochure", etiqueta: "Brochure de propiedades", Icono: BookOpen },
] as const;

export function PestanasDeReportes() {
  return (
    <nav
      aria-label="Reportes"
      className="flex w-full gap-1 rounded-xl bg-default-100 p-1 sm:w-fit"
    >
      {REPORTES.map(({ ruta, etiqueta, Icono }) => (
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
          <Icono className="size-3.5" />
          {etiqueta}
        </NavLink>
      ))}
    </nav>
  );
}
