/**
 * componentes/comunes/BarraDeScrollDibujada.tsx
 * ---------------------------------------------------------------------
 * La barra de scroll de las ventanas de alta y edición, dibujada por
 * nosotros para que se vea SIEMPRE.
 *
 * POR QUÉ NO BASTA CON CSS
 * La barra la pinta el navegador, y varios la esconden mientras no se
 * desplaza: el Mac con trackpad, y Edge y Firefox en Windows 11. A
 * Chrome, Edge y Safari se les puede obligar con ::-webkit-scrollbar
 * (index.css lo hace en el resto del panel), pero a Firefox no hay
 * forma. En estas ventanas el equipo la quiere siempre a la vista, así
 * que la del sistema se esconde (clase `barra-de-scroll-fija`) y se
 * dibuja esta: un carril y una pastilla que siguen al scroll, que se
 * arrastran, y un clic en el carril avanza una página.
 *
 * El desplazamiento sigue siendo el del navegador (rueda, trackpad,
 * teclado, dedo): aquí solo se dibuja la barra.
 *
 * SALE EN CUALQUIER APARATO, TÁCTIL INCLUIDO
 * Una primera versión no la dibujaba en pantallas táctiles, pensando en
 * el móvil. Pero el modo dispositivo de las DevTools de Chrome simula un
 * teléfono táctil, y es justo con lo que el equipo comprueba cómo se ve
 * la ficha: allí la barra no salía, y parecía que el arreglo no
 * funcionaba. «Siempre» es siempre. En el móvil no estorba: el carril
 * cae sobre el margen derecho del formulario, no sobre los campos.
 *
 * CÓMO SE USA
 * Al lado de la zona que se desplaza, sin ningún contenedor posicionado
 * entre las dos, y con la referencia a la zona:
 *
 *   <div ref={zona} className="barra-de-scroll-fija …">…</div>
 *   <BarraDeScrollDibujada zona={zona} />
 *
 * Se coloca con las medidas de maqueta de la zona (offsetTop y demás) y
 * no con las de pantalla: los modales entran con una animación de
 * escala, y las de pantalla la arrastrarían descolocando la barra.
 * ---------------------------------------------------------------------
 */
import { useEffect, useRef, type PointerEvent as EventoDePuntero, type RefObject } from "react";

/** Más corta no se acierta con el puntero. */
const ALTO_MINIMO_DE_LA_PASTILLA = 32;

/** El carril deja este aire arriba, abajo y a la derecha de la zona. */
const SEPARACION_DEL_BORDE = 4;

/** Lo que se puede pulsar; la pastilla que se ve es la mitad (w-1.5). */
const ANCHO_DEL_CARRIL = 12;

interface PropiedadesDeLaBarraDibujada {
  /** La zona que se desplaza, con la clase `barra-de-scroll-fija`. */
  zona: RefObject<HTMLElement | null>;
}

