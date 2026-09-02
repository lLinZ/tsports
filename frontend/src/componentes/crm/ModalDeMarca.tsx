/**
 * componentes/crm/ModalDeMarca.tsx
 * ---------------------------------------------------------------------
 * La ficha de una marca: alta y edición, en un asistente de tres pasos.
 *
 * POR QUÉ TRES PASOS Y NO UN FORMULARIO LARGO
 * La ficha tiene más de quince campos. Puestos todos a la vez, dar de
 * alta una marca en mitad de una llamada se hace cuesta arriba y la
 * gente acaba dejándolo a medias. Partido en tres bloques con sentido
 * propio —quién es la marca, con quién se habla, por dónde va— cada
 * pantalla cabe de un vistazo y se puede parar en cualquier punto.
 *
 *   Paso 1 · La marca   → lo mínimo para identificarla, y la campaña.
 *   Paso 2 · Contacto   → con quién se cierra el negocio.
 *   Paso 3 · Avance     → hasta dónde se ha llegado, y el checklist de
 *                         propiedades IOP con su pronóstico de venta.
 *
 * Al EDITAR se puede guardar desde cualquier paso; al CREAR, solo al
 * final, para que no queden fichas a medio rellenar por accidente.
 *
 * La bitácora aparece a la derecha solo en marcas ya guardadas: no tiene
 * sentido comentar algo que todavía no existe.
 * ---------------------------------------------------------------------
 */
import {
  Button,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  NumberInput,
  Progress,
  Select,
  SelectItem,
  Switch,
  Textarea,
} from "@heroui/react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  CalendarPlus,
  Check,
  Megaphone,
  Package,
  Save,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AccionVigenteDeLaMarca } from "@/api/marcas";
import { CampoDeImagen } from "@/componentes/comunes/CampoDeImagen";
import { ChecklistDePropiedades } from "@/componentes/crm/ChecklistDePropiedades";
import { HistorialDeCampanas } from "@/componentes/crm/HistorialDeCampanas";
import { PanelDeComentarios } from "@/componentes/crm/PanelDeComentarios";
import { useCampanasActivas } from "@/hooks/useCampanas";
import { useCatalogos } from "@/hooks/useCatalogos";
import { useVendedores } from "@/hooks/useVendedores";
import {
  useActualizarMarca,
  useAnotarAccionDeCampana,
  useCrearMarca,
  useEliminarMarca,
  useFichaDeMarca,
} from "@/hooks/useMarcas";
import { useUsuarioAutenticado } from "@/providers/ProveedorSesion";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import { enumerarEnEspanol, formatearDinero } from "@/utilidades/formato";
import type {
  AccionDeCampanaEnElHistorial,
  Campana,
  DatosDeMarcaParaGuardar,
  InversionEnPatrocinios,
  LineaDeChecklistDePropiedad,
  LineaDeChecklistParaGuardar,
  Marca,
} from "@/tipos/modelos";

/** Los tres pasos del asistente. */
const PASOS = [
  { numero: 1, etiqueta: "La marca" },
  { numero: 2, etiqueta: "Contacto" },
  { numero: 3, etiqueta: "Avance" },
] as const;

/**
 * Los cinco datos que el servidor exige para dar la prospección por
 * cerrada. Se repiten aquí para poder enseñar la lista de comprobación
 * en vivo mientras se escribe, sin ir y volver del servidor en cada
 * pulsación. La verdad sigue estando en el backend.
 */
const CAMPOS_DE_PROSPECCION = [
  { clave: "nombreMarca", etiqueta: "nombre" },
  { clave: "logoUrl", etiqueta: "logo" },
  { clave: "personaContacto", etiqueta: "contacto" },
  { clave: "cargoContacto", etiqueta: "cargo" },
  { clave: "emailContacto", etiqueta: "email" },
] as const;

/** Estado del formulario. Todo cadenas salvo lo que de verdad no lo es. */
interface FormularioDeMarca {
  nombreMarca: string;
  sector: string;
  logoUrl: string;
  zona: string;
  campanaId: string;
  /** AAAA-MM-DD. Obligatoria en cuanto hay campaña. */
  fechaCampana: string;
  /** El checklist de propiedades IOP con su pronóstico de venta. */
  propiedades: LineaDeChecklistParaGuardar[];
  invierteActualmente: InversionEnPatrocinios;
  viaProspeccion: string;
  personaContacto: string;
  cargoContacto: string;
  emailContacto: string;
  telefonoContacto: string;
  notas: string;
  faseAproximacionCompletada: boolean;
  viaAproximacion: string;
  fasePropuestaCompletada: boolean;
  descripcionPropuesta: string;
  valorAnualUsd: number;
  vendedorAsignadoId: string;
}

const FORMULARIO_VACIO: FormularioDeMarca = {
  nombreMarca: "",
  sector: "",
  logoUrl: "",
  zona: "",
  campanaId: "",
  fechaCampana: "",
  propiedades: [],
  invierteActualmente: "desconocido",
  viaProspeccion: "",
  personaContacto: "",
  cargoContacto: "",
  emailContacto: "",
  telefonoContacto: "",
  notas: "",
  faseAproximacionCompletada: false,
  viaAproximacion: "",
  fasePropuestaCompletada: false,
  descripcionPropuesta: "",
  valorAnualUsd: 0,
  vendedorAsignadoId: "",
};

