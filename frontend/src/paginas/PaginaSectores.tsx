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
 *
 * Al lado, el PRONÓSTICO (desde el 2026-10-08): el OVP de las líneas del
 * checklist de sus marcas, con su total, que es el «pronosticado» del
 * resumen. Se añadió porque en producción ninguna propuesta llevaba valor
 * y la primera columna salía entera a cero.
 *
 * «Campañas por sector» (desde el 2026-10-08, pedido por LinZ con un
 * boceto): en cada fila, una tarta por semana del mes con el reparto de
 * las acciones de campaña de ese rubro, y arriba el mes con sus flechas y
 * la leyenda de colores. Las semanas y los meses vecinos los pone el
 * servidor (regla 16); un agente recibe solo lo de sus marcas (regla 6).
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
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Shapes,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { mensajeDeError } from "@/api/clienteHttp";
import {
  BloqueDeCarga,
  BloqueDeError,
  EstadoVacio,
} from "@/componentes/comunes/EstadosDePantalla";
import { TartaDeCampanas } from "@/componentes/comunes/TartaDeCampanas";
import {
  useActualizarSector,
  useCampanasPorSector,
  useCrearSector,
  useEliminarSector,
  useSectores,
} from "@/hooks/useSectores";
import { useUsuarioAutenticado } from "@/providers/ProveedorSesion";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import { formatearDinero, formatearNumero, formatearPeriodo } from "@/utilidades/formato";
import type { CampanasPorSector, Sector, SemanaDeCampanas } from "@/tipos/modelos";