export function BarraDeScrollDibujada({ zona }: PropiedadesDeLaBarraDibujada) {
  const referenciaAlCarril = useRef<HTMLDivElement>(null);
  const referenciaALaPastilla = useRef<HTMLDivElement>(null);

  /** Dónde empezó el arrastre de la pastilla, o null si no se arrastra. */
  const arrastreEnCurso = useRef<{ yInicial: number; scrollInicial: number } | null>(null);

  useEffect(() => {
    const zonaQueSeDesplaza = zona.current;
    const carril = referenciaAlCarril.current;
    const pastilla = referenciaALaPastilla.current;

    if (!zonaQueSeDesplaza || !carril || !pastilla) return;

    /**
     * Pone el carril sobre el borde derecho de la zona y la pastilla
     * donde toca. Escribe los estilos directamente en vez de pasar por el
     * estado de React: se llama en cada evento de scroll, y un render por
     * cada uno sobraría.
     */
    function recolocarLaBarra() {
      if (!zonaQueSeDesplaza || !carril || !pastilla) return;

      // Zona escondida (la ficha mientras se ve la bitácora en el móvil):
      // el carril también, o se quedaría flotando sobre la bitácora.
      if (zonaQueSeDesplaza.offsetParent === null) {
        carril.style.display = "none";

        return;
      }

      carril.style.display = "";

      const altoDelCarril = Math.max(
        0,
        zonaQueSeDesplaza.offsetHeight - 2 * SEPARACION_DEL_BORDE,
      );

      carril.style.top = `${zonaQueSeDesplaza.offsetTop + SEPARACION_DEL_BORDE}px`;
      carril.style.left = `${
        zonaQueSeDesplaza.offsetLeft +
        zonaQueSeDesplaza.offsetWidth -
        ANCHO_DEL_CARRIL -
        SEPARACION_DEL_BORDE
      }px`;
      carril.style.height = `${altoDelCarril}px`;

      const { scrollHeight, clientHeight, scrollTop } = zonaQueSeDesplaza;
      const recorridoDelContenido = scrollHeight - clientHeight;

      // Si todo cabe, no hay pastilla, pero el carril sigue a la vista:
      // la barra se ve SIEMPRE, que es lo que se pidió.
      if (recorridoDelContenido <= 0) {
        pastilla.style.display = "none";

        return;
      }

      const altoDeLaPastilla = Math.min(
        altoDelCarril,
        Math.max(ALTO_MINIMO_DE_LA_PASTILLA, (clientHeight / scrollHeight) * altoDelCarril),
      );
      const recorridoDeLaPastilla = altoDelCarril - altoDeLaPastilla;

      pastilla.style.display = "";
      pastilla.style.height = `${altoDeLaPastilla}px`;
      pastilla.style.transform = `translateY(${
        (scrollTop / recorridoDelContenido) * recorridoDeLaPastilla
      }px)`;
    }

    // El contenido cambia de alto sin que haya scroll: al pasar de paso,
    // al marcar una propiedad (se abre su pronóstico), al llegar los
    // datos. Se vigila la zona, cada uno de sus hijos, y la lista de hijos
    // por si cambia.
    const observadorDeTamanos = new ResizeObserver(recolocarLaBarra);

    function vigilarLaZonaYSusHijos() {
      if (!zonaQueSeDesplaza) return;

      observadorDeTamanos.disconnect();
      observadorDeTamanos.observe(zonaQueSeDesplaza);

      for (const hijo of Array.from(zonaQueSeDesplaza.children)) {
        observadorDeTamanos.observe(hijo);
      }

      recolocarLaBarra();
    }

    const observadorDeHijos = new MutationObserver(vigilarLaZonaYSusHijos);

    vigilarLaZonaYSusHijos();
    observadorDeHijos.observe(zonaQueSeDesplaza, { childList: true });
    zonaQueSeDesplaza.addEventListener("scroll", recolocarLaBarra, { passive: true });
    window.addEventListener("resize", recolocarLaBarra);

    return () => {
      observadorDeTamanos.disconnect();
      observadorDeHijos.disconnect();
      zonaQueSeDesplaza.removeEventListener("scroll", recolocarLaBarra);
      window.removeEventListener("resize", recolocarLaBarra);
    };
  }, [zona]);

  /** Agarrar la pastilla, o un clic en el carril para avanzar una página. */
  function alPulsarElCarril(evento: EventoDePuntero<HTMLDivElement>) {
    const zonaQueSeDesplaza = zona.current;
    const pastilla = referenciaALaPastilla.current;

    if (!zonaQueSeDesplaza || !pastilla || evento.button !== 0) return;

    // Sin esto, arrastrar la pastilla seleccionaría el texto de al lado.
    evento.preventDefault();

    if (evento.target === pastilla) {
      arrastreEnCurso.current = {
        yInicial: evento.clientY,
        scrollInicial: zonaQueSeDesplaza.scrollTop,
      };
      evento.currentTarget.setPointerCapture(evento.pointerId);

      return;
    }

    // Fuera de la pastilla: una página hacia ese lado, como la barra del
    // sistema. Si no hay pastilla (todo cabe), no hay a dónde ir.
    if (pastilla.style.display === "none") return;

    const haciaArriba = evento.clientY < pastilla.getBoundingClientRect().top;
    const prefiereMenosMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    zonaQueSeDesplaza.scrollBy({
      top: (haciaArriba ? -1 : 1) * zonaQueSeDesplaza.clientHeight * 0.9,
      behavior: prefiereMenosMovimiento ? "auto" : "smooth",
    });
  }

  function alArrastrarLaPastilla(evento: EventoDePuntero<HTMLDivElement>) {
    const zonaQueSeDesplaza = zona.current;
    const carril = referenciaAlCarril.current;
    const pastilla = referenciaALaPastilla.current;
    const arrastre = arrastreEnCurso.current;

    if (!arrastre || !zonaQueSeDesplaza || !carril || !pastilla) return;

    const recorridoDeLaPastilla = carril.clientHeight - pastilla.offsetHeight;

    if (recorridoDeLaPastilla <= 0) return;

    // Lo que se mueve la pastilla, a escala del contenido: bajarla hasta
    // el fondo del carril es llegar al final del formulario.
    const recorridoDelContenido = zonaQueSeDesplaza.scrollHeight - zonaQueSeDesplaza.clientHeight;

    zonaQueSeDesplaza.scrollTo({
      top:
        arrastre.scrollInicial +
        ((evento.clientY - arrastre.yInicial) * recorridoDelContenido) / recorridoDeLaPastilla,
    });
  }

  function alSoltarLaPastilla(evento: EventoDePuntero<HTMLDivElement>) {
    arrastreEnCurso.current = null;

    if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
      evento.currentTarget.releasePointerCapture(evento.pointerId);
    }
  }

  return (
    <div
      ref={referenciaAlCarril}
      aria-hidden="true"
      className="absolute z-10 w-3 touch-none select-none"
      onPointerCancel={alSoltarLaPastilla}
      onPointerDown={alPulsarElCarril}
      onPointerMove={alArrastrarLaPastilla}
      onPointerUp={alSoltarLaPastilla}
    >
      {/* El carril que se ve, más estrecho que la franja que se pulsa. */}
      <div className="pointer-events-none absolute inset-y-0 left-[3px] w-1.5 rounded-full bg-default-200" />

      {/* Un tono más oscura que la barra del resto del panel: esta tiene
          que encontrarse de un vistazo, y en modo oscuro la otra apenas
          destaca del fondo. */}
      <div
        ref={referenciaALaPastilla}
        className="absolute left-[3px] top-0 w-1.5 rounded-full bg-default-500 transition-colors hover:bg-default-600"
      />
    </div>
  );
}
