/**
 * theme/colorAcento.ts
 * ---------------------------------------------------------------------
 * Convierte el color de perfil que elige cada usuario en el juego
 * completo de variables CSS que usa HeroUI para pintar todo lo que es
 * "primario": botones, enlaces, interruptores, anillos de foco, chips...
 *
 * CÓMO FUNCIONA
 * HeroUI no guarda sus colores como `#1b9aaa`, sino como componentes HSL
 * separados por espacios, así:
 *
 *     --heroui-primary: 187 72% 39%;
 *
 * y luego los usa como `hsl(var(--heroui-primary))`. Gracias a eso basta
 * con reescribir esas variables en el elemento raíz para que TODA la
 * interfaz cambie de color a la vez, sin recompilar Tailwind y sin que
 * ningún componente tenga que enterarse.
 *
 * A partir del color elegido se genera la rampa de tonos 50…900
 * moviendo únicamente la luminosidad, de modo que la familia mantenga el
 * mismo matiz y la interfaz siga pareciendo un sistema coherente.
 *
 * En modo oscuro la rampa se invierte, porque allí el tono claro es el
 * que tiene que destacar sobre el fondo.
 * ---------------------------------------------------------------------
 */

/** Color de acento de partida, el turquesa corporativo de TS Sports. */
export const COLOR_ACENTO_POR_DEFECTO = "#1b9aaa";

/** Un color en el espacio HSL, con la saturación y la luz en tanto por ciento. */
interface ColorHsl {
  matiz: number;
  saturacion: number;
  luminosidad: number;
}

/**
 * Luminosidad objetivo de cada peldaño de la rampa, del más claro al más
 * oscuro. Son los valores que usa HeroUI en sus paletas propias, así que
 * un color personalizado encaja con el resto del sistema.
 */
const LUMINOSIDAD_POR_PELDANO: Record<string, number> = {
  "50": 96,
  "100": 90,
  "200": 80,
  "300": 70,
  "400": 60,
  "500": 48,
  "600": 40,
  "700": 32,
  "800": 24,
  "900": 16,
};

/**
 * Convierte "#1b9aaa" a sus componentes HSL.
 * Admite también la forma corta de tres dígitos ("#1ba").
 */
export function hexAHsl(colorHexadecimal: string): ColorHsl {
  const hexLimpio = normalizarHex(colorHexadecimal);

  const rojo = parseInt(hexLimpio.slice(0, 2), 16) / 255;
  const verde = parseInt(hexLimpio.slice(2, 4), 16) / 255;
  const azul = parseInt(hexLimpio.slice(4, 6), 16) / 255;

  const maximo = Math.max(rojo, verde, azul);
  const minimo = Math.min(rojo, verde, azul);
  const amplitud = maximo - minimo;

  const luminosidad = (maximo + minimo) / 2;

  // Un gris puro no tiene matiz ni saturación definidos.
  if (amplitud === 0) {
    return { matiz: 0, saturacion: 0, luminosidad: redondear(luminosidad * 100) };
  }

  const saturacion =
    luminosidad > 0.5 ? amplitud / (2 - maximo - minimo) : amplitud / (maximo + minimo);

  let matiz: number;

  if (maximo === rojo) {
    matiz = ((verde - azul) / amplitud + (verde < azul ? 6 : 0)) / 6;
  } else if (maximo === verde) {
    matiz = ((azul - rojo) / amplitud + 2) / 6;
  } else {
    matiz = ((rojo - verde) / amplitud + 4) / 6;
  }

  return {
    matiz: redondear(matiz * 360),
    saturacion: redondear(saturacion * 100),
    luminosidad: redondear(luminosidad * 100),
  };
}

/**
 * Limpia y valida un hexadecimal. Si llega algo que no lo es, se
 * devuelve el color por defecto en lugar de dejar la interfaz sin color.
 */