/** Vuelca una marca existente en el estado del formulario. */
function formularioDesdeMarca(marca: Marca): FormularioDeMarca {
  return {
    nombreMarca: marca.nombreMarca,
    sector: marca.sector ?? "",
    logoUrl: marca.logoUrl ?? "",
    zona: marca.zona ?? "",
    campanaId: marca.campanaId ?? "",
    fechaCampana: marca.fechaCampana ?? "",
    // El checklist se vuelca a la forma en la que viaja al guardar: solo
    // el id, el pronóstico y la nota. Lo demás (monto de la propiedad,
    // meta, porcentaje) lo aporta el catálogo, que es su dueño.
    propiedades: (marca.propiedadesOfrecidas ?? []).map((linea) => ({
      propiedadId: linea.propiedadId,
      ovpUsd: linea.ovpUsd,
      nota: linea.nota,
    })),
    invierteActualmente: marca.invierteActualmente,
    viaProspeccion: marca.viaProspeccion ?? "",
    personaContacto: marca.personaContacto ?? "",
    cargoContacto: marca.cargoContacto ?? "",
    emailContacto: marca.emailContacto ?? "",
    telefonoContacto: marca.telefonoContacto ?? "",
    notas: marca.notas ?? "",
    faseAproximacionCompletada: marca.faseAproximacionCompletada,
    viaAproximacion: marca.viaAproximacion ?? "",
    fasePropuestaCompletada: marca.fasePropuestaCompletada,
    descripcionPropuesta: marca.descripcionPropuesta ?? "",
    valorAnualUsd: marca.valorAnualUsd,
    vendedorAsignadoId: marca.vendedorAsignadoId ?? "",
  };
}

interface PropiedadesDelModalDeMarca {
  estaAbierto: boolean;
  /** La marca a editar, o null para dar de alta una nueva. */
  marcaEnEdicion: Marca | null;
  alCerrar: () => void;
}

