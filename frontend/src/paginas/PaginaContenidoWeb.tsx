/**
 * paginas/PaginaContenidoWeb.tsx
 * ---------------------------------------------------------------------
 * El administrador de la web pública: cambiar textos, fotos, colores,
 * servicios, proyectos, equipo y aliados sin tocar código.
 *
 * Sustituye a la antigua `admin.html`. Funciona sobre un borrador en
 * memoria: se edita todo lo que haga falta y se publica una sola vez.
 * Mientras no se pulse "Publicar", la web sigue viéndose como estaba.
 *
 * Cada publicación crea una versión nueva en el servidor, así que si
 * alguien borra medio texto por accidente se puede restaurar desde el
 * historial en lugar de reescribirlo de memoria.
 * ---------------------------------------------------------------------
 */
import {
  Button,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Tab,
  Tabs,
  Textarea,
  Tooltip,
} from "@heroui/react";
import {
  ExternalLink,
  History,
  Image as ImageIcon,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Type,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mensajeDeError } from "@/api/clienteHttp";
import {
  obtenerContenidoParaEditar,
  obtenerHistorialDeContenido,
  publicarContenido,
  restablecerContenidoDeFabrica,
  restaurarVersionDeContenido,
} from "@/api/sitio";
import { CampoDeImagen } from "@/componentes/comunes/CampoDeImagen";
import {
  BloqueDeCarga,
  BloqueDeError,
} from "@/componentes/comunes/EstadosDePantalla";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import { formatearTiempoRelativo } from "@/utilidades/formato";
import type {
  AliadoDeLaWeb,
  ContenidoDeLaWeb,
  IdiomaDeLaWeb,
  MiembroDelEquipo,
  ProyectoDeLaWeb,
  ServicioDeLaWeb,
} from "@/tipos/modelos";

/**
 * Etiquetas legibles de las claves de texto.
 *
 * Las claves del contenido son técnicas ("hero.antetitulo"), así que se
 * traducen a lenguaje llano y se agrupan por sección de la web. Lo que
 * no esté aquí se sigue mostrando, con la clave tal cual: así, si se
 * añade un texto nuevo al diseño, aparece igualmente en el panel.
 */
const SECCIONES_DE_TEXTO: Array<{ prefijo: string; titulo: string }> = [
  { prefijo: "nav.", titulo: "Menú de navegación" },
  { prefijo: "hero.", titulo: "Portada" },
  { prefijo: "metricas.", titulo: "Cifras destacadas" },
  { prefijo: "nosotros.", titulo: "Quiénes somos" },
  { prefijo: "equipo.", titulo: "Equipo" },
  { prefijo: "servicios.", titulo: "Servicios" },
  { prefijo: "franja.", titulo: "Franja de llamada a la acción" },
  { prefijo: "proyectos.", titulo: "Proyectos" },
  { prefijo: "aliados.", titulo: "Aliados" },
  { prefijo: "contacto.", titulo: "Contacto" },
  { prefijo: "whatsapp.", titulo: "Bloque de WhatsApp" },
  { prefijo: "formulario.", titulo: "Formulario" },
  { prefijo: "pie.", titulo: "Pie de página" },
];

