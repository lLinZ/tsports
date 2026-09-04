/**
 * tipos/modelos.ts
 * ---------------------------------------------------------------------
 * Los tipos de todo lo que devuelve la API, escritos una sola vez.
 *
 * Deben coincidir campo a campo con los recursos del backend
 * (backend/app/Http/Resources/*.php). Si se añade una columna allí, se
 * añade aquí: es el contrato entre las dos mitades del sistema y lo que
 * hace que un cambio de nombre en el servidor rompa la compilación del
 * cliente en lugar de aparecer como un `undefined` en pantalla.
 * ---------------------------------------------------------------------
 */

/* ==================================================================== */
/* Usuarios y sesión                                                    */
/* ==================================================================== */

/** Los tres perfiles de acceso. Coincide con el enum RolUsuario de PHP. */
export type RolUsuario = "admin" | "comercial" | "vendedor";

/** Preferencia de apariencia. "sistema" sigue al sistema operativo. */
export type PreferenciaDeTema = "claro" | "oscuro" | "sistema";

/**
 * Capacidades ya resueltas por el servidor. La interfaz consulta estas
 * banderas en lugar de comparar roles, así las reglas de permisos viven
 * en un único sitio (el enum RolUsuario del backend).
 */
export interface PermisosDelUsuario {
  administraElSistema: boolean;
  editaCualquierMarca: boolean;
  asignaVendedores: boolean;
  eliminaMarcas: boolean;
  editaLaWeb: boolean;
  /** Da de alta propiedades (productos IOP) y campañas, y las reparte. */
  gestionaElCatalogoComercial: boolean;
  /**
   * ¿Ve las cifras de TODA la agencia, o solo las suyas? Es la que
   * decide la forma del panel de resumen y del calendario.
   */
  veLasCifrasDeTodaLaEmpresa: boolean;
}

export interface Usuario {
  id: string;
  nombre: string;
  /** Solo llega si quien pregunta tiene derecho a verlo. */
  email?: string;
  rol: RolUsuario;
  rolEtiqueta: string;
  zona: string | null;
  activo: boolean;
  tema: PreferenciaDeTema;
  /** Color de acento del perfil, en hexadecimal (#rrggbb). */
  colorAcento: string;
  urlAvatar: string | null;
  permisos: PermisosDelUsuario;
  creadoEn: string | null;
  ultimoAccesoEn: string | null;
}

/* ==================================================================== */
/* Propiedades (los productos IOP) y campañas                           */
/* ==================================================================== */

/** Una persona del equipo, tal y como la lista una propiedad. */
export interface ProspectorAsignado {
  id: string;
  nombre: string;
  zona: string | null;
}

/**
 * Un producto IOP del catálogo: lo que la agencia vende.
 *
 * Los tres montos del producto, y de dónde sale cada uno:
 *
 *   · `montoTotalUsd`      (MTP) → el valor total de la propiedad.
 *   · `forecastDeVentaUsd`       → la meta: su porcentaje del MTP. Llega
 *                                  calculada del servidor para que las
 *                                  dos mitades cuenten lo mismo.
 *   · el OVP no está aquí: es de cada marca, y vive en
 *     `LineaDeChecklistDePropiedad`.
 */
export interface Propiedad {
  id: string;
  nombre: string;
  descripcion: string | null;
  logoUrl: string | null;

  montoTotalUsd: number;
  porcentajeForecast: number;
  forecastDeVentaUsd: number;

  /** Con `true` la puede ofrecer todo el equipo. */
  asignadaATodos: boolean;
  /** Solo llega si el servidor cargó la relación. */
  prospectores?: ProspectorAsignado[];

  orden: number;
  activa: boolean;

  /** Solo llegan cuando se pide el catálogo con totales. */
  totalMarcas?: number;
  ovpAcumuladoUsd?: number;

  /** Si quien pregunta puede añadirla al checklist de una marca. */
  laPuedoOfrecer: boolean;
  puedoEditarla: boolean;
  puedoEliminarla: boolean;