export function ModalDeMarca({
  estaAbierto,
  marcaEnEdicion,
  alCerrar,
}: PropiedadesDelModalDeMarca) {
  const usuario = useUsuarioAutenticado();
  const { catalogos } = useCatalogos();
  // Solo las campañas abiertas: ofrecer una ya cerrada en el selector
  // únicamente sirve para equivocarse al asignar.
  const { campanas: campanasActivas } = useCampanasActivas();

  const crearMarca = useCrearMarca();
  const actualizarMarca = useActualizarMarca();
  const eliminarMarca = useEliminarMarca();

  const [formulario, establecerFormulario] = useState<FormularioDeMarca>(FORMULARIO_VACIO);
  const [pasoActual, establecerPasoActual] = useState(1);
  const [erroresPorCampo, establecerErroresPorCampo] = useState<Record<string, string>>({});
  const [estaConfirmandoBorrado, establecerConfirmandoBorrado] = useState(false);

  const estamosEditando = marcaEnEdicion !== null;
  const laMarcaEsEditable = marcaEnEdicion?.puedeEditarla ?? true;

  /**
   * La ficha completa de la marca, pedida al abrir.
   *
   * El listado del tablero no trae el historial de campañas a
   * propósito: crece con cada acción que se anota, y cargarlo para las
   * 71 marcas cada vez que se abre el tablero sería arrastrar en cada
   * carga algo que allí no se enseña. Aquí sí hace falta, así que se
   * pide solo de la marca que se está abriendo.
   */
  const fichaCompleta = useFichaDeMarca(
    estaAbierto && marcaEnEdicion ? marcaEnEdicion.id : null,
  );

  const historialDeCampanas = fichaCompleta.data?.historialDeCampanas ?? [];

  /** Lista de vendedores para el selector de asignación. */
  const { vendedores } = useVendedores({ habilitado: estaAbierto });

  /* ---------------------------------------------------------------- */
  /* Carga del formulario al abrir                                    */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!estaAbierto) return;

    if (marcaEnEdicion) {
      establecerFormulario(formularioDesdeMarca(marcaEnEdicion));
    } else {
      // Una marca nueva hereda la zona de quien la registra: es lo que
      // se espera casi siempre y se puede cambiar si hace falta.
      establecerFormulario({ ...FORMULARIO_VACIO, zona: usuario.zona ?? "" });
    }

    establecerPasoActual(1);
    establecerErroresPorCampo({});
    establecerConfirmandoBorrado(false);
  }, [estaAbierto, marcaEnEdicion, usuario.zona]);

  /* ---------------------------------------------------------------- */
  /* Estado derivado                                                  */
  /* ---------------------------------------------------------------- */

  /** Qué datos faltan para cerrar la prospección, calculado en vivo. */
  const datosQueFaltanParaProspeccion = useMemo(
    () =>
      CAMPOS_DE_PROSPECCION.filter(
        (campo) => String(formulario[campo.clave] ?? "").trim() === "",
      ).map((campo) => campo.etiqueta),
    [formulario],
  );

  const laProspeccionEstaCompleta = datosQueFaltanParaProspeccion.length === 0;

  const estaGuardando = crearMarca.isPending || actualizarMarca.isPending;

  /** Cambia un campo del formulario y limpia su error si lo tenía. */
  /**
   * Pone al día la campaña y la fecha del formulario cuando se toca el
   * historial.
   *
   * Hace falta porque el formulario se rellena UNA VEZ, al abrir la
   * ficha, a partir de la marca que llega por props —y esa marca es una
   * instantánea que no se refresca—. Al borrar la acción en curso, el
   * servidor deja la marca sin campaña, pero estos dos campos seguían
   * enseñando la que se acababa de borrar; al guardar se reenviaban y el
   * servidor los anotaba como una asignación nueva, así que la acción
   * volvía a aparecer sola en el historial.
   *
   * Se tocan solo estos dos campos y no se recarga el formulario entero:
   * quien está editando la ficha puede llevar media hora escrita en las
   * notas, y borrar una línea del historial no puede costarle ese texto.
   */
  function sincronizarLaAccionEnCurso(
    accionVigente: AccionVigenteDeLaMarca | null,
  ) {
    establecerFormulario((anterior) => ({
      ...anterior,
      campanaId: accionVigente?.campanaId ?? "",
      fechaCampana: accionVigente?.fechaCampana ?? "",
    }));

    // Si quedaba pendiente el aviso de "falta la fecha", ya no aplica.
    establecerErroresPorCampo((errores) => {
      const { fechaCampana: _quitado, ...resto } = errores;

      return resto;
    });
  }

  function cambiarCampo<Clave extends keyof FormularioDeMarca>(
    clave: Clave,
    valor: FormularioDeMarca[Clave],
  ) {
    establecerFormulario((anterior) => ({ ...anterior, [clave]: valor }));

    establecerErroresPorCampo((errores) => {
      if (!(clave in errores)) return errores;

      const { [clave as string]: _quitado, ...resto } = errores;

      return resto;
    });
  }

  /* ---------------------------------------------------------------- */
  /* Validación                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Comprueba las mismas reglas que el servidor, para avisar antes de
   * enviar. El servidor las vuelve a comprobar: esto es comodidad, no
   * seguridad.
   *
   * Devuelve el paso al que hay que saltar si algo falla, o null si todo
   * está en orden.
   */
  function validarYSenalarElPasoConError(): number | null {
    const erroresEncontrados: Record<string, string> = {};

    if (formulario.nombreMarca.trim() === "") {
      erroresEncontrados.nombreMarca = "Ponle nombre a la marca.";
    }

    if (
      formulario.emailContacto.trim() !== "" &&
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(formulario.emailContacto.trim())
    ) {
      erroresEncontrados.emailContacto = "Ese correo no tiene un formato válido.";
    }

    if (formulario.faseAproximacionCompletada && formulario.viaAproximacion === "") {
      erroresEncontrados.viaAproximacion =
        "Indica por qué vía se hizo la aproximación.";
    }

    if (
      formulario.fasePropuestaCompletada &&
      formulario.descripcionPropuesta.trim() === ""
    ) {
      erroresEncontrados.descripcionPropuesta =
        "Describe qué se le envió a la marca.";
    }

    // Una campaña sin día no se puede colocar en el calendario.
    if (formulario.campanaId !== "" && formulario.fechaCampana === "") {
      erroresEncontrados.fechaCampana =
        "Indica el día en que se hace esta acción de campaña.";
    }

    establecerErroresPorCampo(erroresEncontrados);

    if (Object.keys(erroresEncontrados).length === 0) return null;

    // Se salta al primer paso que contenga un error, para que la persona
    // vea directamente el campo señalado y no un aviso sin contexto.
    if (erroresEncontrados.nombreMarca) return 1;
    if (erroresEncontrados.fechaCampana) return 1;
    if (erroresEncontrados.emailContacto) return 2;

    return 3;
  }

  /* ---------------------------------------------------------------- */
  /* Acciones                                                         */
  /* ---------------------------------------------------------------- */

  async function guardarLaMarca() {
    const pasoConError = validarYSenalarElPasoConError();

    if (pasoConError !== null) {
      establecerPasoActual(pasoConError);

      return;
    }

    const datosParaEnviar: DatosDeMarcaParaGuardar = {
      nombreMarca: formulario.nombreMarca.trim(),
      sector: formulario.sector || null,
      logoUrl: formulario.logoUrl.trim() || null,
      zona: formulario.zona || null,
      campanaId: formulario.campanaId || null,
      fechaCampana: formulario.fechaCampana || null,
      // Siempre se envía el checklist, aunque esté vacío: enviarlo es lo
      // que le dice al servidor "esto es lo que hay ahora", y así
      // desmarcar la última propiedad la quita de verdad.
      propiedades: formulario.propiedades,
      invierteActualmente: formulario.invierteActualmente,
      viaProspeccion: formulario.viaProspeccion || null,
      personaContacto: formulario.personaContacto.trim() || null,
      cargoContacto: formulario.cargoContacto.trim() || null,
      emailContacto: formulario.emailContacto.trim() || null,
      telefonoContacto: formulario.telefonoContacto.trim() || null,
      notas: formulario.notas.trim() || null,
      faseAproximacionCompletada: formulario.faseAproximacionCompletada,
      viaAproximacion: formulario.viaAproximacion || null,
      fasePropuestaCompletada: formulario.fasePropuestaCompletada,
      descripcionPropuesta: formulario.descripcionPropuesta.trim() || null,
      valorAnualUsd: formulario.valorAnualUsd,
    };

    // El campo de asignación solo se envía si esta persona puede
    // asignar; si no, el servidor lo ignoraría de todos modos.
    if (usuario.permisos.asignaVendedores) {
      datosParaEnviar.vendedorAsignadoId = formulario.vendedorAsignadoId || null;
    }

    try {
      if (estamosEditando && marcaEnEdicion) {
        await actualizarMarca.mutateAsync({
          idDeLaMarca: marcaEnEdicion.id,
          datos: datosParaEnviar,
        });

        avisarDeExito("Marca actualizada");
      } else {
        await crearMarca.mutateAsync(datosParaEnviar);

        avisarDeExito("Marca registrada");
      }

      alCerrar();
    } catch (error) {
      avisarDeError(error, "No se pudo guardar la marca");
    }
  }

  async function borrarLaMarca() {
    if (!marcaEnEdicion) return;

    try {
      await eliminarMarca.mutateAsync(marcaEnEdicion.id);

      avisarDeExito("Marca eliminada");
      alCerrar();
    } catch (error) {
      avisarDeError(error, "No se pudo eliminar la marca");
    }
  }

  /** Avanza al paso siguiente exigiendo lo mínimo del paso actual. */
  function irAlPasoSiguiente() {
    if (pasoActual === 1 && formulario.nombreMarca.trim() === "") {
      establecerErroresPorCampo({
        nombreMarca: "Ponle nombre a la marca para continuar.",
      });

      return;
    }

    establecerPasoActual((paso) => Math.min(3, paso + 1));
  }

  /* ---------------------------------------------------------------- */
  /* Interfaz                                                         */
  /* ---------------------------------------------------------------- */

  return (
    <Modal
      // A pantalla completa. La ficha tiene más de quince campos, la
      // bitácora al lado y tres pasos: en una ventana pequeña las
      // descripciones de los selectores se parten en tres líneas y todo
      // queda apretujado. Con la pantalla entera cada campo respira y se
      // ve el contexto completo de la marca de un vistazo.
      classNames={{
        // El cuerpo no lleva relleno propio: cada columna gestiona el suyo.
        base: "m-0 max-h-full rounded-none sm:m-0",
        body: "p-0",
      }}
      isOpen={estaAbierto}
      scrollBehavior="inside"
      size="full"
      onOpenChange={(abierto) => {
        if (!abierto) alCerrar();
      }}
    >
      <ModalContent>
        <ModalBody className="p-0">
          <div
            className={[
              "grid h-full min-h-0 gap-0",
              // La bitácora se lleva un ancho fijo y cómodo; el resto es
              // para el formulario, que es donde está el trabajo.
              estamosEditando ? "lg:grid-cols-[minmax(0,1fr)_26rem]" : "grid-cols-1",
            ].join(" ")}
          >
            {/* ---------- Columna izquierda: el asistente ---------- */}
            <div className="flex h-full min-h-0 flex-col">
              {/* Cabecera con los pasos */}
              <header className="border-b border-default-100 px-6 pb-4 pt-6">
                <div className="mb-1 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold tracking-tight text-foreground">
                      {estamosEditando
                        ? marcaEnEdicion.nombreMarca
                        : "Nueva marca"}
                    </h2>

                    {estamosEditando && (
                      <p className="mt-0.5 text-[11px] text-default-500">
                        {marcaEnEdicion.origen === "web"
                          ? "Llegó por el formulario web"
                          : `Registrada por ${marcaEnEdicion.registradaPorNombre ?? "—"}`}
                      </p>
                    )}
                  </div>

                  {!laMarcaEsEditable && (
                    <Chip color="warning" radius="lg" size="sm" variant="flat">
                      Solo lectura
                    </Chip>
                  )}
                </div>

                <nav className="mt-4 flex gap-1">
                  {PASOS.map((paso) => {
                    const estaActivo = paso.numero === pasoActual;
                    const yaSePaso = paso.numero < pasoActual;

                    return (
                      <button
                        key={paso.numero}
                        className={[
                          "flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left transition",
                          estaActivo
                            ? "bg-primary text-primary-foreground"
                            : "text-default-500 hover:bg-default-100",
                        ].join(" ")}
                        type="button"
                        onClick={() => {
                          // No se deja saltar adelante sin nombre: sin él
                          // la marca no se puede guardar de ninguna forma.
                          if (paso.numero > 1 && formulario.nombreMarca.trim() === "") {
                            establecerErroresPorCampo({
                              nombreMarca: "Ponle nombre a la marca para continuar.",
                            });

                            return;
                          }

                          establecerPasoActual(paso.numero);
                        }}
                      >
                        <span
                          className={[
                            "flex size-5 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold",
                            estaActivo
                              ? "bg-white/20"
                              : yaSePaso
                                ? "bg-success text-white"
                                : "bg-default-200 text-default-500",
                          ].join(" ")}
                        >
                          {yaSePaso ? <Check className="size-3" strokeWidth={3} /> : paso.numero}
                        </span>

                        <span className="truncate text-xs font-semibold">
                          {paso.etiqueta}
                        </span>
                      </button>
                    );
                  })}
                </nav>

                <Progress
                  aria-label="Avance del formulario"
                  className="mt-3"
                  classNames={{ track: "h-1" }}
                  color="primary"
                  radius="full"
                  value={(pasoActual / PASOS.length) * 100}
                />
              </header>

              {/* Cuerpo de cada paso.
                  A pantalla completa el formulario se estiraría a lo
                  ancho del monitor y los campos quedarían larguísimos y
                  difíciles de recorrer con la vista. Se limita a un ancho
                  de lectura cómodo y se centra: el espacio sobrante es
                  margen, no campos de dos palmos. */}
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
                <div className="mx-auto w-full max-w-3xl">
                {pasoActual === 1 && (
                  <PasoLaMarca
                    idDeLaMarca={marcaEnEdicion?.id ?? ""}
                    alCambiarLaAccionVigente={sincronizarLaAccionEnCurso}
                    cambiarCampo={cambiarCampo}
                    campanas={campanasActivas}
                    historialDeCampanas={historialDeCampanas}
                    esUnaMarcaGuardada={estamosEditando}
                    catalogos={catalogos}
                    errores={erroresPorCampo}
                    esEditable={laMarcaEsEditable}
                    formulario={formulario}
                  />
                )}

                {pasoActual === 2 && (
                  <PasoContacto
                    cambiarCampo={cambiarCampo}
                    errores={erroresPorCampo}
                    esEditable={laMarcaEsEditable}
                    formulario={formulario}
                    puedeAsignar={usuario.permisos.asignaVendedores}
                    vendedores={vendedores}
                  />
                )}

                {pasoActual === 3 && (
                  <PasoAvance
                    cambiarCampo={cambiarCampo}
                    catalogos={catalogos}
                    datosQueFaltan={datosQueFaltanParaProspeccion}
                    errores={erroresPorCampo}
                    esEditable={laMarcaEsEditable}
                    formulario={formulario}
                    laProspeccionEstaCompleta={laProspeccionEstaCompleta}
                    lineasGuardadasDelChecklist={
                      marcaEnEdicion?.propiedadesOfrecidas ?? []
                    }
                  />
                )}
                </div>
              </div>

              {/* Botonera. Se alinea con el formulario para que los
                  botones no queden perdidos en una esquina de la pantalla. */}
              <footer className="border-t border-default-100 px-6 py-4 sm:px-8">
                <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2">
                {estamosEditando && marcaEnEdicion.puedeEliminarla && (
                  estaConfirmandoBorrado ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-danger">¿Seguro?</span>

                      <Button
                        color="danger"
                        isLoading={eliminarMarca.isPending}
                        radius="lg"
                        size="sm"
                        onPress={() => void borrarLaMarca()}
                      >
                        Sí, eliminar
                      </Button>

                      <Button
                        radius="lg"
                        size="sm"
                        variant="light"
                        onPress={() => establecerConfirmandoBorrado(false)}
                      >
                        No
                      </Button>
                    </div>
                  ) : (
                    <Button
                      color="danger"
                      radius="lg"
                      size="sm"
                      startContent={<Trash2 className="size-4" />}
                      variant="light"
                      onPress={() => establecerConfirmandoBorrado(true)}
                    >
                      Eliminar
                    </Button>
                  )
                )}

                <div className="flex-1" />

                {pasoActual > 1 && (
                  <Button
                    radius="lg"
                    size="sm"
                    startContent={<ArrowLeft className="size-4" />}
                    variant="light"
                    onPress={() => establecerPasoActual((paso) => paso - 1)}
                  >
                    Atrás
                  </Button>
                )}

                {pasoActual < PASOS.length && (
                  <Button
                    color={estamosEditando ? "default" : "primary"}
                    endContent={<ArrowRight className="size-4" />}
                    radius="lg"
                    size="sm"
                    variant={estamosEditando ? "flat" : "solid"}
                    onPress={irAlPasoSiguiente}
                  >
                    Siguiente
                  </Button>
                )}

                {/* Al editar se puede guardar desde cualquier paso; al
                    crear, solo cuando se ha visto el formulario entero. */}
                {(estamosEditando || pasoActual === PASOS.length) && (
                  <Button
                    color="primary"
                    isDisabled={!laMarcaEsEditable}
                    isLoading={estaGuardando}
                    radius="lg"
                    size="sm"
                    startContent={!estaGuardando && <Save className="size-4" />}
                    onPress={() => void guardarLaMarca()}
                  >
                    {estamosEditando ? "Guardar cambios" : "Registrar marca"}
                  </Button>
                )}
                </div>
              </footer>
            </div>

            {/* ---------- Columna derecha: la bitácora ---------- */}
            {estamosEditando && (
              <div className="hidden h-full min-h-0 border-l border-default-100 bg-default-50/50 p-5 lg:block">
                <PanelDeComentarios idDeLaMarca={marcaEnEdicion.id} />
              </div>
            )}
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