export function PaginaContenidoWeb() {
  const clienteDeConsultas = useQueryClient();

  const consultaDelContenido = useQuery({
    queryKey: ["contenido-web", "edicion"],
    queryFn: obtenerContenidoParaEditar,
    // Se vuelve a pedir siempre al entrar: el contenido lo pueden haber
    // cambiado desde otro equipo mientras tanto.
    staleTime: 0,
  });

  /** Borrador en memoria. Null mientras no ha llegado el contenido. */
  const [borrador, establecerBorrador] = useState<ContenidoDeLaWeb | null>(null);
  const [hayCambiosSinPublicar, establecerHayCambios] = useState(false);
  const [idiomaEnEdicion, establecerIdiomaEnEdicion] = useState<IdiomaDeLaWeb>("es");
  const [elHistorialEstaAbierto, establecerHistorialAbierto] = useState(false);

  // Carga inicial del borrador.
  useEffect(() => {
    if (consultaDelContenido.data && borrador === null) {
      establecerBorrador(consultaDelContenido.data.contenido);
    }
  }, [consultaDelContenido.data, borrador]);

  /** Modifica el borrador y marca que hay cambios pendientes. */
  function modificarBorrador(
    transformacion: (contenidoActual: ContenidoDeLaWeb) => ContenidoDeLaWeb,
  ) {
    establecerBorrador((contenidoActual) =>
      contenidoActual === null ? null : transformacion(contenidoActual),
    );

    establecerHayCambios(true);
  }

  /* ---------------------------------------------------------------- */
  /* Publicación                                                      */
  /* ---------------------------------------------------------------- */

  const publicar = useMutation({
    mutationFn: () => {
      if (borrador === null) throw new Error("No hay contenido que publicar.");

      return publicarContenido(borrador);
    },

    onSuccess: (resultado) => {
      avisarDeExito(resultado.mensaje);

      establecerHayCambios(false);
      void clienteDeConsultas.invalidateQueries({ queryKey: ["contenido-web"] });
    },

    onError: (error) => avisarDeError(error, "No se pudieron publicar los cambios"),
  });

  const restablecer = useMutation({
    mutationFn: restablecerContenidoDeFabrica,

    onSuccess: (contenidoDeFabrica) => {
      establecerBorrador(contenidoDeFabrica);
      establecerHayCambios(false);

      avisarDeExito("La web volvió al contenido de fábrica");
      void clienteDeConsultas.invalidateQueries({ queryKey: ["contenido-web"] });
    },

    onError: (error) => avisarDeError(error, "No se pudo restablecer"),
  });

  /* ---------------------------------------------------------------- */
  /* Aviso al salir con cambios sin publicar                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!hayCambiosSinPublicar) return;

    // Es el único sitio de la aplicación con un borrador que se puede
    // perder: media hora de trabajo cabe en esta pantalla.
    const avisarAlCerrar = (evento: BeforeUnloadEvent) => {
      evento.preventDefault();
      evento.returnValue = "";
    };

    window.addEventListener("beforeunload", avisarAlCerrar);

    return () => window.removeEventListener("beforeunload", avisarAlCerrar);
  }, [hayCambiosSinPublicar]);

  /* ---------------------------------------------------------------- */
  /* Estados de carga                                                 */
  /* ---------------------------------------------------------------- */

  if (consultaDelContenido.isLoading || borrador === null) {
    if (consultaDelContenido.error) {
      return (
        <BloqueDeError
          mensaje={mensajeDeError(consultaDelContenido.error)}
          alReintentar={() => void consultaDelContenido.refetch()}
        />
      );
    }

    return <BloqueDeCarga alto="min-h-96" mensaje="Cargando el contenido de la web…" />;
  }

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Web pública
          </h2>
          <p className="mt-0.5 text-sm text-default-500">
            {consultaDelContenido.data?.actualizadoPor
              ? `Última publicación por ${consultaDelContenido.data.actualizadoPor}, ${formatearTiempoRelativo(consultaDelContenido.data.actualizadoEn)}.`
              : "Cambia textos, fotos y colores sin tocar código."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hayCambiosSinPublicar && (
            <Chip color="warning" radius="lg" size="sm" variant="flat">
              Cambios sin publicar
            </Chip>
          )}

          <Tooltip content="Ver la web en otra pestaña">
            <Button
              isIconOnly
              as="a"
              href="/"
              radius="lg"
              rel="noreferrer"
              size="sm"
              target="_blank"
              variant="flat"
            >
              <ExternalLink className="size-4" />
            </Button>
          </Tooltip>

          <Button
            radius="lg"
            size="sm"
            startContent={<History className="size-4" />}
            variant="flat"
            onPress={() => establecerHistorialAbierto(true)}
          >
            Historial
          </Button>

          <Button
            color="primary"
            isDisabled={!hayCambiosSinPublicar}
            isLoading={publicar.isPending}
            radius="lg"
            size="sm"
            startContent={!publicar.isPending && <Save className="size-4" />}
            onPress={() => publicar.mutate()}
          >
            Publicar cambios
          </Button>
        </div>
      </div>

      {/* Pestañas */}
      <div className="bento-card p-4 sm:p-5">
        <Tabs
          aria-label="Secciones del contenido"
          classNames={{ tabList: "flex-wrap" }}
          color="primary"
          radius="lg"
          variant="light"
        >
          {/* ---------- Colores ---------- */}
          <Tab
            key="colores"
            title={
              <span className="flex items-center gap-1.5">
                <Palette className="size-4" />
                Colores
              </span>
            }
          >
            <div className="space-y-4 pt-4">
              <p className="text-xs leading-relaxed text-default-500">
                Estos son los colores de la web pública, los que ve el visitante.
                No tienen nada que ver con el color de tu perfil en el panel.
              </p>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    ["azulPrincipal", "Azul principal", "Cabecera y pie de página"],
                    ["azulSecundario", "Azul secundario", "Degradados y bloques"],
                    ["acento", "Acento", "Botones y enlaces"],
                    ["acentoVerde", "Acento verde", "Detalles y confirmaciones"],
                    ["fondoAlterno", "Fondo alterno", "Secciones a franjas"],
                  ] as const
                ).map(([clave, etiqueta, ayuda]) => (
                  <CampoDeColor
                    key={clave}
                    alCambiar={(nuevoColor) =>
                      modificarBorrador((contenido) => ({
                        ...contenido,
                        colores: { ...contenido.colores, [clave]: nuevoColor },
                      }))
                    }
                    ayuda={ayuda}
                    etiqueta={etiqueta}
                    valor={borrador.colores[clave]}
                  />
                ))}
              </div>
            </div>
          </Tab>

          {/* ---------- Imágenes ---------- */}
          <Tab
            key="imagenes"
            title={
              <span className="flex items-center gap-1.5">
                <ImageIcon className="size-4" />
                Imágenes
              </span>
            }
          >
            <div className="space-y-5 pt-4">
              <CampoDeImagen
                alCambiar={(url) =>
                  modificarBorrador((contenido) => ({
                    ...contenido,
                    imagenes: { ...contenido.imagenes, hero: url },
                  }))
                }
                ayuda="Foto grande de la portada. También se usa de respaldo si el vídeo no carga."
                etiqueta="Portada"
                valor={borrador.imagenes.hero}
              />

              <Input
                description="Vídeo de fondo de la portada, en bucle y sin sonido. Déjalo vacío para usar solo la foto."
                label="Vídeo de portada (URL .mp4)"
                labelPlacement="outside"
                radius="lg"
                value={borrador.imagenes.heroVideo}
                variant="bordered"
                onValueChange={(url) =>
                  modificarBorrador((contenido) => ({
                    ...contenido,
                    imagenes: { ...contenido.imagenes, heroVideo: url },
                  }))
                }
              />

              <CampoDeImagen
                alCambiar={(url) =>
                  modificarBorrador((contenido) => ({
                    ...contenido,
                    imagenes: { ...contenido.imagenes, nosotros: url },
                  }))
                }
                ayuda="Acompaña al texto de «Quiénes somos»."
                etiqueta="Quiénes somos"
                valor={borrador.imagenes.nosotros}
              />

              <CampoDeImagen
                alCambiar={(url) =>
                  modificarBorrador((contenido) => ({
                    ...contenido,
                    imagenes: { ...contenido.imagenes, llamadaAccion: url },
                  }))
                }
                ayuda="Fondo de la franja ancha del centro de la página."
                etiqueta="Franja de llamada a la acción"
                valor={borrador.imagenes.llamadaAccion}
              />
            </div>
          </Tab>

          {/* ---------- Textos ---------- */}
          <Tab
            key="textos"
            title={
              <span className="flex items-center gap-1.5">
                <Type className="size-4" />
                Textos
              </span>
            }
          >
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs leading-relaxed text-default-500">
                  La web está en dos idiomas. Cambia entre ellos para editar cada
                  versión.
                </p>

                <Tabs
                  aria-label="Idioma"
                  color="primary"
                  radius="lg"
                  selectedKey={idiomaEnEdicion}
                  size="sm"
                  onSelectionChange={(clave) =>
                    establecerIdiomaEnEdicion(clave as IdiomaDeLaWeb)
                  }
                >
                  <Tab key="es" title="Español" />
                  <Tab key="en" title="English" />
                </Tabs>
              </div>

              <EditorDeTextos
                alCambiar={(clave, valor) =>
                  modificarBorrador((contenido) => ({
                    ...contenido,
                    textos: {
                      ...contenido.textos,
                      [idiomaEnEdicion]: {
                        ...contenido.textos[idiomaEnEdicion],
                        [clave]: valor,
                      },
                    },
                  }))
                }
                textos={borrador.textos[idiomaEnEdicion]}
              />
            </div>
          </Tab>

          {/* ---------- Servicios ---------- */}
          <Tab key="servicios" title="Servicios">
            <ListaEditable
              alAnadir={() =>
                modificarBorrador((contenido) => ({
                  ...contenido,
                  servicios: [
                    ...contenido.servicios,
                    {
                      icono: "◆",
                      es: { titulo: "Servicio nuevo", descripcion: "" },
                      en: { titulo: "New service", descripcion: "" },
                    },
                  ],
                }))
              }
              alEliminar={(posicion) =>
                modificarBorrador((contenido) => ({
                  ...contenido,
                  servicios: contenido.servicios.filter((_, i) => i !== posicion),
                }))
              }
              etiquetaDeAnadir="Añadir servicio"
              elementos={borrador.servicios}
              renderizarElemento={(servicio, posicion) => (
                <EditorDeServicio
                  alCambiar={(servicioActualizado) =>
                    modificarBorrador((contenido) => ({
                      ...contenido,
                      servicios: contenido.servicios.map((s, i) =>
                        i === posicion ? servicioActualizado : s,
                      ),
                    }))
                  }
                  servicio={servicio}
                />
              )}
            />
          </Tab>

          {/* ---------- Proyectos ---------- */}
          <Tab key="proyectos" title="Proyectos">
            <ListaEditable
              alAnadir={() =>
                modificarBorrador((contenido) => ({
                  ...contenido,
                  proyectos: [
                    ...contenido.proyectos,
                    {
                      imagen: "",
                      degradado: "linear-gradient(135deg,#0d3b66,#1b6ca8)",
                      es: { etiqueta: "", titulo: "Proyecto nuevo", descripcion: "" },
                      en: { etiqueta: "", titulo: "New project", descripcion: "" },
                    },
                  ],
                }))
              }
              alEliminar={(posicion) =>
                modificarBorrador((contenido) => ({
                  ...contenido,
                  proyectos: contenido.proyectos.filter((_, i) => i !== posicion),
                }))
              }
              etiquetaDeAnadir="Añadir proyecto"
              elementos={borrador.proyectos}
              renderizarElemento={(proyecto, posicion) => (
                <EditorDeProyecto
                  alCambiar={(proyectoActualizado) =>
                    modificarBorrador((contenido) => ({
                      ...contenido,
                      proyectos: contenido.proyectos.map((p, i) =>
                        i === posicion ? proyectoActualizado : p,
                      ),
                    }))
                  }
                  proyecto={proyecto}
                />
              )}
            />
          </Tab>

          {/* ---------- Equipo ---------- */}
          <Tab
            key="equipo"
            title={
              <span className="flex items-center gap-1.5">
                <Users className="size-4" />
                Equipo
              </span>
            }
          >
            <ListaEditable
              alAnadir={() =>
                modificarBorrador((contenido) => ({
                  ...contenido,
                  equipo: [
                    ...contenido.equipo,
                    {
                      nombre: "Nombre y apellido",
                      foto: "",
                      es: { cargo: "" },
                      en: { cargo: "" },
                    },
                  ],
                }))
              }
              alEliminar={(posicion) =>
                modificarBorrador((contenido) => ({
                  ...contenido,
                  equipo: contenido.equipo.filter((_, i) => i !== posicion),
                }))
              }
              etiquetaDeAnadir="Añadir persona"
              elementos={borrador.equipo}
              renderizarElemento={(miembro, posicion) => (
                <EditorDeMiembro
                  alCambiar={(miembroActualizado) =>
                    modificarBorrador((contenido) => ({
                      ...contenido,
                      equipo: contenido.equipo.map((m, i) =>
                        i === posicion ? miembroActualizado : m,
                      ),
                    }))
                  }
                  miembro={miembro}
                />
              )}
            />
          </Tab>

          {/* ---------- Aliados ---------- */}
          <Tab key="aliados" title="Aliados">
            <ListaEditable
              alAnadir={() =>
                modificarBorrador((contenido) => ({
                  ...contenido,
                  aliados: [...contenido.aliados, { nombre: "Marca", logo: "" }],
                }))
              }
              alEliminar={(posicion) =>
                modificarBorrador((contenido) => ({
                  ...contenido,
                  aliados: contenido.aliados.filter((_, i) => i !== posicion),
                }))
              }
              etiquetaDeAnadir="Añadir aliado"
              elementos={borrador.aliados}
              renderizarElemento={(aliado, posicion) => (
                <EditorDeAliado
                  alCambiar={(aliadoActualizado) =>
                    modificarBorrador((contenido) => ({
                      ...contenido,
                      aliados: contenido.aliados.map((a, i) =>
                        i === posicion ? aliadoActualizado : a,
                      ),
                    }))
                  }
                  aliado={aliado}
                />
              )}
            />
          </Tab>

          {/* ---------- Contacto ---------- */}
          <Tab key="contacto" title="Contacto">
            <div className="grid gap-4 pt-4 sm:grid-cols-2">
              {(
                [
                  ["email", "Correo de contacto", "info@tssports.com"],
                  ["whatsapp", "WhatsApp", "+57 320 4325231"],
                  ["instagram", "Instagram (URL)", "https://instagram.com/…"],
                  ["linkedin", "LinkedIn (URL)", "https://linkedin.com/company/…"],
                ] as const
              ).map(([clave, etiqueta, ejemplo]) => (
                <Input
                  key={clave}
                  label={etiqueta}
                  labelPlacement="outside"
                  placeholder={ejemplo}
                  radius="lg"
                  value={borrador.contacto[clave]}
                  variant="bordered"
                  onValueChange={(valor) =>
                    modificarBorrador((contenido) => ({
                      ...contenido,
                      contacto: { ...contenido.contacto, [clave]: valor },
                    }))
                  }
                />
              ))}
            </div>
          </Tab>
        </Tabs>
      </div>

      {/* Restablecer, al final y discreto: es una acción poco frecuente. */}
      <div className="flex justify-end">
        <Button
          color="danger"
          isLoading={restablecer.isPending}
          radius="lg"
          size="sm"
          startContent={<RotateCcw className="size-3.5" />}
          variant="light"
          onPress={() => restablecer.mutate()}
        >
          Restablecer al contenido de fábrica
        </Button>
      </div>

      <ModalDeHistorial
        alCerrar={() => establecerHistorialAbierto(false)}
        alRestaurar={(contenidoRestaurado) => {
          establecerBorrador(contenidoRestaurado);
          establecerHayCambios(false);
          establecerHistorialAbierto(false);
        }}
        estaAbierto={elHistorialEstaAbierto}
      />
    </div>
  );
}