  creadaEn: string | null;
  actualizadaEn: string | null;
}

/** Cuerpo que se envía al crear o editar una propiedad. */
export interface DatosDePropiedadParaGuardar {
  nombre: string;
  descripcion: string | null;
  logoUrl: string | null;
  montoTotalUsd: number;
  porcentajeForecast: number;
  asignadaATodos: boolean;
  prospectoresIds: string[];
  orden: number;
  activa: boolean;
}

/**
 * Una línea del checklist de prospección de una marca: qué propiedad se
 * le está ofreciendo y cuánto se pronostica venderle dentro de ella.
 *
 * Trae los tres montos juntos para poder pintar la barra sin cruzar el
 * catálogo en el navegador.
 */
export interface LineaDeChecklistDePropiedad {
  id: string;
  propiedadId: string;
  propiedadNombre: string;
  propiedadLogoUrl: string | null;
  propiedadActiva: boolean;

  /** MTP de la propiedad: el 100 % contra el que se mide el pronóstico. */
  montoTotalUsd: number;
  porcentajeForecast: number;
  forecastDeVentaUsd: number;

  /** OVP: lo que el vendedor pronostica vender de esta propiedad. */
  ovpUsd: number;
  /** Ya calculado en el servidor: OVP ÷ MTP × 100. */
  porcentajeSobreElTotal: number;

  nota: string | null;
}

/** Una línea del checklist tal y como viaja al guardar la ficha. */
export interface LineaDeChecklistParaGuardar {
  propiedadId: string;
  ovpUsd: number;
  nota: string | null;
}

/** Una campaña comercial. */
export interface Campana {
  id: string;
  nombre: string;
  descripcion: string | null;
  /** Hexadecimal del distintivo en el tablero. */
  color: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  orden: number;
  activa: boolean;
  /** Calculado en el servidor: activa y dentro de sus fechas. */
  estaVigente: boolean;
  totalMarcas?: number;
  puedoEditarla: boolean;
  puedoEliminarla: boolean;
  creadaEn: string | null;
  actualizadaEn: string | null;
}

/** Cuerpo que se envía al crear o editar una campaña. */
export interface DatosDeCampanaParaGuardar {
  nombre: string;
  descripcion: string | null;
  color: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  orden: number;
  activa: boolean;
}

/* ==================================================================== */
/* Marcas (el CRM)                                                      */
/* ==================================================================== */

/** Etapa resumida que el servidor deriva de las tres fases. */
export type EtapaDeMarca =
  | "sin_iniciar"
  | "aproximacion"
  | "prospeccion"
  | "propuesta"
  | "completa";

/** Si la marca ya invierte hoy en patrocinios. */
export type InversionEnPatrocinios = "desconocido" | "si" | "no";

/** De dónde salió el registro. */
export type OrigenDeMarca = "manual" | "web";

export interface Marca {
  id: string;

  // --- Identificación ---
  nombreMarca: string;
  sector: string | null;
  logoUrl: string | null;
  zona: string | null;
  invierteActualmente: InversionEnPatrocinios;
  invierteEtiqueta: string;
  viaProspeccion: string | null;

  // --- Campaña comercial ---
  campanaId: string | null;
  /** Llegan solo si el servidor cargó la relación (listado y ficha). */
  campanaNombre?: string | null;
  campanaColor?: string | null;
  /**
   * El día en que se hace la acción de campaña, en formato AAAA-MM-DD.
   * Es lo que sitúa la marca en el calendario del panel. Va siempre
   * acompañada de campaña: el servidor exige la una con la otra.
   */
  fechaCampana: string | null;
  /**
   * El historial de acciones de campaña. Llega solo al pedir la ficha
   * completa, no en el listado del tablero.
   */
  historialDeCampanas?: AccionDeCampanaEnElHistorial[];

  // --- Persona de contacto ---
  personaContacto: string | null;
  cargoContacto: string | null;
  emailContacto: string | null;
  telefonoContacto: string | null;
  notas: string | null;

