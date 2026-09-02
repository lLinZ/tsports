/**
 * hooks/useEfectosDeScroll.ts
 * ---------------------------------------------------------------------
 * Los efectos de desplazamiento de la web pública: aparición progresiva
 * de las secciones, contadores que suben, cabecera que se vuelve sólida
 * y parallax de la franja central.
 *
 * Estaban repartidos por `render.js` y `script.js` en la versión
 * anterior. Aquí van juntos porque los cuatro comparten la misma idea
 * —reaccionar a la posición de la página— y los cuatro tienen la misma
 * trampa: hay que dejar de escuchar al desmontar o se acumulan
 * observadores cada vez que se cambia de página.
 *
 * Todos respetan `prefers-reduced-motion`: quien pidió menos movimiento
 * en su sistema operativo ve el contenido directamente, sin animación.
 * ---------------------------------------------------------------------
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** ¿La persona pidió menos movimiento en su sistema operativo? */
function prefiereMenosMovimiento(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ==================================================================== */
/* Aparición progresiva                                                 */
/* ==================================================================== */

/**
 * Hace que un elemento aparezca cuando entra en pantalla.
 *
 * Se usa como referencia:
 *
 *     const revelar = useRevelarAlEntrar();
 *     <div ref={revelar} className="revelar">…</div>
 *
 * Un único observador atiende a todos los elementos registrados, en vez
 * de crear uno por tarjeta: con veinte servicios y proyectos en la
 * página, la diferencia se nota.
 */
export function useRevelarAlEntrar() {
  const observadorRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (prefiereMenosMovimiento()) return;

    observadorRef.current = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((entrada) => {
          if (!entrada.isIntersecting) return;

          entrada.target.classList.add("visible");

          // Una vez visible, ya no hace falta seguir vigilándolo.
          observadorRef.current?.unobserve(entrada.target);
        });
      },
      { threshold: 0.12 },
    );

    return () => observadorRef.current?.disconnect();
  }, []);

  // Referencia que se pasa a cada elemento que quiera aparecer.
  return useCallback((elemento: HTMLElement | null) => {
    if (elemento === null) return;

    if (prefiereMenosMovimiento()) {
      elemento.classList.add("visible");

      return;
    }

    observadorRef.current?.observe(elemento);
  }, []);
}

/* ==================================================================== */
/* Contadores animados                                                  */
/* ==================================================================== */

/**
 * Anima una cifra desde cero hasta su valor cuando entra en pantalla.
 *
 * Acepta el texto tal cual está en el contenido ("20+", "100%", "17+")
 * y conserva el sufijo: solo se anima la parte numérica. Si el texto no
 * empieza por un número, se devuelve intacto y no pasa nada.
 */
export function useContadorAnimado<TElemento extends HTMLElement = HTMLElement>(
  textoConLaCifra: string,
) {
  const [textoMostrado, establecerTextoMostrado] = useState(textoConLaCifra);
  const referenciaAlElemento = useRef<TElemento | null>(null);

  useEffect(() => {
    const elemento = referenciaAlElemento.current;

    if (elemento === null) return;

    // "20+" → número 20, sufijo "+"
    const partes = textoConLaCifra.trim().match(/^([\d.,]+)(.*)$/);

    if (partes === null || prefiereMenosMovimiento()) {
      establecerTextoMostrado(textoConLaCifra);

      return;
    }

    const valorFinal = parseFloat(partes[1].replace(/,/g, ""));
    const sufijo = partes[2] ?? "";

    if (Number.isNaN(valorFinal)) {
      establecerTextoMostrado(textoConLaCifra);

      return;
    }

    // Arranca en cero para que se vea subir.
    establecerTextoMostrado(`0${sufijo}`);

    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas[0]?.isIntersecting) return;

        observador.disconnect();

        const DURACION_MS = 1300;
        const instanteInicial = performance.now();

        const siguienteFotograma = (instanteActual: number) => {
          const avance = Math.min((instanteActual - instanteInicial) / DURACION_MS, 1);

          // Desaceleración cúbica: rápido al principio y suave al final,
          // que es como se percibe natural una cuenta ascendente.
          const avanceSuavizado = 1 - Math.pow(1 - avance, 3);

          establecerTextoMostrado(
            `${Math.round(valorFinal * avanceSuavizado)}${sufijo}`,
          );

          if (avance < 1) requestAnimationFrame(siguienteFotograma);
        };

        requestAnimationFrame(siguienteFotograma);
      },
      { threshold: 0.6 },
    );

    observador.observe(elemento);

    return () => observador.disconnect();
  }, [textoConLaCifra]);

  return { referenciaAlElemento, textoMostrado };
}

