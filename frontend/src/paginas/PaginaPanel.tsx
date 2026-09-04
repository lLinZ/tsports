/**
 * paginas/PaginaPanel.tsx
 * ---------------------------------------------------------------------
 * El resumen: lo primero que ve el equipo al entrar.
 *
 * SON DOS PANTALLAS, y el servidor decide cuál toca:
 *
 *   · `alcance: "empresa"`  → admin y comercial. El cuadro completo, con
 *     el que se reparte el trabajo. Es lo que se describe abajo.
 *   · `alcance: "personal"` → el agente. Su agenda y su cartera, sin una
 *     sola cifra de la agencia. Lo pinta `PanelDelAgente`.
 *
 * El corte lo hace el servidor, no este fichero: a un agente las cifras
 * de la agencia ni siquiera le llegan. Si solo se escondieran aquí,
 * seguirían viajando en la respuesta y se leerían desde el inspector.
 *
 * El panel de la empresa está montado como una rejilla bento de cajas de
 * distinto tamaño:
 *
 *   · Arriba, los cinco contadores grandes y, en su propia fila, los dos
 *     de los productos IOP: la meta del catálogo y lo que el equipo
 *     pronostica vender.
 *   · Después, el informe de propiedades (cuánto se pronostica de cada
 *     una) y el forecast de cada prospector.
 *   · Luego, la inversión en marketing deportivo por zona y el reparto
 *     por campaña.
 *   · A continuación, el avance por zona y la actividad reciente.
 *   · Abajo, el reparto por sector y la carga de cada vendedor.
 *
 * Todas las cifras vienen ya calculadas del servidor: el navegador no
 * descarga las marcas para poder enseñar un total.
 * ---------------------------------------------------------------------
 */