  // --- Avance del proceso comercial ---
  /** Se calcula en el servidor; no se puede marcar a mano. */
  faseProspeccionCompletada: boolean;
  faseAproximacionCompletada: boolean;
  viaAproximacion: string | null;
  fasePropuestaCompletada: boolean;
  descripcionPropuesta: string | null;
  valorAnualUsd: number;

  /** Etapa resumida, ya calculada por el servidor. */
  etapa: EtapaDeMarca;
  /** Qué datos faltan para cerrar la prospección, en palabras. */
  datosQueFaltan: string[];

  // --- Checklist de propiedades (los productos IOP) ---
  /** Qué propiedades se le están ofreciendo, con su pronóstico. */
  propiedadesOfrecidas?: LineaDeChecklistDePropiedad[];
  /** Suma de los pronósticos de todas ellas. */
  ovpTotalUsd?: number;

  // --- Responsables ---
  registradaPorId: string | null;
  registradaPorNombre: string | null;
  vendedorAsignadoId: string | null;
  vendedorAsignadoNombre: string | null;
  estaSinDuenio: boolean;

  origen: OrigenDeMarca;
  origenEtiqueta: string;

  // --- Permisos de quien consulta ---
  /** Si es false, la interfaz deshabilita los controles de edición. */
  puedeEditarla: boolean;
  puedeEliminarla: boolean;

  totalComentarios?: number;
  comentarios?: ComentarioDeMarca[];

  creadaEn: string | null;
  actualizadaEn: string | null;
}

/** Cuerpo que se envía al crear o editar una marca. */
export interface DatosDeMarcaParaGuardar {
  nombreMarca: string;
  sector: string | null;
  logoUrl: string | null;
  zona: string | null;
  campanaId: string | null;
  /** Obligatoria en cuanto se asigna una campaña. AAAA-MM-DD. */
  fechaCampana: string | null;
  invierteActualmente: InversionEnPatrocinios;
  viaProspeccion: string | null;
  personaContacto: string | null;
  cargoContacto: string | null;
  emailContacto: string | null;
  telefonoContacto: string | null;
  notas: string | null;
  faseAproximacionCompletada: boolean;
  viaAproximacion: string | null;
  fasePropuestaCompletada: boolean;
  descripcionPropuesta: string | null;
  valorAnualUsd: number;
  /** Solo lo aplica el servidor si quien envía puede asignar. */
  vendedorAsignadoId?: string | null;
  /**
   * El checklist de propiedades. Si NO se envía la clave, el servidor
   * deja el checklist como estaba; si se envía vacía, lo vacía.
   */
  propiedades?: LineaDeChecklistParaGuardar[];
}

/** Filtros del tablero, tal y como viajan en la consulta. */
export interface FiltrosDeMarcas {
  busqueda: string;
  etapa: EtapaDeMarca | "";
  zona: string;
  sector: string;
  vendedor: string;
  /** Id de campaña, o "sin_campana" para las que no tienen ninguna. */
  campana: string;
  /** Id de la propiedad que se les está ofreciendo. */
  propiedad: string;
  /** Si invierte hoy en marketing deportivo. */
  invierte: InversionEnPatrocinios | "";
  orden: "recientes" | "antiguas" | "valor_desc" | "valor_asc" | "nombre";
}

/* ==================================================================== */
/* Bitácora                                                             */
/* ==================================================================== */

export interface ComentarioDeMarca {
  id: string;
  marcaId: string;
  autorId: string | null;
  autorNombre: string;
  cuerpo: string;
  puedeBorrarlo: boolean;
  creadoEn: string | null;
}

/* ==================================================================== */
/* Panel de métricas                                                    */
/* ==================================================================== */

export interface ContadoresDelPanel {
  totalMarcas: number;
  enAproximacion: number;
  enProspeccion: number;
  conPropuesta: number;
  valorPropuestoAnual: number;
  sinAsignar: number;
  /** Meta de venta de todo el catálogo: la suma de los forecast. */
  forecastDePropiedades: number;
  /** Lo que el equipo pronostica vender de esas propiedades (OVP). */
  ovpPronosticado: number;
}

