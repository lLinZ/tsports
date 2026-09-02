/**
 * utilidades/formato.ts
 * ---------------------------------------------------------------------
 * Cómo se enseñan los números y las fechas en toda la interfaz.
 *
 * Está centralizado para que un importe se vea igual en el tablero, en
 * la ficha y en los informes. En la versión anterior cada fichero tenía
 * su propia función `money()` y las tres daban resultados distintos.
 * ---------------------------------------------------------------------
 */

/**
 * Importes en dólares. El CRM trabaja siempre en USD, así que el símbolo
 * va fijo y no se localiza.
 *
 * Sin decimales a propósito: los patrocinios se hablan en miles y los
 * céntimos solo añaden ruido a las cifras del tablero.
 */
const formateadorDeDinero = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatearDinero(importe: number | null | undefined): string {
  return formateadorDeDinero.format(Number(importe) || 0);
}

/**
 * Versión abreviada para las tarjetas de métricas, donde no cabe la
 * cifra completa: 1 250 000 → "$1,25 M".
 */
export function formatearDineroAbreviado(importe: number | null | undefined): string {
  const cantidad = Number(importe) || 0;

  if (Math.abs(cantidad) >= 1_000_000) {
    return `$${(cantidad / 1_000_000).toLocaleString("es", {
      maximumFractionDigits: 2,
    })} M`;
  }

  if (Math.abs(cantidad) >= 10_000) {
    return `$${(cantidad / 1_000).toLocaleString("es", {
      maximumFractionDigits: 1,
    })} k`;
  }

  return formatearDinero(cantidad);
}

/** Números enteros con separador de miles (1234 → "1.234"). */
export function formatearNumero(valor: number | null | undefined): string {
  return (Number(valor) || 0).toLocaleString("es");
}

/**
 * Porcentajes de la relación entre montos (6,76 % de 7.400 son 500).
 *
 * Con un decimal como mucho, y sin él cuando la cifra es redonda: en una
 * barra estrecha "20 %" se lee de un vistazo y "20,0 %" no aporta nada.
 * Por debajo del 0,1 % se escribe "<0,1 %" en vez de un "0 %" que haría
 * pensar que no hay nada pronosticado.
 */
export function formatearPorcentaje(valor: number | null | undefined): string {
  const porcentaje = Number(valor) || 0;

  if (porcentaje > 0 && porcentaje < 0.1) return "<0,1 %";

  return `${porcentaje.toLocaleString("es", { maximumFractionDigits: 1 })} %`;
}

/* ==================================================================== */
/* Fechas                                                              */
/* ==================================================================== */

