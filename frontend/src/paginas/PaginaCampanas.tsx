/**
 * paginas/PaginaCampanas.tsx
 * ---------------------------------------------------------------------
 * Las campañas comerciales: el empujón dentro del que se trabaja cada
 * marca ("Temporada 2026", "Cierre de año"…).
 *
 * Es una pantalla deliberadamente pequeña. Una campaña es poco más que
 * un nombre, un color y unas fechas: lo que da valor es poder asignarla
 * desde la ficha de una marca, filtrar el tablero por ella y ver su
 * reparto en el resumen.
 *
 * El color no es decorativo: es lo que permite distinguir de un vistazo,
 * en la cuadrícula de marcas, a qué campaña pertenece cada una cuando hay
 * varias abiertas a la vez.
 * ---------------------------------------------------------------------
 */
import {
  Button,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  NumberInput,
  Switch,
  Textarea,
  Tooltip,
} from "@heroui/react";
import { Megaphone, Pencil, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { mensajeDeError } from "@/api/clienteHttp";
import {
  BloqueDeCarga,
  BloqueDeError,
  EstadoVacio,
} from "@/componentes/comunes/EstadosDePantalla";
import { useCatalogos } from "@/hooks/useCatalogos";
import {
  useActualizarCampana,
  useCatalogoDeCampanas,
  useCrearCampana,
  useEliminarCampana,
} from "@/hooks/useCampanas";
import { useUsuarioAutenticado } from "@/providers/ProveedorSesion";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import { formatearFecha } from "@/utilidades/formato";
import type { Campana, DatosDeCampanaParaGuardar } from "@/tipos/modelos";

export function PaginaCampanas() {
  const usuario = useUsuarioAutenticado();
  const catalogo = useCatalogoDeCampanas();

  const [elModalEstaAbierto, establecerModalAbierto] = useState(false);
  const [campanaEnEdicion, establecerCampanaEnEdicion] = useState<Campana | null>(
    null,
  );

  function abrirModalDeAlta() {
    establecerCampanaEnEdicion(null);
    establecerModalAbierto(true);
  }

  function abrirModalDeEdicion(campana: Campana) {
    establecerCampanaEnEdicion(campana);
    establecerModalAbierto(true);
  }

  const { campanas } = catalogo;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Campañas
          </h2>
          <p className="mt-0.5 text-sm text-default-500">
            {catalogo.estaCargando
              ? "Cargando…"
              : `${campanas.length} ${
                  campanas.length === 1 ? "campaña" : "campañas"
                } · ${campanas.filter((campana) => campana.estaVigente).length} en marcha`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            isIconOnly
            aria-label="Actualizar las campañas"
            isLoading={catalogo.estaRefrescando}
            radius="lg"
            size="sm"
            variant="flat"
            onPress={() => void catalogo.recargar()}
          >
            {!catalogo.estaRefrescando && <RefreshCw className="size-4" />}
          </Button>

          {usuario.permisos.gestionaElCatalogoComercial && (
            <Button
              color="primary"
              radius="lg"
              size="sm"
              startContent={<Plus className="size-4" />}
              onPress={abrirModalDeAlta}
            >
              Nueva campaña
            </Button>
          )}
        </div>
      </div>

      {catalogo.estaCargando ? (
        <BloqueDeCarga alto="min-h-72" mensaje="Cargando las campañas…" />
      ) : catalogo.error ? (
        <BloqueDeError
          alReintentar={() => void catalogo.recargar()}
          mensaje={mensajeDeError(catalogo.error)}
        />
      ) : campanas.length === 0 ? (
        <div className="bento-card">
          <EstadoVacio
            accion={
              usuario.permisos.gestionaElCatalogoComercial ? (
                <Button
                  color="primary"
                  radius="lg"
                  size="sm"
                  startContent={<Plus className="size-4" />}
                  onPress={abrirModalDeAlta}
                >
                  Crear la primera campaña
                </Button>
              ) : undefined
            }
            descripcion="Sirven para agrupar el trabajo comercial y ver después su reparto en el resumen."
            icono={<Megaphone className="size-5" />}
            titulo="Todavía no hay campañas"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {campanas.map((campana) => (
            <TarjetaDeCampana
              key={campana.id}
              alEditar={abrirModalDeEdicion}
              campana={campana}
            />
          ))}
        </div>
      )}

      <ModalDeCampana
        alCerrar={() => establecerModalAbierto(false)}
        campanaEnEdicion={campanaEnEdicion}
        estaAbierto={elModalEstaAbierto}
      />
    </div>
  );
}

/* ==================================================================== */
/* Piezas                                                              */
/* ==================================================================== */

function TarjetaDeCampana({
  campana,
  alEditar,
}: {
  campana: Campana;
  alEditar: (campana: Campana) => void;
}) {
  const marcasEnLaCampana = campana.totalMarcas ?? 0;

  return (
    <article
      className={[
        "bento-card flex flex-col gap-3 p-4",
        campana.puedoEditarla ? "bento-card-interactive" : "",
        campana.activa ? "" : "opacity-70",
      ].join(" ")}
      role={campana.puedoEditarla ? "button" : undefined}
      tabIndex={campana.puedoEditarla ? 0 : undefined}
      onClick={campana.puedoEditarla ? () => alEditar(campana) : undefined}
      onKeyDown={(evento) => {
        if (campana.puedoEditarla && evento.key === "Enter") alEditar(campana);
      }}
    >
      <div className="flex items-start gap-3">
        {/* El color de la campaña, que es como se reconoce en el tablero. */}
        <span
          className="mt-0.5 size-9 shrink-0 rounded-2xl"
          style={{ backgroundColor: campana.color }}
        />

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold leading-snug text-foreground">
            {campana.nombre}
          </h3>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {campana.estaVigente ? (
              <Chip color="success" radius="lg" size="sm" variant="flat">
                En marcha
              </Chip>
            ) : (
              <Chip radius="lg" size="sm" variant="flat">
                {campana.activa ? "Fuera de fechas" : "Cerrada"}
              </Chip>
            )}
          </div>
        </div>

        {campana.puedoEditarla && (
          <Pencil className="size-4 shrink-0 text-default-300" />
        )}
      </div>

      {campana.descripcion && (
        <p className="line-clamp-2 text-[11px] leading-relaxed text-default-500">
          {campana.descripcion}
        </p>
      )}

      {(campana.fechaInicio || campana.fechaFin) && (
        <p className="text-[11px] text-default-500">
          {formatearFecha(campana.fechaInicio)} — {formatearFecha(campana.fechaFin)}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-default-100 pt-3">
        <span className="text-[11px] text-default-500">
          {marcasEnLaCampana === 0
            ? "Sin marcas todavía"
            : `${marcasEnLaCampana} ${
                marcasEnLaCampana === 1 ? "marca" : "marcas"
              }`}
        </span>

        {marcasEnLaCampana > 0 && (
          <Link
            className="text-[11px] font-semibold text-primary hover:underline"
            to={`/marcas?campana=${campana.id}`}
            onClick={(evento) => evento.stopPropagation()}
          >
            Ver las marcas
          </Link>
        )}
      </div>
    </article>
  );
}

/* ==================================================================== */
/* Alta y edición                                                      */
/* ==================================================================== */

interface FormularioDeCampana {
  nombre: string;
  descripcion: string;
  color: string;
  fechaInicio: string;
  fechaFin: string;
  orden: number;
  activa: boolean;
}

const FORMULARIO_DE_CAMPANA_VACIO: FormularioDeCampana = {
  nombre: "",
  descripcion: "",
  color: "#1b9aaa",
  fechaInicio: "",
  fechaFin: "",
  orden: 0,
  activa: true,
};

function ModalDeCampana({
  estaAbierto,
  campanaEnEdicion,
  alCerrar,
}: {
  estaAbierto: boolean;
  campanaEnEdicion: Campana | null;
  alCerrar: () => void;
}) {
  const { catalogos } = useCatalogos();

  const crearCampana = useCrearCampana();
  const actualizarCampana = useActualizarCampana();
  const eliminarCampana = useEliminarCampana();

  const [formulario, establecerFormulario] = useState<FormularioDeCampana>(
    FORMULARIO_DE_CAMPANA_VACIO,
  );
  const [errorDelNombre, establecerErrorDelNombre] = useState("");
  const [estaConfirmandoBorrado, establecerConfirmandoBorrado] = useState(false);

  const estamosEditando = campanaEnEdicion !== null;

  useEffect(() => {
    if (!estaAbierto) return;

    if (campanaEnEdicion) {
      establecerFormulario({
        nombre: campanaEnEdicion.nombre,
        descripcion: campanaEnEdicion.descripcion ?? "",
        color: campanaEnEdicion.color,
        fechaInicio: campanaEnEdicion.fechaInicio ?? "",
        fechaFin: campanaEnEdicion.fechaFin ?? "",
        orden: campanaEnEdicion.orden,
        activa: campanaEnEdicion.activa,
      });
    } else {
      establecerFormulario(FORMULARIO_DE_CAMPANA_VACIO);
    }

    establecerErrorDelNombre("");
    establecerConfirmandoBorrado(false);
  }, [estaAbierto, campanaEnEdicion]);

  function cambiarCampo<Clave extends keyof FormularioDeCampana>(
    clave: Clave,
    valor: FormularioDeCampana[Clave],
  ) {
    establecerFormulario((anterior) => ({ ...anterior, [clave]: valor }));
  }

  async function guardarLaCampana() {
    if (formulario.nombre.trim() === "") {
      establecerErrorDelNombre("Ponle nombre a la campaña.");

      return;
    }

    const datosParaEnviar: DatosDeCampanaParaGuardar = {
      nombre: formulario.nombre.trim(),
      descripcion: formulario.descripcion.trim() || null,
      color: formulario.color,
      fechaInicio: formulario.fechaInicio || null,
      fechaFin: formulario.fechaFin || null,
      orden: formulario.orden,
      activa: formulario.activa,
    };

    try {
      if (estamosEditando && campanaEnEdicion) {
        await actualizarCampana.mutateAsync({
          idDeLaCampana: campanaEnEdicion.id,
          datos: datosParaEnviar,
        });

        avisarDeExito("Campaña actualizada");
      } else {
        await crearCampana.mutateAsync(datosParaEnviar);

        avisarDeExito("Campaña creada");
      }

      alCerrar();
    } catch (error) {
      avisarDeError(error, "No se pudo guardar la campaña");
    }
  }

  async function borrarLaCampana() {
    if (!campanaEnEdicion) return;

    try {
      await eliminarCampana.mutateAsync(campanaEnEdicion.id);

      avisarDeExito("Campaña eliminada");
      alCerrar();
    } catch (error) {
      avisarDeError(error, "No se pudo eliminar la campaña");
    }
  }

  const marcasEnLaCampana = campanaEnEdicion?.totalMarcas ?? 0;
  const estaGuardando = crearCampana.isPending || actualizarCampana.isPending;

  return (
    <Modal
      isOpen={estaAbierto}
      scrollBehavior="inside"
      size="lg"
      onOpenChange={(abierto) => {
        if (!abierto) alCerrar();
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Megaphone className="size-5 text-primary" />
            {estamosEditando ? campanaEnEdicion.nombre : "Nueva campaña"}
          </span>
        </ModalHeader>

        <ModalBody className="space-y-5 pb-2">
          <Input
            errorMessage={errorDelNombre}
            isInvalid={Boolean(errorDelNombre)}
            isRequired
            label="Nombre de la campaña"
            labelPlacement="outside"
            placeholder="Ej. Temporada 2026"
            radius="lg"
            value={formulario.nombre}
            variant="bordered"
            onValueChange={(valor) => {
              cambiarCampo("nombre", valor);
              establecerErrorDelNombre("");
            }}
          />

          <Textarea
            label="Descripción"
            labelPlacement="outside"
            minRows={2}
            placeholder="Qué se persigue en esta campaña…"
            radius="lg"
            value={formulario.descripcion}
            variant="bordered"
            onValueChange={(valor) => cambiarCampo("descripcion", valor)}
          />

          {/* Color: se eligen los mismos de la paleta del sistema, para
              que las campañas no desentonen con el resto del panel. */}
          <div>
            <p className="mb-2 text-xs font-semibold text-default-600">
              Color del distintivo
            </p>

            <div className="flex flex-wrap gap-2">
              {(catalogos?.coloresDeAcento ?? []).map((colorDisponible) => {
                const estaElegido = formulario.color === colorDisponible.hex;

                return (
                  <Tooltip key={colorDisponible.hex} content={colorDisponible.nombre}>
                    <button
                      aria-label={colorDisponible.nombre}
                      className={[
                        "size-8 rounded-xl transition",
                        estaElegido
                          ? "ring-2 ring-foreground ring-offset-2 ring-offset-content1"
                          : "hover:scale-110",
                      ].join(" ")}
                      style={{ backgroundColor: colorDisponible.hex }}
                      type="button"
                      onClick={() => cambiarCampo("color", colorDisponible.hex)}
                    />
                  </Tooltip>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Empieza"
              labelPlacement="outside"
              placeholder="—"
              radius="lg"
              size="sm"
              type="date"
              value={formulario.fechaInicio}
              variant="bordered"
              onValueChange={(valor) => cambiarCampo("fechaInicio", valor)}
            />

            <Input
              description="Fuera de estas fechas la campaña deja de contar como en marcha."
              label="Termina"
              labelPlacement="outside"
              placeholder="—"
              radius="lg"
              size="sm"
              type="date"
              value={formulario.fechaFin}
              variant="bordered"
              onValueChange={(valor) => cambiarCampo("fechaFin", valor)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberInput
              description="Menor número, más arriba en el selector."
              label="Orden"
              labelPlacement="outside"
              minValue={0}
              radius="lg"
              size="sm"
              value={formulario.orden}
              variant="bordered"
              onValueChange={(valor) =>
                cambiarCampo("orden", Number.isNaN(valor) ? 0 : valor)
              }
            />

            <div className="flex items-end">
              <div className="flex w-full items-center justify-between gap-3 rounded-2xl border border-default-200 px-3 py-2.5">
                <div>
                  <span className="text-xs font-semibold text-foreground">
                    Abierta
                  </span>
                  <p className="text-[10px] text-default-500">
                    Al cerrarla deja de ofrecerse en la ficha de las marcas.
                  </p>
                </div>

                <Switch
                  color="success"
                  isSelected={formulario.activa}
                  size="sm"
                  onValueChange={(activada) => cambiarCampo("activa", activada)}
                />
              </div>
            </div>
          </div>
        </ModalBody>

        <ModalFooter className="flex-wrap gap-2">
          {estamosEditando && campanaEnEdicion.puedoEliminarla && (
            estaConfirmandoBorrado ? (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <span className="text-xs text-danger">
                  {marcasEnLaCampana > 0
                    ? `${marcasEnLaCampana} ${
                        marcasEnLaCampana === 1 ? "marca se quedará" : "marcas se quedarán"
                      } sin campaña. ¿Seguro?`
                    : "¿Seguro?"}
                </span>

                <Button
                  color="danger"
                  isLoading={eliminarCampana.isPending}
                  radius="lg"
                  size="sm"
                  onPress={() => void borrarLaCampana()}
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
                className="mr-auto"
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

          <Button radius="lg" size="sm" variant="light" onPress={alCerrar}>
            Cancelar
          </Button>

          <Button
            color="primary"
            isLoading={estaGuardando}
            radius="lg"
            size="sm"
            startContent={!estaGuardando && <Save className="size-4" />}
            onPress={() => void guardarLaCampana()}
          >
            {estamosEditando ? "Guardar cambios" : "Crear campaña"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
