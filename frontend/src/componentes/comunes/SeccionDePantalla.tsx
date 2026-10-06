/**
 * componentes/comunes/SeccionDePantalla.tsx
 * ---------------------------------------------------------------------
 * Una parte de una pantalla larga, con su título y una frase que dice
 * qué pregunta contesta. Y el índice de esas partes, para saltar a cada
 * una.
 *
 * Nació con el resumen de la dirección (2026-10-06), que había crecido
 * hasta diez cifras y once cajas seguidas sin nada que las agrupase: el
 * equipo lo encontraba denso y no sabía qué era cada cosa. Agrupado por
 * preguntas («¿qué toca hoy?», «¿cómo va el pipeline?»…) se lee de
 * arriba abajo y se salta a lo que se busca.
 *
 * La sección no es una caja: el título va suelto sobre el fondo y las
 * cajas bento van debajo. Meter las cajas dentro de otra caja sería una
 * ventana dentro de una ventana.
 * ---------------------------------------------------------------------
 */
import type { ReactNode } from "react";

interface PropiedadesDeSeccion {
  /** El ancla del índice. */
  id: string;
  titulo: string;
  /** La pregunta que contesta, en una o dos frases. */
  descripcion: string;
  icono: ReactNode;
  children: ReactNode;
}

export function SeccionDePantalla({ id, titulo, descripcion, icono, children }: PropiedadesDeSeccion) {
  return (
    // scroll-mt: al saltar desde el índice, que el título no quede debajo
    // de la barra superior fija.
    <section aria-labelledby={`${id}-titulo`} className="scroll-mt-20 space-y-4" id={id}>
      <header className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-100/20 dark:text-primary-400">
          {icono}
        </span>

        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight text-foreground" id={`${id}-titulo`}>
            {titulo}
          </h2>
          <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-default-500">{descripcion}</p>
        </div>
      </header>

      {children}
    </section>
  );
}

/**
 * Los enlaces a cada sección. Son anclas (`<a href="#…">`) y no `<Link>`:
 * React Router cambiaría la dirección sin mover la pantalla.
 */
export function IndiceDeSecciones({
  secciones,
}: {
  secciones: Array<{ id: string; titulo: string; icono: ReactNode }>;
}) {
  return (
    <nav aria-label="Partes de esta pantalla" className="flex flex-wrap gap-1.5">
      {secciones.map((seccion) => (
        <a
          key={seccion.id}
          className="flex items-center gap-1.5 rounded-full border border-default-200 bg-content1 px-3 py-1.5 text-xs font-medium text-default-600 transition hover:border-primary hover:text-primary"
          href={`#${seccion.id}`}
        >
          <span className="text-primary [&>svg]:size-3.5">{seccion.icono}</span>
          {seccion.titulo}
        </a>
      ))}
    </nav>
  );
}