/** Convierte una fecha ISO del servidor a Date, o null si no es válida. */
function comoFecha(fechaIso: string | null | undefined): Date | null {
  if (!fechaIso) return null;

  // Una fecha SIN hora ("2026-09-20") la interpreta el navegador como
  // medianoche UTC. Al pintarla en un huso negativo —Venezuela es
  // UTC-4— se retrocede a las 20:00 del día anterior y la fecha se ve
  // corrida un día: una acción del 20 aparecía como "19 sept".
  //
  // Por eso se construye a mano como fecha LOCAL: estas cadenas
  // representan un día del calendario, no un instante en el tiempo.
  const esSoloUnDia = /^\d{4}-\d{2}-\d{2}$/.test(fechaIso);

  if (esSoloUnDia) {
    const [anio, mes, dia] = fechaIso.split("-").map(Number);

    // El mes va de 0 a 11 en el constructor de Date.
    const fechaLocal = new Date(anio, mes - 1, dia);

    return Number.isNaN(fechaLocal.getTime()) ? null : fechaLocal;
  }

  // Las marcas de tiempo completas sí llevan zona horaria dentro y se
  // convierten solas al huso de quien mira.
  const fecha = new Date(fechaIso);

  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Fecha corta: "24 ago 2026". */
export function formatearFecha(fechaIso: string | null | undefined): string {
  const fecha = comoFecha(fechaIso);

  if (fecha === null) return "—";

  return fecha.toLocaleDateString("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Fecha y hora: "24 ago, 14:05". */
export function formatearFechaYHora(fechaIso: string | null | undefined): string {
  const fecha = comoFecha(fechaIso);

  if (fecha === null) return "—";

  return fecha.toLocaleString("es", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Tiempo relativo: "hace 5 minutos", "hace 3 días".
 *
 * Es lo que se usa en la bitácora y en el historial de actividad: para
 * saber si algo acaba de pasar, "hace 5 minutos" se entiende de un
 * vistazo y una fecha exacta no.
 */
export function formatearTiempoRelativo(fechaIso: string | null | undefined): string {
  const fecha = comoFecha(fechaIso);

  if (fecha === null) return "—";

  const formateador = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  const segundosTranscurridos = (fecha.getTime() - Date.now()) / 1000;

  const escalas: Array<{ limite: number; unidad: Intl.RelativeTimeFormatUnit; divisor: number }> = [
    { limite: 60, unidad: "second", divisor: 1 },
    { limite: 3600, unidad: "minute", divisor: 60 },
    { limite: 86_400, unidad: "hour", divisor: 3600 },
    { limite: 604_800, unidad: "day", divisor: 86_400 },
    { limite: 2_592_000, unidad: "week", divisor: 604_800 },
    { limite: 31_536_000, unidad: "month", divisor: 2_592_000 },
  ];

  const escalaAplicable = escalas.find(
    (escala) => Math.abs(segundosTranscurridos) < escala.limite,
  );

  if (escalaAplicable === undefined) {
    return formateador.format(
      Math.round(segundosTranscurridos / 31_536_000),
      "year",
    );
  }

  return formateador.format(
    Math.round(segundosTranscurridos / escalaAplicable.divisor),
    escalaAplicable.unidad,
  );
}

/* ==================================================================== */
/* Texto                                                               */
/* ==================================================================== */

/**
 * Iniciales para el avatar de un usuario o el marcador de una marca sin
 * logo: "Refrescos del Caribe" → "RC".
 */
export function inicialesDe(nombreCompleto: string | null | undefined): string {
  const palabras = (nombreCompleto || "")
    .trim()
    .split(/\s+/)
    .filter((palabra) => palabra.length > 0);

  if (palabras.length === 0) return "?";

  if (palabras.length === 1) {
    return palabras[0].slice(0, 2).toUpperCase();
  }

  return (palabras[0][0] + palabras[palabras.length - 1][0]).toUpperCase();
}

/** Corta un texto largo añadiendo puntos suspensivos. */
export function recortarTexto(texto: string, longitudMaxima: number): string {
  if (texto.length <= longitudMaxima) return texto;

  return `${texto.slice(0, longitudMaxima - 1).trimEnd()}…`;
}

/**
 * Enumera una lista en lenguaje natural:
 * ["logo", "cargo", "email"] → "logo, cargo y email".
 *
 * Se usa para decir qué datos le faltan a una marca; leído así se
 * entiende mucho mejor que una lista separada por comas a secas.
 */
export function enumerarEnEspanol(elementos: string[]): string {
  if (elementos.length === 0) return "";
  if (elementos.length === 1) return elementos[0];

  const todosMenosElUltimo = elementos.slice(0, -1).join(", ");

  return `${todosMenosElUltimo} y ${elementos[elementos.length - 1]}`;
}

/** Construye un enlace de WhatsApp a partir de un teléfono con formato. */
export function enlaceDeWhatsapp(telefono: string, mensaje?: string): string {
  const soloDigitos = (telefono || "").replace(/\D/g, "");
  const textoCodificado = mensaje ? `?text=${encodeURIComponent(mensaje)}` : "";

  return `https://wa.me/${soloDigitos}${textoCodificado}`;
}
