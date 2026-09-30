/**
 * componentes/crm/GaleriaDePropiedad.tsx
 * ---------------------------------------------------------------------
 * El material de venta de una propiedad, dentro de su ventana de
 * edición: subir fotos y PDF, ordenarlos, elegir la portada, ponerles
 * título y decidir qué foto sale en la web.
 *
 * TODO SE GUARDA AL MOMENTO, fichero a fichero, sin pasar por el botón
 * «Guardar cambios» de la ventana: una foto subida ya está en la galería
 * aunque luego se cancele el formulario. La caja lo dice, porque es lo
 * contrario de lo que hace el resto de la ventana.
 *
 *   · Subir: varias a la vez, con el botón o soltándolas encima. Cada una
 *     va por su cuenta con su barra, y la miniatura la hace el navegador
 *     antes de mandarla (utilidades/ficheros.ts).
 *   · Ordenar: arrastrando con el ratón. Con el dedo el navegador no
 *     arrastra, así que el menú de cada pieza trae además «Mover antes» y
 *     «Mover después».
 *   · El título no es decorativo: «Vista desde tribuna este» es lo que
 *     convierte una foto en un argumento de venta. Sale en el visor.
 *
 * Qué puede tocar cada quien no se decide aquí: esta caja solo aparece en
 * la ventana de edición, que solo abre quien puede editar la propiedad, y
 * el servidor lo vuelve a comprobar en cada petición.
 * ---------------------------------------------------------------------
 */
import {
  Button,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Progress,
  Textarea,
} from "@heroui/react";
import {
  ArrowLeft,
  ArrowRight,
  EyeOff,
  FileText,
  Globe,
  GripVertical,
  ImagePlus,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  VisorDeGaleria,
  type ElementoDelVisor,
} from "@/componentes/comunes/VisorDeGaleria";
import { useCatalogos } from "@/hooks/useCatalogos";
import { useGaleriaDePropiedad } from "@/hooks/usePropiedades";
import { avisarDeError } from "@/utilidades/avisos";
import {
  TIPOS_ADMITIDOS_EN_GALERIA_Y_BITACORA,
  generarMiniatura,
  motivoParaNoSubir,
} from "@/utilidades/ficheros";
import { formatearTamanoDeFichero } from "@/utilidades/formato";
import type { ArchivoDeGaleria, Propiedad } from "@/tipos/modelos";

/** Cuántas subidas van a la vez. Más ahogaría la conexión de un móvil. */
const SUBIDAS_A_LA_VEZ = 3;

/** Lo que se pinta de una subida en marcha. */
interface SubidaEnMarcha {
  idLocal: string;
  nombre: string;
  progreso: number;
}

/** Lo que se arrastra al reordenar, para no confundirlo con un fichero. */
const TIPO_DE_ARRASTRE = "application/x-tsports-pieza";