/* ==================================================================== */
/* Piezas de formulario                                                */
/* ==================================================================== */

/**
 * Un campo con su texto de ayuda debajo.
 *
 * Existe para esquivar un fallo de HeroUI: cuando a un `Select` con
 * `labelPlacement="outside"` se le pasa `description`, se activa su rama
 * interna `has-helper`, que cambia la etiqueta de `absolute` a
 * `relative` y le quita el desplazamiento que la subía... pero le deja
 * el `top-1/2`. Resultado: la etiqueta baja media altura del control y
 * se monta encima del borde, pisando el texto seleccionado.
 *
 * Se ve solo en los selectores que llevan descripción; los que no la
 * llevan (Zona, Sector) usan la rama buena y salen bien.
 *
 * En vez de pelearse con esas clases a base de `!important`, aquí el
 * campo va sin `description` —así HeroUI usa siempre la rama que
 * funciona— y la ayuda se pinta como un párrafo normal. De paso queda
 * bajo nuestro control el espacio que la separa del campo.
 */
/**
 * Botón que deja la acción de campaña apuntada en el calendario sin
 * pasar por "Guardar cambios".
 *
 * Enseña en qué estado está para que se entienda qué va a pasar antes de
 * pulsarlo: si falta el día avisa de que hace falta, y una vez anotado
 * lo confirma en el propio botón en vez de solo con un aviso que se va
 * a los tres segundos.
 */