export interface ResumenDeZona {
  zona: string;
  total: number;
  aproximacion: number;
  prospeccion: number;
  propuesta: number;
  valor: number;
}

export interface ResumenDeSector {
  sector: string;
  total: number;
  valor: number;
}

export interface ResumenDeVendedor {
  vendedorId: string;
  vendedorNombre: string;
  total: number;
  propuestas: number;
  valor: number;
}

export interface RegistroDeActividad {
  id: number;
  usuarioId: string | null;
  usuarioNombre: string;
  accion: string;
  entidadTipo: string;
  entidadId: string | null;
  descripcion: string;
  metadatos: Record<string, unknown> | null;
  creadoEn: string | null;
}

/**
 * Empresas por zona según si ya invierten en marketing deportivo. Es el
 * informe con el que se decide dónde apretar: una zona llena de marcas
 * que ya patrocinan tiene ventas más cortas por delante.
 */
export interface ResumenDeInversionPorZona {
  zona: string;
  total: number;
  siInvierte: number;
  noInvierte: number;
  sinDefinir: number;
}

/** Los tres montos de una propiedad, con lo que lleva pronosticado. */
export interface ResumenDePropiedad {
  propiedadId: string;
  nombre: string;
  logoUrl: string | null;
  activa: boolean;
  montoTotalUsd: number;
  porcentajeForecast: number;
  forecastDeVentaUsd: number;
  ovpAcumuladoUsd: number;
  totalMarcas: number;
  /** OVP ÷ MTP: la proporción que se pinta en la barra. */
  porcentajeSobreElTotal: number;
  /** OVP ÷ meta: cuánto del forecast acordado se lleva cubierto. */
  porcentajeSobreLaMeta: number;
}

/** Cuánto pronostica vender cada prospector, sumando sus marcas. */
export interface ResumenDeForecastPorProspector {
  vendedorId: string | null;
  vendedorNombre: string;
  ovpUsd: number;
  totalMarcas: number;
  totalPropiedades: number;
}

export interface ResumenDeCampana {
  campanaId: string | null;
  nombre: string;
  color: string;
  activa: boolean;
  estaVigente: boolean;
  total: number;
  valor: number;
}

/**
 * Las cifras de quien está mirando el panel: solo sus marcas.
 *
 * Los demás bloques del resumen hablan de todo el equipo, que es lo que
 * necesita quien reparte trabajo. A quien tiene doce marcas asignadas,
 * saber que en total hay setenta y una no le dice nada sobre su día.
 */
export interface MisNumerosDelPanel {
  totalMarcas: number;
  enAproximacion: number;
  enProspeccion: number;
  conPropuesta: number;
  valorPropuestoAnual: number;
  /** Lo que pronostica vender de las propiedades que ofrece (regla 11). */
  miPronostico: number;
  /** Acciones de campaña que tiene de hoy en adelante. */
  accionesPorDelante: number;
}

/** Una propiedad que el agente está ofreciendo, con SU pronóstico. */
export interface MiPropiedadDelPanel {
  propiedadId: string;
  nombre: string;
  /** Lo que él pronostica, sumando sus marcas. */
  ovpUsd: number;
  /** Cuántas de SUS marcas la tienen en el checklist. */
  totalMarcas: number;
}

/** Cómo se reparten las marcas del agente entre campañas. */
export interface MiCampanaDelPanel {
  campanaId: string | null;
  nombre: string;
  color: string;
  total: number;
}

/**
 * El panel de quien ve las cifras de toda la agencia: admin y comercial.
 * Es el cuadro con el que se reparte el trabajo.
 */