export function GaleriaDePropiedad({
  propiedad,
  seVaAPublicar,
}: {
  propiedad: Propiedad;
  /** Lo que dice ahora el interruptor de la web del formulario, aunque no se haya guardado. */
  seVaAPublicar: boolean;
}) {
  const { catalogos } = useCatalogos();
  const galeria = useGaleriaDePropiedad(propiedad.id, propiedad);

  const [subidas, establecerSubidas] = useState<SubidaEnMarcha[]>([]);
  const [estaArrastrandoFicheros, establecerArrastrandoFicheros] = useState(false);
  const [idArrastrada, establecerIdArrastrada] = useState<string | null>(null);
  const [idDestino, establecerIdDestino] = useState<string | null>(null);
  const [idEnEdicion, establecerIdEnEdicion] = useState<string | null>(null);
  const [idPorBorrar, establecerIdPorBorrar] = useState<string | null>(null);
  const [idOcupada, establecerIdOcupada] = useState<string | null>(null);
  const [posicionEnElVisor, establecerPosicionEnElVisor] = useState<number | null>(null);

  const selectorDeFicheros = useRef<HTMLInputElement>(null);

  const piezas = galeria.galeria;
  const tamanoMaximoMb = catalogos?.tamanoMaximoDeArchivoMb ?? 20;

  /* ------------------------------------------------------------------ */
  /* Subir                                                               */
  /* ------------------------------------------------------------------ */

  async function subirFicheros(ficheros: File[]) {
    const validos = ficheros.filter((fichero) => {
      const motivo = motivoParaNoSubir(fichero, tamanoMaximoMb);

      if (motivo !== null) avisarDeError(motivo, "No se puede subir");

      return motivo === null;
    });

    const pendientes = validos.map((fichero) => ({
      fichero,
      idLocal: idAlAzar(),
    }));

    establecerSubidas((actuales) => [
      ...actuales,
      ...pendientes.map(({ fichero, idLocal }) => ({ idLocal, nombre: fichero.name, progreso: 0 })),
    ]);

    // Una cola sencilla con varias a la vez: cada «trabajador» va sacando
    // la siguiente hasta que no queda ninguna.
    const cola = [...pendientes];

    async function trabajador() {
      for (let siguiente = cola.shift(); siguiente !== undefined; siguiente = cola.shift()) {
        const { fichero, idLocal } = siguiente;

        try {
          const miniatura = await generarMiniatura(fichero);

          await galeria.subir(fichero, miniatura, (fraccion) => {
            establecerSubidas((actuales) =>
              actuales.map((subida) =>
                subida.idLocal === idLocal ? { ...subida, progreso: fraccion } : subida,
              ),
            );
          });
        } catch (error) {
          avisarDeError(error, `No se pudo subir «${fichero.name}»`);
        } finally {
          establecerSubidas((actuales) => actuales.filter((subida) => subida.idLocal !== idLocal));
        }
      }
    }

    await Promise.all(Array.from({ length: SUBIDAS_A_LA_VEZ }, trabajador));
  }

  function alSoltarEnLaCaja(evento: DragEvent) {
    evento.preventDefault();
    establecerArrastrandoFicheros(false);

    if (evento.dataTransfer.files.length > 0) {
      void subirFicheros(Array.from(evento.dataTransfer.files));
    }
  }

  /* ------------------------------------------------------------------ */
  /* Ordenar                                                             */
  /* ------------------------------------------------------------------ */

  async function llevarA(idDeLaPieza: string, posicionNueva: number) {
    const ids = piezas.map((pieza) => pieza.id);
    const posicionActual = ids.indexOf(idDeLaPieza);

    if (posicionActual === -1 || posicionActual === posicionNueva) return;

    ids.splice(posicionActual, 1);
    ids.splice(posicionNueva, 0, idDeLaPieza);

    try {
      await galeria.reordenar(ids);
    } catch (error) {
      avisarDeError(error, "No se pudo cambiar el orden");
    }
  }

  function alSoltarSobreUnaPieza(idDeLaPieza: string) {
    const arrastrada = idArrastrada;

    establecerIdArrastrada(null);
    establecerIdDestino(null);

    if (arrastrada === null || arrastrada === idDeLaPieza) return;

    void llevarA(
      arrastrada,
      piezas.findIndex((pieza) => pieza.id === idDeLaPieza),
    );
  }

  /* ------------------------------------------------------------------ */
  /* Lo demás                                                            */
  /* ------------------------------------------------------------------ */

  /** Ejecuta una acción sobre una pieza, con su rueda y su aviso si falla. */
  async function sobreLaPieza(idDeLaPieza: string, accion: () => Promise<void>, siFalla: string) {
    establecerIdOcupada(idDeLaPieza);

    try {
      await accion();
    } catch (error) {
      avisarDeError(error, siFalla);
    } finally {
      establecerIdOcupada(null);
    }
  }

  const elementosDelVisor: ElementoDelVisor[] = piezas.map((pieza) => ({
    id: pieza.id,
    tipo: pieza.tipo,
    url: pieza.url,
    urlMiniatura: pieza.urlMiniatura,
    nombre: pieza.nombre,
    titulo: pieza.titulo,
    descripcion: pieza.descripcion,
    tamanoBytes: pieza.tamanoBytes,
  }));

  const totalDeFotos = piezas.filter((pieza) => pieza.tipo === "imagen").length;
  const totalDeDocumentos = piezas.length - totalDeFotos;

  return (
    <div
      className={[
        "rounded-2xl border p-4 transition",
        estaArrastrandoFicheros ? "border-primary bg-primary-50/40 dark:bg-primary-100/10" : "border-default-200",
      ].join(" ")}
      onDragLeave={(evento) => {
        // Solo al salir de la caja de verdad, no al pasar de un hijo a otro.
        if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) {
          establecerArrastrandoFicheros(false);
        }
      }}
      onDragOver={(evento) => {
        if (evento.dataTransfer.types.includes("Files")) {
          evento.preventDefault();
          establecerArrastrandoFicheros(true);
        }
      }}
      onDrop={(evento) => {
        if (evento.dataTransfer.types.includes("Files")) alSoltarEnLaCaja(evento);
      }}
    >
      {/* Cabecera */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ImagePlus className="size-4 text-default-400" />
            Fotos, planos y dossier
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-default-500">
            {piezas.length === 0
              ? "Lo que el vendedor abre delante del cliente desde la ficha de la marca."
              : `${totalDeFotos} ${totalDeFotos === 1 ? "foto" : "fotos"} · ${totalDeDocumentos} ${
                  totalDeDocumentos === 1 ? "documento" : "documentos"
                }. Se guarda al subirlo, sin pulsar «Guardar».`}
          </p>
        </div>

        <Button
          color="primary"
          radius="lg"
          size="sm"
          startContent={<Upload className="size-4" />}
          variant="flat"
          onPress={() => selectorDeFicheros.current?.click()}
        >
          Subir fotos o PDF
        </Button>
      </div>

      {/* Las subidas en marcha */}
      {subidas.length > 0 && (
        <div className="mt-3 space-y-2">
          {subidas.map((subida) => (
            <div key={subida.idLocal} className="rounded-xl bg-default-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="min-w-0 truncate text-default-600">{subida.nombre}</span>
                <span className="shrink-0 tabular-nums text-default-400">
                  {subida.progreso === 0 ? "En cola" : `${Math.round(subida.progreso * 100)} %`}
                </span>
              </div>
              <Progress
                aria-label={`Subiendo ${subida.nombre}`}
                className="mt-1.5"
                color="primary"
                radius="full"
                size="sm"
                value={subida.progreso * 100}
              />
            </div>
          ))}
        </div>
      )}

      {/* La galería */}
      {piezas.length === 0 && subidas.length === 0 ? (
        <button
          className="mt-3 flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-default-200 px-4 py-6 text-center transition hover:border-primary"
          type="button"
          onClick={() => selectorDeFicheros.current?.click()}
        >
          <ImagePlus className="size-6 text-default-300" />
          <span className="text-xs font-semibold text-default-600">
            Arrastra aquí las fotos del recinto, los planos o el dossier
          </span>
          <span className="text-[11px] text-default-400">
            JPG, PNG, WebP, GIF o PDF, hasta {tamanoMaximoMb} MB cada uno
          </span>
        </button>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {piezas.map((pieza, posicion) => (
            <PiezaDeLaGaleria
              key={pieza.id}
              esLaPrimera={posicion === 0}
              esLaUltima={posicion === piezas.length - 1}
              estaOcupada={idOcupada === pieza.id}
              estaConfirmandoBorrado={idPorBorrar === pieza.id}
              estaEditandose={idEnEdicion === pieza.id}
              esDestinoDelArrastre={idDestino === pieza.id && idArrastrada !== pieza.id}
              pieza={pieza}
              seVaAPublicar={seVaAPublicar}
              alAbrir={() => establecerPosicionEnElVisor(posicion)}
              alArrastrar={() => establecerIdArrastrada(pieza.id)}
              alCancelar={() => {
                establecerIdEnEdicion(null);
                establecerIdPorBorrar(null);
              }}
              alElegirAccion={(accion) => {
                if (accion === "portada") {
                  void sobreLaPieza(pieza.id, () => galeria.elegirPortada(pieza.id), "No se pudo cambiar la portada");
                } else if (accion === "web") {
                  void sobreLaPieza(
                    pieza.id,
                    () => galeria.actualizar(pieza.id, { enLaWeb: !pieza.enLaWeb }),
                    "No se pudo cambiar",
                  );
                } else if (accion === "editar") {
                  establecerIdPorBorrar(null);
                  establecerIdEnEdicion(pieza.id);
                } else if (accion === "antes") {
                  void llevarA(pieza.id, posicion - 1);
                } else if (accion === "despues") {
                  void llevarA(pieza.id, posicion + 1);
                } else if (accion === "eliminar") {
                  establecerIdEnEdicion(null);
                  establecerIdPorBorrar(pieza.id);
                }
              }}
              alConfirmarBorrado={() => {
                establecerIdPorBorrar(null);
                void sobreLaPieza(pieza.id, () => galeria.eliminar(pieza.id), "No se pudo quitar");
              }}
              alGuardarTexto={async (titulo, descripcion) => {
                await sobreLaPieza(
                  pieza.id,
                  () => galeria.actualizar(pieza.id, { titulo, descripcion }),
                  "No se pudo guardar el título",
                );
                establecerIdEnEdicion(null);
              }}
              alPasarPorEncima={() => establecerIdDestino(pieza.id)}
              alSoltar={() => alSoltarSobreUnaPieza(pieza.id)}
              alTerminarDeArrastrar={() => {
                establecerIdArrastrada(null);
                establecerIdDestino(null);
              }}
            />
          ))}
        </div>
      )}

      {seVaAPublicar && totalDeFotos > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-default-500">
          <Globe className="size-3.5 shrink-0" />
          Las fotos sin la marca «Solo para el equipo» salen en la web. Los PDF no salen nunca.
        </p>
      )}

      {/* El selector real queda oculto: lo abre el botón. */}
      <input
        ref={selectorDeFicheros}
        multiple
        accept={TIPOS_ADMITIDOS_EN_GALERIA_Y_BITACORA}
        className="hidden"
        type="file"
        onChange={(evento) => {
          const elegidos = Array.from(evento.target.files ?? []);

          // Se limpia para que elegir otra vez los mismos vuelva a subir.
          evento.target.value = "";

          if (elegidos.length > 0) void subirFicheros(elegidos);
        }}
      />

      <VisorDeGaleria
        elementos={elementosDelVisor}
        estaAbierto={posicionEnElVisor !== null}
        posicionInicial={posicionEnElVisor ?? 0}
        titulo={propiedad.nombre}
        alCerrar={() => establecerPosicionEnElVisor(null)}
      />
    </div>
  );
}