function BotonDeAnotarEnElCalendario({
  idDeLaMarca,
  campanaId,
  fecha,
}: {
  idDeLaMarca: string;
  campanaId: string;
  fecha: string;
}) {
  const anotarAccion = useAnotarAccionDeCampana();

  /** Lo último que se anotó, para confirmarlo en el propio botón. */
  const [loAnotado, establecerLoAnotado] = useState<string | null>(null);

  const faltaElDia = fecha === "";
  const yaEstaAnotadoEsto = loAnotado === `${campanaId}|${fecha}`;

  function anotar() {
    anotarAccion.mutate(
      { idDeLaMarca, campanaId, fecha },
      {
        onSuccess: () => {
          establecerLoAnotado(`${campanaId}|${fecha}`);
          avisarDeExito("Anotado en el calendario");
        },
        onError: (error) => avisarDeError(error, "No se pudo anotar la acción"),
      },
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        color={yaEstaAnotadoEsto ? "success" : "primary"}
        isDisabled={faltaElDia || yaEstaAnotadoEsto}
        isLoading={anotarAccion.isPending}
        radius="full"
        size="sm"
        startContent={
          yaEstaAnotadoEsto ? (
            <Check className="size-4" />
          ) : (
            <CalendarPlus className="size-4" />
          )
        }
        variant={yaEstaAnotadoEsto ? "flat" : "solid"}
        onPress={anotar}
      >
        {yaEstaAnotadoEsto ? "Anotado en el calendario" : "Anotar en el calendario"}
      </Button>

      <p className="text-[11px] leading-snug text-default-400">
        {faltaElDia
          ? "Elige primero el día."
          : yaEstaAnotadoEsto
            ? "Ya aparece en el calendario del panel."
            : "Lo apunta ahora mismo, sin guardar el resto de la ficha."}
      </p>
    </div>
  );
}

function CampoConAyuda({
  ayuda,
  children,
}: {
  ayuda: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {children}
      <p className="text-tiny leading-relaxed text-default-400">{ayuda}</p>
    </div>
  );
}

/* ==================================================================== */
/* Paso 1 · La marca                                                   */
/* ==================================================================== */

/** Propiedades comunes a los tres pasos. */
interface PropiedadesDePaso {
  formulario: FormularioDeMarca;
  cambiarCampo: <Clave extends keyof FormularioDeMarca>(
    clave: Clave,
    valor: FormularioDeMarca[Clave],
  ) => void;
  errores: Record<string, string>;
  esEditable: boolean;
}

function PasoLaMarca({
  formulario,
  cambiarCampo,
  idDeLaMarca,
  alCambiarLaAccionVigente,
  historialDeCampanas,
  esUnaMarcaGuardada,
  errores,
  esEditable,
  catalogos,
  campanas,
}: PropiedadesDePaso & {
  catalogos: ReturnType<typeof useCatalogos>["catalogos"];
  campanas: Campana[];
  historialDeCampanas: AccionDeCampanaEnElHistorial[];
  /** En una marca nueva no hay historial que enseñar todavía. */
  esUnaMarcaGuardada: boolean;
  alCambiarLaAccionVigente: (
    accionVigente: AccionVigenteDeLaMarca | null,
  ) => void;
  /** Vacío mientras la marca se está creando y aún no tiene id. */
  idDeLaMarca: string;
}) {
  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-default-500">
        Lo básico para identificar la marca. El resto se puede completar
        más adelante.
      </p>

      <Input
        errorMessage={errores.nombreMarca}
        isDisabled={!esEditable}
        isInvalid={Boolean(errores.nombreMarca)}
        isRequired
        label="Marca o cliente"
        labelPlacement="outside"
        placeholder="Ej. Refrescos del Caribe"
        radius="lg"
        startContent={<Building2 className="size-4 text-default-400" />}
        value={formulario.nombreMarca}
        variant="bordered"
        onValueChange={(valor) => cambiarCampo("nombreMarca", valor)}
      />

      <CampoDeImagen
        alCambiar={(url) => cambiarCampo("logoUrl", url)}
        ayuda="Hace falta para dar la prospección por completa."
        etiqueta="Logo de la marca"
        formaDeLaVistaPrevia="cuadrada"
        isDisabled={!esEditable}
        proposito="logo_marca"
        valor={formulario.logoUrl}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          isDisabled={!esEditable}
          label="Zona"
          labelPlacement="outside"
          placeholder="Sin zona"
          radius="lg"
          selectedKeys={formulario.zona ? [formulario.zona] : []}
          variant="bordered"
          onSelectionChange={(seleccion) =>
            cambiarCampo("zona", String(Array.from(seleccion)[0] ?? ""))
          }
        >
          {(catalogos?.zonas ?? []).map((zona) => (
            <SelectItem key={zona}>{zona}</SelectItem>
          ))}
        </Select>

        <Select
          isDisabled={!esEditable}
          label="Sector"
          labelPlacement="outside"
          placeholder="Elegir sector"
          radius="lg"
          selectedKeys={formulario.sector ? [formulario.sector] : []}
          variant="bordered"
          onSelectionChange={(seleccion) =>
            cambiarCampo("sector", String(Array.from(seleccion)[0] ?? ""))
          }
        >
          {(catalogos?.sectores ?? []).map((sector) => (
            <SelectItem key={sector}>{sector}</SelectItem>
          ))}
        </Select>
      </div>

      {/* Campaña dentro de la que se trabaja la marca. */}
      <CampoConAyuda ayuda="El empujón comercial dentro del que se trabaja esta marca.">
      <Select
        isDisabled={!esEditable}
        label="Campaña asignada"
        labelPlacement="outside"
        placeholder="Sin campaña"
        radius="lg"
        selectedKeys={formulario.campanaId ? [formulario.campanaId] : []}
        startContent={<Megaphone className="size-4 text-default-400" />}
        variant="bordered"
        onSelectionChange={(seleccion) => {
          const campanaElegida = String(Array.from(seleccion)[0] ?? "");

          cambiarCampo("campanaId", campanaElegida);

          // Al quitar la campaña se limpia también la fecha, igual que
          // hace el servidor: si se quedara puesta y luego se eligiese
          // otra campaña, heredaría un día que nadie escogió para ella.
          if (campanaElegida === "") cambiarCampo("fechaCampana", "");
        }}
      >
        {campanas.map((campana) => (
          <SelectItem key={campana.id} textValue={campana.nombre}>
            <span className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: campana.color }}
              />
              {campana.nombre}
            </span>
          </SelectItem>
        ))}
      </Select>
      </CampoConAyuda>

      {/* La fecha solo tiene sentido si hay campaña, así que aparece al
          elegirla. Es obligatoria: sin día, la acción no se puede situar
          en ninguna semana del calendario. */}
      {formulario.campanaId !== "" && (
        <CampoConAyuda ayuda="El día en que se hace esta acción. Es lo que la coloca en el calendario del panel.">
          <Input
            errorMessage={errores.fechaCampana}
            isDisabled={!esEditable}
            isInvalid={Boolean(errores.fechaCampana)}
            isRequired
            label="¿Qué día se hace?"
            labelPlacement="outside"
            radius="lg"
            startContent={<CalendarDays className="size-4 text-default-400" />}
            type="date"
            value={formulario.fechaCampana}
            variant="bordered"
            onValueChange={(valor) => cambiarCampo("fechaCampana", valor)}
          />
        </CampoConAyuda>
      )}

      {/*
        Atajo para dejar la acción apuntada sin guardar la ficha entera.

        Que apuntar una visita dependiera de "Guardar cambios" no se
        entendía: son dos cosas distintas —una es corregir los datos de
        la marca, la otra es registrar algo que acaba de pasar— y además
        obligaba a que el resto del formulario estuviera correcto para
        poder anotar una visita que ya se había hecho.

        Solo sale en fichas ya guardadas: una marca que se está creando
        todavía no tiene id contra el que anotar, y ahí el botón de
        guardar hace las dos cosas de una vez.
      */}
      {esUnaMarcaGuardada && esEditable && formulario.campanaId !== "" && (
        <BotonDeAnotarEnElCalendario
          campanaId={formulario.campanaId}
          fecha={formulario.fechaCampana}
          idDeLaMarca={idDeLaMarca}
        />
      )}

      {/* El recorrido de la marca. Solo en fichas ya guardadas: una
          marca que se está creando no tiene historial todavía. */}
      {esUnaMarcaGuardada && (
        <HistorialDeCampanas
          alCambiarLaAccionVigente={alCambiarLaAccionVigente}
          historial={historialDeCampanas}
        />
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <CampoConAyuda ayuda="La acción BTL donde la viste.">
        <Select
          isDisabled={!esEditable}
          label="¿Dónde la identificaste?"
          labelPlacement="outside"
          placeholder="Elegir vía"
          radius="lg"
          selectedKeys={formulario.viaProspeccion ? [formulario.viaProspeccion] : []}
          variant="bordered"
          onSelectionChange={(seleccion) =>
            cambiarCampo("viaProspeccion", String(Array.from(seleccion)[0] ?? ""))
          }
        >
          {(catalogos?.viasDeProspeccion ?? []).map((via) => (
            <SelectItem key={via}>{via}</SelectItem>
          ))}
        </Select>
        </CampoConAyuda>

        <CampoConAyuda ayuda="Quien ya patrocina suele ser una venta más corta.">
        <Select
          isDisabled={!esEditable}
          label="¿Invierte hoy en patrocinios?"
          labelPlacement="outside"
          radius="lg"
          selectedKeys={[formulario.invierteActualmente]}
          variant="bordered"
          onSelectionChange={(seleccion) =>
            cambiarCampo(
              "invierteActualmente",
              (Array.from(seleccion)[0] as InversionEnPatrocinios) ?? "desconocido",
            )
          }
        >
          {(catalogos?.opcionesDeInversion ?? []).map((opcion) => (
            <SelectItem key={opcion.valor}>{opcion.etiqueta}</SelectItem>
          ))}
        </Select>
        </CampoConAyuda>
      </div>
    </div>
  );
}

