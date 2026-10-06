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
  /**
   * Ve todas las marcas de la agencia (admin y comercial) o solo las que
   * tiene asignadas (el agente). Decide, por ejemplo, qué dice «todas» en
   * el reporte de bitácora.
   */
  veTodasLasMarcas: boolean;
  /** Puede sacar el histórico completo de la bitácora. Hoy, el administrador. */
  sacaLaBitacoraCompleta: boolean;
  /** Ve y sube los reportes de «Cierre de mes» (admin y comercial). */
  veLosCierresDeMes: boolean;
  /** Cambia los días que tarda una marca en enfriarse. Hoy, el administrador. */
  ajustaLosUmbralesDelEstado: boolean;
  /** Pone y quita las metas de venta (quien reparte: admin y comercial). */
  fijaLasMetas: boolean;
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
 * Una pieza de la galería de una propiedad: una foto, un plano o el
 * dossier en PDF.
 *
 * `urlMiniatura` es la versión pequeña de una foto, para las rejillas;
 * null si no la hay (los documentos nunca), y entonces se usa `url`.
 */
export interface ArchivoDeGaleria {
  id: string;
  tipo: "imagen" | "documento";
  nombre: string;
  tamanoBytes: number;
  url: string;
  urlMiniatura: string | null;
  titulo: string | null;
  descripcion: string | null;
  orden: number;
  esPortada: boolean;
  /** Si sale en la web cuando la propiedad está publicada. Un PDF, nunca. */
  enLaWeb: boolean;
  subidoEn: string | null;
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

  /**
   * Si sale en la web pública. Solo sale si además está activa: una
   * desactivada deja de verse fuera aunque siga marcada.
   */
  publicadaEnLaWeb: boolean;
  /** Lo que lee el visitante. Aparte de `descripcion`, que es la nota interna. */
  textoWebEs: string | null;
  textoWebEn: string | null;