/* ==================================================================== */
/* Una pieza                                                            */
/* ==================================================================== */

type AccionSobreLaPieza = "portada" | "web" | "editar" | "antes" | "despues" | "eliminar";

function PiezaDeLaGaleria({
  pieza,
  seVaAPublicar,
  esLaPrimera,
  esLaUltima,
  estaOcupada,
  estaEditandose,
  estaConfirmandoBorrado,
  esDestinoDelArrastre,
  alAbrir,
  alElegirAccion,
  alCancelar,
  alConfirmarBorrado,
  alGuardarTexto,
  alArrastrar,
  alPasarPorEncima,
  alSoltar,
  alTerminarDeArrastrar,
}: {
  pieza: ArchivoDeGaleria;
  seVaAPublicar: boolean;
  esLaPrimera: boolean;
  esLaUltima: boolean;
  estaOcupada: boolean;
  estaEditandose: boolean;
  estaConfirmandoBorrado: boolean;
  esDestinoDelArrastre: boolean;
  alAbrir: () => void;
  alElegirAccion: (accion: AccionSobreLaPieza) => void;
  alCancelar: () => void;
  alConfirmarBorrado: () => void;
  alGuardarTexto: (titulo: string | null, descripcion: string | null) => Promise<void>;
  alArrastrar: () => void;
  alPasarPorEncima: () => void;
  alSoltar: () => void;
  alTerminarDeArrastrar: () => void;
}) {
  const esFoto = pieza.tipo === "imagen";

  const acciones: Array<{ clave: AccionSobreLaPieza; texto: string; icono: ReactNode; peligrosa?: boolean }> = [
    ...(esFoto && !pieza.esPortada
      ? [{ clave: "portada" as const, texto: "Usar como portada", icono: <Star className="size-4" /> }]
      : []),
    ...(esFoto
      ? [
          {
            clave: "web" as const,
            texto: pieza.enLaWeb ? "No enseñarla en la web" : "Enseñarla en la web",
            icono: pieza.enLaWeb ? <EyeOff className="size-4" /> : <Globe className="size-4" />,
          },
        ]
      : []),
    { clave: "editar", texto: "Título y descripción", icono: <Pencil className="size-4" /> },
    ...(!esLaPrimera ? [{ clave: "antes" as const, texto: "Mover antes", icono: <ArrowLeft className="size-4" /> }] : []),
    ...(!esLaUltima ? [{ clave: "despues" as const, texto: "Mover después", icono: <ArrowRight className="size-4" /> }] : []),
    { clave: "eliminar", texto: "Quitar de la galería", icono: <Trash2 className="size-4" />, peligrosa: true },
  ];

  return (
    <article
      className={[
        "group flex flex-col overflow-hidden rounded-xl border bg-content1 transition",
        esDestinoDelArrastre ? "border-primary ring-2 ring-primary/40" : "border-default-200",
        estaOcupada ? "opacity-60" : "",
      ].join(" ")}
      draggable={!estaEditandose && !estaConfirmandoBorrado}
      onDragEnd={alTerminarDeArrastrar}
      onDragOver={(evento) => {
        if (evento.dataTransfer.types.includes(TIPO_DE_ARRASTRE)) {
          evento.preventDefault();
          alPasarPorEncima();
        }
      }}
      onDragStart={(evento) => {
        evento.dataTransfer.effectAllowed = "move";
        evento.dataTransfer.setData(TIPO_DE_ARRASTRE, pieza.id);
        alArrastrar();
      }}
      onDrop={(evento) => {
        if (evento.dataTransfer.types.includes(TIPO_DE_ARRASTRE)) {
          evento.preventDefault();
          evento.stopPropagation();
          alSoltar();
        }
      }}
    >
      {/* La vista: se abre en el visor al pulsarla. */}
      <button
        aria-label={`Ver ${pieza.titulo ?? pieza.nombre}`}
        className="relative block aspect-[4/3] w-full overflow-hidden bg-default-100"
        type="button"
        onClick={alAbrir}
      >
        {esFoto ? (
          <img
            alt=""
            className="size-full object-cover"
            draggable={false}
            loading="lazy"
            src={pieza.urlMiniatura ?? pieza.url}
          />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-1 px-2 text-default-500">
            <FileText className="size-7" />
            <span className="line-clamp-2 break-all text-[10px]">{pieza.nombre}</span>
          </span>
        )}

        <span className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
          {pieza.esPortada && (
            <Chip
              className="h-5 bg-black/60 text-[10px] text-white"
              radius="full"
              size="sm"
              startContent={<Star className="ml-0.5 size-3 fill-current" />}
            >
              Portada
            </Chip>
          )}

          {esFoto && seVaAPublicar && !pieza.enLaWeb && (
            <Chip
              className="h-5 bg-black/60 text-[10px] text-white"
              radius="full"
              size="sm"
              startContent={<EyeOff className="ml-0.5 size-3" />}
            >
              Solo para el equipo
            </Chip>
          )}
        </span>

        <GripVertical className="absolute right-1.5 top-1.5 size-4 text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
      </button>

      {/* Lo de abajo: título y menú, o el formulario, o la confirmación. */}
      {estaConfirmandoBorrado ? (
        <div className="space-y-2 p-2">
          <p className="text-[11px] text-danger">
            ¿Quitarla de la galería? {pieza.esPortada ? "La portada pasará a la siguiente foto." : ""}
          </p>
          <div className="flex gap-1.5">
            <Button color="danger" radius="lg" size="sm" onPress={alConfirmarBorrado}>
              Quitar
            </Button>
            <Button radius="lg" size="sm" variant="light" onPress={alCancelar}>
              No
            </Button>
          </div>
        </div>
      ) : estaEditandose ? (
        <FormularioDeTexto pieza={pieza} alCancelar={alCancelar} alGuardar={alGuardarTexto} />
      ) : (
        <div className="flex items-start gap-1 p-2">
          <div className="min-w-0 flex-1">
            <p
              className={[
                "truncate text-[11px] font-semibold",
                pieza.titulo ? "text-foreground" : "text-default-400",
              ].join(" ")}
            >
              {pieza.titulo ?? (esFoto ? "Sin título" : pieza.nombre)}
            </p>
            <p className="truncate text-[10px] text-default-400">
              {esFoto ? "Foto" : "PDF"} · {formatearTamanoDeFichero(pieza.tamanoBytes)}
            </p>
          </div>

          <Dropdown placement="bottom-end">
            <DropdownTrigger>
              <Button
                isIconOnly
                aria-label={`Opciones de ${pieza.titulo ?? pieza.nombre}`}
                isLoading={estaOcupada}
                radius="full"
                size="sm"
                variant="light"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownTrigger>

            <DropdownMenu
              aria-label="Qué hacer con esta pieza"
              items={acciones}
              variant="flat"
              onAction={(clave) => alElegirAccion(clave as AccionSobreLaPieza)}
            >
              {(accion) => (
                <DropdownItem
                  key={accion.clave}
                  className={accion.peligrosa ? "text-danger" : undefined}
                  color={accion.peligrosa ? "danger" : "default"}
                  startContent={accion.icono}
                >
                  {accion.texto}
                </DropdownItem>
              )}
            </DropdownMenu>
          </Dropdown>
        </div>
      )}
    </article>
  );
}

