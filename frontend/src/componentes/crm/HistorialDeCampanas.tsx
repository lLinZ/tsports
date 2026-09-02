/**
 * componentes/crm/HistorialDeCampanas.tsx
 * ---------------------------------------------------------------------
 * El recorrido comercial de una marca: qué acciones se le han hecho,
 * cuándo, y quién las anotó.
 *
 * "10 de septiembre · Visita presencial · anotó Daymar Marcano."
 *
 * Se alimenta de `eventos_de_campana`, que guarda una fila por cada
 * acción asignada. Por eso una marca puede tener varias —se la visita,
 * más tarde se le manda material, después se la invita a un evento— y
 * todas se conservan.
 *
 * SE PUEDEN CORREGIR Y BORRAR
 * Las acciones nacen solas al asignar campaña en la ficha, pero la
 * realidad se mueve: una visita se aplaza, una invitación se cancela.
 * Sin poder tocarlas, el calendario acabaría enseñando cosas que ya no
 * van a pasar.
 *
 * Los botones se muestran según las banderas que manda el servidor
 * (`puedoEditarlo` / `puedoEliminarlo`), no comparando roles aquí:
 * corregir lo puede hacer quien pueda editar la marca; borrar, solo
 * admin y comercial.
 *
 * El nombre y el color de cada línea vienen copiados dentro del evento,
 * no de la campaña actual. Así, si alguien renombra o borra "Visita
 * presencial", el historial sigue diciendo lo que de verdad se hizo.
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
  Select,
  SelectItem,
  Textarea,
  Tooltip,
} from "@heroui/react";
import { History, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  corregirAccionDeCampana,
  eliminarAccionDeCampana,
} from "@/api/marcas";
import { clavesDeMarcas } from "@/hooks/useMarcas";
import { useCampanasActivas } from "@/hooks/useCampanas";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import { formatearFecha, formatearTiempoRelativo } from "@/utilidades/formato";
import type { AccionDeCampanaEnElHistorial } from "@/tipos/modelos";

export function HistorialDeCampanas({
  historial,
}: {
  historial: AccionDeCampanaEnElHistorial[];
}) {
  const clienteDeConsultas = useQueryClient();

  /** La acción que se está corrigiendo, si hay alguna. */
  const [accionEnCorreccion, establecerAccionEnCorreccion] =
    useState<AccionDeCampanaEnElHistorial | null>(null);

  /** La acción cuyo borrado se está confirmando. */
  const [accionPorBorrar, establecerAccionPorBorrar] = useState<string | null>(null);

  /**
   * Tras tocar el historial hay que refrescar tres cosas: la ficha (su
   * historial), el listado del tablero (la campaña de la tarjeta) y el
   * calendario del panel (el evento pudo cambiar de semana).
   */
  function refrescarLoQueDependeDelHistorial() {
    void clienteDeConsultas.invalidateQueries({ queryKey: clavesDeMarcas.todas });
    void clienteDeConsultas.invalidateQueries({ queryKey: ["panel", "calendario"] });
  }

  const borrarAccion = useMutation({
    mutationFn: eliminarAccionDeCampana,

    onSuccess: () => {
      avisarDeExito("Acción eliminada del historial");
      establecerAccionPorBorrar(null);
      refrescarLoQueDependeDelHistorial();
    },

    onError: (error) => avisarDeError(error, "No se pudo eliminar la acción"),
  });

  if (historial.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-default-200 px-4 py-6 text-center">
        <History className="mx-auto mb-2 size-5 text-default-300" />
        <p className="text-xs text-default-500">
          Todavía no se le ha hecho ninguna acción de campaña.
        </p>
        <p className="mt-0.5 text-[11px] text-default-400">
          Al asignarle una campaña con su fecha, quedará anotada aquí.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-default-200 p-4">
        <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-default-500">
          <History className="size-3.5" />
          Historial de campañas
          <span className="ml-auto font-normal normal-case tracking-normal text-default-400">
            {historial.length} {historial.length === 1 ? "acción" : "acciones"}
          </span>
        </h4>

        {/* Línea de tiempo: de lo más reciente a lo más antiguo, que es
            como se consulta un historial. */}
        <ol className="space-y-0">
          {historial.map((accion, posicion) => {
            const esLaUltima = posicion === historial.length - 1;
            const seEstaConfirmandoElBorrado = accionPorBorrar === accion.id;

            return (
              <li key={accion.id} className="group flex gap-3">
                {/* Punto y línea vertical que unen las entradas. */}
                <div className="flex flex-col items-center">
                  <span
                    className="mt-1.5 size-2.5 shrink-0 rounded-full ring-2 ring-content1"
                    style={{ backgroundColor: accion.campanaColor }}
                  />
                  {!esLaUltima && (
                    <span className="w-px flex-1 bg-default-200" aria-hidden />
                  )}
                </div>

                <div className={`min-w-0 flex-1 ${esLaUltima ? "pb-0" : "pb-4"}`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold leading-snug text-foreground">
                        {accion.campanaNombre}
                      </p>

                      <p className="mt-0.5 text-[11px] text-default-500">
                        {formatearFecha(accion.fecha)}
                      </p>

                      {accion.nota && (
                        <p className="mt-1 text-[11px] leading-relaxed text-default-500">
                          {accion.nota}
                        </p>
                      )}

                      {accion.registradoPorNombre && (
                        <p className="mt-0.5 text-[11px] text-default-400">
                          Anotado por {accion.registradoPorNombre}
                          {accion.registradoEn
                            ? ` · ${formatearTiempoRelativo(accion.registradoEn)}`
                            : ""}
                        </p>
                      )}
                    </div>

                    {/* Los botones aparecen al pasar por encima, para que
                        la línea de tiempo se lea limpia. En pantalla
                        táctil se muestran siempre. */}
                    {!seEstaConfirmandoElBorrado && (
                      <div className="flex shrink-0 gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                        {accion.puedoEditarlo && (
                          <Tooltip content="Corregir" placement="left">
                            <Button
                              isIconOnly
                              aria-label="Corregir esta acción"
                              radius="lg"
                              size="sm"
                              variant="light"
                              onPress={() => establecerAccionEnCorreccion(accion)}
                            >
                              <Pencil className="size-3" />
                            </Button>
                          </Tooltip>
                        )}

                        {accion.puedoEliminarlo && (
                          <Tooltip content="Eliminar" placement="left">
                            <Button
                              isIconOnly
                              aria-label="Eliminar esta acción"
                              color="danger"
                              radius="lg"
                              size="sm"
                              variant="light"
                              onPress={() => establecerAccionPorBorrar(accion.id)}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Confirmación en línea: borrar historial no se
                      deshace, así que no basta con un solo clic. */}
                  {seEstaConfirmandoElBorrado && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-danger-50 px-3 py-2 dark:bg-danger-100/10">
                      <span className="text-[11px] text-danger-600">
                        ¿Eliminar esta acción del historial?
                      </span>

                      <Button
                        color="danger"
                        isLoading={borrarAccion.isPending}
                        radius="lg"
                        size="sm"
                        onPress={() => borrarAccion.mutate(accion.id)}
                      >
                        Sí, eliminar
                      </Button>

                      <Button
                        radius="lg"
                        size="sm"
                        variant="light"
                        onPress={() => establecerAccionPorBorrar(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <ModalDeCorreccion
        accion={accionEnCorreccion}
        onCerrar={() => establecerAccionEnCorreccion(null)}
        onCorregida={refrescarLoQueDependeDelHistorial}
      />
    </>
  );
}

/* ==================================================================== */
/* Corregir una acción                                                 */
/* ==================================================================== */

function ModalDeCorreccion({
  accion,
  onCerrar,
  onCorregida,
}: {
  accion: AccionDeCampanaEnElHistorial | null;
  onCerrar: () => void;
  onCorregida: () => void;
}) {
  const { campanas } = useCampanasActivas();

  const [campanaId, establecerCampanaId] = useState("");
  const [fecha, establecerFecha] = useState("");
  const [nota, establecerNota] = useState("");

  // Se recarga el formulario cada vez que se abre con otra acción.
  const [idCargado, establecerIdCargado] = useState<string | null>(null);

  if (accion !== null && idCargado !== accion.id) {
    establecerIdCargado(accion.id);
    establecerCampanaId(accion.campanaId ?? "");
    establecerFecha(accion.fecha);
    establecerNota(accion.nota ?? "");
  }

  const corregir = useMutation({
    mutationFn: () => {
      if (accion === null) throw new Error("No hay ninguna acción abierta.");

      return corregirAccionDeCampana(accion.id, {
        campanaId,
        fecha,
        nota: nota.trim() || null,
      });
    },

    onSuccess: () => {
      avisarDeExito("Acción corregida");
      onCorregida();
      onCerrar();
    },

    onError: (error) => avisarDeError(error, "No se pudo corregir la acción"),
  });

  // La campaña del evento puede haberse borrado del catálogo; si es así
  // se añade a la lista para no perderla al abrir el formulario.
  const laCampanaSigueEnElCatalogo =
    accion?.campanaId != null &&
    campanas.some((campana) => campana.id === accion.campanaId);

  const faltanDatos = campanaId === "" || fecha === "";

  return (
    <Modal
      isOpen={accion !== null}
      size="lg"
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="text-lg font-bold tracking-tight">Corregir la acción</span>
          <span className="text-xs font-normal text-default-500">
            Cambia la campaña o el día. El calendario se actualiza solo.
          </span>
        </ModalHeader>

        <ModalBody className="gap-4">
          <Select
            isRequired
            label="Campaña"
            labelPlacement="outside"
            placeholder="Elegir campaña"
            radius="lg"
            selectedKeys={campanaId ? [campanaId] : []}
            variant="bordered"
            onSelectionChange={(seleccion) =>
              establecerCampanaId(String(Array.from(seleccion)[0] ?? ""))
            }
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

          {accion !== null && !laCampanaSigueEnElCatalogo && (
            <p className="rounded-xl bg-warning-50 px-3 py-2 text-[11px] leading-relaxed text-warning-700 dark:bg-warning-100/10">
              La campaña original de esta acción («{accion.campanaNombre}») ya no
              está en el catálogo o está desactivada. Al guardar tendrás que
              elegir una de las vigentes.
            </p>
          )}

          <Input
            isRequired
            label="¿Qué día se hace?"
            labelPlacement="outside"
            radius="lg"
            type="date"
            value={fecha}
            variant="bordered"
            onValueChange={establecerFecha}
          />

          <Textarea
            label="Nota"
            labelPlacement="outside"
            minRows={2}
            placeholder="Por qué se cambió, o cualquier detalle de la acción…"
            radius="lg"
            value={nota}
            variant="bordered"
            onValueChange={establecerNota}
          />
        </ModalBody>

        <ModalFooter>
          <Button radius="lg" variant="light" onPress={onCerrar}>
            Cancelar
          </Button>

          <Button
            color="primary"
            isDisabled={faltanDatos}
            isLoading={corregir.isPending}
            radius="lg"
            onPress={() => corregir.mutate()}
          >
            Guardar
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