  /** Sus fotos, planos y dossier, en orden. Viaja siempre con la propiedad. */
  galeria?: ArchivoDeGaleria[];
  /** La foto pequeña de la portada, lista para una tarjeta. */
  portadaUrl?: string | null;

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
  publicadaEnLaWeb: boolean;
  textoWebEs: string | null;
  textoWebEn: string | null;
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
  /** Marcas que la tienen o la tuvieron alguna vez: la cifra que se enseña. */
  totalMarcas?: number;
  /**
   * Marcas que la tienen PUESTA hoy. Solo para avisar, antes de borrarla,
   * de cuántas se quedarán sin campaña.
   */
  marcasConLaCampanaPuesta?: number;
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

/**
 * Una fase suelta del proceso.
 *
 * No es lo mismo que `EtapaDeMarca` y la diferencia importa: la etapa
 * mete cada marca en un único cajón (con propuesta ya NO cuenta como en
 * aproximación), mientras que la fase solo dice si esa casilla está
 * marcada. Los contadores del panel cuentan fases, y por eso al pulsar
 * uno el tablero filtra por fase y no por etapa.
 */
export type FaseDeMarca = "aproximacion" | "prospeccion" | "propuesta";

/** Si la marca ya invierte hoy en patrocinios. */
export type InversionEnPatrocinios = "desconocido" | "si" | "no";

/** De dónde salió el registro. */
export type OrigenDeMarca = "manual" | "web";

/**
 * Caliente, tibia o fría. Lo calcula siempre el servidor
 * (App\Support\EstadoDeLasMarcas): la interfaz no cuenta días.
 */
export type EstadoDeMarca = "caliente" | "tibia" | "fria";

/** Qué fue lo último que movió la marca. */
export type MotivoDeMovimiento =
  | "alta"
  | "fase"
  | "valor"
  | "comentario"
  /** Una entrada de la bitácora que dejó «Contacté». */
  | "contacto"
  | "accion_de_campana";

/** Hasta cuántos días dura cada estado. Los fija el administrador. */
export interface UmbralesDelEstado {
  diasCaliente: number;
  diasTibia: number;
}

/**
 * De qué día es un recordatorio respecto a hoy, con el calendario de
 * Caracas. Lo decide el servidor: aquí no se comparan fechas.
 */
export type CuandoDelRecordatorio = "vencido" | "hoy" | "proximo";

/** Lo que la tarjeta enseña de mi próximo recordatorio. */
export interface ProximoRecordatorio {
  id: string;
  /** AAAA-MM-DD. */
  fecha: string;
  cuando: CuandoDelRecordatorio;
  /** 0 hoy, 1 mañana, negativo si ya pasó. Contado por el servidor. */
  diasHasta: number;
  nota: string | null;
}

/** Un recordatorio de seguimiento, tal como lo devuelve RecursoRecordatorio. */
export interface Recordatorio extends ProximoRecordatorio {
  personaId: string;
  personaNombre?: string | null;
  /** Si es de quien pregunta. En la ficha salen los de todo el equipo. */
  esMio: boolean;
  creadoPorNombre: string | null;
  cumplido: boolean;
  cumplidoEn: string | null;
  cumplidoPorNombre: string | null;
  /** Solo cuando hace falta reconocerla (en el panel). */
  marca?: { id: string; nombre: string; logoUrl: string | null };
  /** Si puede cumplirlo, posponerlo o borrarlo: el permiso de editar su marca. */
  puedoCambiarlo: boolean;
}

/** Lo que el panel enseña de los recordatorios de quien mira. */
export interface MisRecordatorios {
  vencidos: Recordatorio[];
  paraHoy: Recordatorio[];
  /** Los de los próximos siete días. */
  proximos: Recordatorio[];
}

/** Cómo se habló con una marca, en las entradas que deja «Contacté». */
export type TipoDeContacto = "llamada" | "whatsapp" | "reunion" | "correo";

/**
 * Lo que se envía al pulsar «Contacté»: la entrada de la bitácora y,
 * si se elige, el siguiente paso. Los «N días» los cuenta el servidor
 * desde el día de Caracas; un día concreto va en `retomarEl`. Sin
 * ninguno de los dos no se deja recordatorio («no hace falta»).
 */
export interface DatosDeContacto {
  tipo: TipoDeContacto;
  cuerpo: string;
  retomarEnDias?: number | null;
  /** AAAA-MM-DD, hoy o por delante. */
  retomarEl?: string | null;
  notaDelSiguientePaso?: string | null;
  /** El recordatorio de hoy (o vencido) que este contacto ya cumple. */
  recordatorioCumplidoId?: string | null;
}

/** Lo que se envía al dejar un recordatorio. */
export interface DatosDeRecordatorio {
  /** AAAA-MM-DD, hoy o por delante. */
  fecha: string;
  nota?: string | null;
  /** Para otra persona; solo lo acepta el servidor de quien reparte. */
  personaId?: string | null;
}

/* -------------------------------------------------------------------- */
/* El buscador único                                                     */
/* -------------------------------------------------------------------- */

/**
 * Un resultado del buscador. `enlace` viene resuelto del servidor; en una
 * persona puede ser null, y entonces se le escribe por el chat.
 */
export interface ResultadoDelBuscador {
  id: string;
  titulo: string;
  detalle: string;
  enlace: string | null;
  imagenUrl?: string | null;
  /** Solo las campañas: el color con que se pintan en todo el sistema. */
  color?: string | null;
}

export type GrupoDelBuscador = "marcas" | "propiedades" | "campanas" | "sectores" | "personas";

export interface RespuestaDelBuscador {
  texto: string;
  resultados: Record<GrupoDelBuscador, ResultadoDelBuscador[]>;
}

/** Cuántas marcas hay en cada estado. */
export interface ContadoresDeEstado {
  caliente: number;
  tibia: number;
  fria: number;
}

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

  // --- Caliente, tibia o fría (todo resuelto en el servidor) ---
  /** El que se enseña: el fijado a mano o, si no hay, el calculado. */
  estado: EstadoDeMarca;
  /** El que diría el sistema sin lo fijado a mano. */
  estadoAutomatico: EstadoDeMarca;
  /** Quién lo fijó a mano y cuándo; null si va en automático. */
  estadoFijado: { porNombre: string | null; en: string | null } | null;
  ultimoMovimiento: {
    /** El día, AAAA-MM-DD, en el calendario del equipo. */
    el: string;
    /** 0 = hoy, 1 = ayer. Ya contado por el servidor. */
    haceDias: number;
    motivo: MotivoDeMovimiento;
    etiqueta: string;
  };
  /** La próxima acción de campaña (hoy o por delante), AAAA-MM-DD. */
  proximaAccionEl: string | null;
  /** Cuántos días faltan para ella (0 = hoy). Contado por el servidor. */
  proximaAccionEnDias: number | null;