export interface ResumenDeLaEmpresa {
  alcance: "empresa";
  contadores: ContadoresDelPanel;
  misNumeros: MisNumerosDelPanel;
  porZona: ResumenDeZona[];
  porSector: ResumenDeSector[];
  porVendedor: ResumenDeVendedor[];
  inversionPorZona: ResumenDeInversionPorZona[];
  propiedades: ResumenDePropiedad[];
  forecastPorProspector: ResumenDeForecastPorProspector[];
  porCampana: ResumenDeCampana[];
  actividadReciente: RegistroDeActividad[];
}

/**
 * El panel de un agente: solo su cartera.
 *
 * No trae ni una cifra de la agencia. No es que se escondan al pintar:
 * el servidor ni las calcula ni las envía, así que tampoco se pueden
 * leer desde el inspector del navegador.
 */
export interface ResumenDelAgente {
  alcance: "personal";
  misNumeros: MisNumerosDelPanel;
  misPropiedades: MiPropiedadDelPanel[];
  misCampanas: MiCampanaDelPanel[];
}

/**
 * Lo que devuelve /api/panel/resumen. El campo `alcance` distingue las
 * dos formas, así que TypeScript obliga a comprobarlo antes de leer
 * cualquier cifra de la agencia.
 */
export type ResumenDelPanel = ResumenDeLaEmpresa | ResumenDelAgente;

/* ==================================================================== */
/* Calendario e historial de acciones de campaña                        */
/* ==================================================================== */

/**
 * Una línea del historial de una marca.
 *
 * El nombre y el color vienen copiados dentro del evento, no de la
 * campaña: así el historial sigue siendo legible aunque esa campaña se
 * renombre o se borre después.
 */
export interface AccionDeCampanaEnElHistorial {
  id: string;
  /** Hace falta para preseleccionar la campaña al corregir la acción. */
  campanaId: string | null;
  campanaNombre: string;
  campanaColor: string;
  /** AAAA-MM-DD. */
  fecha: string;
  nota: string | null;
  registradoPorNombre: string | null;
  registradoEn: string | null;
  /** Banderas ya resueltas por el servidor; no se comparan roles aquí. */
  puedoEditarlo: boolean;
  puedoEliminarlo: boolean;
}

/** Cuerpo que se envía al corregir una acción del historial. */
export interface DatosDeAccionParaCorregir {
  campanaId: string;
  /** AAAA-MM-DD. */
  fecha: string;
  nota: string | null;
}

/**
 * Una acción de campaña situada en un día concreto.
 *
 * "El 10 de septiembre, visita presencial a Azúcar la Pastora": eso es
 * un evento del calendario.
 */
export interface EventoDeCalendario {
  eventoId: string;
  marcaId: string;
  marcaNombre: string;
  logoUrl: string | null;
  // Nunca nulos: se copian dentro del evento al anotarlo, y sus columnas
  // no admiten nulo. Es lo que permite que el historial siga siendo
  // legible aunque la campaña se renombre o se borre.
  campanaNombre: string;
  campanaColor: string;
  zona: string | null;
  sector: string | null;
  vendedorNombre: string | null;
}

/** Un día del calendario, con lo que toca hacer ese día. */
export interface DiaDelCalendario {
  /** AAAA-MM-DD. */
  fecha: string;
  diaDelMes: number;
  esHoy: boolean;
  /**
   * En la vista mensual, los días de relleno del mes anterior y del
   * siguiente. Se pintan apagados para que se distingan.
   */
  esDeOtroMes: boolean;
  /** Puede venir vacío: todos los días del periodo llegan siempre. */
  eventos: EventoDeCalendario[];
}

/** Las dos formas de mirar el calendario. */
export type VistaDelCalendario = "semana" | "mes";

/** Un total del reporte: "Visita presencial → 5". */
export interface TotalDelReporte {
  etiqueta: string;
  total: number;
}

/** Las cifras que resumen la semana filtrada. */
export interface ResumenDeLaSemana {
  totalDeAcciones: number;
  marcasDistintas: number;
  porCampana: TotalDelReporte[];
  porZona: TotalDelReporte[];
  porVendedor: TotalDelReporte[];
}