/* ==================================================================== */
/* Paso 2 · Contacto                                                   */
/* ==================================================================== */

function PasoContacto({
  formulario,
  cambiarCampo,
  errores,
  esEditable,
  puedeAsignar,
  vendedores,
}: PropiedadesDePaso & {
  puedeAsignar: boolean;
  vendedores: Array<{ id: string; nombre: string; zona: string | null }>;
}) {
  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-default-500">
        ¿Con quién se cierra el negocio?
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          isDisabled={!esEditable}
          label="Persona de contacto"
          labelPlacement="outside"
          placeholder="Nombre y apellido"
          radius="lg"
          value={formulario.personaContacto}
          variant="bordered"
          onValueChange={(valor) => cambiarCampo("personaContacto", valor)}
        />

        <Input
          isDisabled={!esEditable}
          label="Cargo"
          labelPlacement="outside"
          placeholder="Ej. Gerente de mercadeo"
          radius="lg"
          value={formulario.cargoContacto}
          variant="bordered"
          onValueChange={(valor) => cambiarCampo("cargoContacto", valor)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          errorMessage={errores.emailContacto}
          isDisabled={!esEditable}
          isInvalid={Boolean(errores.emailContacto)}
          label="Correo"
          labelPlacement="outside"
          placeholder="nombre@empresa.com"
          radius="lg"
          type="email"
          value={formulario.emailContacto}
          variant="bordered"
          onValueChange={(valor) => cambiarCampo("emailContacto", valor)}
        />

        <Input
          isDisabled={!esEditable}
          label="Teléfono"
          labelPlacement="outside"
          placeholder="+58 412 000 0000"
          radius="lg"
          value={formulario.telefonoContacto}
          variant="bordered"
          onValueChange={(valor) => cambiarCampo("telefonoContacto", valor)}
        />
      </div>

      {puedeAsignar && (
        <CampoConAyuda ayuda="Es quien trabaja la marca; solo él, un comercial o un administrador podrán editarla.">
        <Select
          isDisabled={!esEditable}
          label="Vendedor asignado"
          labelPlacement="outside"
          placeholder="Sin asignar"
          radius="lg"
          selectedKeys={
            formulario.vendedorAsignadoId ? [formulario.vendedorAsignadoId] : []
          }
          startContent={<UserRound className="size-4 text-default-400" />}
          variant="bordered"
          onSelectionChange={(seleccion) =>
            cambiarCampo("vendedorAsignadoId", String(Array.from(seleccion)[0] ?? ""))
          }
        >
          {vendedores.map((vendedor) => (
            <SelectItem key={vendedor.id} textValue={vendedor.nombre}>
              {vendedor.nombre}
              {vendedor.zona ? ` — ${vendedor.zona}` : ""}
            </SelectItem>
          ))}
        </Select>
        </CampoConAyuda>
      )}

      <Textarea
        isDisabled={!esEditable}
        label="Notas"
        labelPlacement="outside"
        minRows={3}
        placeholder="Cualquier detalle útil sobre la marca o el contacto…"
        radius="lg"
        value={formulario.notas}
        variant="bordered"
        onValueChange={(valor) => cambiarCampo("notas", valor)}
      />
    </div>
  );
}

