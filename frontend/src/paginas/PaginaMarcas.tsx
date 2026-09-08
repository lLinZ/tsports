/**
 * paginas/PaginaMarcas.tsx
 * ---------------------------------------------------------------------
 * El tablero del CRM: donde el equipo comercial pasa el día.
 *
 * Una cuadrícula de tarjetas con buscador y filtros arriba. Los filtros
 * viajan en la dirección del navegador (?zona=Caracas&etapa=propuesta),
 * lo que permite guardar una vista en marcadores o pasarle a un
 * compañero el enlace exacto de lo que estás viendo.
 *
 * Esa misma dirección es la que convierte los contadores del panel en
 * botones: pulsar «13 con propuesta» abre esta pantalla con `?fase=`
 * puesto. Ojo con la diferencia entre los dos filtros de avance, porque
 * no significan lo mismo:
 *
 *   · `?etapa=` es el selector de aquí arriba. Reparte las marcas en
 *     cajones que no se pisan: una marca con propuesta cuenta como «con
 *     propuesta» y ya no aparece en «en aproximación».
 *   · `?fase=` es lo que cuentan los contadores del panel: si esa
 *     casilla está marcada, sin mirar las otras dos.
 *
 * Por eso el mismo avance se filtra de dos maneras, y por eso poner los
 * dos a la vez no tendría sentido: `cambiarFiltro` quita uno al poner
 * el otro.
 *
 * La búsqueda se aplica con un pequeño retardo para no lanzar una
 * consulta por cada tecla pulsada.
 * ---------------------------------------------------------------------
 */