  // --- Recordatorios (solo en el tablero, acotados a quien mira) ---
  /** Mi próximo recordatorio pendiente en esta marca, para cumplirlo desde la tarjeta. */
  miProximoRecordatorio?: ProximoRecordatorio | null;
  /** Cuántos recordatorios pendientes tengo yo en esta marca. */
  misRecordatoriosPendientes?: number;

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
/**
 * Un rubro del catálogo.
 *
 * La marca guarda el sector como TEXTO, no por relación, así que
 * `totalMarcas` se cuenta por el nombre. Es el dato con el que la
 * pantalla decide si un sector se puede borrar o solo desactivar, y lo
 * que avisa de cuántas marcas arrastra un renombrado.
 */
export interface Sector {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
  totalMarcas: number;
}

/**
 * Una persona tal y como sale en el filtro por agente del tablero.
 *
 * No es una cuenta: es quien de verdad aparece llevando marcas. Puede
 * no tener cuenta (`tieneCuenta: false`) si su nombre quedó escrito en
 * las marcas y la cuenta ya no existe; en ese caso `id` es el nombre,
 * que es con lo que el servidor sabe buscarla.
 */
export interface AgenteConMarcas {
  id: string;
  nombre: string;
  totalMarcas: number;
  tieneCuenta: boolean;
}

/** Una persona tal y como sale en el filtro del historial de auditoría. */
export interface PersonaDeAuditoria {
  /** Id de su cuenta, o su nombre si ya no tiene cuenta. */
  id: string;
  nombre: string;
  totalMovimientos: number;
}

export interface FiltrosDeMarcas {
  busqueda: string;
  etapa: EtapaDeMarca | "";
  /** Una fase marcada, sin mirar las otras dos. Llega al pulsar un contador del panel. */
  fase: FaseDeMarca | "";
  zona: string;
  sector: string;
  vendedor: string;
  /**
   * Id de campaña: las marcas que la tienen o la tuvieron alguna vez.
   * "sin_campana" trae las que no han tenido ninguna.
   */
  campana: string;
  /** Id de la propiedad que se les está ofreciendo. */
  propiedad: string;
  /** Si invierte hoy en marketing deportivo. */
  invierte: InversionEnPatrocinios | "";
  /** Caliente, tibia o fría, contando lo fijado a mano. */
  estado: EstadoDeMarca | "";
  /**
   * "sin": las que no tienen ni recordatorio pendiente ni acción de
   * campaña por delante. Llega al pulsar «Sin siguiente paso» del panel.
   */
  siguientePaso: "sin" | "";
  /**
   * `ovp_propiedad` ordena por lo que se pronostica de la propiedad
   * filtrada, de más a menos. Sin `propiedad`, el servidor lo ignora.
   */
  orden: "recientes" | "antiguas" | "valor_desc" | "valor_asc" | "nombre" | "ovp_propiedad";
}

/**
 * Las cifras de la propiedad por la que se está filtrando el tablero,
 * sumadas sobre las marcas que se están mirando (con los demás filtros
 * puestos y solo las que esta persona puede ver).
 */
export interface ResumenDePropiedadFiltrada {
  propiedadId: string;
  nombre: string;
  logoUrl: string | null;
  montoTotalUsd: number;
  porcentajeForecast: number;
  forecastDeVentaUsd: number;
  ovpUsd: number;
  porcentajeSobreElTotal: number;
}

/* ==================================================================== */
/* Bitácora                                                             */
/* ==================================================================== */

/**
 * Un emoji con cuánta gente lo puso, ya agrupado por el servidor.
 *
 * Viene contado de allí y no se recuenta aquí: contar en el navegador
 * algo que el servidor ya sabe es de las cosas que este proyecto no
 * hace.
 */
export interface ReaccionDeComentario {
  emoji: string;
  total: number;
  /** ¿La puse yo? Es lo que decide si el botón sale resaltado. */
  laMia: boolean;
  /** Para poder decir quiénes al pasar por encima. */
  quienes: string[];
}

/** Alguien etiquetado en una entrada. */
export interface PersonaEtiquetada {
  id: string;
  nombre: string;
}

/**
 * Alguien a quien se PUEDE etiquetar en esta marca.
 *
 * La lista sale de quién puede ver esa marca, no del equipo entero: un
 * agente solo ve lo suyo, y la notificación de una mención lleva dentro
 * el nombre de la marca.
 */
export interface PersonaMencionable {
  id: string;
  nombre: string;
  rolEtiqueta: string;
}

/**
 * Un fichero adjunto a una entrada de la bitácora.
 *
 * Las tres direcciones vienen FIRMADAS por el servidor y caducan en uno o
 * dos días: los adjuntos viven en el disco privado, porque son de una
 * marca y una marca no la ve todo el equipo. No se guardan ni se copian a
 * mano; se piden otra vez con la bitácora.
 */
export interface AdjuntoDeComentario {
  id: string;
  tipo: "imagen" | "documento";
  nombre: string;
  tamanoBytes: number;
  url: string;
  /** Null si no hay versión pequeña: se usa `url`. */
  urlMiniatura: string | null;
  urlDescarga: string;
}

export interface ComentarioDeMarca {
  id: string;
  marcaId: string;
  /** Null si es una entrada raíz; si no, de cuál cuelga. */
  comentarioPadreId: string | null;

