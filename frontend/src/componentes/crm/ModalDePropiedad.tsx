/**
 * componentes/crm/ModalDePropiedad.tsx
 * ---------------------------------------------------------------------
 * Alta y edición de un producto IOP.
 *
 * El formulario está ordenado como se piensa la propiedad:
 *
 *   1. Quién es      → nombre, logo y una descripción corta.
 *   2. Cuánto vale   → el monto total (MTP) y el porcentaje acordado.
 *      Debajo se enseña en vivo la meta que sale de esos dos números, que
 *      es la cifra que después suma el tablero. Verla mientras se escribe
 *      evita el error de teclear 1.620.000 en vez de 162.000 y no
 *      enterarse hasta que el forecast de la agencia se dispara.
 *   3. Quién la vende → todo el equipo, o las personas concretas que se
 *      elijan. Sin nadie asignado la propiedad desaparecería del
 *      checklist de todos, así que el servidor lo rechaza.
 *
 * Borrar una propiedad se lleva por delante su línea en el checklist de
 * cada marca, así que la botonera avisa de cuántas se van a perder y
 * ofrece antes desactivarla.
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
  Select,
  SelectItem,
  Switch,
  Textarea,
} from "@heroui/react";
import { Package, Save, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listarUsuarios } from "@/api/usuarios";
import { CampoDeImagen } from "@/componentes/comunes/CampoDeImagen";
import { useCatalogos } from "@/hooks/useCatalogos";
import {
  useActualizarPropiedad,
  useCrearPropiedad,
  useEliminarPropiedad,
} from "@/hooks/usePropiedades";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import { formatearDinero } from "@/utilidades/formato";
import type { DatosDePropiedadParaGuardar, Propiedad } from "@/tipos/modelos";

interface FormularioDePropiedad {
  nombre: string;
  descripcion: string;
  logoUrl: string;
  montoTotalUsd: number;
  porcentajeForecast: number;
  asignadaATodos: boolean;
  prospectoresIds: string[];
  orden: number;
  activa: boolean;
}

interface PropiedadesDelModalDePropiedad {
  estaAbierto: boolean;
  /** La propiedad a editar, o null para dar de alta una nueva. */
  propiedadEnEdicion: Propiedad | null;
  alCerrar: () => void;
}

