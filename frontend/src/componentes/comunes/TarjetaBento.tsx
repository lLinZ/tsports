/**
 * componentes/comunes/TarjetaBento.tsx
 * ---------------------------------------------------------------------
 * La caja base de toda la interfaz.
 *
 * El sistema visual es de tipo "bento": una rejilla de cajas
 * redondeadas de distintos tamaños, cada una con una sola idea dentro.
 * Este componente es esa caja, y existe para que las esquinas, el borde,
 * la sombra y el espaciado sean idénticos en las cuarenta y pico
 * tarjetas de la aplicación.
 *
 * `columnas` y `filas` dicen cuánto ocupa la caja dentro de la rejilla
 * de doce columnas de <RejillaBento>, sin que cada pantalla tenga que
 * recordar las clases de Tailwind correspondientes.
 * ---------------------------------------------------------------------
 */
import type { ReactNode } from "react";

/** Cuántas de las doce columnas ocupa la tarjeta en pantalla grande. */
type AnchoEnColumnas = 3 | 4 | 6 | 8 | 9 | 12;

/** Cuántas filas de la rejilla ocupa en alto. */
type AltoEnFilas = 1 | 2 | 3;

interface PropiedadesDeTarjetaBento {
  children: ReactNode;

  /** Título de la caja. Si no se pasa, no se dibuja la cabecera. */
  titulo?: string;
  /** Frase corta bajo el título que explica qué se está viendo. */
  descripcion?: string;
  /** Contenido alineado a la derecha de la cabecera (botones, filtros). */
  accionDeCabecera?: ReactNode;
  /** Icono decorativo junto al título. */
  icono?: ReactNode;

  columnas?: AnchoEnColumnas;
  filas?: AltoEnFilas;

  /** Marca la tarjeta como pulsable: cambia el cursor y eleva al pasar. */
  esPulsable?: boolean;
  onClick?: () => void;

  /** Quita el relleno interior, para tarjetas que llevan una tabla. */
  sinRelleno?: boolean;

  className?: string;
}

/**
 * Traducción de columnas a clases de Tailwind.
 *
 * Se escriben literales y no interpoladas (`col-span-${n}`) porque
 * Tailwind analiza el código como texto: una clase construida en
 * ejecución no aparece en el CSS final y la tarjeta saldría sin ancho.
 */
const CLASES_DE_COLUMNAS: Record<AnchoEnColumnas, string> = {
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  6: "lg:col-span-6",
  8: "lg:col-span-8",
  9: "lg:col-span-9",
  12: "lg:col-span-12",
};

const CLASES_DE_FILAS: Record<AltoEnFilas, string> = {
  1: "row-span-1",
  2: "row-span-2",
  3: "row-span-3",
};

export function TarjetaBento({
  children,
  titulo,
  descripcion,
  accionDeCabecera,
  icono,
  columnas = 12,
  filas = 1,
  esPulsable = false,
  onClick,
  sinRelleno = false,
  className = "",
}: PropiedadesDeTarjetaBento) {
  const tieneCabecera = Boolean(titulo || accionDeCabecera);

  const clasesDeLaTarjeta = [
    "bento-card flex flex-col",
    CLASES_DE_COLUMNAS[columnas],
    CLASES_DE_FILAS[filas],
    esPulsable ? "bento-card-interactive" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // Una tarjeta pulsable tiene que poder usarse con el teclado: se le da
  // rol de botón y se atiende Enter y Espacio, igual que un botón real.
  const propiedadesDeAccesibilidad = esPulsable
    ? {
        role: "button" as const,
        tabIndex: 0,
        onKeyDown: (evento: React.KeyboardEvent) => {
          if (evento.key === "Enter" || evento.key === " ") {
            evento.preventDefault();
            onClick?.();
          }
        },
      }
    : {};

  return (
    <section
      className={clasesDeLaTarjeta}
      onClick={esPulsable ? onClick : undefined}
      {...propiedadesDeAccesibilidad}
    >
      {tieneCabecera && (
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-1">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
              {icono && <span className="text-primary">{icono}</span>}
              <span className="truncate">{titulo}</span>
            </h2>

            {descripcion && (
              <p className="mt-0.5 text-xs leading-relaxed text-default-500">
                {descripcion}
              </p>
            )}
          </div>

          {accionDeCabecera && (
            <div className="flex shrink-0 items-center gap-2">{accionDeCabecera}</div>
          )}
        </header>
      )}

      <div className={sinRelleno ? "flex-1 min-h-0" : "flex-1 min-h-0 p-5"}>
        {children}
      </div>
    </section>
  );
}

/**
 * La rejilla que contiene las tarjetas.
 *
 * En móvil todo cae a una columna; a partir de pantalla grande se abren
 * las doce columnas y cada tarjeta ocupa las que haya declarado.
 */
export function RejillaBento({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-4 lg:grid-cols-12 lg:auto-rows-min ${className}`}
    >
      {children}
    </div>
  );
}
