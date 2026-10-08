/**
 * paginas/PaginaSectores.tsx
 * ---------------------------------------------------------------------
 * El catálogo de rubros: Alimentos, Bebidas, Telecomunicaciones…
 *
 * Existe porque hasta ahora era una lista escrita en el código del
 * servidor: añadir un rubro obligaba a tocar el repositorio y volver a
 * desplegar, y mientras tanto las marcas de ese rubro se quedaban en
 * "Otro".
 *
 * Es una pantalla pequeña a propósito —un sector es solo un nombre—,
 * pero tiene dos reglas que conviene que se vean al usarla:
 *
 *   · Un sector CON marcas no se borra, se desactiva. Desactivado
 *     desaparece del selector de la ficha, pero las marcas que ya lo
 *     llevan lo conservan y siguen contando en el resumen.
 *   · Renombrar arrastra el cambio a sus marcas. Por eso la fila avisa
 *     de cuántas son antes de guardar.
 *
 * Verlo lo puede todo el equipo; editarlo, quien gestiona el catálogo
 * comercial. La bandera ya viene resuelta del servidor: aquí no se
 * compara ningún rol.
 *
 * «Dinero por sector» (desde el 2026-10-07): el valor de las propuestas
 * enviadas de las marcas de cada rubro, con una fila para las que no
 * tienen sector y el total, que es el mismo valor propuesto del resumen.
 * Lo suma el servidor y solo se lo manda a quien ve las cifras de toda la
 * empresa; sin él, la columna no sale.
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
  Switch,
  Tab,
  Tabs,
  Tooltip,
} from "@heroui/react";
import { Pencil, Plus, RefreshCw, Save, Shapes, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { mensajeDeError } from "@/api/clienteHttp";
import {
  BloqueDeCarga,
  BloqueDeError,
  EstadoVacio,
} from "@/componentes/comunes/EstadosDePantalla";
import {
  useActualizarSector,
  useCrearSector,
  useEliminarSector,
  useSectores,
} from "@/hooks/useSectores";
import { useUsuarioAutenticado } from "@/providers/ProveedorSesion";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import { formatearDinero, formatearNumero } from "@/utilidades/formato";
import type { Sector } from "@/tipos/modelos";

export function PaginaSectores() {
  const usuario = useUsuarioAutenticado();
  const catalogo = useSectores();

  const puedeEditar = usuario.permisos.gestionaElCatalogoComercial;

  // El dinero solo llega a quien ve las cifras de toda la empresa: si no
  // viene, la columna no se pinta (aquí no se mira el rol).
  const conDinero = catalogo.totalValorPropuestoUsd !== null;
  const [orden, establecerOrden] = useState<"catalogo" | "dinero">("catalogo");

  const sectoresEnOrden =
    conDinero && orden === "dinero"
      ? [...catalogo.sectores].sort(
          (uno, otro) => (otro.valorPropuestoUsd ?? 0) - (uno.valorPropuestoUsd ?? 0),
        )
      : catalogo.sectores;

  const crearSector = useCrearSector();
  const actualizarSector = useActualizarSector();
  const eliminarSector = useEliminarSector();

  const [elModalEstaAbierto, establecerModalAbierto] = useState(false);
  const [sectorEnEdicion, establecerSectorEnEdicion] = useState<Sector | null>(null);
  const [nombre, establecerNombre] = useState("");
  const [estaActivo, establecerEstaActivo] = useState(true);

  /*
    El formulario se vuelca cada vez que se ABRE el modal, no cada vez
    que cambia la marca en edición: dos altas seguidas comparten
    identidad —ninguna, las dos null— y la segunda abriría con lo que se
    escribió en la primera. Es el mismo fallo que ya se corrigió en el
    alta de cuentas.
  */
  useEffect(() => {
    if (!elModalEstaAbierto) return;

    establecerNombre(sectorEnEdicion?.nombre ?? "");
    establecerEstaActivo(sectorEnEdicion?.activo ?? true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elModalEstaAbierto]);

  function abrirParaCrear() {
    establecerSectorEnEdicion(null);
    establecerModalAbierto(true);
  }

  function abrirParaEditar(sector: Sector) {
    establecerSectorEnEdicion(sector);
    establecerModalAbierto(true);
  }

  async function guardar() {
    const nombreLimpio = nombre.trim();

    if (nombreLimpio === "") {
      avisarDeError(new Error("El sector necesita un nombre."), "Falta el nombre");

      return;
    }

    try {
      if (sectorEnEdicion === null) {
        await crearSector.mutateAsync(nombreLimpio);
        avisarDeExito("Sector añadido");
      } else {
        await actualizarSector.mutateAsync({
          idDelSector: sectorEnEdicion.id,
          datos: { nombre: nombreLimpio, activo: estaActivo },
        });
        avisarDeExito(
          sectorEnEdicion.nombre === nombreLimpio
            ? "Sector actualizado"
            : `Renombrado, y con él sus ${formatearNumero(sectorEnEdicion.totalMarcas)} marcas`,
        );
      }

      establecerModalAbierto(false);
    } catch (error) {
      avisarDeError(error, "No se pudo guardar el sector");
    }
  }

  async function borrar(sector: Sector) {
    try {
      await eliminarSector.mutateAsync(sector.id);
      avisarDeExito("Sector eliminado");
    } catch (error) {
      // Con marcas dentro el servidor responde 422 explicando que hay
      // que desactivarlo; ese mensaje ya viene redactado.
      avisarDeError(error, "No se pudo eliminar el sector");
    }
  }

  const estaGuardando = crearSector.isPending || actualizarSector.isPending;

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Sectores
          </h2>
          <p className="mt-0.5 text-sm text-default-500">
            El rubro de cada marca. Es con lo que el resumen contesta en qué
            sectores se está concentrando el esfuerzo
            {conDinero && " y cuánto dinero hay en cada uno"}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {conDinero && (
            <Tabs
              aria-label="Orden de los sectores"
              radius="lg"
              selectedKey={orden}
              size="sm"
              onSelectionChange={(clave) => establecerOrden(clave as "catalogo" | "dinero")}
            >
              <Tab key="catalogo" title="Como el catálogo" />
              <Tab key="dinero" title="Más dinero primero" />
            </Tabs>
          )}

          <Button
            isIconOnly
            aria-label="Actualizar el catálogo"
            radius="lg"
            size="sm"
            variant="flat"
            onPress={catalogo.recargar}
          >
            <RefreshCw className="size-4" />
          </Button>

          {puedeEditar && (
            <Button
              color="primary"
              radius="lg"
              size="sm"
              startContent={<Plus className="size-4" />}
              onPress={abrirParaCrear}
            >
              Nuevo sector
            </Button>
          )}
        </div>
      </div>

      {/* Catálogo */}
      {catalogo.estaCargando ? (
        <BloqueDeCarga alto="min-h-72" mensaje="Cargando los sectores…" />
      ) : catalogo.error ? (
        <BloqueDeError
          alReintentar={catalogo.recargar}
          mensaje={mensajeDeError(catalogo.error)}
        />
      ) : catalogo.sectores.length === 0 ? (
        <div className="bento-card">
          <EstadoVacio
            accion={
              puedeEditar ? (
                <Button
                  color="primary"
                  radius="lg"
                  size="sm"
                  startContent={<Plus className="size-4" />}
                  onPress={abrirParaCrear}
                >
                  Añadir el primero
                </Button>
              ) : undefined
            }
            descripcion="Sin rubros no se pueden clasificar las marcas."
            icono={<Shapes className="size-5" />}
            titulo="Todavía no hay sectores"
          />
        </div>
      ) : (
        <div className="bento-card divide-y divide-default-100 p-2">
          {conDinero && (
            <div className="hidden items-center gap-3 px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-default-400 sm:flex">
              <span className="flex-1">Sector</span>
              <span className="w-44 text-right">Dinero por sector</span>
              <span className={puedeEditar ? "w-[4.5rem]" : "hidden"} />
            </div>
          )}

          {sectoresEnOrden.map((sector) => (
            <div
              key={sector.id}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  className={[
                    "flex size-8 shrink-0 items-center justify-center rounded-xl",
                    sector.activo
                      ? "bg-primary-100 text-primary-700"
                      : "bg-default-100 text-default-400",
                  ].join(" ")}
                >
                  <Shapes className="size-4" />
                </span>

                <div className="min-w-0">
                  <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                    <span className="truncate">{sector.nombre}</span>
                    {/* Junto al nombre y no con los botones: así la
                        columna del dinero queda alineada en todas las filas. */}
                    {!sector.activo && (
                      <Chip className="shrink-0" radius="lg" size="sm" variant="flat">
                        Retirado
                      </Chip>
                    )}
                  </p>
                  {/* El total es también el aviso de qué se arrastra al
                      renombrar y de por qué no se puede borrar. */}
                  <Link
                    className="text-[11px] text-default-500 hover:text-primary hover:underline"
                    to={`/marcas?sector=${encodeURIComponent(sector.nombre)}`}
                  >
                    {formatearNumero(sector.totalMarcas)}{" "}
                    {sector.totalMarcas === 1 ? "marca" : "marcas"}
                  </Link>
                </div>
              </div>

              {conDinero && (
                <DineroDelSector
                  importe={sector.valorPropuestoUsd ?? 0}
                  total={catalogo.totalValorPropuestoUsd ?? 0}
                />
              )}

              <div className="flex shrink-0 items-center gap-2">
                {puedeEditar && (
                  <>
                    <Button
                      isIconOnly
                      aria-label={`Editar el sector ${sector.nombre}`}
                      radius="lg"
                      size="sm"
                      variant="light"
                      onPress={() => abrirParaEditar(sector)}
                    >
                      <Pencil className="size-4" />
                    </Button>

                    <Tooltip
                      content={
                        sector.totalMarcas > 0
                          ? "Tiene marcas dentro: desactívalo desde el lápiz"
                          : "Eliminar"
                      }
                      placement="top"
                    >
                      {/* El botón se deja PULSABLE aunque tenga marcas:
                          el servidor responde con el motivo exacto y
                          eso enseña la regla mejor que un botón apagado
                          que no explica nada. */}
                      <Button
                        isIconOnly
                        aria-label={`Eliminar el sector ${sector.nombre}`}
                        color="danger"
                        radius="lg"
                        size="sm"
                        variant="light"
                        onPress={() => void borrar(sector)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
          ))}

          {/* Lo que no está en ningún sector y el total de la columna,
              que es el valor propuesto de toda la agencia: el mismo
              número que el resumen. */}
          {conDinero && catalogo.sinSector !== null && catalogo.sinSector.totalMarcas > 0 && (
            <FilaDeTotales
              conBotones={puedeEditar}
              detalle={`${formatearNumero(catalogo.sinSector.totalMarcas)} ${
                catalogo.sinSector.totalMarcas === 1 ? "marca" : "marcas"
              } sin sector${
                // `?? []`: una copia guardada de antes de esta versión no lo trae.
                (catalogo.sinSector.nombresFueraDelCatalogo ?? []).length > 0
                  ? ` o con uno que no está en la lista: ${catalogo.sinSector.nombresFueraDelCatalogo.join(", ")}`
                  : ""
              }`}
              importe={catalogo.sinSector.valorPropuestoUsd}
              titulo="Sin sector"
              total={catalogo.totalValorPropuestoUsd ?? 0}
            />
          )}

          {conDinero && (
            <FilaDeTotales
              destacada
              conBotones={puedeEditar}
              detalle="Valor de las propuestas enviadas"
              importe={catalogo.totalValorPropuestoUsd ?? 0}
              titulo="Total"
            />
          )}
        </div>
      )}

      {/* Alta y edición */}
      <Modal
        isOpen={elModalEstaAbierto}
        placement="center"
        onOpenChange={establecerModalAbierto}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span className="text-base font-bold">
              {sectorEnEdicion === null ? "Nuevo sector" : "Editar sector"}
            </span>
            {sectorEnEdicion !== null && sectorEnEdicion.totalMarcas > 0 && (
              <span className="text-[11px] font-normal text-default-500">
                Si le cambias el nombre, se lo cambia también a sus{" "}
                {formatearNumero(sectorEnEdicion.totalMarcas)}{" "}
                {sectorEnEdicion.totalMarcas === 1 ? "marca" : "marcas"}.
              </span>
            )}
          </ModalHeader>

          <ModalBody>
            <Input
              autoFocus
              label="Nombre"
              placeholder="Turismo, Seguros, Construcción…"
              radius="lg"
              value={nombre}
              variant="bordered"
              onValueChange={establecerNombre}
            />

            {sectorEnEdicion !== null && (
              <Switch
                isSelected={estaActivo}
                size="sm"
                onValueChange={establecerEstaActivo}
              >
                <span className="text-sm">
                  Activo
                  <span className="block text-[11px] text-default-400">
                    Retirado deja de ofrecerse al clasificar, y las marcas que
                    ya lo tienen lo conservan.
                  </span>
                </span>
              </Switch>
            )}
          </ModalBody>

          <ModalFooter>
            <Button
              radius="lg"
              variant="light"
              onPress={() => establecerModalAbierto(false)}
            >
              Cancelar
            </Button>
            <Button
              color="primary"
              isLoading={estaGuardando}
              radius="lg"
              startContent={!estaGuardando && <Save className="size-4" />}
              onPress={() => void guardar()}
            >
              Guardar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

/* ==================================================================== */
/* La columna «Dinero por sector»                                       */
/* ==================================================================== */

/**
 * El importe de un sector con una barra fina de su parte del total: de un
 * vistazo se ve dónde está el dinero sin leer cifra por cifra.
 */
function DineroDelSector({ importe, total }: { importe: number; total: number }) {
  const parte = total > 0 ? importe / total : 0;

  return (
    // En el teléfono va debajo, a lo ancho: el nombre y los botones
    // se quedan en la primera línea.
    <div className="order-last w-full shrink-0 pl-11 sm:order-none sm:w-44 sm:pl-0 sm:text-right">
      <p
        className={[
          "text-sm font-semibold tabular-nums",
          importe > 0 ? "text-foreground" : "text-default-400",
        ].join(" ")}
      >
        {formatearDinero(importe)}
      </p>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-default-100 sm:ml-auto sm:w-32">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: importe > 0 ? `${Math.max(parte * 100, 2)}%` : "0%" }}
        />
      </div>
    </div>
  );
}

/** «Sin sector» y «Total», debajo de la lista, alineados con la columna. */
function FilaDeTotales({
  titulo,
  detalle,
  importe,
  total,
  destacada = false,
  conBotones,
}: {
  titulo: string;
  detalle: string;
  importe: number;
  /** Con él se dibuja la barra de su parte; el total no la lleva. */
  total?: number;
  destacada?: boolean;
  /** Si las filas de arriba llevan botones, para dejar su hueco. */
  conBotones: boolean;
}) {
  return (
    <div
      className={[
        "flex flex-wrap items-center justify-between gap-3 px-3 py-3",
        destacada ? "rounded-xl bg-default-50" : "",
      ].join(" ")}
    >
      <div className="min-w-0 flex-1 pl-11">
        <p className={["text-sm text-foreground", destacada ? "font-bold" : "font-semibold italic"].join(" ")}>
          {titulo}
        </p>
        <p className="text-[11px] text-default-500">{detalle}</p>
      </div>

      {total !== undefined ? (
        <DineroDelSector importe={importe} total={total} />
      ) : (
        <p className="w-full shrink-0 pl-11 text-base font-bold tabular-nums text-primary sm:w-44 sm:pl-0 sm:text-right">
          {formatearDinero(importe)}
        </p>
      )}

      {conBotones && <span aria-hidden className="hidden w-[4.5rem] shrink-0 sm:block" />}
    </div>
  );
}