export function ModalDePropiedad({
  estaAbierto,
  propiedadEnEdicion,
  alCerrar,
}: PropiedadesDelModalDePropiedad) {
  const { catalogos } = useCatalogos();

  const crearPropiedad = useCrearPropiedad();
  const actualizarPropiedad = useActualizarPropiedad();
  const eliminarPropiedad = useEliminarPropiedad();

  const porcentajePorDefecto = catalogos?.porcentajeForecastPorDefecto ?? 20;

  const [formulario, establecerFormulario] = useState<FormularioDePropiedad>({
    nombre: "",
    descripcion: "",
    logoUrl: "",
    montoTotalUsd: 0,
    porcentajeForecast: porcentajePorDefecto,
    asignadaATodos: true,
    prospectoresIds: [],
    orden: 0,
    activa: true,
  });

  const [errorDelNombre, establecerErrorDelNombre] = useState("");
  const [estaConfirmandoBorrado, establecerConfirmandoBorrado] = useState(false);

  const estamosEditando = propiedadEnEdicion !== null;

  /** El equipo entero, para el selector de a quién se le asigna. */
  const consultaDelEquipo = useQuery({
    queryKey: ["usuarios", "todos"],
    queryFn: () => listarUsuarios({ soloActivos: true }),
    enabled: estaAbierto,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!estaAbierto) return;

    if (propiedadEnEdicion) {
      establecerFormulario({
        nombre: propiedadEnEdicion.nombre,
        descripcion: propiedadEnEdicion.descripcion ?? "",
        logoUrl: propiedadEnEdicion.logoUrl ?? "",
        montoTotalUsd: propiedadEnEdicion.montoTotalUsd,
        porcentajeForecast: propiedadEnEdicion.porcentajeForecast,
        asignadaATodos: propiedadEnEdicion.asignadaATodos,
        prospectoresIds: (propiedadEnEdicion.prospectores ?? []).map(
          (prospector) => prospector.id,
        ),
        orden: propiedadEnEdicion.orden,
        activa: propiedadEnEdicion.activa,
      });
    } else {
      establecerFormulario({
        nombre: "",
        descripcion: "",
        logoUrl: "",
        montoTotalUsd: 0,
        porcentajeForecast: porcentajePorDefecto,
        asignadaATodos: true,
        prospectoresIds: [],
        orden: 0,
        activa: true,
      });
    }

    establecerErrorDelNombre("");
    establecerConfirmandoBorrado(false);
  }, [estaAbierto, propiedadEnEdicion, porcentajePorDefecto]);

  /** La meta que sale del monto y el porcentaje, calculada en vivo. */
  const metaDeVenta =
    (formulario.montoTotalUsd * formulario.porcentajeForecast) / 100;

  const estaGuardando = crearPropiedad.isPending || actualizarPropiedad.isPending;

  function cambiarCampo<Clave extends keyof FormularioDePropiedad>(
    clave: Clave,
    valor: FormularioDePropiedad[Clave],
  ) {
    establecerFormulario((anterior) => ({ ...anterior, [clave]: valor }));
  }

  async function guardarLaPropiedad() {
    if (formulario.nombre.trim() === "") {
      establecerErrorDelNombre("Ponle nombre a la propiedad.");

      return;
    }

    const datosParaEnviar: DatosDePropiedadParaGuardar = {
      nombre: formulario.nombre.trim(),
      descripcion: formulario.descripcion.trim() || null,
      logoUrl: formulario.logoUrl.trim() || null,
      montoTotalUsd: formulario.montoTotalUsd,
      porcentajeForecast: formulario.porcentajeForecast,
      asignadaATodos: formulario.asignadaATodos,
      // Si es para todo el equipo, la lista de personas sobra.
      prospectoresIds: formulario.asignadaATodos ? [] : formulario.prospectoresIds,
      orden: formulario.orden,
      activa: formulario.activa,
    };

    try {
      if (estamosEditando && propiedadEnEdicion) {
        await actualizarPropiedad.mutateAsync({
          idDeLaPropiedad: propiedadEnEdicion.id,
          datos: datosParaEnviar,
        });

        avisarDeExito("Propiedad actualizada");
      } else {
        await crearPropiedad.mutateAsync(datosParaEnviar);

        avisarDeExito("Propiedad creada");
      }

      alCerrar();
    } catch (error) {
      avisarDeError(error, "No se pudo guardar la propiedad");
    }
  }

  async function borrarLaPropiedad() {
    if (!propiedadEnEdicion) return;

    try {
      await eliminarPropiedad.mutateAsync(propiedadEnEdicion.id);

      avisarDeExito("Propiedad eliminada");
      alCerrar();
    } catch (error) {
      avisarDeError(error, "No se pudo eliminar la propiedad");
    }
  }

  const marcasQueLaOfrecen = propiedadEnEdicion?.totalMarcas ?? 0;

  return (
    <Modal
      isOpen={estaAbierto}
      scrollBehavior="inside"
      size="2xl"
      onOpenChange={(abierto) => {
        if (!abierto) alCerrar();
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Package className="size-5 text-primary" />
            {estamosEditando ? propiedadEnEdicion.nombre : "Nueva propiedad"}
          </span>

          <span className="text-[11px] font-normal text-default-500">
            Un producto IOP del catálogo: lo que la agencia pone a la venta.
          </span>
        </ModalHeader>

        <ModalBody className="space-y-5 pb-2">
          {/* --- Quién es --- */}
          <Input
            errorMessage={errorDelNombre}
            isInvalid={Boolean(errorDelNombre)}
            isRequired
            label="Nombre de la propiedad"
            labelPlacement="outside"
            placeholder="Ej. Comité Olímpico"
            radius="lg"
            value={formulario.nombre}
            variant="bordered"
            onValueChange={(valor) => {
              cambiarCampo("nombre", valor);
              establecerErrorDelNombre("");
            }}
          />

          <CampoDeImagen
            alCambiar={(url) => cambiarCampo("logoUrl", url)}
            ayuda="Se ve en el checklist de cada marca y en el informe del resumen."
            etiqueta="Logo de la propiedad"
            formaDeLaVistaPrevia="cuadrada"
            proposito="logo_marca"
            valor={formulario.logoUrl}
          />

          <Textarea
            label="Descripción"
            labelPlacement="outside"
            minRows={2}
            placeholder="Qué incluye la propiedad, temporada, alcance…"
            radius="lg"
            value={formulario.descripcion}
            variant="bordered"
            onValueChange={(valor) => cambiarCampo("descripcion", valor)}
          />

          {/* --- Cuánto vale --- */}
          <div className="rounded-2xl border border-default-200 p-4">
            <p className="mb-3 text-sm font-semibold text-foreground">
              Los montos de la propiedad
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <NumberInput
                description="El valor total de la propiedad, al 100 %."
                label="Monto total · MTP (USD)"
                labelPlacement="outside"
                minValue={0}
                radius="lg"
                size="sm"
                startContent={<span className="text-xs text-default-400">$</span>}
                step={1000}
                value={formulario.montoTotalUsd}
                variant="bordered"
                onValueChange={(valor) =>
                  cambiarCampo("montoTotalUsd", Number.isNaN(valor) ? 0 : valor)
                }
              />

              <NumberInput
                description="Lo acordado suele ser el 20 % del monto total."
                label="Forecast (% del MTP)"
                labelPlacement="outside"
                maxValue={100}
                minValue={0}
                radius="lg"
                size="sm"
                step={1}
                value={formulario.porcentajeForecast}
                variant="bordered"
                onValueChange={(valor) =>
                  cambiarCampo("porcentajeForecast", Number.isNaN(valor) ? 0 : valor)
                }
              />
            </div>

            {/* La meta resultante, en vivo. */}
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-default-50 px-3 py-2">
              <span className="text-[11px] text-default-500">
                Meta de venta de esta propiedad
              </span>

              <span className="text-sm font-bold text-primary">
                {formatearDinero(metaDeVenta)}
              </span>
            </div>
          </div>

          {/* --- Quién la vende --- */}
          <div className="rounded-2xl border border-default-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Users className="size-4 text-default-400" />
                  Disponible para todo el equipo
                </span>
                <p className="mt-0.5 text-[11px] text-default-500">
                  Cualquier prospector podrá ofrecerla a sus marcas.
                </p>
              </div>

              <Switch
                isSelected={formulario.asignadaATodos}
                size="sm"
                onValueChange={(activada) => cambiarCampo("asignadaATodos", activada)}
              />
            </div>

            {!formulario.asignadaATodos && (
              <div className="mt-3">
                <Select
                  description="Solo estas personas podrán añadirla al checklist de una marca."
                  isRequired
                  label="Prospectores asignados"
                  labelPlacement="outside"
                  placeholder="Elegir personas"
                  radius="lg"
                  selectedKeys={new Set(formulario.prospectoresIds)}
                  selectionMode="multiple"
                  size="sm"
                  variant="bordered"
                  onSelectionChange={(seleccion) =>
                    cambiarCampo(
                      "prospectoresIds",
                      Array.from(seleccion).map(String),
                    )
                  }
                >
                  {(consultaDelEquipo.data ?? []).map((personaDelEquipo) => (
                    <SelectItem
                      key={personaDelEquipo.id}
                      textValue={personaDelEquipo.nombre}
                    >
                      {personaDelEquipo.nombre}
                      {personaDelEquipo.zona ? ` — ${personaDelEquipo.zona}` : ""}
                    </SelectItem>
                  ))}
                </Select>
              </div>
            )}
          </div>

          {/* --- Orden y estado --- */}
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberInput
              description="Menor número, más arriba en el checklist."
              label="Orden en el catálogo"
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
                    En venta
                  </span>
                  <p className="text-[10px] text-default-500">
                    Al desactivarla deja de ofrecerse, sin perder el histórico.
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
          {estamosEditando && propiedadEnEdicion.puedoEliminarla && (
            estaConfirmandoBorrado ? (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <span className="text-xs text-danger">
                  {marcasQueLaOfrecen > 0
                    ? `Se quitará de ${marcasQueLaOfrecen} ${
                        marcasQueLaOfrecen === 1 ? "marca" : "marcas"
                      }. ¿Seguro?`
                    : "¿Seguro?"}
                </span>

                <Button
                  color="danger"
                  isLoading={eliminarPropiedad.isPending}
                  radius="lg"
                  size="sm"
                  onPress={() => void borrarLaPropiedad()}
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

          {estamosEditando && marcasQueLaOfrecen > 0 && !estaConfirmandoBorrado && (
            <Chip radius="lg" size="sm" variant="flat">
              En {marcasQueLaOfrecen} {marcasQueLaOfrecen === 1 ? "marca" : "marcas"}
            </Chip>
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
            onPress={() => void guardarLaPropiedad()}
          >
            {estamosEditando ? "Guardar cambios" : "Crear propiedad"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