import { Button, Chip, Input, Select, SelectItem } from "@heroui/react";
import {
  Building2,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { mensajeDeError } from "@/api/clienteHttp";
import {
  BloqueDeCarga,
  BloqueDeError,
  EstadoVacio,
} from "@/componentes/comunes/EstadosDePantalla";
import { ModalDeMarca } from "@/componentes/crm/ModalDeMarca";
import { TarjetaDeMarca } from "@/componentes/crm/TarjetaDeMarca";
import { useCampanasActivas } from "@/hooks/useCampanas";
import { useCatalogos } from "@/hooks/useCatalogos";
import {
  useAgentesDeMarcas,
  useAlternarFase,
  useFichaDeMarca,
  useListadoDeMarcas,
} from "@/hooks/useMarcas";
import { usePropiedadesOfrecibles } from "@/hooks/usePropiedades";
import { useScrollInfinito } from "@/hooks/useScrollInfinito";
import { useUsuarioAutenticado } from "@/providers/ProveedorSesion";
import { avisarDeError } from "@/utilidades/avisos";
import { formatearNumero } from "@/utilidades/formato";
import type {
  EtapaDeMarca,
  FaseDeMarca,
  FiltrosDeMarcas,
  InversionEnPatrocinios,
  Marca,
} from "@/tipos/modelos";

/** Las etapas del filtro, con el nombre que ve la persona. */
const OPCIONES_DE_ETAPA: Array<{ valor: EtapaDeMarca | ""; etiqueta: string }> = [
  { valor: "", etiqueta: "Todo el avance" },
  { valor: "sin_iniciar", etiqueta: "Sin iniciar" },
  { valor: "aproximacion", etiqueta: "En aproximación" },
  { valor: "prospeccion", etiqueta: "Prospección completa" },
  { valor: "propuesta", etiqueta: "Con propuesta" },
  { valor: "completa", etiqueta: "Proceso completo" },
];

/**
 * Cómo se llama cada fase cuando llega como filtro desde el panel.
 *
 * Son los mismos rótulos que llevan los contadores del resumen, a
 * propósito: quien pulsa «Con propuesta» tiene que reconocer de dónde
 * viene la lista que está mirando.
 */
const NOMBRE_DE_LA_FASE: Record<FaseDeMarca, string> = {
  aproximacion: "En aproximación",
  prospeccion: "Prospección completa",
  propuesta: "Con propuesta",
};

const OPCIONES_DE_ORDEN: Array<{
  valor: FiltrosDeMarcas["orden"];
  etiqueta: string;
}> = [
  { valor: "recientes", etiqueta: "Más recientes" },
  { valor: "antiguas", etiqueta: "Más antiguas" },
  { valor: "valor_desc", etiqueta: "Mayor valor" },
  { valor: "valor_asc", etiqueta: "Menor valor" },
  { valor: "nombre", etiqueta: "Nombre (A–Z)" },
];

/** Milisegundos de espera antes de buscar mientras se escribe. */
const RETARDO_DE_BUSQUEDA_MS = 350;

export function PaginaMarcas() {
  const usuario = useUsuarioAutenticado();
  const { catalogos } = useCatalogos();

  const [parametrosDeLaUrl, establecerParametrosDeLaUrl] = useSearchParams();

  /* ---------------------------------------------------------------- */
  /* Filtros (viven en la URL para poder compartir la vista)          */
  /* ---------------------------------------------------------------- */

  const filtrosAplicados = useMemo<Partial<FiltrosDeMarcas>>(
    () => ({
      busqueda: parametrosDeLaUrl.get("busqueda") ?? "",
      etapa: (parametrosDeLaUrl.get("etapa") as EtapaDeMarca) ?? "",
      fase: (parametrosDeLaUrl.get("fase") as FaseDeMarca) ?? "",
      zona: parametrosDeLaUrl.get("zona") ?? "",
      sector: parametrosDeLaUrl.get("sector") ?? "",
      vendedor: parametrosDeLaUrl.get("vendedor") ?? "",
      campana: parametrosDeLaUrl.get("campana") ?? "",
      propiedad: parametrosDeLaUrl.get("propiedad") ?? "",
      invierte:
        (parametrosDeLaUrl.get("invierte") as InversionEnPatrocinios) ?? "",
      orden:
        (parametrosDeLaUrl.get("orden") as FiltrosDeMarcas["orden"]) ?? "recientes",
    }),
    [parametrosDeLaUrl],
  );

  /**
   * Lo que se está escribiendo en el buscador. Es un estado aparte del
   * filtro aplicado porque la caja tiene que responder al instante
   * aunque la consulta espere un momento.
   */
  const [textoDelBuscador, establecerTextoDelBuscador] = useState(
    filtrosAplicados.busqueda ?? "",
  );

  // Vuelca el texto al filtro de la URL tras el retardo.
  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      if (textoDelBuscador === (filtrosAplicados.busqueda ?? "")) return;

      cambiarFiltro("busqueda", textoDelBuscador);
    }, RETARDO_DE_BUSQUEDA_MS);

    return () => window.clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoDelBuscador]);

  /** Cambia un filtro conservando el resto. */
  function cambiarFiltro(clave: keyof FiltrosDeMarcas, valor: string) {
    const parametrosNuevos = new URLSearchParams(parametrosDeLaUrl);

    if (valor === "") {
      parametrosNuevos.delete(clave);
    } else {
      parametrosNuevos.set(clave, valor);
    }

    // Etapa y fase son dos formas de leer el MISMO avance, así que se
    // pisan: dejar las dos puestas daría listas vacías imposibles de
    // entender ("en aproximación" + "con propuesta" no devuelve nada).
    // Manda la última que se haya tocado.
    if (clave === "etapa" && valor !== "") {
      parametrosNuevos.delete("fase");
    }

    if (clave === "fase" && valor !== "") {
      parametrosNuevos.delete("etapa");
    }

    establecerParametrosDeLaUrl(parametrosNuevos, { replace: true });
  }

  function limpiarTodosLosFiltros() {
    establecerTextoDelBuscador("");
    establecerParametrosDeLaUrl(new URLSearchParams(), { replace: true });
  }

  const hayFiltrosActivos =
    Boolean(filtrosAplicados.busqueda) ||
    Boolean(filtrosAplicados.etapa) ||
    Boolean(filtrosAplicados.fase) ||
    Boolean(filtrosAplicados.zona) ||
    Boolean(filtrosAplicados.sector) ||
    Boolean(filtrosAplicados.vendedor) ||
    Boolean(filtrosAplicados.campana) ||
    Boolean(filtrosAplicados.propiedad) ||
    Boolean(filtrosAplicados.invierte);

  /* ---------------------------------------------------------------- */
  /* Datos                                                            */
  /* ---------------------------------------------------------------- */

  const listado = useListadoDeMarcas(filtrosAplicados);
  const alternarFase = useAlternarFase();

  // El final de la cuadrícula pide la página siguiente al asomar. El
  // tablero se recorre desplazándose, que es como lo usa el equipo, en
  // vez de con un paginador.
  const finalDeLaCuadricula = useScrollInfinito({
    hayMas: listado.hayMasMarcas,
    estaCargando: listado.estaTrayendoMas,
    pedirMas: () => void listado.pedirMasMarcas(),
  });

  // Campañas y propiedades para sus dos selectores. Las dos consultas ya
  // están cacheadas para toda la sesión desde la ficha de una marca, así
  // que no cuestan una petición extra al abrir el tablero.
  const { campanas: campanasActivas } = useCampanasActivas();
  const { propiedades: propiedadesOfrecibles } = usePropiedadesOfrecibles();

  /*
    La lista del filtro por agente NO es la de vendedores.

    `useVendedores` contesta "a quién puedo asignarle esta marca", y solo
    trae cuentas de vendedor activas. Aquí la pregunta es otra: "por quién
    puedo filtrar", y la respuesta tiene que incluir a cualquiera que
    aparezca llevando marcas —un comercial, un admin, alguien que ya se
    desactivó—, porque si no, sus marcas no salen al filtrar por nadie.
    Cada persona viene con su total, que se pinta al lado del nombre.
  */
  const { agentes, sinAsignar: totalSinAsignar } = useAgentesDeMarcas({
    habilitado: usuario.permisos.asignaVendedores,
  });

  /* ---------------------------------------------------------------- */
  /* Ficha                                                            */
  /* ---------------------------------------------------------------- */

  const [laFichaEstaAbierta, establecerFichaAbierta] = useState(false);
  const [marcaEnEdicion, establecerMarcaEnEdicion] = useState<Marca | null>(null);

  function abrirFichaDe(marca: Marca) {
    establecerMarcaEnEdicion(marca);
    establecerFichaAbierta(true);
  }

  function abrirFichaNueva() {
    establecerMarcaEnEdicion(null);
    establecerFichaAbierta(true);
  }

  /* ---------------------------------------------------------------- */
  /* Abrir una marca desde fuera (?abrir=<id>)                        */
  /* ---------------------------------------------------------------- */

  /**
   * El calendario del panel enlaza aquí con `?abrir=<id>` al pulsar un
   * evento. La marca puede no estar en la página cargada —o quedar fuera
   * de los filtros activos—, así que se pide su ficha por separado en
   * vez de buscarla en el listado.
   */
  const idDeLaMarcaAAbrir = parametrosDeLaUrl.get("abrir");
  const fichaPedidaPorLaUrl = useFichaDeMarca(idDeLaMarcaAAbrir);

  useEffect(() => {
    if (fichaPedidaPorLaUrl.data === undefined) return;

    establecerMarcaEnEdicion(fichaPedidaPorLaUrl.data);
    establecerFichaAbierta(true);

    // El parámetro se quita de la dirección en cuanto cumple su función:
    // si se quedara, cerrar la ficha y recargar volvería a abrirla.
    const parametrosSinAbrir = new URLSearchParams(parametrosDeLaUrl);
    parametrosSinAbrir.delete("abrir");
    establecerParametrosDeLaUrl(parametrosSinAbrir, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichaPedidaPorLaUrl.data]);

  async function alternarLaFaseDeUnaMarca(
    marca: Marca,
    fase: "aproximacion" | "propuesta",
    completada: boolean,
  ) {
    try {
      await alternarFase.mutateAsync({ idDeLaMarca: marca.id, fase, completada });
    } catch (error) {
      avisarDeError(error, "No se pudo cambiar la fase");
    }
  }

  /* ---------------------------------------------------------------- */
  /* Interfaz                                                         */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Marcas
          </h2>
          <p className="mt-0.5 text-sm text-default-500">
            {listado.estaCargando
              ? "Cargando…"
              : `${formatearNumero(listado.total)} ${
                  listado.total === 1 ? "marca" : "marcas"
                }${hayFiltrosActivos ? " con los filtros aplicados" : ""}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            isIconOnly
            aria-label="Actualizar el listado"
            isLoading={listado.estaRefrescando}
            radius="lg"
            size="sm"
            variant="flat"
            onPress={() => void listado.recargar()}
          >
            {!listado.estaRefrescando && <RefreshCw className="size-4" />}
          </Button>

          <Button
            color="primary"
            radius="lg"
            size="sm"
            startContent={<Plus className="size-4" />}
            onPress={abrirFichaNueva}
          >
            Nueva marca
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bento-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-52 flex-1"
            isClearable
            placeholder="Buscar por marca, contacto o correo…"
            radius="lg"
            size="sm"
            startContent={<Search className="size-4 text-default-400" />}
            value={textoDelBuscador}
            variant="bordered"
            onClear={() => establecerTextoDelBuscador("")}
            onValueChange={establecerTextoDelBuscador}
          />

          <Select
            aria-label="Filtrar por avance"
            className="w-44"
            radius="lg"
            selectedKeys={[filtrosAplicados.etapa || ""]}
            size="sm"
            variant="bordered"
            onSelectionChange={(seleccion) =>
              cambiarFiltro("etapa", String(Array.from(seleccion)[0] ?? ""))
            }
          >
            {OPCIONES_DE_ETAPA.map((opcion) => (
              <SelectItem key={opcion.valor}>{opcion.etiqueta}</SelectItem>
            ))}
          </Select>

          <Select
            aria-label="Filtrar por zona"
            className="w-40"
            placeholder="Todas las zonas"
            radius="lg"
            selectedKeys={filtrosAplicados.zona ? [filtrosAplicados.zona] : []}
            size="sm"
            variant="bordered"
            onSelectionChange={(seleccion) =>
              cambiarFiltro("zona", String(Array.from(seleccion)[0] ?? ""))
            }
          >
            {[
              <SelectItem key="">Todas las zonas</SelectItem>,
              ...(catalogos?.zonas ?? []).map((zona) => (
                <SelectItem key={zona}>{zona}</SelectItem>
              )),
              <SelectItem key="sin_zona">Sin zona</SelectItem>,
            ]}
          </Select>

          <Select
            aria-label="Filtrar por sector"
            className="w-40"
            placeholder="Todos los sectores"
            radius="lg"
            selectedKeys={filtrosAplicados.sector ? [filtrosAplicados.sector] : []}
            size="sm"
            variant="bordered"
            onSelectionChange={(seleccion) =>
              cambiarFiltro("sector", String(Array.from(seleccion)[0] ?? ""))
            }
          >
            {[
              <SelectItem key="">Todos los sectores</SelectItem>,
              ...(catalogos?.sectores ?? []).map((sector) => (
                <SelectItem key={sector}>{sector}</SelectItem>
              )),
            ]}
          </Select>

          <Select
            aria-label="Filtrar por campaña"
            className="w-44"
            placeholder="Todas las campañas"
            radius="lg"
            selectedKeys={filtrosAplicados.campana ? [filtrosAplicados.campana] : []}
            size="sm"
            variant="bordered"
            onSelectionChange={(seleccion) =>
              cambiarFiltro("campana", String(Array.from(seleccion)[0] ?? ""))
            }
          >
            {[
              <SelectItem key="">Todas las campañas</SelectItem>,
              <SelectItem key="sin_campana">Sin campaña</SelectItem>,
              ...campanasActivas.map((campana) => (
                <SelectItem key={campana.id}>{campana.nombre}</SelectItem>
              )),
            ]}
          </Select>

          <Select
            aria-label="Filtrar por propiedad ofrecida"
            className="w-48"
            placeholder="Todas las propiedades"
            radius="lg"
            selectedKeys={
              filtrosAplicados.propiedad ? [filtrosAplicados.propiedad] : []
            }
            size="sm"
            variant="bordered"
            onSelectionChange={(seleccion) =>
              cambiarFiltro("propiedad", String(Array.from(seleccion)[0] ?? ""))
            }
          >
            {[
              <SelectItem key="">Todas las propiedades</SelectItem>,
              ...propiedadesOfrecibles.map((propiedad) => (
                <SelectItem key={propiedad.id}>{propiedad.nombre}</SelectItem>
              )),
            ]}
          </Select>

          <Select
            aria-label="Filtrar por inversión en marketing deportivo"
            className="w-44"
            placeholder="Invierte o no"
            radius="lg"
            selectedKeys={filtrosAplicados.invierte ? [filtrosAplicados.invierte] : []}
            size="sm"
            variant="bordered"
            onSelectionChange={(seleccion) =>
              cambiarFiltro("invierte", String(Array.from(seleccion)[0] ?? ""))
            }
          >
            {[
              <SelectItem key="">Invierte o no</SelectItem>,
              ...(catalogos?.opcionesDeInversion ?? []).map((opcion) => (
                <SelectItem key={opcion.valor}>{opcion.etiqueta}</SelectItem>
              )),
            ]}
          </Select>

          {usuario.permisos.asignaVendedores && (
            <Select
              aria-label="Filtrar por agente"
              className="w-44"
              placeholder="Todos los agentes"
              radius="lg"
              selectedKeys={
                filtrosAplicados.vendedor ? [filtrosAplicados.vendedor] : []
              }
              size="sm"
              variant="bordered"
              onSelectionChange={(seleccion) =>
                cambiarFiltro("vendedor", String(Array.from(seleccion)[0] ?? ""))
              }
            >
              {[
                <SelectItem key="">Todos los agentes</SelectItem>,
                <SelectItem key="sin_asignar" textValue="Sin asignar">
                  Sin asignar ({formatearNumero(totalSinAsignar)})
                </SelectItem>,
                ...agentes.map((agente) => (
                  <SelectItem key={agente.id} textValue={agente.nombre}>
                    {agente.nombre} ({formatearNumero(agente.totalMarcas)})
                  </SelectItem>
                )),
              ]}
            </Select>
          )}

          <Select
            aria-label="Ordenar"
            className="w-40"
            radius="lg"
            selectedKeys={[filtrosAplicados.orden ?? "recientes"]}
            size="sm"
            startContent={<SlidersHorizontal className="size-3.5 text-default-400" />}
            variant="bordered"
            onSelectionChange={(seleccion) =>
              cambiarFiltro("orden", String(Array.from(seleccion)[0] ?? "recientes"))
            }
          >
            {OPCIONES_DE_ORDEN.map((opcion) => (
              <SelectItem key={opcion.valor}>{opcion.etiqueta}</SelectItem>
            ))}
          </Select>

          {hayFiltrosActivos && (
            <Button
              radius="lg"
              size="sm"
              startContent={<X className="size-3.5" />}
              variant="light"
              onPress={limpiarTodosLosFiltros}
            >
              Limpiar
            </Button>
          )}
        </div>

        {/* Recordatorio visible de que la vista está filtrada. */}
        {hayFiltrosActivos && (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-default-100 pt-2">
            {filtrosAplicados.busqueda && (
              <Chip radius="lg" size="sm" variant="flat">
                «{filtrosAplicados.busqueda}»
              </Chip>
            )}
            {filtrosAplicados.fase && (
              <Chip
                color="primary"
                onClose={() => cambiarFiltro("fase", "")}
                radius="lg"
                size="sm"
                variant="flat"
              >
                {NOMBRE_DE_LA_FASE[filtrosAplicados.fase]}
              </Chip>
            )}
            {filtrosAplicados.zona && (
              <Chip radius="lg" size="sm" variant="flat">
                Zona: {filtrosAplicados.zona === "sin_zona" ? "sin zona" : filtrosAplicados.zona}
              </Chip>
            )}
            {filtrosAplicados.vendedor === "sin_asignar" && (
              <Chip color="warning" radius="lg" size="sm" variant="flat">
                Sin agente asignado
              </Chip>
            )}
            {filtrosAplicados.vendedor &&
              filtrosAplicados.vendedor !== "sin_asignar" && (
                <Chip
                  color="primary"
                  onClose={() => cambiarFiltro("vendedor", "")}
                  radius="lg"
                  size="sm"
                  variant="flat"
                >
                  Agente:{" "}
                  {agentes.find(
                    (agente) => agente.id === filtrosAplicados.vendedor,
                  )?.nombre ?? "el seleccionado"}
                </Chip>
              )}
            {filtrosAplicados.campana && (
              <Chip radius="lg" size="sm" variant="flat">
                Campaña:{" "}
                {filtrosAplicados.campana === "sin_campana"
                  ? "sin campaña"
                  : (campanasActivas.find(
                      (campana) => campana.id === filtrosAplicados.campana,
                    )?.nombre ?? "otra")}
              </Chip>
            )}
            {filtrosAplicados.propiedad && (
              <Chip color="primary" radius="lg" size="sm" variant="flat">
                Ofreciendo:{" "}
                {propiedadesOfrecibles.find(
                  (propiedad) => propiedad.id === filtrosAplicados.propiedad,
                )?.nombre ?? "una propiedad"}
              </Chip>
            )}
            {filtrosAplicados.invierte && (
              <Chip radius="lg" size="sm" variant="flat">
                {catalogos?.opcionesDeInversion.find(
                  (opcion) => opcion.valor === filtrosAplicados.invierte,
                )?.etiqueta ?? filtrosAplicados.invierte}
              </Chip>
            )}
          </div>
        )}
      </div>

      {/* Cuadrícula */}
      {listado.estaCargando ? (
        <BloqueDeCarga alto="min-h-72" mensaje="Cargando las marcas…" />
      ) : listado.error ? (
        <BloqueDeError
          mensaje={mensajeDeError(listado.error)}
          alReintentar={() => void listado.recargar()}
        />
      ) : listado.marcas.length === 0 ? (
        <div className="bento-card">
          <EstadoVacio
            accion={
              hayFiltrosActivos ? (
                <Button radius="lg" size="sm" variant="flat" onPress={limpiarTodosLosFiltros}>
                  Quitar los filtros
                </Button>
              ) : (
                <Button
                  color="primary"
                  radius="lg"
                  size="sm"
                  startContent={<Plus className="size-4" />}
                  onPress={abrirFichaNueva}
                >
                  Registrar la primera marca
                </Button>
              )
            }
            descripcion={
              hayFiltrosActivos
                ? "Prueba a quitar algún filtro o a buscar otra cosa."
                : "Empieza registrando las marcas que quieres trabajar."
            }
            icono={<Building2 className="size-5" />}
            titulo={
              hayFiltrosActivos
                ? "Ninguna marca coincide"
                : "Todavía no hay marcas"
            }
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {listado.marcas.map((marca) => (
              <TarjetaDeMarca
                key={marca.id}
                alAbrirFicha={abrirFichaDe}
                alAlternarFase={(marcaPulsada, fase, completada) =>
                  void alternarLaFaseDeUnaMarca(marcaPulsada, fase, completada)
                }
                marca={marca}
              />
            ))}
          </div>

          {/*
            El centinela del scroll infinito. Se queda montado siempre,
            también cuando ya no quedan páginas: si se desmontara, al
            cambiar un filtro y volver a haber más no habría nada que
            observar.

            El botón es la red de seguridad. El observador puede no
            dispararse —un navegador viejo, o la pestaña en segundo
            plano— y entonces la única forma de seguir sería recargar.
          */}
          <div ref={finalDeLaCuadricula} className="flex justify-center py-2">
            {listado.estaTrayendoMas ? (
              <span className="text-sm text-default-400">Cargando más marcas…</span>
            ) : listado.hayMasMarcas ? (
              <Button
                radius="lg"
                size="sm"
                variant="flat"
                onPress={() => void listado.pedirMasMarcas()}
              >
                Ver más marcas
              </Button>
            ) : (
              listado.marcas.length > 0 && (
                <span className="text-xs text-default-300">
                  No hay más marcas que mostrar
                </span>
              )
            )}
          </div>
        </>
      )}

      <ModalDeMarca
        alCerrar={() => establecerFichaAbierta(false)}
        estaAbierto={laFichaEstaAbierta}
        marcaEnEdicion={marcaEnEdicion}
      />
    </div>
  );
}