  autorId: string | null;
  autorNombre: string;
  cuerpo: string;
  /** Solo en las entradas que dejó «Contacté». */
  tipoDeContacto: { valor: TipoDeContacto; etiqueta: string } | null;

  /**
   * Una entrada eliminada NO desaparece: se queda sin texto y diciendo
   * quién la quitó. Es lo que hace que el histórico exportado valga
   * como registro.
   */
  eliminado: boolean;
  eliminadoPorNombre: string | null;
  eliminadoEn: string | null;

  /** Null mientras no se haya tocado. */
  editadoEn: string | null;

  reacciones: ReaccionDeComentario[];
  mencionados: PersonaEtiquetada[];
  /** Lo que se envió con la entrada. Se cuelga al publicar y no cambia. */
  adjuntos: AdjuntoDeComentario[];

  /** Solo las entradas raíz las traen; las respuestas no anidan. */
  respuestas: ComentarioDeMarca[];

  puedeEditarlo: boolean;
  puedeBorrarlo: boolean;
  creadoEn: string | null;
}

/** Cuerpo que se envía al escribir o corregir una entrada. */
export interface DatosDeComentario {
  cuerpo: string;
  /** Ids de las personas etiquetadas. El servidor vuelve a filtrarlos. */
  menciones: string[];
  /** Solo al responder: de qué entrada cuelga. */
  comentarioPadreId?: string | null;
  /**
   * Solo al publicar: los ficheros ya subidos que lleva. Al corregir no
   * se mandan, porque los adjuntos no cambian una vez publicados.
   */
  adjuntos?: string[];
}

/** Un adjunto tal como sale en el histórico y en el reporte. */
export interface AdjuntoDelHistorico {
  nombre: string;
  tipo: "imagen" | "documento";
  tamanoBytes: number;
  /** Firmado y con caducidad: para abrirlo desde el reporte en pantalla. */
  url: string | null;
}

/** Una entrada tal como sale en el histórico que se descarga. */
export interface EntradaDelHistorico {
  id: string;
  marcaNombre: string;
  esRespuesta: boolean;
  autorNombre: string;
  fecha: string | null;
  cuerpo: string;
  /** «Llamada», «WhatsApp»… en las que dejó «Contacté». */
  tipoDeContacto: string | null;
  editado: boolean;
  eliminado: boolean;
  eliminadoPorNombre: string | null;
  mencionados: string[];
  totalReacciones: number;
  adjuntos: AdjuntoDelHistorico[];
}

/** El histórico completo de una marca, o de toda la agencia. */
export interface HistoricoDeBitacora {
  alcance: "marca" | "completa";
  marcaNombre: string | null;
  generadoEn: string;
  generadoPor: string;
  entradas: EntradaDelHistorico[];
}

/** Una marca en el buscador corto (etiquetar en el chat, acotar un reporte). */
export interface SugerenciaDeMarca {
  id: string;
  nombre: string;
  logoUrl: string | null;
  sector: string | null;
  zona: string | null;
}

/** Una entrada del reporte por fechas. */
export interface EntradaDelReporte extends EntradaDelHistorico {
  /**
   * Solo en una respuesta cuya entrada quedó FUERA del periodo: de quién
   * era y qué decía, para que la respuesta se entienda sola.
   */
  respondeA: {
    autorNombre: string;
    fecha: string | null;
    /** Null si esa entrada se eliminó. */
    extracto: string | null;
  } | null;
}

/** Lo escrito en la bitácora de una marca durante el periodo. */
export interface MarcaDelReporte {
  marcaId: string;
  marcaNombre: string;
  logoUrl: string | null;
  sector: string | null;
  zona: string | null;
  agenteNombre: string | null;
  totalEntradas: number;
  entradas: EntradaDelReporte[];
}

/** El reporte de bitácora entre dos fechas, agrupado por marca. */
export interface ReporteDeBitacora {
  /** Días en formato AAAA-MM-DD, los dos incluidos. */
  desde: string;
  hasta: string;
  zonaHoraria: string;
  /** «todas» = sin marcas elegidas; «seleccion» = solo las elegidas. */
  alcance: "todas" | "seleccion";
  marcasElegidas: Array<{ id: string; nombre: string }>;
  generadoEn: string;
  generadoPor: string;
  resumen: {
    totalEntradas: number;
    totalMarcas: number;
    totalAutores: number;
    porAutor: Array<{ nombre: string; total: number }>;
  };
  /** Primero las marcas con más entradas en el periodo. */
  marcas: MarcaDelReporte[];
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
  /** Ni recordatorio pendiente ni acción por delante. */
  sinSiguientePaso: number;
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
  /** Sus marcas sin nada por delante: si lleva la cartera al día. */
  sinSiguientePaso: number;
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
  /**
   * Marcas que tienen o tuvieron la campaña alguna vez. En «Sin
   * campaña», las que no han tenido ninguna.
   */
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
  /** Sus marcas sin recordatorio pendiente ni acción por delante. */
  sinSiguientePaso: number;
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
  /** Sus marcas que tienen o tuvieron esa campaña; ver ResumenDeCampana. */
  total: number;
}

/**
 * El panel de quien ve las cifras de toda la agencia: admin y comercial.
 * Es el cuadro con el que se reparte el trabajo.
 */
/** Cuántas marcas de las que se ven están calientes, tibias y frías. */
export interface RepartoPorEstado extends ContadoresDeEstado {
  umbrales: UmbralesDelEstado;
}

/**
 * La meta del año de una persona y cuánto lleva, medido contra el OVP de
 * sus marcas. El porcentaje lo calcula el servidor; null = sin meta.
 */
export interface MetaDeUnaPersona {
  personaId: string;
  nombre: string;
  rolEtiqueta: string;
  anio: number;
  metaUsd: number | null;
  ovpUsd: number;
  porcentaje: number | null;
  fijadaPorNombre: string | null;
}

/** Las metas del equipo, para quien reparte el trabajo. */
export interface MetasDelEquipo {
  anio: number;
  personas: MetaDeUnaPersona[];
}

export interface ResumenDeLaEmpresa {
  alcance: "empresa";
  contadores: ContadoresDelPanel;
  misNumeros: MisNumerosDelPanel;
  miMeta: MetaDeUnaPersona | null;
  metasDelEquipo: MetasDelEquipo;
  porEstado: RepartoPorEstado;
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
  miMeta: MetaDeUnaPersona | null;
  porEstado: RepartoPorEstado;
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

/**
 * Un total por campaña, con el color con el que se pintan sus puntos.
 *
 * El color llega del servidor pegado al total y no se busca aquí entre
 * los eventos del periodo: es lo que permite que la leyenda del
 * calendario y el reporte hablen exactamente de lo mismo.
 */
export interface TotalPorCampanaDelReporte extends TotalDelReporte {
  color: string;
}

/** Las cifras que resumen la semana filtrada. */
export interface ResumenDeLaSemana {
  totalDeAcciones: number;
  marcasDistintas: number;
  porCampana: TotalPorCampanaDelReporte[];
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
  /**
   * Lo que puede pesar una foto o un PDF de la galería o de la bitácora.
   * Sirve para avisar antes de subir; quien manda es el servidor.
   */
  tamanoMaximoDeArchivoMb: number;
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
  /**
   * La propiedad por la que se pregunta, si se escribe desde su tarjeta
   * del catálogo. El lead nace con ella en su checklist.
   */
  propiedadId?: string;
  /** Trampa para robots: debe viajar siempre vacío. */
  sitioWeb: string;
}

/**
 * Una propiedad del catálogo tal como la ve un visitante de la web.
 * Sin montos ni documentos: solo lo que se decidió enseñar fuera.
 */
export interface PropiedadEnLaWeb {
  id: string;
  nombre: string;
  logoUrl: string | null;
  texto: Record<IdiomaDeLaWeb, string>;
  portadaUrl: string | null;
  fotos: Array<{
    id: string;
    url: string;
    urlMiniatura: string | null;
    titulo: string | null;
    descripcion: string | null;
  }>;
}

/**
 * El usuario y la contraseña de invitado con los que un cliente abre el
 * catálogo de la web. Solo lo ven admin y comercial, y en claro: es lo
 * que se le manda a cada cliente nuevo.
 */
export interface AccesoDeInvitados {
  usuario: string;
  /** Nula solo si el servidor ya no la puede leer (cambió su APP_KEY). */
  contrasena: string | null;
  cambiadoPor: string | null;
  cambiadoEn: string | null;
}

/** Lo que devuelve la puerta del catálogo al entrar con la pareja buena. */
export interface LlaveDelCatalogo {
  llave: string;
  caducaEn: string;
}

/* ==================================================================== */
/* Tiempo real                                                          */
/* ==================================================================== */

/** Lo que devuelve GET /api/tiempo-real (TiempoRealController). */
export interface ConfiguracionDeTiempoReal {
  /** Falso si el servidor no tiene Reverb encendido: no se intenta conectar. */
  activo: boolean;
  /** La clave pública de Reverb. Solo viene cuando `activo` es verdadero. */
  clave: string | null;
}

/** Una persona del equipo vista desde la pantalla de pruebas del tiempo real. */
export interface PersonaEnVivo {
  id: string;
  nombre: string;
  rolEtiqueta: string;
  /** Tiene ahora mismo el panel abierto y suscrito a su canal. */
  conectada: boolean;
}

/** Lo que devuelve GET /api/admin/tiempo-real (solo admin). */
export interface PanelDeTiempoReal {
  activo: boolean;
  /** Falso si no se pudo preguntar a Reverb: entonces `conectada` no significa nada. */
  seSabeQuienEstaConectado: boolean;
  personas: PersonaEnVivo[];
}

/** Lo que viaja en el evento `.prueba-de-conexion` (PruebaDeTiempoReal). */
export interface AvisoDePrueba {
  titulo: string | null;
  mensaje: string | null;
  enviadoPor: string | null;
  /** Hora del servidor al enviarlo, con milisegundos. */
  enviadaEn: string;
}

/** Respuesta de POST /api/admin/tiempo-real/prueba. */
export interface ResultadoDelAvisoDePrueba {
  enviados: number;
  mensaje: string;
}

/* ==================================================================== */
/* Notificaciones (la campanita)                                        */
/* ==================================================================== */

/**
 * Los avisos que hoy existen (Notificacion::TIPO_* en el backend). La
 * interfaz solo lo usa para elegir el icono: un tipo que aún no conozca
 * se pinta con la campana y sigue funcionando.
 */
export type TipoDeNotificacion =
  | "lead_nuevo"
  | "marca_asignada"
  | "mencion_en_bitacora"
  | "comentario_en_bitacora"
  | "recordatorios_del_dia"
  | (string & {});

/** Un aviso, tal como lo devuelve RecursoNotificacion y lo empuja Reverb. */
export interface Notificacion {
  id: string;
  tipo: TipoDeNotificacion;
  titulo: string;
  cuerpo: string | null;
  /** A dónde lleva al pulsarlo, ya resuelto por el servidor. Se sigue tal cual. */
  enlace: string | null;
  leida: boolean;
  creadaEn: string | null;
}

/* ==================================================================== */
/* Chat interno                                                         */
/* ==================================================================== */

/** Alguien del equipo, tal y como lo ve el chat. */
export interface PersonaDelChat {
  id: string;
  nombre: string;
  rolEtiqueta: string;
  colorAcento: string | null;
  urlAvatar: string | null;
  activo: boolean;
  /** Con el panel a la vista ahora mismo (ver App\Support\Presencia). */
  enLinea: boolean;
  vistoPorUltimaVezEn: string | null;
}

/** Lo último que se dijo en una charla, para la lista. */
export interface AdelantoDeMensaje {
  id: number;
  autorNombre: string;
  esMio: boolean;
  esDeSistema: boolean;
  /** En texto corrido, con las marcas etiquetadas como «#Nombre». */
  texto: string;
  creadoEn: string | null;
}

/** Una charla del chat, directa o de grupo. */
export interface ConversacionDelChat {
  id: string;
  tipo: "directa" | "grupo";
  esGrupo: boolean;
  /** El del grupo, o en una directa el de la otra persona. */
  nombre: string;
  participantes: PersonaDelChat[];
  ultimoMensaje: AdelantoDeMensaje | null;
  /** Mensajes de otros después de lo último que leí. Lo cuenta el servidor. */
  sinLeer: number;
  miUltimoLeidoId: number;
  /** Hasta qué mensaje han leído TODOS los demás: el doble check. */
  leidoPorLosDemasHasta: number;
  creadaEn: string | null;
}

/**
 * Una marca etiquetada en un mensaje, vista por quien lo lee. Sin logo
 * ni enlace si esa persona no puede abrirla: solo el nombre que le
 * contaron (regla 6).
 */
export interface MarcaEnMensaje {
  id: string;
  nombre: string;
  logoUrl: string | null;
  enlace: string | null;
}

export interface MensajeDeChat {
  /** Un número que crece: ordena y sirve de cursor. */
  id: number;
  conversacionId: string;
  tipo: "texto" | "sistema";
  autorId: string | null;
  autorNombre: string;
  esMio: boolean;
  /** Con cada marca como `[[marca:<id>]]`, en su sitio. */
  cuerpo: string;
  marcas: MarcaEnMensaje[];
  creadoEn: string | null;
}

/** Lo que se tiene cargado de una charla. */
export interface MensajesDeLaConversacion {
  mensajes: MensajeDeChat[];
  hayMasAntiguos: boolean;
  leidoPorLosDemasHasta: number;
}

/** La respuesta del latido: presencia y si hay algo nuevo. */
export interface LatidoDelChat {
  sinLeer: number;
  ultimoMensajeId: number;
  /** Ids de quienes están en línea ahora. */
  enLinea: string[];
}

/* ==================================================================== */
/* Cierre de mes                                                        */
/* ==================================================================== */

/** De qué tipo es el fichero de un reporte, para elegir su icono. */
export type FormatoDeReporte = "pdf" | "hoja" | "texto" | "presentacion" | "imagen";

/**
 * Un reporte de cierre de mes. Lo sube el comercial (o el administrador)
 * al acabar cada mes; quedan agrupados por `mes`.
 */
export interface CierreDeMes {
  id: string;
  /** El mes al que corresponde, «2026-09». No el día en que se subió. */
  mes: string;
  titulo: string;
  notas: string | null;
  /**
   * El fichero. Las dos direcciones son FIRMADAS y caducan en uno o dos
   * días: sirven para abrirlo desde la pantalla, no para copiarlas.
   */
  archivo: {
    nombre: string;
    formato: FormatoDeReporte;
    tamanoBytes: number;
    url: string;
    urlDescarga: string;
  } | null;
  subidoPor: string | null;
  subidoEn: string | null;
  puedoEliminarlo: boolean;
}

/* ==================================================================== */
/* Reporte «Pronóstico por marca»                                       */
/* ==================================================================== */

/** Lo que se le pronostica a una marca en una propiedad. */
export interface PronosticoDeUnaMarcaEnUnaPropiedad {
  propiedadId: string;
  nombre: string;
  activa: boolean;
  ovpUsd: number;
}

export interface PronosticoDeUnaMarca {
  marcaId: string;
  nombre: string;
  logoUrl: string | null;
  sector: string | null;
  zona: string | null;
  agenteNombre: string | null;
  ovpUsd: number;
  propiedades: PronosticoDeUnaMarcaEnUnaPropiedad[];
}

export interface PronosticoDeUnaPropiedad {
  propiedadId: string;
  nombre: string;
  logoUrl: string | null;
  activa: boolean;
  ovpUsd: number;
  marcas: Array<{ marcaId: string; nombre: string; logoUrl: string | null; ovpUsd: number }>;
}

/**
 * En qué marcas está el pronóstico (OVP). El mismo dinero leído por
 * marca y por propiedad; el total cuadra con «Pronosticado por el
 * equipo» de la pantalla de Propiedades. «personal» = solo las marcas
 * del agente que lo pide.
 */
export interface ReporteDePronostico {
  alcance: "empresa" | "personal";
  generadoEn: string;
  generadoPor: string;
  resumen: {
    totalOvpUsd: number;
    totalMarcas: number;
    totalPropiedades: number;
  };
  porMarca: PronosticoDeUnaMarca[];
  porPropiedad: PronosticoDeUnaPropiedad[];
}