export interface PeriodoDelCalendario {
  periodo: {
    vista: VistaDelCalendario;
    /** Primer día de la rejilla, AAAA-MM-DD. */
    desde: string;
    /** Último día de la rejilla, AAAA-MM-DD. */
    hasta: string;
    /** El día que se pidió; sirve para saltar al periodo vecino. */
    dia: string;
    /** Ya redactada: "8 – 14 de septiembre" o "Septiembre de 2026". */
    etiqueta: string;
    esElPeriodoActual: boolean;
    /**
     * De quién es esta agenda: `true` cuando el servidor la ha acotado a
     * las marcas de quien pregunta. Lo dice él porque es él quien filtra;
     * aquí no se comparan roles.
     */
    esSoloMia: boolean;
  };
  dias: DiaDelCalendario[];
  resumen: ResumenDeLaSemana;
}

/* ==================================================================== */
/* Catálogos                                                            */
/* ==================================================================== */

export interface OpcionDeCatalogo {
  valor: string;
  etiqueta: string;
}

export interface ColorDeAcento {
  nombre: string;
  hex: string;
}

export interface CatalogosDelSistema {
  zonas: string[];
  /** Reparto por defecto sobre el MTP al crear una propiedad (20 %). */
  porcentajeForecastPorDefecto: number;
  sectores: string[];
  viasDeProspeccion: string[];
  viasDeAproximacion: string[];
  coloresDeAcento: ColorDeAcento[];
  roles: OpcionDeCatalogo[];
  temas: OpcionDeCatalogo[];
  opcionesDeInversion: OpcionDeCatalogo[];
}

/* ==================================================================== */
/* Contenido de la web pública                                          */
/* ==================================================================== */

/** Idiomas en los que se publica la web. */
export type IdiomaDeLaWeb = "es" | "en";

export interface ColoresDeLaWeb {
  azulPrincipal: string;
  azulSecundario: string;
  acento: string;
  acentoVerde: string;
  fondoAlterno: string;
}

export interface ImagenesDeLaWeb {
  hero: string;
  heroVideo: string;
  nosotros: string;
  llamadaAccion: string;
}

export interface ContactoDeLaWeb {
  email: string;
  whatsapp: string;
  instagram: string;
  linkedin: string;
}

/** Un servicio de la web, con su texto en los dos idiomas. */
export interface ServicioDeLaWeb {
  icono: string;
  es: { titulo: string; descripcion: string };
  en: { titulo: string; descripcion: string };
}

export interface ProyectoDeLaWeb {
  imagen: string;
  degradado: string;
  es: { etiqueta: string; titulo: string; descripcion: string };
  en: { etiqueta: string; titulo: string; descripcion: string };
}

export interface MiembroDelEquipo {
  nombre: string;
  foto: string;
  es: { cargo: string };
  en: { cargo: string };
}

export interface AliadoDeLaWeb {
  nombre: string;
  logo: string;
}

/** Diccionario de textos: clave con puntos → texto. */
export type TextosDeLaWeb = Record<string, string>;

export interface ContenidoDeLaWeb {
  colores: ColoresDeLaWeb;
  imagenes: ImagenesDeLaWeb;
  contacto: ContactoDeLaWeb;
  textos: Record<IdiomaDeLaWeb, TextosDeLaWeb>;
  servicios: ServicioDeLaWeb[];
  proyectos: ProyectoDeLaWeb[];
  equipo: MiembroDelEquipo[];
  aliados: AliadoDeLaWeb[];
}

/** Una entrada del historial de versiones del contenido. */
export interface VersionDeContenido {
  id: number;
  esLaPublicada: boolean;
  autor: string;
  nota: string | null;
  creadaEn: string | null;
}

/* ==================================================================== */
/* Formulario público de contacto                                       */
/* ==================================================================== */

export interface MensajeDeContacto {
  nombre: string;
  email: string;
  empresa: string;
  telefono: string;
  mensaje: string;
  /** Trampa para robots: debe viajar siempre vacío. */
  sitioWeb: string;
}
