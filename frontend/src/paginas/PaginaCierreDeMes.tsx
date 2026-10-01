/**
 * paginas/PaginaCierreDeMes.tsx
 * ---------------------------------------------------------------------
 * Los reportes de cierre de mes, agrupados por mes. Desde el 2026-10-01.
 *
 * Al acabar cada mes el comercial prepara su reporte (un PDF, un Excel,
 * una presentación) y lo sube aquí; admin y comercial los ven todos, del
 * mes más reciente al más antiguo. El agente no entra (CierreDeMesPolicy).
 *
 * Al subir se elige el mes AL QUE CORRESPONDE, que por defecto es el
 * anterior: el reporte de septiembre se sube en octubre. Mes y año van en
 * dos desplegables y no en un `<input type="month">`, que Safari en el
 * Mac pinta como un campo de texto.
 *
 * Los ficheros viven en el disco privado y se abren con enlaces firmados
 * que caducan (regla 21): por eso esta pantalla no se guarda en la copia
 * sin conexión.
 * ---------------------------------------------------------------------
 */
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Progress,
  Select,
  SelectItem,
  Textarea,
} from "@heroui/react";
import {
  CalendarCheck,
  Download,
  ExternalLink,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileUp,
  Presentation,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { mensajeDeError } from "@/api/clienteHttp";
import { BarraDeScrollDibujada } from "@/componentes/comunes/BarraDeScrollDibujada";
import { BloqueDeCarga, BloqueDeError, EstadoVacio } from "@/componentes/comunes/EstadosDePantalla";
import { TarjetaBento } from "@/componentes/comunes/TarjetaBento";
import { useCierresDeMes, useEliminarCierreDeMes, useSubirCierreDeMes } from "@/hooks/useCierresDeMes";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import { formatearFechaYHora, formatearTamanoDeFichero } from "@/utilidades/formato";
import type { CierreDeMes, FormatoDeReporte } from "@/tipos/modelos";

const NOMBRES_DE_LOS_MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** El tope del servidor (GuardadoDeArchivos), para avisar antes de subir. */
const TAMANO_MAXIMO_EN_BYTES = 20 * 1024 * 1024;

/** Lo que admite el servidor; el selector de ficheros enseña solo esto. */
const FORMATOS_ADMITIDOS =
  ".pdf,.xlsx,.xls,.docx,.doc,.pptx,.ppt,.jpg,.jpeg,.png,.webp,.gif";

/** «2026-09» → «Septiembre de 2026». A mano: «2026-09» no es una fecha (regla 16). */
function nombreDelMes(mes: string): string {
  const [anio, numeroDelMes] = mes.split("-").map(Number);
  const nombre = NOMBRES_DE_LOS_MESES[(numeroDelMes ?? 1) - 1] ?? mes;

  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} de ${anio}`;
}

/** El mes anterior al de hoy, que es el que se suele cerrar. */
function mesAnterior(): { anio: number; mes: number } {
  const hoy = new Date();
  const anterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);

  return { anio: anterior.getFullYear(), mes: anterior.getMonth() + 1 };
}

export function PaginaCierreDeMes() {
  const { cierres, estaCargando, error, recargar } = useCierresDeMes();
  const [laVentanaEstaAbierta, establecerVentanaAbierta] = useState(false);

  // Ya vienen del mes más reciente al más antiguo: se agrupan sin reordenar.
  const porMes: Array<{ mes: string; cierres: CierreDeMes[] }> = [];

  for (const cierre of cierres) {
    const grupo = porMes[porMes.length - 1];

    if (grupo?.mes === cierre.mes) {
      grupo.cierres.push(cierre);
    } else {
      porMes.push({ mes: cierre.mes, cierres: [cierre] });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-default-500">
          El reporte de cierre de cada mes, del más reciente al más antiguo. Se sube en PDF,
          Excel, Word, PowerPoint o como imagen.
        </p>

        <Button
          color="primary"
          radius="lg"
          startContent={<Upload className="size-4" />}
          onPress={() => establecerVentanaAbierta(true)}
        >
          Subir reporte
        </Button>
      </div>

      {estaCargando ? (
        <BloqueDeCarga alto="min-h-60" mensaje="Cargando los reportes…" />
      ) : error ? (
        <BloqueDeError alReintentar={() => void recargar()} mensaje={mensajeDeError(error)} />
      ) : porMes.length === 0 ? (
        <div className="bento-card">
          <EstadoVacio
            accion={
              <Button
                color="primary"
                radius="lg"
                size="sm"
                startContent={<Upload className="size-4" />}
                onPress={() => establecerVentanaAbierta(true)}
              >
                Subir el primero
              </Button>
            }
            descripcion="Cuando alguien suba el reporte de un mes, aparecerá aquí agrupado con los demás de ese mes."
            icono={<CalendarCheck className="size-5" />}
            titulo="Todavía no hay reportes"
          />
        </div>
      ) : (
        porMes.map((grupo) => (
          <TarjetaBento
            key={grupo.mes}
            descripcion={grupo.cierres.length === 1 ? "1 reporte" : `${grupo.cierres.length} reportes`}
            icono={<CalendarCheck className="size-4" />}
            titulo={nombreDelMes(grupo.mes)}
          >
            <ul className="-my-1 divide-y divide-default-100">
              {grupo.cierres.map((cierre) => (
                <FilaDeReporte key={cierre.id} cierre={cierre} />
              ))}
            </ul>
          </TarjetaBento>
        ))
      )}

      <VentanaDeSubida
        estaAbierta={laVentanaEstaAbierta}
        alCerrar={() => establecerVentanaAbierta(false)}
      />
    </div>
  );
}

/* ==================================================================== */
/* Un reporte                                                           */
/* ==================================================================== */

const ICONO_DEL_FORMATO: Record<FormatoDeReporte, ReactNode> = {
  pdf: <FileText className="size-5" />,
  hoja: <FileSpreadsheet className="size-5" />,
  texto: <FileText className="size-5" />,
  presentacion: <Presentation className="size-5" />,
  imagen: <FileImage className="size-5" />,
};

const COLOR_DEL_FORMATO: Record<FormatoDeReporte, string> = {
  pdf: "bg-danger-50 text-danger-600",
  hoja: "bg-success-50 text-success-700",
  texto: "bg-primary-50 text-primary-600",
  presentacion: "bg-warning-50 text-warning-700",
  imagen: "bg-secondary-50 text-secondary-600",
};

function FilaDeReporte({ cierre }: { cierre: CierreDeMes }) {
  const eliminar = useEliminarCierreDeMes();
  const [estaConfirmando, establecerConfirmando] = useState(false);

  const archivo = cierre.archivo;
  // Un PDF o una foto se abren en el navegador; un Excel o un Word no se
  // pueden ver ahí, así que para esos solo se ofrece descargarlos.
  const seAbreEnElNavegador = archivo !== null && (archivo.formato === "pdf" || archivo.formato === "imagen");

  async function borrarlo() {
    try {
      await eliminar.mutateAsync(cierre.id);
      avisarDeExito("Reporte eliminado");
    } catch (fallo) {
      avisarDeError(fallo, "No se pudo eliminar el reporte");
      establecerConfirmando(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span
        className={[
          "flex size-11 shrink-0 items-center justify-center rounded-xl",
          archivo ? COLOR_DEL_FORMATO[archivo.formato] : "bg-default-100 text-default-400",
        ].join(" ")}
      >
        {archivo ? ICONO_DEL_FORMATO[archivo.formato] : <FileText className="size-5" />}
      </span>

      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate text-sm font-semibold text-foreground">{cierre.titulo}</p>
        <p className="truncate text-[11px] text-default-500">
          {archivo ? `${archivo.nombre} · ${formatearTamanoDeFichero(archivo.tamanoBytes)}` : "Sin fichero"}
        </p>
        <p className="text-[11px] text-default-400">
          Subido por {cierre.subidoPor ?? "alguien"} · {formatearFechaYHora(cierre.subidoEn)}
        </p>
        {cierre.notas && (
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-default-600">{cierre.notas}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {estaConfirmando ? (
          <>
            <span className="text-xs text-danger">¿Eliminarlo?</span>
            <Button
              color="danger"
              isLoading={eliminar.isPending}
              radius="lg"
              size="sm"
              onPress={() => void borrarlo()}
            >
              Sí
            </Button>
            <Button radius="lg" size="sm" variant="light" onPress={() => establecerConfirmando(false)}>
              No
            </Button>
          </>
        ) : (
          <>
            {archivo && seAbreEnElNavegador && (
              <Button
                as="a"
                href={archivo.url}
                radius="lg"
                rel="noreferrer"
                size="sm"
                startContent={<ExternalLink className="size-3.5" />}
                target="_blank"
                variant="flat"
              >
                Abrir
              </Button>
            )}
            {archivo && (
              <Button
                as="a"
                href={archivo.urlDescarga}
                radius="lg"
                size="sm"
                startContent={<Download className="size-3.5" />}
                variant="flat"
              >
                Descargar
              </Button>
            )}
            {cierre.puedoEliminarlo && (
              <Button
                isIconOnly
                aria-label={`Eliminar ${cierre.titulo}`}
                color="danger"
                radius="lg"
                size="sm"
                variant="light"
                onPress={() => establecerConfirmando(true)}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/* ==================================================================== */
/* Subir un reporte                                                     */
/* ==================================================================== */

function VentanaDeSubida({
  estaAbierta,
  alCerrar,
}: {
  estaAbierta: boolean;
  alCerrar: () => void;
}) {
  const subir = useSubirCierreDeMes();
  const cuerpoDeLaVentana = useRef<HTMLDivElement>(null);
  const selectorDeFichero = useRef<HTMLInputElement>(null);

  const [anio, establecerAnio] = useState(() => mesAnterior().anio);
  const [mes, establecerMes] = useState(() => mesAnterior().mes);
  const [archivo, establecerArchivo] = useState<File | null>(null);
  const [titulo, establecerTitulo] = useState("");
  const [notas, establecerNotas] = useState("");
  const [progreso, establecerProgreso] = useState(0);
  const [errorDelArchivo, establecerErrorDelArchivo] = useState("");
  const [estaEncima, establecerEncima] = useState(false);

  const anioActual = new Date().getFullYear();
  const aniosDisponibles = [anioActual, anioActual - 1, anioActual - 2];

  function empezarDeCero() {
    const anterior = mesAnterior();

    establecerAnio(anterior.anio);
    establecerMes(anterior.mes);
    establecerArchivo(null);
    establecerTitulo("");
    establecerNotas("");
    establecerProgreso(0);
    establecerErrorDelArchivo("");
  }

  function elegirArchivo(elegido: File | undefined) {
    if (!elegido) return;

    if (elegido.size > TAMANO_MAXIMO_EN_BYTES) {
      establecerArchivo(null);
      establecerErrorDelArchivo("El fichero pesa más de 20 MB. Redúcelo o guárdalo en PDF.");

      return;
    }

    establecerArchivo(elegido);
    establecerErrorDelArchivo("");
  }

  function cerrar() {
    if (subir.isPending) return;

    empezarDeCero();
    alCerrar();
  }

  async function subirElReporte() {
    if (archivo === null) {
      establecerErrorDelArchivo("Elige el fichero del reporte.");

      return;
    }

    try {
      await subir.mutateAsync({
        datos: {
          archivo,
          mes: `${anio}-${String(mes).padStart(2, "0")}`,
          titulo,
          notas,
        },
        alProgresar: establecerProgreso,
      });

      avisarDeExito(`Reporte subido a ${nombreDelMes(`${anio}-${String(mes).padStart(2, "0")}`)}`);
      empezarDeCero();
      alCerrar();
    } catch (fallo) {
      establecerProgreso(0);
      avisarDeError(fallo, "No se pudo subir el reporte");
    }
  }

  return (
    <Modal
      // Barra de scroll siempre a la vista, como en todas las ventanas de
      // alta y edición: la clase esconde la del sistema y la dibuja
      // BarraDeScrollDibujada, debajo del cuerpo.
      classNames={{ body: "barra-de-scroll-fija" }}
      isDismissable={!subir.isPending}
      isOpen={estaAbierta}
      radius="lg"
      scrollBehavior="inside"
      size="lg"
      onOpenChange={(abierta) => {
        if (!abierta) cerrar();
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <CalendarCheck className="size-5 text-primary" />
            Subir reporte de cierre
          </span>
        </ModalHeader>

        <ModalBody ref={cuerpoDeLaVentana} className="gap-5 pb-2">
          <div>
            <p className="mb-2 text-xs font-semibold text-foreground">¿De qué mes es el reporte?</p>
            <div className="grid grid-cols-2 gap-3">
              <Select
                aria-label="Mes"
                disallowEmptySelection
                radius="lg"
                selectedKeys={[String(mes)]}
                variant="bordered"
                onSelectionChange={(seleccion) => establecerMes(Number(Array.from(seleccion)[0] ?? mes))}
              >
                {NOMBRES_DE_LOS_MESES.map((nombre, posicion) => (
                  <SelectItem key={String(posicion + 1)}>
                    {`${nombre.charAt(0).toUpperCase()}${nombre.slice(1)}`}
                  </SelectItem>
                ))}
              </Select>
              <Select
                aria-label="Año"
                disallowEmptySelection
                radius="lg"
                selectedKeys={[String(anio)]}
                variant="bordered"
                onSelectionChange={(seleccion) => establecerAnio(Number(Array.from(seleccion)[0] ?? anio))}
              >
                {aniosDisponibles.map((unAnio) => (
                  <SelectItem key={String(unAnio)}>{String(unAnio)}</SelectItem>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-foreground">El fichero</p>
            <button
              className={[
                "flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition",
                estaEncima ? "border-primary bg-primary-50" : "border-default-200 hover:border-primary/60 hover:bg-default-50",
              ].join(" ")}
              type="button"
              onClick={() => selectorDeFichero.current?.click()}
              onDragLeave={() => establecerEncima(false)}
              onDragOver={(evento) => {
                evento.preventDefault();
                establecerEncima(true);
              }}
              onDrop={(evento) => {
                evento.preventDefault();
                establecerEncima(false);
                elegirArchivo(evento.dataTransfer.files[0]);
              }}
            >
              <FileUp className="size-7 text-primary" />
              {archivo ? (
                <>
                  <span className="max-w-full truncate text-sm font-semibold text-foreground">{archivo.name}</span>
                  <span className="text-[11px] text-default-500">
                    {formatearTamanoDeFichero(archivo.size)} · pulsa para cambiarlo
                  </span>
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold text-foreground">Arrastra el reporte aquí o pulsa para elegirlo</span>
                  <span className="text-[11px] text-default-500">PDF, Excel, Word, PowerPoint o imagen · hasta 20 MB</span>
                </>
              )}
            </button>
            <input
              ref={selectorDeFichero}
              accept={FORMATOS_ADMITIDOS}
              className="hidden"
              type="file"
              onChange={(evento) => {
                elegirArchivo(evento.target.files?.[0]);
                // Para poder volver a elegir el mismo fichero después de quitarlo.
                evento.target.value = "";
              }}
            />
            {errorDelArchivo && <p className="mt-1.5 text-xs text-danger">{errorDelArchivo}</p>}
          </div>

          <Input
            description="Si lo dejas vacío, se usa el nombre del fichero."
            label="Título (opcional)"
            labelPlacement="outside"
            placeholder="Ej. Cierre de ventas de septiembre"
            radius="lg"
            value={titulo}
            variant="bordered"
            onValueChange={establecerTitulo}
          />

          <Textarea
            label="Notas (opcional)"
            labelPlacement="outside"
            minRows={2}
            placeholder="Lo más importante del mes, en dos líneas."
            radius="lg"
            value={notas}
            variant="bordered"
            onValueChange={establecerNotas}
          />

          {subir.isPending && (
            <div>
              <div className="flex justify-between text-[11px] text-default-500">
                <span>Subiendo…</span>
                <span className="tabular-nums">{Math.round(progreso * 100)} %</span>
              </div>
              <Progress
                aria-label="Subiendo el reporte"
                className="mt-1.5"
                color="primary"
                radius="full"
                size="sm"
                value={progreso * 100}
              />
            </div>
          )}
        </ModalBody>

        <BarraDeScrollDibujada zona={cuerpoDeLaVentana} />

        <ModalFooter>
          <Button isDisabled={subir.isPending} radius="lg" variant="light" onPress={cerrar}>
            Cancelar
          </Button>
          <Button
            color="primary"
            isLoading={subir.isPending}
            radius="lg"
            startContent={!subir.isPending && <Upload className="size-4" />}
            onPress={() => void subirElReporte()}
          >
            Subir
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