/* ==================================================================== */
/* Paso 3 · Avance                                                     */
/* ==================================================================== */

function PasoAvance({
  formulario,
  cambiarCampo,
  errores,
  esEditable,
  catalogos,
  datosQueFaltan,
  laProspeccionEstaCompleta,
  lineasGuardadasDelChecklist,
}: PropiedadesDePaso & {
  catalogos: ReturnType<typeof useCatalogos>["catalogos"];
  datosQueFaltan: string[];
  laProspeccionEstaCompleta: boolean;
  /** Lo que la marca ya tenía guardado, para no perder lo retirado. */
  lineasGuardadasDelChecklist: LineaDeChecklistDePropiedad[];
}) {
  const propiedadesMarcadas = formulario.propiedades;

  const pronosticoTotalDeLaFicha = propiedadesMarcadas.reduce(
    (suma, linea) => suma + linea.ovpUsd,
    0,
  );

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-default-500">
        Marca hasta dónde se ha llegado. Se puede dejar en blanco y avanzar
        más adelante.
      </p>

      {/* Prospección: no se marca, se cumple. */}
      <div className="rounded-2xl border border-default-200 bg-default-50 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">Prospección</span>

          {laProspeccionEstaCompleta ? (
            <Chip color="success" radius="lg" size="sm" variant="flat">
              Completa
            </Chip>
          ) : (
            <Chip color="warning" radius="lg" size="sm" variant="flat">
              Faltan {datosQueFaltan.length}
            </Chip>
          )}
        </div>

        <p className="mb-3 text-[11px] leading-relaxed text-default-500">
          Se completa sola cuando la marca tiene nombre, logo, contacto,
          cargo y correo. No se puede marcar a mano, para que el indicador
          no pueda mentir.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {CAMPOS_DE_PROSPECCION.map((campo) => {
            const estaRelleno = String(formulario[campo.clave] ?? "").trim() !== "";

            return (
              <span
                key={campo.clave}
                className={[
                  "flex items-center gap-1 rounded-lg px-2 py-1 text-[11px]",
                  estaRelleno
                    ? "bg-success-100 text-success-700 dark:bg-success-100/15"
                    : "bg-default-200 text-default-500",
                ].join(" ")}
              >
                {estaRelleno && <Check className="size-2.5" strokeWidth={3} />}
                {campo.etiqueta}
              </span>
            );
          })}
        </div>

        {!laProspeccionEstaCompleta && (
          <p className="mt-2 text-[11px] text-warning">
            Falta {enumerarEnEspanol(datosQueFaltan)}.
          </p>
        )}
      </div>

      {/* El checklist de productos IOP. Va dentro de la prospección
          porque es el trabajo que se hace en esa fase, pero NO cuenta
          para darla por completa: eso lo siguen decidiendo los cinco
          datos de arriba. */}
      <div className="rounded-2xl border border-default-200 p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Package className="size-4 text-primary" />
            Propiedades a ofrecer
          </span>

          {propiedadesMarcadas.length > 0 && (
            <Chip color="primary" radius="lg" size="sm" variant="flat">
              {formatearDinero(pronosticoTotalDeLaFicha)}
            </Chip>
          )}
        </div>

        <p className="mb-3 text-[11px] leading-relaxed text-default-500">
          Marca los productos que se le están ofreciendo a esta marca y
          anota cuánto estimas venderle de cada uno. La barra enseña qué
          porcentaje representa sobre el valor total de la propiedad.
        </p>

        <ChecklistDePropiedades
          alCambiar={(lineasNuevas) => cambiarCampo("propiedades", lineasNuevas)}
          esEditable={esEditable}
          lineas={propiedadesMarcadas}
          lineasGuardadas={lineasGuardadasDelChecklist}
        />
      </div>

      {/* Aproximación */}
      <div
        className={[
          "rounded-2xl border p-4 transition",
          formulario.faseAproximacionCompletada
            ? "border-primary bg-primary-50/50 dark:bg-primary-100/5"
            : "border-default-200",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm font-semibold text-foreground">Aproximación</span>
            <p className="text-[11px] text-default-500">
              ¿Ya se habló con la marca?
            </p>
          </div>

          <Switch
            isDisabled={!esEditable}
            isSelected={formulario.faseAproximacionCompletada}
            size="sm"
            onValueChange={(activada) =>
              cambiarCampo("faseAproximacionCompletada", activada)
            }
          />
        </div>

        {formulario.faseAproximacionCompletada && (
          <div className="mt-3">
            <Select
              errorMessage={errores.viaAproximacion}
              isDisabled={!esEditable}
              isInvalid={Boolean(errores.viaAproximacion)}
              isRequired
              label="Vía de contacto"
              labelPlacement="outside"
              placeholder="Elegir vía"
              radius="lg"
              selectedKeys={
                formulario.viaAproximacion ? [formulario.viaAproximacion] : []
              }
              size="sm"
              variant="bordered"
              onSelectionChange={(seleccion) =>
                cambiarCampo("viaAproximacion", String(Array.from(seleccion)[0] ?? ""))
              }
            >
              {(catalogos?.viasDeAproximacion ?? []).map((via) => (
                <SelectItem key={via}>{via}</SelectItem>
              ))}
            </Select>
          </div>
        )}
      </div>

      {/* Propuesta */}
      <div
        className={[
          "rounded-2xl border p-4 transition",
          formulario.fasePropuestaCompletada
            ? "border-success bg-success-50/50 dark:bg-success-100/5"
            : "border-default-200",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm font-semibold text-foreground">Propuesta</span>
            <p className="text-[11px] text-default-500">
              ¿Ya se le envió algo por escrito?
            </p>
          </div>

          <Switch
            color="success"
            isDisabled={!esEditable}
            isSelected={formulario.fasePropuestaCompletada}
            size="sm"
            onValueChange={(activada) =>
              cambiarCampo("fasePropuestaCompletada", activada)
            }
          />
        </div>

        {formulario.fasePropuestaCompletada && (
          <div className="mt-3 space-y-3">
            <Textarea
              errorMessage={errores.descripcionPropuesta}
              isDisabled={!esEditable}
              isInvalid={Boolean(errores.descripcionPropuesta)}
              isRequired
              label="¿Qué se le envió?"
              labelPlacement="outside"
              minRows={2}
              placeholder="Ej. Patrocinio principal de la temporada, con presencia en camiseta…"
              radius="lg"
              size="sm"
              value={formulario.descripcionPropuesta}
              variant="bordered"
              onValueChange={(valor) => cambiarCampo("descripcionPropuesta", valor)}
            />

            <NumberInput
              description="El 100 % del valor de la propuesta enviada."
              isDisabled={!esEditable}
              label="Valor anual (USD)"
              labelPlacement="outside"
              minValue={0}
              radius="lg"
              size="sm"
              startContent={<span className="text-xs text-default-400">$</span>}
              step={500}
              value={formulario.valorAnualUsd}
              variant="bordered"
              onValueChange={(valor) =>
                cambiarCampo("valorAnualUsd", Number.isNaN(valor) ? 0 : valor)
              }
            />
          </div>
        )}
      </div>

      {/* Recordatorio de que el valor solo cuenta con propuesta enviada. */}
      {!formulario.fasePropuestaCompletada && formulario.valorAnualUsd > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-warning-50 px-3 py-2 text-[11px] leading-relaxed text-warning-700 dark:bg-warning-100/10">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          Sin propuesta enviada el importe se guarda a cero, para que el
          total del pipeline no cuente dinero del que aún no se ha hablado.
        </p>
      )}
    </div>
  );
}