import { Button, Chip, Progress } from "@heroui/react";
import {
  Activity,
  Building2,
  CalendarClock,
  CheckCircle2,
  Handshake,
  MapPin,
  Megaphone,
  Package,
  PieChart,
  Search,
  Target,
  TrendingUp,
  UserRound,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { BarraDeProporcion } from "@/componentes/comunes/BarraDeProporcion";
import {
  BloqueDeCarga,
  BloqueDeError,
  EstadoVacio,
} from "@/componentes/comunes/EstadosDePantalla";
import { CalendarioDeCampanas } from "@/componentes/crm/CalendarioDeCampanas";
import { RejillaBento, TarjetaBento } from "@/componentes/comunes/TarjetaBento";
import { useResumenDelPanel } from "@/hooks/useMarcas";
import { useUsuarioAutenticado } from "@/providers/ProveedorSesion";
import { mensajeDeError } from "@/api/clienteHttp";
import {
  formatearDineroAbreviado,
  formatearNumero,
  formatearTiempoRelativo,
} from "@/utilidades/formato";
import type {
  MisNumerosDelPanel,
  ResumenDeInversionPorZona,
  ResumenDelAgente,
  ResumenDeZona,
  Usuario,
} from "@/tipos/modelos";

/** Color fijo de cada fase, el mismo en todos los gráficos del sistema. */
const COLOR_DE_FASE = {
  aproximacion: "#3b82f6",
  prospeccion: "#f59e0b",
  propuesta: "#16c79a",
} as const;

export function PaginaPanel() {
  const usuario = useUsuarioAutenticado();
  const consulta = useResumenDelPanel();

  if (consulta.isLoading) {
    return <BloqueDeCarga alto="min-h-96" mensaje="Cargando las cifras…" />;
  }

  if (consulta.error || !consulta.data) {
    return (
      <BloqueDeError
        mensaje={mensajeDeError(consulta.error)}
        alReintentar={() => void consulta.refetch()}
      />
    );
  }

  // El servidor manda una de dos respuestas y `alcance` dice cuál. El
  // agente no recibe ni una cifra de la agencia, así que no hay nada que
  // esconder aquí: simplemente se pinta otro panel.
  if (consulta.data.alcance === "personal") {
    return <PanelDelAgente resumen={consulta.data} usuario={usuario} />;
  }

  const {
    contadores,
    misNumeros,
    porZona,
    porSector,
    porVendedor,
    inversionPorZona,
    propiedades,
    forecastPorProspector,
    porCampana,
    actividadReciente,
  } = consulta.data;

  return (
    <div className="space-y-6">
      {/* Saludo y acceso directo al trabajo del día. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Hola, {usuario.nombre.split(" ")[0]}
          </h2>
          <p className="mt-0.5 text-sm text-default-500">
            Así va el pipeline de patrocinios ahora mismo.
          </p>
        </div>

        <Button
          as={Link}
          color="primary"
          radius="lg"
          size="sm"
          startContent={<Building2 className="size-4" />}
          to="/marcas"
          variant="flat"
        >
          Ir a las marcas
        </Button>
      </div>

      {/*
        Lo propio, antes que lo del equipo.

        Un comercial que además lleva marcas suyas quiere verlas antes
        que el total de la agencia. Se calla cuando no tiene ninguna, que
        es cuando serían cinco ceros ocupando la mejor parte de la
        pantalla.
      */}
      {misNumeros.totalMarcas > 0 && (
        <MisMarcasDeUnVistazo miId={usuario.id} numeros={misNumeros} />
      )}

      {/* --- Los cinco contadores --- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <TarjetaDeMetrica
          etiqueta="Marcas registradas"
          icono={<Building2 className="size-4" />}
          valor={formatearNumero(contadores.totalMarcas)}
        />
        <TarjetaDeMetrica
          color={COLOR_DE_FASE.aproximacion}
          etiqueta="En aproximación"
          icono={<Handshake className="size-4" />}
          valor={formatearNumero(contadores.enAproximacion)}
        />
        <TarjetaDeMetrica
          color={COLOR_DE_FASE.prospeccion}
          etiqueta="Prospección completa"
          icono={<Search className="size-4" />}
          valor={formatearNumero(contadores.enProspeccion)}
        />
        <TarjetaDeMetrica
          color={COLOR_DE_FASE.propuesta}
          etiqueta="Con propuesta"
          icono={<CheckCircle2 className="size-4" />}
          valor={formatearNumero(contadores.conPropuesta)}
        />
        <TarjetaDeMetrica
          destacada
          etiqueta="Valor propuesto / año"
          icono={<Wallet className="size-4" />}
          valor={formatearDineroAbreviado(contadores.valorPropuestoAnual)}
        />
      </div>

      {/* --- Los dos números de los productos IOP ---
          Van en su propia fila y no mezclados con los de arriba porque
          responden a otra pregunta: aquellos cuentan marcas y propuestas
          enviadas; estos, cuánto se espera vender de las propiedades. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TarjetaDeMetrica
          etiqueta="Meta de venta del catálogo"
          icono={<Target className="size-4" />}
          valor={formatearDineroAbreviado(contadores.forecastDePropiedades)}
        />
        <TarjetaDeMetrica
          color={COLOR_DE_FASE.propuesta}
          etiqueta="Pronosticado por el equipo (OVP)"
          icono={<TrendingUp className="size-4" />}
          valor={formatearDineroAbreviado(contadores.ovpPronosticado)}
        />
      </div>

      {/* Aviso de leads sin dueño: es trabajo que nadie está haciendo. */}
      {contadores.sinAsignar > 0 && (
        <Link
          className="flex items-center justify-between gap-3 rounded-2xl border border-warning-200 bg-warning-50 px-4 py-3 transition hover:border-warning-300 dark:bg-warning-100/10"
          to="/marcas?vendedor=sin_asignar"
        >
          <span className="text-sm text-warning-700 dark:text-warning-500">
            Hay <strong>{contadores.sinAsignar}</strong>{" "}
            {contadores.sinAsignar === 1 ? "marca" : "marcas"} sin agente
            asignado. Nadie las está trabajando.
          </span>

          <Chip color="warning" radius="lg" size="sm" variant="flat">
            Ver
          </Chip>
        </Link>
      )}

      {/* --- Rejilla bento --- */}
      <RejillaBento>
        {/* El calendario abre la rejilla: es lo que contesta "¿qué toca
            hacer esta semana?", que es la pregunta con la que el equipo
            entra al panel por la mañana. */}
        <CalendarioDeCampanas />

        {/* El informe de propiedades va después: es la vista nueva y
            la que responde "¿cuánto estamos pronosticando vender?". */}
        <TarjetaBento
          accionDeCabecera={
            <Button
              as={Link}
              radius="lg"
              size="sm"
              to="/propiedades"
              variant="flat"
            >
              Ver catálogo
            </Button>
          }
          columnas={8}
          descripcion="De cada propiedad: su valor total, la meta acordada y lo que el equipo pronostica venderle."
          icono={<Package className="size-4" />}
          titulo="Propiedades (productos IOP)"
        >
          {propiedades.length === 0 ? (
            <EstadoVacio
              descripcion="Se cargan en la pantalla de Propiedades, con su monto total y su meta."
              titulo="Todavía no hay propiedades"
            />
          ) : (
            <ul className="space-y-4">
              {propiedades.map((propiedad) => (
                <li key={propiedad.propiedadId}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <Link
                      className="min-w-0 truncate text-xs font-semibold text-foreground hover:text-primary hover:underline"
                      to={`/marcas?propiedad=${propiedad.propiedadId}`}
                    >
                      {propiedad.nombre}
                    </Link>

                    <span className="shrink-0 text-[11px] text-default-500">
                      {propiedad.totalMarcas}{" "}
                      {propiedad.totalMarcas === 1 ? "marca" : "marcas"} · meta{" "}
                      <strong className="text-foreground">
                        {formatearDineroAbreviado(propiedad.forecastDeVentaUsd)}
                      </strong>
                    </span>
                  </div>

                  <BarraDeProporcion
                    montoDeLaMeta={propiedad.forecastDeVentaUsd}
                    montoPronosticado={propiedad.ovpAcumuladoUsd}
                    montoTotal={propiedad.montoTotalUsd}
                  />
                </li>
              ))}
            </ul>
          )}
        </TarjetaBento>

        <TarjetaBento
          columnas={4}
          descripcion="Cuánto pronostica vender cada persona, sumando todas sus marcas."
          icono={<TrendingUp className="size-4" />}
          titulo="Forecast por prospector"
        >
          {forecastPorProspector.length === 0 ? (
            <EstadoVacio
              descripcion="Aparecerá en cuanto se anoten pronósticos en el checklist de una marca."
              titulo="Sin pronósticos todavía"
            />
          ) : (
            <ul className="space-y-2.5">
              {forecastPorProspector.map((fila) => (
                <li
                  key={fila.vendedorId ?? "sin_asignar"}
                  className="flex items-center justify-between gap-3 rounded-xl bg-default-50 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">
                      {fila.vendedorNombre}
                    </p>
                    <p className="text-[10px] text-default-400">
                      {fila.totalMarcas}{" "}
                      {fila.totalMarcas === 1 ? "marca" : "marcas"} ·{" "}
                      {fila.totalPropiedades}{" "}
                      {fila.totalPropiedades === 1 ? "propiedad" : "propiedades"}
                    </p>
                  </div>

                  <span className="shrink-0 text-xs font-bold text-primary">
                    {formatearDineroAbreviado(fila.ovpUsd)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TarjetaBento>

        {/* El informe de inversión en marketing deportivo por zona. */}
        <TarjetaBento
          columnas={6}
          descripcion="Cuántas empresas de cada zona ya invierten en marketing deportivo y cuántas no."
          icono={<Megaphone className="size-4" />}
          titulo="Inversión por zona"
        >
          <GraficoDeInversionPorZona zonas={inversionPorZona} />
        </TarjetaBento>

        <TarjetaBento
          columnas={6}
          descripcion="Cuántas marcas se están trabajando dentro de cada campaña."
          icono={<Activity className="size-4" />}
          titulo="Reparto por campaña"
        >
          {porCampana.length === 0 ? (
            <EstadoVacio
              descripcion="Las campañas se crean en su propia pantalla y se asignan desde la ficha de cada marca."
              titulo="Todavía no hay campañas"
            />
          ) : (
            <ul className="space-y-2.5">
              {porCampana.map((campana) => (
                <li
                  key={campana.campanaId ?? "sin_campana"}
                  className="flex items-center justify-between gap-3 rounded-xl bg-default-50 px-3 py-2.5"
                >
                  <Link
                    className="flex min-w-0 items-center gap-2"
                    to={`/marcas?campana=${campana.campanaId ?? "sin_campana"}`}
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: campana.color }}
                    />
                    <span className="truncate text-xs font-medium text-foreground">
                      {campana.nombre}
                    </span>

                    {!campana.estaVigente && campana.campanaId !== null && (
                      <span className="shrink-0 text-[10px] text-default-400">
                        (cerrada)
                      </span>
                    )}
                  </Link>

                  <div className="flex shrink-0 items-center gap-2">
                    <Chip radius="lg" size="sm" variant="flat">
                      {campana.total} {campana.total === 1 ? "marca" : "marcas"}
                    </Chip>

                    {campana.valor > 0 && (
                      <span className="text-[11px] font-semibold text-success">
                        {formatearDineroAbreviado(campana.valor)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TarjetaBento>

        <TarjetaBento
          columnas={8}
          descripcion="Cuántas marcas ha movido cada zona en cada fase del proceso."
          icono={<MapPin className="size-4" />}
          titulo="Avance por zona"
        >
          <GraficoDeZonas zonas={porZona} />
        </TarjetaBento>

        <TarjetaBento
          columnas={4}
          descripcion="Lo último que ha hecho el equipo."
          icono={<Activity className="size-4" />}
          titulo="Actividad reciente"
        >
          {actividadReciente.length === 0 ? (
            <EstadoVacio
              descripcion="Aquí aparecerá lo que vaya haciendo el equipo."
              titulo="Todavía no hay movimiento"
            />
          ) : (
            <ol className="space-y-3">
              {actividadReciente.slice(0, 8).map((registro) => (
                <li key={registro.id} className="flex gap-3">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />

                  <div className="min-w-0">
                    <p className="text-xs leading-relaxed text-foreground">
                      {registro.descripcion}
                    </p>
                    <p className="mt-0.5 text-[11px] text-default-400">
                      {registro.usuarioNombre} ·{" "}
                      {formatearTiempoRelativo(registro.creadoEn)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </TarjetaBento>

        <TarjetaBento
          columnas={6}
          descripcion="En qué rubros se está concentrando el esfuerzo."
          icono={<PieChart className="size-4" />}
          titulo="Marcas por sector"
        >
          {porSector.length === 0 ? (
            <EstadoVacio
              descripcion="Asigna un sector a las marcas para ver este reparto."
              titulo="Sin sectores asignados"
            />
          ) : (
            <ul className="space-y-3">
              {porSector.slice(0, 7).map((fila) => {
                const totalMayor = porSector[0].total || 1;

                return (
                  <li key={fila.sector}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-medium text-foreground">
                        {fila.sector}
                      </span>
                      <span className="shrink-0 text-[11px] text-default-500">
                        {fila.total} · {formatearDineroAbreviado(fila.valor)}
                      </span>
                    </div>

                    <Progress
                      aria-label={`Marcas en el sector ${fila.sector}`}
                      classNames={{ track: "h-1.5" }}
                      color="primary"
                      radius="full"
                      value={(fila.total / totalMayor) * 100}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </TarjetaBento>

        <TarjetaBento
          columnas={6}
          descripcion="Cuántas marcas lleva cada persona y cuánto tiene propuesto."
          icono={<UserRound className="size-4" />}
          titulo="Carga por agente"
        >
          {porVendedor.length === 0 ? (
            <EstadoVacio
              descripcion="Asigna agentes a las marcas desde su ficha."
              titulo="Nadie tiene marcas asignadas"
            />
          ) : (
            <ul className="space-y-2.5">
              {porVendedor.slice(0, 7).map((fila) => (
                <li
                  key={fila.vendedorId}
                  className="flex items-center justify-between gap-3 rounded-xl bg-default-50 px-3 py-2.5"
                >
                  <span className="min-w-0 truncate text-xs font-medium text-foreground">
                    {fila.vendedorNombre}
                  </span>

                  <div className="flex shrink-0 items-center gap-2">
                    <Chip radius="lg" size="sm" variant="flat">
                      {fila.total} {fila.total === 1 ? "marca" : "marcas"}
                    </Chip>

                    {fila.valor > 0 && (
                      <Chip
                        color="success"
                        radius="lg"
                        size="sm"
                        startContent={<TrendingUp className="ml-1 size-3" />}
                        variant="flat"
                      >
                        {formatearDineroAbreviado(fila.valor)}
                      </Chip>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TarjetaBento>
      </RejillaBento>
    </div>
  );
}

/* ==================================================================== */
/* El panel del agente                                                 */
/* ==================================================================== */

/**
 * El panel de quien solo ve lo suyo.
 *
 * No es el panel de la empresa con cajas escondidas: es otra pantalla,
 * porque contesta otra pregunta. La de arriba dice "cómo va la agencia";
 * esta dice "qué tengo yo y qué me toca hacer". Por eso el orden es
 * agenda primero y cifras después, al revés que en el panel de la
 * dirección.
 *
 * Las cifras de la agencia —el pipeline entero, el reparto por zona, lo
 * que pronostica cada compañero— no llegan siquiera al navegador: el
 * servidor devuelve otra respuesta (`alcance: "personal"`). Esconderlas
 * al pintar habría dejado el dato viajando en la red.
 */
function PanelDelAgente({
  resumen,
  usuario,
}: {
  resumen: ResumenDelAgente;
  usuario: Usuario;
}) {
  const { misNumeros, misPropiedades, misCampanas } = resumen;

  const noTieneNadaAsignado = misNumeros.totalMarcas === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Hola, {usuario.nombre.split(" ")[0]}
          </h2>
          <p className="mt-0.5 text-sm text-default-500">
            {noTieneNadaAsignado
              ? "Todavía no tienes marcas asignadas."
              : "Esto es lo que llevas y lo que tienes por delante."}
          </p>
        </div>

        <Button
          as={Link}
          color="primary"
          radius="lg"
          size="sm"
          startContent={<Building2 className="size-4" />}
          to={`/marcas?vendedor=${usuario.id}`}
          variant="flat"
        >
          Ver mis marcas
        </Button>
      </div>

      {/* Las seis cifras propias. Las mismas que ve un comercial de sí
          mismo, aquí en primer plano porque son TODO su panel. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <TarjetaDeMetrica
          etiqueta="Marcas asignadas"
          icono={<Building2 className="size-4" />}
          valor={formatearNumero(misNumeros.totalMarcas)}
        />
        <TarjetaDeMetrica
          color={COLOR_DE_FASE.aproximacion}
          etiqueta="En aproximación"
          icono={<Handshake className="size-4" />}
          valor={formatearNumero(misNumeros.enAproximacion)}
        />
        <TarjetaDeMetrica
          color={COLOR_DE_FASE.prospeccion}
          etiqueta="Prospección completa"
          icono={<Search className="size-4" />}
          valor={formatearNumero(misNumeros.enProspeccion)}
        />
        <TarjetaDeMetrica
          color={COLOR_DE_FASE.propuesta}
          etiqueta="Con propuesta"
          icono={<CheckCircle2 className="size-4" />}
          valor={formatearNumero(misNumeros.conPropuesta)}
        />
        <TarjetaDeMetrica
          etiqueta="Valor propuesto / año"
          icono={<Wallet className="size-4" />}
          valor={formatearDineroAbreviado(misNumeros.valorPropuestoAnual)}
        />
        <TarjetaDeMetrica
          destacada
          etiqueta="Mi pronóstico (OVP)"
          icono={<TrendingUp className="size-4" />}
          valor={formatearDineroAbreviado(misNumeros.miPronostico)}
        />
      </div>

      {/* El aviso de trabajo pendiente, con el mismo peso visual que en
          el panel de la dirección tienen los leads sin dueño. */}
      {misNumeros.accionesPorDelante > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
          <CalendarClock className="size-4 shrink-0 text-primary" />
          <span className="text-sm text-foreground">
            Tienes <strong>{misNumeros.accionesPorDelante}</strong>{" "}
            {misNumeros.accionesPorDelante === 1
              ? "acción de campaña"
              : "acciones de campaña"}{" "}
            de hoy en adelante.
          </span>
        </div>
      )}

      <RejillaBento>
        {/* La agenda abre el panel: para quien trabaja las marcas, "¿qué
            toca esta semana?" es la primera pregunta del día. El
            servidor ya la devuelve acotada a sus marcas. */}
        <CalendarioDeCampanas />

        <TarjetaBento
          columnas={6}
          descripcion="Lo que pronosticas vender de cada producto IOP, sumando tus marcas."
          icono={<Package className="size-4" />}
          titulo="Mis propiedades"
        >
          {misPropiedades.length === 0 ? (
            <EstadoVacio
              descripcion="Aparecerán cuando anotes un pronóstico en el checklist de alguna de tus marcas."
              titulo="Sin pronósticos todavía"
            />
          ) : (
            <ul className="space-y-2.5">
              {misPropiedades.map((propiedad) => (
                <li
                  key={propiedad.propiedadId}
                  className="flex items-center justify-between gap-3 rounded-xl bg-default-50 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <Link
                      className="block truncate text-xs font-medium text-foreground hover:text-primary hover:underline"
                      to={`/marcas?propiedad=${propiedad.propiedadId}&vendedor=${usuario.id}`}
                    >
                      {propiedad.nombre}
                    </Link>
                    <p className="text-[10px] text-default-400">
                      {propiedad.totalMarcas}{" "}
                      {propiedad.totalMarcas === 1 ? "marca mía" : "marcas mías"}
                    </p>
                  </div>

                  <span className="shrink-0 text-xs font-bold text-primary">
                    {formatearDineroAbreviado(propiedad.ovpUsd)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TarjetaBento>

        <TarjetaBento
          columnas={6}
          descripcion="Dentro de qué empujón comercial estás trabajando cada marca."
          icono={<Megaphone className="size-4" />}
          titulo="Mis campañas"
        >
          {misCampanas.length === 0 ? (
            <EstadoVacio
              descripcion="Se asigna una campaña desde la ficha de la marca, junto con el día de la acción."
              titulo="Ninguna marca tiene campaña"
            />
          ) : (
            <ul className="space-y-2.5">
              {misCampanas.map((campana) => (
                <li
                  key={campana.campanaId ?? "sin_campana"}
                  className="flex items-center justify-between gap-3 rounded-xl bg-default-50 px-3 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: campana.color }}
                    />
                    <span className="truncate text-xs font-medium text-foreground">
                      {campana.nombre}
                    </span>
                  </span>

                  <Chip radius="lg" size="sm" variant="flat">
                    {campana.total}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
        </TarjetaBento>
      </RejillaBento>
    </div>
  );
}

/* ==================================================================== */
/* Piezas                                                              */
/* ==================================================================== */

/**
 * Uno de los contadores de la fila superior.
 *
 * `destacada` la pinta con el color de acento del perfil: se reserva
 * para el importe, que es la cifra que todo el mundo busca primero.
 */
function TarjetaDeMetrica({
  etiqueta,
  valor,
  icono,
  color,
  destacada = false,
}: {
  etiqueta: string;
  valor: string;
  icono: React.ReactNode;
  color?: string;
  destacada?: boolean;
}) {
  return (
    <div
      className={[
        "bento-card flex flex-col gap-2 p-4",
        destacada ? "bg-primary text-primary-foreground border-primary" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span
          className={[
            "flex size-7 items-center justify-center rounded-xl",
            destacada ? "bg-white/20" : "bg-default-100",
          ].join(" ")}
          style={color && !destacada ? { color, backgroundColor: `${color}1a` } : undefined}
        >
          {icono}
        </span>
      </div>

      <div>
        <p className="text-2xl font-bold leading-none tracking-tight">{valor}</p>
        <p
          className={[
            "mt-1.5 text-[11px] leading-tight",
            destacada ? "text-primary-foreground/80" : "text-default-500",
          ].join(" ")}
        >
          {etiqueta}
        </p>
      </div>
    </div>
  );
}

/**
 * El informe de inversión en marketing deportivo, por zona.
 *
 * Cada fila es una barra apilada de tres tramos: las que ya invierten,
 * las que no y las que están sin averiguar. Se dibuja apilada y no en
 * tres barras sueltas porque aquí lo que interesa es la PROPORCIÓN
 * dentro de la zona, no comparar cifras absolutas entre zonas.
 *
 * El tramo gris (sin averiguar) es el aviso más útil del informe: una
 * zona mayormente gris no dice que no haya inversión, dice que todavía
 * no se ha preguntado.
 */
function GraficoDeInversionPorZona({
  zonas,
}: {
  zonas: ResumenDeInversionPorZona[];
}) {
  const zonasConMarcas = zonas.filter((zona) => zona.total > 0);

  if (zonasConMarcas.length === 0) {
    return (
      <EstadoVacio
        descripcion="Aparecerá en cuanto haya marcas registradas con su zona."
        titulo="Sin datos todavía"
      />
    );
  }

  const TRAMOS = [
    { clave: "siInvierte", etiqueta: "Sí invierte", color: "#16c79a" },
    { clave: "noInvierte", etiqueta: "No invierte", color: "#f0533f" },
    { clave: "sinDefinir", etiqueta: "Sin averiguar", color: "#cbd5e1" },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-4">
        {TRAMOS.map((tramo) => (
          <span
            key={tramo.clave}
            className="flex items-center gap-1.5 text-[11px] text-default-500"
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: tramo.color }}
            />
            {tramo.etiqueta}
          </span>
        ))}
      </div>

      <div className="space-y-4">
        {zonasConMarcas.map((zona) => (
          <div key={zona.zona}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">
                {zona.zona}
              </span>

              <span className="text-[11px] text-default-500">
                {zona.siInvierte} de {zona.total} ya invierten
              </span>
            </div>

            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-default-100">
              {TRAMOS.map((tramo) => {
                const cantidad = zona[tramo.clave];

                if (cantidad === 0) return null;

                return (
                  <Link
                    key={tramo.clave}
                    className="h-full transition-opacity hover:opacity-80"
                    style={{
                      width: `${(cantidad / zona.total) * 100}%`,
                      backgroundColor: tramo.color,
                    }}
                    title={`${tramo.etiqueta}: ${cantidad}`}
                    // Las marcas sin zona se filtran con el valor
                    // especial que entiende el servidor, no con el
                    // texto que se enseña en el gráfico.
                    to={`/marcas?zona=${encodeURIComponent(
                      zona.zona === "Sin zona" ? "sin_zona" : zona.zona,
                    )}&invierte=${
                      tramo.clave === "siInvierte"
                        ? "si"
                        : tramo.clave === "noInvierte"
                          ? "no"
                          : "desconocido"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * El gráfico de barras por zona.
 *
 * Se dibuja con divs y no con una librería de gráficos a propósito: son
 * tres barras por fila y una dependencia de 200 kB para esto no se
 * justifica. Las barras se escalan contra el valor más alto de todo el
 * gráfico, para que las zonas se puedan comparar entre sí de un vistazo.
 */
function GraficoDeZonas({ zonas }: { zonas: ResumenDeZona[] }) {
  const valorMaximo = Math.max(
    1,
    ...zonas.flatMap((zona) => [zona.aproximacion, zona.prospeccion, zona.propuesta]),
  );

  return (
    <div className="space-y-5">
      {/* Leyenda */}
      <div className="flex flex-wrap gap-4">
        {(
          [
            ["Aproximación", COLOR_DE_FASE.aproximacion],
            ["Prospección", COLOR_DE_FASE.prospeccion],
            ["Propuesta", COLOR_DE_FASE.propuesta],
          ] as const
        ).map(([nombreDeLaFase, colorDeLaFase]) => (
          <span
            key={nombreDeLaFase}
            className="flex items-center gap-1.5 text-[11px] text-default-500"
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: colorDeLaFase }}
            />
            {nombreDeLaFase}
          </span>
        ))}
      </div>

      <div className="space-y-4">
        {zonas.map((zona) => (
          <div key={zona.zona}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">
                {zona.zona}
              </span>

              <span className="text-[11px] text-default-500">
                {zona.total} {zona.total === 1 ? "marca" : "marcas"} ·{" "}
                <strong className="text-foreground">
                  {formatearDineroAbreviado(zona.valor)}
                </strong>
              </span>
            </div>

            <div className="space-y-1">
              {(
                [
                  [zona.aproximacion, COLOR_DE_FASE.aproximacion, "Aproximación"],
                  [zona.prospeccion, COLOR_DE_FASE.prospeccion, "Prospección"],
                  [zona.propuesta, COLOR_DE_FASE.propuesta, "Propuesta"],
                ] as const
              ).map(([cantidad, colorDeLaBarra, nombreDeLaFase]) => (
                <div key={nombreDeLaFase} className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-default-100">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        // Un mínimo del 4 % para que un valor de 1 se vea
                        // como una barra y no como una raya invisible.
                        width: cantidad
                          ? `${Math.max(4, (cantidad / valorMaximo) * 100)}%`
                          : "0%",
                        backgroundColor: colorDeLaBarra,
                      }}
                      title={`${nombreDeLaFase}: ${cantidad}`}
                    />
                  </div>

                  <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-default-500">
                    {cantidad}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * "Mis marcas": el resumen de quien está mirando, no el del equipo.
 *
 * Es la primera caja del panel para un vendedor, porque es la única que
 * habla de su trabajo. Enseña cinco cosas y ninguna es decorativa:
 * cuántas marcas lleva, en qué fases van, cuánto pronostica vender y
 * —la que convierte el panel en agenda— cuántas acciones de campaña
 * tiene por delante.
 *
 * El enlace de abajo lleva al tablero ya filtrado por sus marcas: sin
 * eso, "tengo doce" obliga a buscarlas a mano entre setenta y una.
 */
function MisMarcasDeUnVistazo({
  numeros,
  miId,
}: {
  numeros: MisNumerosDelPanel;
  /** El filtro del tablero espera el id del vendedor, no un alias. */
  miId: string;
}) {
  return (
    <section className="bento-card border-primary/30 bg-primary/5 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <UserRound className="size-4 text-primary" />
          Mis marcas
        </h3>

        <Button
          as={Link}
          className="font-semibold"
          color="primary"
          radius="full"
          size="sm"
          to={`/marcas?vendedor=${miId}`}
          variant="light"
        >
          Ver solo las mías
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <CifraPropia etiqueta="Asignadas" valor={formatearNumero(numeros.totalMarcas)} />
        <CifraPropia
          etiqueta="En prospección"
          valor={formatearNumero(numeros.enProspeccion)}
        />
        <CifraPropia
          etiqueta="Con propuesta"
          valor={formatearNumero(numeros.conPropuesta)}
        />
        <CifraPropia
          destacada
          etiqueta="Mi pronóstico"
          valor={formatearDineroAbreviado(numeros.miPronostico)}
        />
        <CifraPropia
          etiqueta="Acciones por delante"
          valor={formatearNumero(numeros.accionesPorDelante)}
        />
      </div>
    </section>
  );
}

function CifraPropia({
  etiqueta,
  valor,
  destacada = false,
}: {
  etiqueta: string;
  valor: string;
  destacada?: boolean;
}) {
  return (
    <div className="rounded-xl bg-content1 px-3 py-2.5">
      <p className="text-[11px] leading-tight text-default-500">{etiqueta}</p>
      <p
        className={[
          "mt-1 text-lg font-bold leading-none",
          destacada ? "text-primary" : "text-foreground",
        ].join(" ")}
      >
        {valor}
      </p>
    </div>
  );
}