/* ==================================================================== */
/* Piezas de edición                                                   */
/* ==================================================================== */

/** Selector de color con muestra y campo hexadecimal. */
function CampoDeColor({
  etiqueta,
  ayuda,
  valor,
  alCambiar,
}: {
  etiqueta: string;
  ayuda: string;
  valor: string;
  alCambiar: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-default-200 p-3">
      {/* El selector nativo del sistema operativo: no hace falta más. */}
      <input
        aria-label={etiqueta}
        className="size-11 shrink-0 cursor-pointer rounded-xl border border-default-200 bg-transparent"
        type="color"
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
      />

      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">{etiqueta}</p>
        <p className="mb-1 text-[10px] leading-tight text-default-500">{ayuda}</p>

        <Input
          aria-label={`Código del color ${etiqueta}`}
          classNames={{ input: "font-mono text-[11px]" }}
          radius="lg"
          size="sm"
          value={valor}
          variant="bordered"
          onValueChange={alCambiar}
        />
      </div>
    </div>
  );
}

/** Editor de todos los textos de un idioma, agrupados por sección. */
function EditorDeTextos({
  textos,
  alCambiar,
}: {
  textos: Record<string, string>;
  alCambiar: (clave: string, valor: string) => void;
}) {
  const clavesYaMostradas = new Set<string>();

  return (
    <div className="space-y-6">
      {SECCIONES_DE_TEXTO.map((seccion) => {
        const clavesDeLaSeccion = Object.keys(textos)
          .filter((clave) => clave.startsWith(seccion.prefijo))
          .sort();

        if (clavesDeLaSeccion.length === 0) return null;

        clavesDeLaSeccion.forEach((clave) => clavesYaMostradas.add(clave));

        return (
          <section key={seccion.prefijo}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-default-500">
              {seccion.titulo}
            </h3>

            <div className="grid gap-3 lg:grid-cols-2">
              {clavesDeLaSeccion.map((clave) => (
                <CampoDeTexto
                  key={clave}
                  alCambiar={(valor) => alCambiar(clave, valor)}
                  clave={clave}
                  valor={textos[clave] ?? ""}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* Cualquier clave que no encaje en las secciones conocidas: así un
          texto nuevo del diseño se puede editar sin tocar este fichero. */}
      {(() => {
        const clavesSueltas = Object.keys(textos)
          .filter((clave) => !clavesYaMostradas.has(clave))
          .sort();

        if (clavesSueltas.length === 0) return null;

        return (
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-default-500">
              Otros textos
            </h3>

            <div className="grid gap-3 lg:grid-cols-2">
              {clavesSueltas.map((clave) => (
                <CampoDeTexto
                  key={clave}
                  alCambiar={(valor) => alCambiar(clave, valor)}
                  clave={clave}
                  valor={textos[clave] ?? ""}
                />
              ))}
            </div>
          </section>
        );
      })()}
    </div>
  );
}

/**
 * Un texto suelto. Los largos usan un área de varias líneas: escribir un
 * párrafo en una caja de una sola línea es incomodísimo.
 */
function CampoDeTexto({
  clave,
  valor,
  alCambiar,
}: {
  clave: string;
  valor: string;
  alCambiar: (valor: string) => void;
}) {
  const esUnTextoLargo = valor.length > 90;

  // "hero.antetitulo" → "antetitulo"
  const etiquetaCorta = clave.split(".").slice(1).join(".") || clave;

  if (esUnTextoLargo) {
    return (
      <div className="lg:col-span-2">
        <Textarea
          label={etiquetaCorta}
          labelPlacement="outside"
          minRows={2}
          radius="lg"
          size="sm"
          value={valor}
          variant="bordered"
          onValueChange={alCambiar}
        />
      </div>
    );
  }

  return (
    <Input
      label={etiquetaCorta}
      labelPlacement="outside"
      radius="lg"
      size="sm"
      value={valor}
      variant="bordered"
      onValueChange={alCambiar}
    />
  );
}

/**
 * Envoltorio genérico de las listas editables (servicios, proyectos,
 * equipo y aliados): la tarjeta, el botón de borrar y el de añadir.
 */
function ListaEditable<T>({
  elementos,
  renderizarElemento,
  alAnadir,
  alEliminar,
  etiquetaDeAnadir,
}: {
  elementos: T[];
  renderizarElemento: (elemento: T, posicion: number) => React.ReactNode;
  alAnadir: () => void;
  alEliminar: (posicion: number) => void;
  etiquetaDeAnadir: string;
}) {
  return (
    <div className="space-y-3 pt-4">
      {elementos.map((elemento, posicion) => (
        <div
          key={posicion}
          className="relative rounded-2xl border border-default-200 p-4"
        >
          <Tooltip content="Quitar" placement="left">
            <Button
              isIconOnly
              aria-label="Quitar el elemento"
              className="absolute right-2 top-2"
              color="danger"
              radius="lg"
              size="sm"
              variant="light"
              onPress={() => alEliminar(posicion)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </Tooltip>

          {renderizarElemento(elemento, posicion)}
        </div>
      ))}

      <Button
        className="w-full"
        radius="lg"
        startContent={<Plus className="size-4" />}
        variant="flat"
        onPress={alAnadir}
      >
        {etiquetaDeAnadir}
      </Button>
    </div>
  );
}

function EditorDeServicio({
  servicio,
  alCambiar,
}: {
  servicio: ServicioDeLaWeb;
  alCambiar: (servicio: ServicioDeLaWeb) => void;
}) {
  return (
    <div className="grid gap-3 pr-10 sm:grid-cols-[5rem_1fr]">
      <Input
        classNames={{ input: "text-center text-lg" }}
        label="Icono"
        labelPlacement="outside"
        radius="lg"
        size="sm"
        value={servicio.icono}
        variant="bordered"
        onValueChange={(icono) => alCambiar({ ...servicio, icono })}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {(["es", "en"] as const).map((idioma) => (
          <div key={idioma} className="space-y-2">
            <Input
              label={idioma === "es" ? "Título (ES)" : "Título (EN)"}
              labelPlacement="outside"
              radius="lg"
              size="sm"
              value={servicio[idioma].titulo}
              variant="bordered"
              onValueChange={(titulo) =>
                alCambiar({
                  ...servicio,
                  [idioma]: { ...servicio[idioma], titulo },
                })
              }
            />

            <Textarea
              label={idioma === "es" ? "Descripción (ES)" : "Descripción (EN)"}
              labelPlacement="outside"
              minRows={2}
              radius="lg"
              size="sm"
              value={servicio[idioma].descripcion}
              variant="bordered"
              onValueChange={(descripcion) =>
                alCambiar({
                  ...servicio,
                  [idioma]: { ...servicio[idioma], descripcion },
                })
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function EditorDeProyecto({
  proyecto,
  alCambiar,
}: {
  proyecto: ProyectoDeLaWeb;
  alCambiar: (proyecto: ProyectoDeLaWeb) => void;
}) {
  return (
    <div className="space-y-3 pr-10">
      <CampoDeImagen
        alCambiar={(imagen) => alCambiar({ ...proyecto, imagen })}
        ayuda="Si la dejas vacía se usa el degradado de color."
        etiqueta="Imagen del proyecto"
        valor={proyecto.imagen}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {(["es", "en"] as const).map((idioma) => (
          <div key={idioma} className="space-y-2">
            <Input
              label={idioma === "es" ? "Etiqueta (ES)" : "Etiqueta (EN)"}
              labelPlacement="outside"
              radius="lg"
              size="sm"
              value={proyecto[idioma].etiqueta}
              variant="bordered"
              onValueChange={(etiqueta) =>
                alCambiar({ ...proyecto, [idioma]: { ...proyecto[idioma], etiqueta } })
              }
            />

            <Input
              label={idioma === "es" ? "Título (ES)" : "Título (EN)"}
              labelPlacement="outside"
              radius="lg"
              size="sm"
              value={proyecto[idioma].titulo}
              variant="bordered"
              onValueChange={(titulo) =>
                alCambiar({ ...proyecto, [idioma]: { ...proyecto[idioma], titulo } })
              }
            />

            <Textarea
              label={idioma === "es" ? "Descripción (ES)" : "Descripción (EN)"}
              labelPlacement="outside"
              minRows={2}
              radius="lg"
              size="sm"
              value={proyecto[idioma].descripcion}
              variant="bordered"
              onValueChange={(descripcion) =>
                alCambiar({
                  ...proyecto,
                  [idioma]: { ...proyecto[idioma], descripcion },
                })
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function EditorDeMiembro({
  miembro,
  alCambiar,
}: {
  miembro: MiembroDelEquipo;
  alCambiar: (miembro: MiembroDelEquipo) => void;
}) {
  return (
    <div className="space-y-3 pr-10">
      <Input
        label="Nombre"
        labelPlacement="outside"
        radius="lg"
        size="sm"
        value={miembro.nombre}
        variant="bordered"
        onValueChange={(nombre) => alCambiar({ ...miembro, nombre })}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Cargo (ES)"
          labelPlacement="outside"
          radius="lg"
          size="sm"
          value={miembro.es.cargo}
          variant="bordered"
          onValueChange={(cargo) => alCambiar({ ...miembro, es: { cargo } })}
        />

        <Input
          label="Cargo (EN)"
          labelPlacement="outside"
          radius="lg"
          size="sm"
          value={miembro.en.cargo}
          variant="bordered"
          onValueChange={(cargo) => alCambiar({ ...miembro, en: { cargo } })}
        />
      </div>

      <CampoDeImagen
        alCambiar={(foto) => alCambiar({ ...miembro, foto })}
        etiqueta="Foto"
        formaDeLaVistaPrevia="cuadrada"
        valor={miembro.foto}
      />
    </div>
  );
}

function EditorDeAliado({
  aliado,
  alCambiar,
}: {
  aliado: AliadoDeLaWeb;
  alCambiar: (aliado: AliadoDeLaWeb) => void;
}) {
  return (
    <div className="space-y-3 pr-10">
      <Input
        description="Si no pones logo, se muestra este nombre como texto."
        label="Nombre de la marca"
        labelPlacement="outside"
        radius="lg"
        size="sm"
        value={aliado.nombre}
        variant="bordered"
        onValueChange={(nombre) => alCambiar({ ...aliado, nombre })}
      />

      <CampoDeImagen
        alCambiar={(logo) => alCambiar({ ...aliado, logo })}
        etiqueta="Logo"
        formaDeLaVistaPrevia="cuadrada"
        valor={aliado.logo}
      />
    </div>
  );
}

/* ==================================================================== */
/* Historial de versiones                                              */
/* ==================================================================== */

function ModalDeHistorial({
  estaAbierto,
  alCerrar,
  alRestaurar,
}: {
  estaAbierto: boolean;
  alCerrar: () => void;
  alRestaurar: (contenido: ContenidoDeLaWeb) => void;
}) {
  const consultaDelHistorial = useQuery({
    queryKey: ["contenido-web", "historial"],
    queryFn: obtenerHistorialDeContenido,
    enabled: estaAbierto,
  });

  const restaurar = useMutation({
    mutationFn: restaurarVersionDeContenido,

    onSuccess: (contenidoRestaurado) => {
      avisarDeExito("Versión restaurada y publicada");
      alRestaurar(contenidoRestaurado);
    },

    onError: (error) => avisarDeError(error, "No se pudo restaurar la versión"),
  });

  return (
    <Modal isOpen={estaAbierto} scrollBehavior="inside" size="lg" onOpenChange={(abierto) => !abierto && alCerrar()}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="text-lg font-bold tracking-tight">
            Historial de la web
          </span>
          <span className="text-xs font-normal text-default-500">
            Cada publicación guarda una versión. Puedes volver a cualquiera.
          </span>
        </ModalHeader>

        <ModalBody className="pb-6">
          {consultaDelHistorial.isLoading ? (
            <BloqueDeCarga mensaje="Cargando el historial…" />
          ) : (
            <ul className="space-y-2">
              {(consultaDelHistorial.data ?? []).map((version) => (
                <li
                  key={version.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-default-200 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {version.autor}

                      {version.esLaPublicada && (
                        <Chip color="success" radius="lg" size="sm" variant="flat">
                          En la web
                        </Chip>
                      )}
                    </p>

                    <p className="truncate text-[11px] text-default-500">
                      {formatearTiempoRelativo(version.creadaEn)}
                      {version.nota ? ` · ${version.nota}` : ""}
                    </p>
                  </div>

                  {!version.esLaPublicada && (
                    <Button
                      isLoading={
                        restaurar.isPending && restaurar.variables === version.id
                      }
                      radius="lg"
                      size="sm"
                      variant="flat"
                      onPress={() => restaurar.mutate(version.id)}
                    >
                      Restaurar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