function FormularioDeTexto({
  pieza,
  alGuardar,
  alCancelar,
}: {
  pieza: ArchivoDeGaleria;
  alGuardar: (titulo: string | null, descripcion: string | null) => Promise<void>;
  alCancelar: () => void;
}) {
  const [titulo, establecerTitulo] = useState(pieza.titulo ?? "");
  const [descripcion, establecerDescripcion] = useState(pieza.descripcion ?? "");
  const [estaGuardando, establecerGuardando] = useState(false);

  async function guardar() {
    establecerGuardando(true);

    try {
      await alGuardar(titulo.trim() || null, descripcion.trim() || null);
    } finally {
      establecerGuardando(false);
    }
  }

  return (
    <div className="space-y-2 p-2">
      <Input
        aria-label="Título"
        maxLength={160}
        placeholder="Ej. Vista desde tribuna este"
        radius="lg"
        size="sm"
        value={titulo}
        variant="bordered"
        onValueChange={establecerTitulo}
      />
      <Textarea
        aria-label="Descripción"
        maxLength={1000}
        minRows={2}
        placeholder="Qué se ve, dónde iría la marca, aforo…"
        radius="lg"
        size="sm"
        value={descripcion}
        variant="bordered"
        onValueChange={establecerDescripcion}
      />
      <div className="flex gap-1.5">
        <Button color="primary" isLoading={estaGuardando} radius="lg" size="sm" onPress={() => void guardar()}>
          Guardar
        </Button>
        <Button radius="lg" size="sm" variant="light" onPress={alCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/** Un identificador para las subidas en marcha, que solo vive en pantalla. */
function idAlAzar(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