export function PaginaSectores() {
  const usuario = useUsuarioAutenticado();
  const catalogo = useSectores();

  const puedeEditar = usuario.permisos.gestionaElCatalogoComercial;

  // El dinero solo llega a quien ve las cifras de toda la empresa: si no
  // viene, la columna no se pinta (aquí no se mira el rol).
  const conDinero = catalogo.totalValorPropuestoUsd !== null;
  const [orden, establecerOrden] = useState<OrdenDeLosSectores>("catalogo");

  const totales = {
    propuestas: catalogo.totalValorPropuestoUsd ?? 0,
    pronostico: catalogo.totalPronosticoUsd ?? 0,
  };

  const sectoresEnOrden =
    conDinero && orden !== "catalogo"
      ? [...catalogo.sectores].sort((uno, otro) =>
          orden === "propuestas"
            ? (otro.valorPropuestoUsd ?? 0) - (uno.valorPropuestoUsd ?? 0)
            : (otro.pronosticoUsd ?? 0) - (uno.pronosticoUsd ?? 0),
        )
      : catalogo.sectores;

  // null = el mes en curso, el que diga el servidor (hora de Caracas).
  const [mesElegido, establecerMesElegido] = useState<string | null>(null);
  const campanas = useCampanasPorSector(mesElegido);
  const semanasDeCadaSector = new Map(
    (campanas.datos?.sectores ?? []).map((fila) => [fila.sector, fila.semanas]),
  );
  const semanasSinSector = campanas.datos?.sinSector ?? null;

  // «Sin sector» sale si tiene dinero que enseñar o acciones de campaña.
  const hayDineroSinSector =
    conDinero && catalogo.sinSector !== null && catalogo.sinSector.totalMarcas > 0;

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
              classNames={{ base: "max-w-full" }}
              radius="lg"
              selectedKey={orden}
              size="sm"
              onSelectionChange={(clave) => establecerOrden(clave as OrdenDeLosSectores)}
            >
              {/* En el teléfono, el nombre corto: los tres largos no caben. */}
              <Tab key="catalogo" title={<TituloDeOrden corto="Catálogo" largo="Como el catálogo" />} />
              <Tab key="propuestas" title={<TituloDeOrden corto="Propuestas" largo="Más en propuestas" />} />
              <Tab key="pronostico" title={<TituloDeOrden corto="Pronóstico" largo="Más pronóstico" />} />
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
          <div className="flex flex-wrap items-end gap-3 px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-default-400">
            <span className="hidden flex-1 pb-0.5 sm:block">Sector</span>
            <CabeceraDeLasSemanas alCambiarDeMes={establecerMesElegido} datos={campanas.datos} />
            {conDinero && (
              <div className="hidden shrink-0 pb-0.5 text-right sm:block">
                <span className="block">Dinero por sector</span>
                <span className="mt-1 flex gap-3 font-medium normal-case tracking-normal text-default-500">
                  <span className={ANCHO_DEL_IMPORTE}>Propuestas enviadas</span>
                  <span className={ANCHO_DEL_IMPORTE}>Pronóstico (OVP)</span>
                </span>
              </div>
            )}
            {puedeEditar && <span aria-hidden className="hidden w-[4.5rem] sm:block" />}
          </div>

          <LeyendaDeCampanas
            alReintentar={campanas.recargar}
            datos={campanas.datos}
            error={campanas.error}
          />

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

              <TartasDeLasSemanas
                datos={campanas.datos}
                nombre={sector.nombre}
                semanas={semanasDeCadaSector.get(sector.nombre)}
              />

              {conDinero && (
                <DineroDelSector
                  // `?? 0`: una copia guardada de antes de esta versión no
                  // trae el pronóstico.
                  pronostico={sector.pronosticoUsd ?? 0}
                  propuestas={sector.valorPropuestoUsd ?? 0}
                  totales={totales}
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
          {(hayDineroSinSector || semanasSinSector !== null) && (
            <FilaDeTotales
              conBotones={puedeEditar}
              conDinero={conDinero}
              detalle={
                hayDineroSinSector && catalogo.sinSector !== null
                  ? `${formatearNumero(catalogo.sinSector.totalMarcas)} ${
                      catalogo.sinSector.totalMarcas === 1 ? "marca" : "marcas"
                    } sin sector${
                      // `?? []`: una copia guardada de antes de esta versión no lo trae.
                      (catalogo.sinSector.nombresFueraDelCatalogo ?? []).length > 0
                        ? ` o con uno que no está en la lista: ${catalogo.sinSector.nombresFueraDelCatalogo.join(", ")}`
                        : ""
                    }`
                  : "Marcas sin sector o con uno que no está en la lista"
              }
              pronostico={catalogo.sinSector?.pronosticoUsd ?? 0}
              propuestas={catalogo.sinSector?.valorPropuestoUsd ?? 0}
              semanas={
                <TartasDeLasSemanas
                  datos={campanas.datos}
                  nombre="Sin sector"
                  semanas={semanasSinSector ?? undefined}
                />
              }
              titulo="Sin sector"
              totales={totales}
            />
          )}

          {conDinero && (
            <FilaDeTotales
              destacada
              conBotones={puedeEditar}
              conDinero={conDinero}
              detalle="Las propuestas enviadas y el pronóstico de todo el equipo"
              pronostico={totales.pronostico}
              propuestas={totales.propuestas}
              semanas={<TartasDeLasSemanas soloHueco datos={campanas.datos} nombre="Total" />}
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
/* Las columnas «Dinero por sector»                                      */
/* ==================================================================== */

type OrdenDeLosSectores = "catalogo" | "propuestas" | "pronostico";

/** El ancho de cada columna de dinero, igual en la cabecera y en las filas. */
const ANCHO_DEL_IMPORTE = "sm:w-36";

/*
  Dónde van las dos columnas: a la derecha de la fila y, en el teléfono,
  debajo y a lo ancho, para que el nombre y los botones se queden en la
  primera línea.
*/
const COLOCACION_DEL_DINERO =
  "order-last flex w-full shrink-0 gap-4 pl-11 sm:order-none sm:w-auto sm:gap-3 sm:pl-0";

function TituloDeOrden({ corto, largo }: { corto: string; largo: string }) {
  return (
    <>
      <span className="sm:hidden">{corto}</span>
      <span className="hidden sm:inline">{largo}</span>
    </>
  );
}

/** Las propuestas enviadas y el pronóstico de una fila, cada uno con su barra. */
function DineroDelSector({
  propuestas,
  pronostico,
  totales,
}: {
  propuestas: number;
  pronostico: number;
  totales: { propuestas: number; pronostico: number };
}) {
  return (
    <div className={COLOCACION_DEL_DINERO}>
      <ImporteConBarra color="bg-primary" importe={propuestas} rotulo="Propuestas" total={totales.propuestas} />
      <ImporteConBarra color="bg-primary-300" importe={pronostico} rotulo="Pronóstico" total={totales.pronostico} />
    </div>
  );
}

/**
 * Un importe con una barra fina de su parte del total: de un vistazo se ve
 * dónde está el dinero sin leer cifra por cifra.
 */
function ImporteConBarra({
  importe,
  total,
  rotulo,
  color,
}: {
  importe: number;
  total: number;
  /** En el teléfono no hay cabecera: cada importe dice cuál es. */
  rotulo: string;
  color: string;
}) {
  const parte = total > 0 ? importe / total : 0;

  return (
    <div className={`min-w-0 flex-1 sm:flex-none sm:text-right ${ANCHO_DEL_IMPORTE}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-default-400 sm:hidden">
        {rotulo}
      </p>
      <p
        className={[
          "text-sm font-semibold tabular-nums",
          importe > 0 ? "text-foreground" : "text-default-400",
        ].join(" ")}
      >
        {formatearDinero(importe)}
      </p>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-default-100 sm:ml-auto sm:w-28">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: importe > 0 ? `${Math.max(parte * 100, 2)}%` : "0%" }}
        />
      </div>
    </div>
  );
}

/** «Sin sector» y «Total», debajo de la lista, alineados con las columnas. */
function FilaDeTotales({
  titulo,
  detalle,
  propuestas,
  pronostico,
  totales,
  destacada = false,
  conBotones,
  conDinero,
  semanas,
}: {
  titulo: string;
  detalle: string;
  propuestas: number;
  pronostico: number;
  /** Con ellos se dibuja la barra de su parte; el total no la lleva. */
  totales?: { propuestas: number; pronostico: number };
  destacada?: boolean;
  /** Si las filas de arriba llevan botones, para dejar su hueco. */
  conBotones: boolean;
  /** Sin dinero (un agente), la fila solo lleva las tartas. */
  conDinero: boolean;
  /** Las tartas de la fila, o su hueco para que las columnas cuadren. */
  semanas: ReactNode;
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

      {semanas}

      {!conDinero ? null : totales !== undefined ? (
        <DineroDelSector pronostico={pronostico} propuestas={propuestas} totales={totales} />
      ) : (
        <div className={COLOCACION_DEL_DINERO}>
          {[
            { rotulo: "Propuestas", importe: propuestas },
            { rotulo: "Pronóstico", importe: pronostico },
          ].map(({ rotulo, importe }) => (
            <div key={rotulo} className={`min-w-0 flex-1 sm:flex-none sm:text-right ${ANCHO_DEL_IMPORTE}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-default-400 sm:hidden">
                {rotulo}
              </p>
              <p className="text-base font-bold tabular-nums text-primary">
                {formatearDinero(importe)}
              </p>
            </div>
          ))}
        </div>
      )}

      {conBotones && <span aria-hidden className="hidden w-[4.5rem] shrink-0 sm:block" />}
    </div>
  );
}

/* ==================================================================== */
/* Campañas por sector                                                   */
/* ==================================================================== */

/*
  El ancho de cada semana, igual en la cabecera y en las filas: si no
  coinciden, las tartas no caen bajo su «Semana N». En el teléfono, más
  estrecho para que quepan seis semanas.
*/
const ANCHO_DE_SEMANA = "w-11 sm:w-16";

/*
  Dónde van las semanas: en pantalla muy ancha, entre el nombre y el
  dinero; más estrecha, en su propia línea debajo, con la sangría del
  icono. Desde que hay dos columnas de dinero (propuestas y pronóstico)
  no caben en la misma fila hasta xl.
*/
const COLOCACION_DE_LAS_SEMANAS =
  "order-last w-full shrink-0 pl-11 xl:order-none xl:w-auto xl:pl-0";

/** "1–6", o "31" si la semana es un solo día. */
function diasDeLaSemana(semana: CampanasPorSector["semanas"][number]): string {
  const desde = Number(semana.desde.slice(8));
  const hasta = Number(semana.hasta.slice(8));

  return desde === hasta ? `${desde}` : `${desde}–${hasta}`;
}

/** El mes con sus flechas y, debajo, una columna por semana. */
function CabeceraDeLasSemanas({
  datos,
  alCambiarDeMes,
}: {
  datos: CampanasPorSector | null;
  alCambiarDeMes: (mes: string | null) => void;
}) {
  // Hasta pantalla muy ancha las tartas van en su propia línea, debajo del
  // nombre y con la sangría de su icono; la cabecera se coloca igual.
  return (
    <div className={`${COLOCACION_DE_LAS_SEMANAS} flex`}>
      <div className="w-fit">
        <div className="mb-1 flex items-center justify-center gap-1 normal-case tracking-normal">
          <Button
            isIconOnly
            aria-label="Mes anterior"
            isDisabled={datos === null}
            radius="full"
            size="sm"
            variant="light"
            onPress={() => datos && alCambiarDeMes(datos.periodo.anterior)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-32 text-center text-xs font-semibold text-foreground">
            {datos?.periodo.etiqueta ?? "…"}
          </span>
          <Button
            isIconOnly
            aria-label="Mes siguiente"
            isDisabled={datos === null}
            radius="full"
            size="sm"
            variant="light"
            onPress={() => datos && alCambiarDeMes(datos.periodo.siguiente)}
          >
            <ChevronRight className="size-4" />
          </Button>
          {datos !== null && !datos.periodo.esElMesActual && (
            <Button
              className="h-6 min-w-0 px-2 text-[11px]"
              radius="full"
              size="sm"
              variant="flat"
              onPress={() => alCambiarDeMes(null)}
            >
              Este mes
            </Button>
          )}
        </div>

        <div className="flex">
          {(datos?.semanas ?? []).map((semana) => (
            <div
              key={semana.numero}
              className={[
                ANCHO_DE_SEMANA,
                "text-center leading-tight normal-case tracking-normal",
                semana.esLaActual ? "text-primary" : "",
              ].join(" ")}
              title={formatearPeriodo(semana.desde, semana.hasta)}
            >
              <span className="block font-semibold">
                <span className="sm:hidden">S{semana.numero}</span>
                <span className="hidden sm:inline">Semana {semana.numero}</span>
              </span>
              <span className="block font-normal tabular-nums">
                {diasDeLaSemana(semana)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Qué campaña es cada color, con sus acciones del mes. Sin ninguna, lo
 * dice: una franja que desaparece hace pensar que la pantalla no carga.
 */
function LeyendaDeCampanas({
  datos,
  error,
  alReintentar,
}: {
  datos: CampanasPorSector | null;
  error: unknown;
  alReintentar: () => void;
}) {
  if (error) {
    return (
      <p className="px-3 py-2 text-xs text-danger">
        No se pudieron cargar las campañas por sector.{" "}
        <button
          className="font-semibold underline"
          type="button"
          onClick={alReintentar}
        >
          Reintentar
        </button>
      </p>
    );
  }

  if (datos === null) return null;

  if (datos.campanas.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-default-400">
        Ninguna acción de campaña en {datos.periodo.etiqueta.toLowerCase()}.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs text-default-600">
      <span className="text-default-400">
        {formatearNumero(datos.totalDeAcciones)}{" "}
        {datos.totalDeAcciones === 1 ? "acción" : "acciones"} de campaña:
      </span>
      {datos.campanas.map((campana) => (
        <span key={campana.etiqueta} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={{ backgroundColor: campana.color }}
          />
          {campana.etiqueta}
          <span className="font-semibold tabular-nums text-foreground">
            {formatearNumero(campana.total)}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * Una tarta por semana en la fila de un sector. Una semana sin acciones
 * deja su hueco vacío, para que la siguiente siga bajo su columna.
 */
function TartasDeLasSemanas({
  datos,
  nombre,
  semanas,
  soloHueco = false,
}: {
  datos: CampanasPorSector | null;
  nombre: string;
  /** Sin acciones en el mes, el sector no viene en la respuesta. */
  semanas?: SemanaDeCampanas[];
  /** Para la fila del total: ocupa el sitio y no pinta nada. */
  soloHueco?: boolean;
}) {
  if (datos === null) return null;

  return (
    <div
      className={[
        COLOCACION_DE_LAS_SEMANAS,
        // En su propia línea, una fila sin tartas no gasta una en blanco.
        soloHueco || semanas === undefined ? "hidden xl:flex" : "flex",
      ].join(" ")}
    >
      {datos.semanas.map((semana, posicion) => (
        <div
          key={semana.numero}
          className={`${ANCHO_DE_SEMANA} flex justify-center`}
        >
          {!soloHueco && semanas?.[posicion] && (
            <TartaDeCampanas
              porciones={semanas[posicion].porCampana}
              subtitulo={formatearPeriodo(semana.desde, semana.hasta)}
              titulo={`${nombre} · Semana ${semana.numero}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