function normalizarHex(colorHexadecimal: string): string {
  const sinAlmohadilla = (colorHexadecimal || "").trim().replace(/^#/, "");

  if (/^[0-9a-fA-F]{3}$/.test(sinAlmohadilla)) {
    // Forma corta: se duplica cada dígito ("1ba" → "11bbaa").
    return sinAlmohadilla
      .split("")
      .map((digito) => digito + digito)
      .join("");
  }

  if (/^[0-9a-fA-F]{6}$/.test(sinAlmohadilla)) {
    return sinAlmohadilla;
  }

  return COLOR_ACENTO_POR_DEFECTO.replace("#", "");
}

function redondear(numero: number): number {
  return Math.round(numero * 10) / 10;
}

/** Formatea un HSL como lo espera HeroUI: "187 72% 39%". */
function comoVariableCss({ matiz, saturacion, luminosidad }: ColorHsl): string {
  return `${matiz} ${saturacion}% ${luminosidad}%`;
}

/**
 * Decide si el texto sobre este color debe ser blanco o casi negro.
 *
 * Se calcula la luminancia relativa según la fórmula de WCAG, no la
 * luminosidad de HSL: dos colores con la misma L pueden tener contrastes
 * muy distintos (un amarillo y un azul, por ejemplo), y de ahí salen los
 * botones con texto blanco ilegible.
 */
export function colorDeTextoLegibleSobre(colorHexadecimal: string): string {
  const hexLimpio = normalizarHex(colorHexadecimal);

  const canales = [0, 2, 4].map((posicion) => {
    const valorLineal = parseInt(hexLimpio.slice(posicion, posicion + 2), 16) / 255;

    return valorLineal <= 0.03928
      ? valorLineal / 12.92
      : Math.pow((valorLineal + 0.055) / 1.055, 2.4);
  });

  const luminanciaRelativa =
    0.2126 * canales[0] + 0.7152 * canales[1] + 0.0722 * canales[2];

  // 0.45 es el punto en el que el contraste con blanco y con negro se
  // iguala aproximadamente; por encima, el texto oscuro lee mejor.
  return luminanciaRelativa > 0.45 ? "0 0% 8%" : "0 0% 100%";
}

/**
 * Aplica el color de acento a toda la interfaz.
 *
 * Escribe las variables directamente en <html>, que es lo que permite
 * que el cambio se vea al instante y sin volver a renderizar nada.
 *
 * @param colorHexadecimal Color elegido por el usuario (#rrggbb).
 * @param enModoOscuro     Si está activo el tema oscuro: la rampa se
 *                         invierte para que el tono claro sea el que
 *                         destaque sobre el fondo.
 */
export function aplicarColorDeAcento(
  colorHexadecimal: string,
  enModoOscuro: boolean,
): void {
  const raiz = document.documentElement;
  const colorBase = hexAHsl(colorHexadecimal);

  const peldanos = Object.entries(LUMINOSIDAD_POR_PELDANO);

  peldanos.forEach(([peldano, luminosidadObjetivo]) => {
    // En oscuro se lee la rampa al revés: el 50 pasa a ser el tono más
    // oscuro y el 900 el más claro.
    const luminosidadAplicada = enModoOscuro
      ? 100 - luminosidadObjetivo
      : luminosidadObjetivo;

    raiz.style.setProperty(
      `--heroui-primary-${peldano}`,
      comoVariableCss({ ...colorBase, luminosidad: luminosidadAplicada }),
    );
  });

  // El color "primario" a secas: en oscuro se aclara un poco para que no
  // se hunda en el fondo, y en claro se usa tal cual lo eligió la
  // persona, que es lo que espera ver.
  const colorPrincipal = enModoOscuro
    ? { ...colorBase, luminosidad: Math.min(72, colorBase.luminosidad + 14) }
    : colorBase;

  raiz.style.setProperty("--heroui-primary", comoVariableCss(colorPrincipal));

  // Texto sobre el color primario, y anillo de foco a juego.
  raiz.style.setProperty(
    "--heroui-primary-foreground",
    colorDeTextoLegibleSobre(colorHexadecimal),
  );
  raiz.style.setProperty("--heroui-focus", comoVariableCss(colorPrincipal));

  // Se guarda el hexadecimal como atributo para poder leerlo desde CSS
  // o desde las herramientas del navegador al depurar.
  raiz.setAttribute("data-acento", colorHexadecimal);
}
