/**
 * utilidades/consultas.ts
 * ---------------------------------------------------------------------
 * Cuándo un fallo del servidor tapa la pantalla, y cuándo no.
 *
 * LA REGLA: un error solo sustituye al contenido si NO HAY CONTENIDO.
 *
 * Suena obvio y sin embargo el sistema hacía justo lo contrario. Las
 * pantallas preguntaban «¿hay error?» antes que «¿hay datos?», y
 * TanStack Query marca como error también el REFRESCO fallido de una
 * consulta que ya tiene datos. Resultado: el tablero se veía entero, se
 * iba la red, el refresco de fondo fallaba y la pantalla se quedaba en
 * «No se pudieron cargar los datos» — borrando delante de los ojos algo
 * que se estaba leyendo bien.
 *
 * Se notó al montar la consulta sin conexión, donde deja la función en
 * nada: se guardan los datos en el dispositivo para poder mirarlos sin
 * red y, ocho segundos después de abrir, la pantalla los tira.
 *
 * Que el dato sea de hace un rato ya se dice en su sitio, que es el
 * indicador de la barra superior («Sin conexión», con la fecha de la
 * copia). Aquí lo único que se decide es si hay algo que enseñar.
 * ---------------------------------------------------------------------
 */

/**
 * El error de una consulta, pero solo si además se quedó sin nada que
 * enseñar. Si hay datos —de esta sesión o de la copia guardada—
 * devuelve null y la pantalla sigue pintando lo que tiene.
 *
 * Vale igual para `useQuery` y para `useInfiniteQuery`: en las dos,
 * `data` es `undefined` mientras no haya llegado ninguna página.
 */
export function errorSoloSiNoHayNadaQueEnsenar(consulta: {
  error: unknown;
  data: unknown;
}): unknown {
  return consulta.data === undefined ? consulta.error : null;
}