/* ==================================================================== */
/* Cabecera sólida al bajar                                             */
/* ==================================================================== */

/**
 * Devuelve `true` cuando la página se ha desplazado lo bastante como
 * para que la cabecera deje de ser transparente.
 *
 * Sobre la portada la cabecera va translúcida para no tapar el vídeo;
 * en cuanto se baja, se vuelve sólida o el menú quedaría ilegible sobre
 * el contenido claro.
 */
export function useCabeceraSolida(umbralEnPixeles = 40): boolean {
  const [laCabeceraEsSolida, establecerCabeceraSolida] = useState(false);

  useEffect(() => {
    let hayFotogramaPendiente = false;

    const alDesplazar = () => {
      if (hayFotogramaPendiente) return;

      hayFotogramaPendiente = true;

      // Se agrupa la lectura en un fotograma: el evento de scroll se
      // dispara decenas de veces por segundo y tocar el DOM en cada uno
      // provoca tirones.
      requestAnimationFrame(() => {
        establecerCabeceraSolida(window.scrollY > umbralEnPixeles);
        hayFotogramaPendiente = false;
      });
    };

    alDesplazar();
    window.addEventListener("scroll", alDesplazar, { passive: true });

    return () => window.removeEventListener("scroll", alDesplazar);
  }, [umbralEnPixeles]);

  return laCabeceraEsSolida;
}

/* ==================================================================== */
/* Parallax                                                             */
/* ==================================================================== */

/**
 * Desplaza el fondo de una sección más despacio que la página, para dar
 * sensación de profundidad.
 *
 * Devuelve dos referencias: una para la sección que sirve de marco y
 * otra para la imagen que se mueve dentro.
 */
export function useParallax<
  TSeccion extends HTMLElement = HTMLElement,
  TFondo extends HTMLElement = HTMLElement,
>(factorDeDesplazamiento = 0.12) {
  const referenciaALaSeccion = useRef<TSeccion | null>(null);
  const referenciaAlFondo = useRef<TFondo | null>(null);

  useEffect(() => {
    if (prefiereMenosMovimiento()) return;

    let hayFotogramaPendiente = false;

    const actualizarPosicion = () => {
      const seccion = referenciaALaSeccion.current;
      const fondo = referenciaAlFondo.current;

      hayFotogramaPendiente = false;

      if (seccion === null || fondo === null) return;

      const posicion = seccion.getBoundingClientRect();
      const laSeccionEstaVisible =
        posicion.bottom > 0 && posicion.top < window.innerHeight;

      // Solo se mueve mientras se ve: fuera de pantalla es trabajo tirado.
      if (!laSeccionEstaVisible) return;

      fondo.style.transform = `translateY(${posicion.top * factorDeDesplazamiento}px)`;
    };

    const alDesplazar = () => {
      if (hayFotogramaPendiente) return;

      hayFotogramaPendiente = true;
      requestAnimationFrame(actualizarPosicion);
    };

    actualizarPosicion();
    window.addEventListener("scroll", alDesplazar, { passive: true });

    return () => window.removeEventListener("scroll", alDesplazar);
  }, [factorDeDesplazamiento]);

  return { referenciaALaSeccion, referenciaAlFondo };
}
