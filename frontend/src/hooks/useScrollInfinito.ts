/**
 * hooks/useScrollInfinito.ts
 * ---------------------------------------------------------------------
 * Pide la siguiente página cuando el final de la lista entra en pantalla.
 *
 * Los listados largos —el tablero de marcas y el historial de auditoría—
 * vienen paginados del servidor. Hasta ahora la interfaz solo pedía la
 * primera página y no tenía forma de pedir las demás: con 102 marcas
 * cargadas, 42 no había manera de verlas. Esto lo resuelve sin meter un
 * paginador, que es lo que el equipo no quiere: el tablero se recorre
 * desplazándose, no saltando de página en página.
 *
 * Devuelve una referencia que se cuelga de un elemento vacío al final de
 * la lista (el "centinela"). Cuando ese elemento asoma, se pide más.
 *
 * Dos decisiones que evitan los fallos típicos de esto:
 *
 *   · El margen de 400px hace que la petición salga ANTES de llegar al
 *     final, así que la lista no se queda un instante en blanco mientras
 *     llega. Sin él se ve el salto en cada página.
 *   · Mientras haya una petición en curso no se lanza otra. El navegador
 *     dispara el observador varias veces seguidas al desplazarse rápido,
 *     y sin esta comprobación se piden tres páginas a la vez.
 *
 * El centinela debe seguir montado aunque no queden páginas: quien lo
 * desmonta al terminar se queda sin observador si después se cambia un
 * filtro y vuelve a haber más.
 * ---------------------------------------------------------------------
 */
import { useEffect, useRef } from "react";

export function useScrollInfinito({
  hayMas,
  estaCargando,
  pedirMas,
}: {
  /** Si el servidor dice que todavía quedan páginas. */
  hayMas: boolean;
  /** Si ya hay una petición de página en curso. */
  estaCargando: boolean;
  pedirMas: () => void;
}) {
  const centinela = useRef<HTMLDivElement | null>(null);

  // La función se guarda en una referencia para que el observador no se
  // vuelva a crear en cada renderizado: `pedirMas` cambia de identidad
  // en cada uno, y reconectar el observador a cada paso lo dispara de
  // más y pide páginas de sobra.
  const pedirMasEstable = useRef(pedirMas);
  pedirMasEstable.current = pedirMas;

  useEffect(() => {
    const elemento = centinela.current;

    if (elemento === null) return;

    // Navegadores sin IntersectionObserver: no se rompe nada, la lista
    // se queda en la primera página y el botón de "Ver más" sigue ahí.
    if (typeof IntersectionObserver === "undefined") return;

    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas[0].isIntersecting) return;
        if (!hayMas || estaCargando) return;

        pedirMasEstable.current();
      },
      { rootMargin: "400px" },
    );

    observador.observe(elemento);

    return () => observador.disconnect();
  }, [hayMas, estaCargando]);

  return centinela;
}
