/**
 * paginas/PaginaAvisos.tsx
 * ---------------------------------------------------------------------
 * «Avisos»: qué avisa el sistema, a quién, por dónde y si llegó. Solo
 * para el administrador (`configuraLosAvisos`), desde el 2026-11-05
 * (propuesta «Panel de avisos», aprobada por LinZ). Hasta entonces el
 * sistema mandaba seis avisos y nadie podía ver cuáles salían.
 *
 * Dos pestañas (en la dirección, ?vista=registro):
 *
 *   · QUÉ AVISOS HAY → arriba, si cada canal funciona (campanita,
 *     pantalla, móvil y el aviso de las 08:00). Debajo, cada aviso con
 *     cuándo salta, a quién le llega, por dónde, cuántos salieron en 30
 *     días y un interruptor. En el lead y el comentario se eligen los
 *     roles con casillas; lo que no se puede elegir sale con candado y
 *     dice por qué (un agente nunca recibe un lead sin dueño).
 *   · REGISTRO DE ENVÍOS → cada aviso que salió, a quién y qué pasó en
 *     cada canal: si llegó a la pantalla, si se entregó al móvil y a
 *     cuál, o por qué no. Con scroll infinito (regla 14).
 *
 * Qué se puede elegir, los resultados y las cifras llegan del servidor
 * (AvisosController); aquí solo se pinta.
 * ---------------------------------------------------------------------
 */
import {
  Checkbox,
  Chip,
  Select,
  SelectItem,
  Switch,
  Tab,
  Tabs,
} from "@heroui/react";
import {
  AlarmClock,
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  Lock,
  Radio,
  Smartphone,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { mensajeDeError } from "@/api/clienteHttp";
import {
  BloqueDeCarga,
  BloqueDeError,
  EstadoVacio,
} from "@/componentes/comunes/EstadosDePantalla";
import {
  useGuardarAjusteDeAviso,
  usePanelDeAvisos,
  useRegistroDeEnvios,
} from "@/hooks/useAvisos";
import { useScrollInfinito } from "@/hooks/useScrollInfinito";
import type {
  AvisoDelSistema,
  EntregaAlMovil,
  EntregaEnPantalla,
  EnvioDeAviso,
  FiltrosDelRegistroDeEnvios,
  PanelDeAvisos,
  TipoDeNotificacion,
} from "@/tipos/modelos";
import { avisarDeError } from "@/utilidades/avisos";
import { iconoDelAviso } from "@/utilidades/iconosDeAvisos";
import {
  formatearFechaYHora,
  formatearHora,
  formatearNumero,
  formatearPorcentaje,
  formatearTiempoRelativo,
  inicialesDe,
} from "@/utilidades/formato";

type Vista = "avisos" | "registro";

export function PaginaAvisos() {
  const [parametros, establecerParametros] = useSearchParams();
  const vista: Vista =
    parametros.get("vista") === "registro" ? "registro" : "avisos";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Avisos
          </h2>
          <p className="mt-0.5 text-sm text-default-500">
            Qué avisa el sistema, a quién y por dónde
          </p>
        </div>

        <Tabs
          aria-label="Qué ver de los avisos"
          radius="full"
          selectedKey={vista}
          size="sm"
          onSelectionChange={(clave) =>
            establecerParametros(
              clave === "registro" ? { vista: "registro" } : {},
            )
          }
        >
          <Tab key="avisos" title="Qué avisos hay" />
          <Tab key="registro" title="Registro de envíos" />
        </Tabs>
      </div>

      {vista === "avisos" ? <QueAvisosHay /> : <RegistroDeEnvios />}
    </div>
  );
}

/* ==================================================================== */
/* Qué avisos hay                                                      */
/* ==================================================================== */

function QueAvisosHay() {
  const { panel, estaCargando, error, recargar } = usePanelDeAvisos();

  if (estaCargando) {
    return <BloqueDeCarga alto="min-h-72" mensaje="Cargando los avisos…" />;
  }

  if (error || panel === undefined) {
    return (
      <BloqueDeError
        alReintentar={() => void recargar()}
        mensaje={mensajeDeError(error)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <CanalesDeAviso canales={panel.canales} />

      <div className="bento-card px-4 py-1 sm:px-5">
        <div className="hidden grid-cols-[minmax(0,1fr)_15rem_9rem_8rem_3rem] gap-4 border-b border-default-100 py-3 text-[10px] font-semibold uppercase tracking-wide text-default-400 lg:grid">
          <span className="pl-12">Aviso y cuándo salta</span>
          <span>A quién le llega</span>
          <span>Por dónde</span>
          <span>Últimos 30 días</span>
          <span />
        </div>

        {panel.avisos.map((aviso) => (
          <FilaDeAviso key={aviso.tipo} aviso={aviso} />
        ))}

        <p className="flex items-start gap-2 border-t border-default-100 py-3 text-xs text-default-500">
          <Smartphone className="mt-0.5 size-3.5 shrink-0" />
          Un aviso que ya se leyó en pantalla no hace sonar el teléfono, y un
          mensaje del chat tampoco si la persona tiene el panel a la vista. Cada
          persona puede quitarse el móvil o el sonido de cada aviso en sus
          ajustes.
        </p>
      </div>
    </div>
  );
}

function CanalesDeAviso({ canales }: { canales: PanelDeAvisos["canales"] }) {
  const { campanita, pantalla, movil, manana } = canales;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Canal
        detalle={`${formatearNumero(campanita.guardados30Dias)} avisos guardados en 30 días`}
        estado={{ bien: true, texto: "Funciona" }}
        icono={Bell}
        titulo="Campanita"
      />
      <Canal
        detalle={
          pantalla.activo
            ? `${formatearNumero(pantalla.conectadosAhora)} ${pantalla.conectadosAhora === 1 ? "persona" : "personas"} con el panel a la vista ahora`
            : "Los avisos se ven al entrar o en la consulta de cada minuto"
        }
        estado={
          pantalla.activo
            ? { bien: true, texto: "Conectado" }
            : { bien: false, texto: "Apagado" }
        }
        icono={Radio}
        titulo="En pantalla, al momento"
      />
      <Canal
        detalle={
          movil.activo
            ? `${formatearNumero(movil.dispositivos)} dispositivos de ${formatearNumero(movil.personas)} personas${
                movil.ultimoEnvioEn === null
                  ? ""
                  : ` · último envío ${formatearTiempoRelativo(movil.ultimoEnvioEn)}`
              }`
            : "El servidor no tiene las claves de los avisos al móvil"
        }
        estado={
          !movil.activo
            ? { bien: false, texto: "Apagado" }
            : movil.personasSinMovil > 0
              ? { bien: false, texto: `${movil.personasSinMovil} sin activar` }
              : { bien: true, texto: "Funciona" }
        }
        icono={Smartphone}
        titulo="Al móvil"
      />
      <Canal
        detalle={
          manana.ultimaVezEn === null
            ? "Todavía no ha salido ninguno"
            : `${formatearFechaYHora(manana.ultimaVezEn)}, a ${manana.personas} ${manana.personas === 1 ? "persona" : "personas"}`
        }
        estado={
          manana.ultimaVezEn === null
            ? { bien: false, texto: "Sin salir" }
            : { bien: true, texto: "Salió" }
        }
        icono={AlarmClock}
        titulo="Aviso de las 08:00"
      />
    </div>
  );
}

function Canal({
  titulo,
  detalle,
  icono: Icono,
  estado,
}: {
  titulo: string;
  detalle: string;
  icono: LucideIcon;
  estado: { bien: boolean; texto: string };
}) {
  return (
    <div className="bento-card p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-default-100 text-default-500">
          <Icono className="size-4" />
        </span>
        <Chip
          color={estado.bien ? "success" : "warning"}
          radius="full"
          size="sm"
          startContent={
            estado.bien ? (
              <Check className="ml-1 size-3" />
            ) : (
              <AlertTriangle className="ml-1 size-3" />
            )
          }
          variant="flat"
        >
          {estado.texto}
        </Chip>
      </div>
      <p className="text-sm font-semibold text-foreground">{titulo}</p>
      <p className="mt-0.5 text-xs text-default-500">{detalle}</p>
    </div>
  );
}

function FilaDeAviso({ aviso }: { aviso: AvisoDelSistema }) {
  const guardar = useGuardarAjusteDeAviso();
  const Icono = iconoDelAviso(aviso.tipo);

  async function cambiar(cambios: {
    activo: boolean;
    destinatarios?: Record<string, boolean>;
  }) {
    try {
      await guardar.mutateAsync({ tipo: aviso.tipo, cambios });
    } catch (errorAlGuardar) {
      avisarDeError(errorAlGuardar, "No se pudo guardar el aviso");
    }
  }

  const canales: {
    clave: keyof AvisoDelSistema["canales"];
    icono: LucideIcon;
    nombre: string;
  }[] = [
    { clave: "campanita", icono: Bell, nombre: "Campanita" },
    { clave: "pantalla", icono: Radio, nombre: "En pantalla" },
    { clave: "movil", icono: Smartphone, nombre: "Al móvil" },
    { clave: "sonido", icono: Volume2, nombre: "Con sonido" },
  ];

  return (
    <div
      className={[
        "grid grid-cols-1 items-center gap-3 border-b border-default-100 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_15rem_9rem_8rem_3rem] lg:gap-4",
        aviso.activo ? "" : "opacity-60",
      ].join(" ")}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
          <Icono className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {aviso.nombre}
            {!aviso.activo && (
              <span className="ml-2 text-xs font-normal text-warning-600">
                · apagado
              </span>
            )}
          </p>
          <p className="text-xs text-default-500">{aviso.cuandoSalta}</p>
          {aviso.cambiadoPor !== null && aviso.cambiadoEn !== null && (
            <p className="mt-0.5 text-[11px] text-default-400">
              Lo cambió {aviso.cambiadoPor}{" "}
              {formatearTiempoRelativo(aviso.cambiadoEn)}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-xs">
        {aviso.aQuienVa !== null ? (
          <Chip radius="full" size="sm" variant="flat">
            {aviso.aQuienVa}
          </Chip>
        ) : (
          <>
            {aviso.destinatarios.map((destinatario) => (
              <Checkbox
                key={destinatario.clave}
                isDisabled={!aviso.activo || guardar.isPending}
                isSelected={destinatario.llega}
                radius="md"
                size="sm"
                onValueChange={(llega) =>
                  void cambiar({
                    activo: aviso.activo,
                    destinatarios: { [destinatario.clave]: llega },
                  })
                }
              >
                <span className="text-xs text-foreground">
                  {destinatario.etiqueta}
                </span>
              </Checkbox>
            ))}
            {aviso.bloqueados.map((bloqueado) => (
              <span
                key={bloqueado.etiqueta}
                className="flex items-center gap-2 text-default-400"
              >
                <span className="flex size-5 items-center justify-center rounded-md bg-default-100">
                  <Lock className="size-3" />
                </span>
                {bloqueado.etiqueta} · {bloqueado.motivo}
              </span>
            ))}
          </>
        )}
      </div>

      <div className="flex gap-1.5">
        {canales.map(({ clave, icono: IconoDelCanal, nombre }) => (
          <span
            key={clave}
            className={[
              "flex size-8 items-center justify-center rounded-lg",
              aviso.canales[clave]
                ? "bg-primary-50 text-primary"
                : "bg-default-50 text-default-200",
            ].join(" ")}
            title={aviso.canales[clave] ? nombre : `${nombre}: no`}
          >
            <IconoDelCanal className="size-4" />
          </span>
        ))}
      </div>

      <div className="text-xs">
        <p className="font-semibold text-foreground">
          {formatearNumero(aviso.ultimos30Dias.cantidad)}{" "}
          {aviso.tipo === "mensaje_de_chat"
            ? aviso.ultimos30Dias.cantidad === 1
              ? "mensaje"
              : "mensajes"
            : aviso.ultimos30Dias.cantidad === 1
              ? "aviso"
              : "avisos"}
        </p>
        <p className="text-default-500">
          {aviso.ultimos30Dias.ultimoEn === null
            ? "Ninguno"
            : `Último ${formatearTiempoRelativo(aviso.ultimos30Dias.ultimoEn)}`}
        </p>
      </div>

      <Switch
        aria-label={`${aviso.activo ? "Apagar" : "Encender"} el aviso ${aviso.nombre}`}
        isDisabled={guardar.isPending}
        isSelected={aviso.activo}
        size="sm"
        onValueChange={(activo) => void cambiar({ activo })}
      />
    </div>
  );
}

/* ==================================================================== */
/* Registro de envíos                                                  */
/* ==================================================================== */

const TIPOS_DEL_REGISTRO: { clave: TipoDeNotificacion; nombre: string }[] = [
  { clave: "lead_nuevo", nombre: "Nuevo lead desde la web" },
  { clave: "marca_asignada", nombre: "Te asignaron una marca" },
  { clave: "mencion_en_bitacora", nombre: "Te etiquetaron en la bitácora" },
  { clave: "comentario_en_bitacora", nombre: "Comentario en la bitácora" },
  { clave: "recordatorios_del_dia", nombre: "Recordatorios del día" },
];

const TODOS = "todos";

function RegistroDeEnvios() {
  const [filtros, establecerFiltros] = useState<FiltrosDelRegistroDeEnvios>({
    persona: null,
    tipo: null,
    dias: 7,
    resultado: "todos",
  });
  const registro = useRegistroDeEnvios(filtros);

  const finalDeLaLista = useScrollInfinito({
    hayMas: registro.hayMas,
    estaCargando: registro.estaPidiendoMas,
    pedirMas: registro.pedirMas,
  });

  const { resumen } = registro;

  return (
    <div className="space-y-4">
      {resumen !== undefined && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Cifra
            etiqueta={`Avisos en ${resumen.dias} días`}
            icono={Bell}
            valor={formatearNumero(resumen.total)}
          />
          <Cifra
            etiqueta="Leídos o entregados"
            icono={Check}
            tono="bien"
            valor={
              resumen.porcentajeLeidosOEntregados === null
                ? "—"
                : formatearPorcentaje(resumen.porcentajeLeidosOEntregados)
            }
          />
          <Cifra
            etiqueta="Fallaron al móvil"
            icono={AlertTriangle}
            tono={resumen.fallaronAlMovil > 0 ? "mal" : undefined}
            valor={formatearNumero(resumen.fallaronAlMovil)}
          />
          <Cifra
            etiqueta="Personas sin el móvil activado"
            icono={Smartphone}
            tono={resumen.personasSinMovil > 0 ? "ojo" : undefined}
            valor={formatearNumero(resumen.personasSinMovil)}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Persona"
          className="w-52"
          radius="lg"
          selectedKeys={[filtros.persona ?? TODOS]}
          size="sm"
          onChange={(evento) =>
            establecerFiltros((antes) => ({
              ...antes,
              persona:
                evento.target.value === TODOS || evento.target.value === ""
                  ? null
                  : evento.target.value,
            }))
          }
        >
          {[
            <SelectItem key={TODOS}>Todas las personas</SelectItem>,
            ...registro.personas.map((persona) => (
              <SelectItem key={persona.id}>{persona.nombre}</SelectItem>
            )),
          ]}
        </Select>

        <Select
          aria-label="Aviso"
          className="w-56"
          radius="lg"
          selectedKeys={[filtros.tipo ?? TODOS]}
          size="sm"
          onChange={(evento) =>
            establecerFiltros((antes) => ({
              ...antes,
              tipo:
                evento.target.value === TODOS || evento.target.value === ""
                  ? null
                  : (evento.target.value as TipoDeNotificacion),
            }))
          }
        >
          {[
            <SelectItem key={TODOS}>Todos los avisos</SelectItem>,
            ...TIPOS_DEL_REGISTRO.map((tipo) => (
              <SelectItem key={tipo.clave}>{tipo.nombre}</SelectItem>
            )),
          ]}
        </Select>

        <Select
          aria-label="Días"
          className="w-40"
          radius="lg"
          selectedKeys={[String(filtros.dias)]}
          size="sm"
          onChange={(evento) => {
            if (evento.target.value === "") return;
            establecerFiltros((antes) => ({
              ...antes,
              dias: Number(evento.target.value) as 7 | 30 | 90,
            }));
          }}
        >
          <SelectItem key="7">Últimos 7 días</SelectItem>
          <SelectItem key="30">Últimos 30 días</SelectItem>
          <SelectItem key="90">Últimos 90 días</SelectItem>
        </Select>

        <Select
          aria-label="Resultado"
          className="w-52"
          radius="lg"
          selectedKeys={[filtros.resultado]}
          size="sm"
          onChange={(evento) => {
            if (evento.target.value === "") return;
            establecerFiltros((antes) => ({
              ...antes,
              resultado: evento.target.value as "todos" | "sin_llegar",
            }));
          }}
        >
          <SelectItem key="todos">Todos los resultados</SelectItem>
          <SelectItem key="sin_llegar">Solo los que no llegaron</SelectItem>
        </Select>
      </div>

      <div className="bento-card overflow-x-auto px-4 py-1 sm:px-5">
        {registro.estaCargando ? (
          <BloqueDeCarga alto="min-h-48" mensaje="Cargando el registro…" />
        ) : registro.error ? (
          <BloqueDeError
            alReintentar={() => void registro.recargar()}
            mensaje={mensajeDeError(registro.error)}
          />
        ) : registro.envios.length === 0 ? (
          <EstadoVacio
            descripcion="Con estos filtros no salió ningún aviso."
            icono={<BellOff className="size-5" />}
            titulo="Nada que enseñar"
          />
        ) : (
          <div className="min-w-[56rem]">
            <div className="grid grid-cols-[6rem_minmax(0,1fr)_9.5rem_5.5rem_6.5rem_12.5rem_4.5rem] gap-4 border-b border-default-100 py-3 text-[10px] font-semibold uppercase tracking-wide text-default-400">
              <span>Cuándo</span>
              <span>Aviso</span>
              <span>Para</span>
              <span>Campanita</span>
              <span>Pantalla</span>
              <span>Móvil</span>
              <span>Lo vio</span>
            </div>
            {registro.envios.map((envio) => (
              <FilaDeEnvio key={envio.id} envio={envio} />
            ))}
          </div>
        )}

        <div ref={finalDeLaLista} />
        {registro.estaPidiendoMas && <BloqueDeCarga alto="min-h-16" />}
      </div>
    </div>
  );
}

function FilaDeEnvio({ envio }: { envio: EnvioDeAviso }) {
  const movil = comoSeDiceElMovil(envio.alMovil, envio.alMovilDetalle);
  const pantalla = comoSeDiceLaPantalla(envio.enPantalla);

  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)_9.5rem_5.5rem_6.5rem_12.5rem_4.5rem] items-center gap-4 border-b border-default-100 py-3 text-xs last:border-b-0">
      <span className="text-default-500">
        {envio.creadaEn === null ? "—" : formatearFechaYHora(envio.creadaEn)}
      </span>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {envio.titulo}
        </p>
        {envio.cuerpo !== null && (
          <p className="truncate text-default-500">{envio.cuerpo}</p>
        )}
      </div>

      <span className="flex min-w-0 items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary">
          {inicialesDe(envio.destinatario?.nombre)}
        </span>
        <span className="truncate text-foreground">
          {envio.destinatario?.nombre ?? "Cuenta borrada"}
        </span>
      </span>

      <span className="inline-flex items-center gap-1 font-semibold text-success-600">
        <Check className="size-3.5" />
        Guardado
      </span>

      <span className={pantalla.clase}>{pantalla.texto}</span>

      <span>
        <Chip
          className="max-w-full"
          color={movil.color}
          radius="full"
          size="sm"
          variant="flat"
        >
          <span className="truncate" title={movil.texto}>
            {movil.texto}
          </span>
        </Chip>
      </span>

      <span
        className={
          envio.leidaEn === null
            ? "font-semibold text-danger"
            : "text-default-500"
        }
      >
        {envio.leidaEn === null ? "Sin leer" : formatearHora(envio.leidaEn)}
      </span>
    </div>
  );
}

function comoSeDiceLaPantalla(entrega: EntregaEnPantalla | null): {
  texto: string;
  clase: string;
} {
  switch (entrega) {
    case "al_momento":
      return { texto: "Al momento", clase: "font-semibold text-success-600" };
    case "panel_cerrado":
      return { texto: "Panel cerrado", clase: "text-default-500" };
    case "sin_tiempo_real":
      return { texto: "Sin tiempo real", clase: "text-default-500" };
    case "fallo":
      return { texto: "Falló", clase: "font-semibold text-danger" };
    default:
      return { texto: "—", clase: "text-default-300" };
  }
}

function comoSeDiceElMovil(
  entrega: EntregaAlMovil | null,
  detalle: string | null,
): { texto: string; color: "success" | "warning" | "danger" | "default" } {
  switch (entrega) {
    case "entregado":
      return {
        texto: detalle ? `Entregado · ${detalle}` : "Entregado",
        color: "success",
      };
    case "ya_leido":
      return { texto: "No hizo falta: ya lo había leído", color: "default" };
    case "sin_dispositivo":
      return { texto: "No tiene el móvil activado", color: "warning" };
    case "apagado_por_la_persona":
      return { texto: "Lo quitó del móvil en sus ajustes", color: "default" };
    case "silencio":
      return { texto: "En su horario de silencio", color: "default" };
    case "sin_push":
      return {
        texto: "El móvil está apagado en el servidor",
        color: "default",
      };
    case "fallo":
      return {
        texto: detalle ? `Falló: ${detalle}` : "Falló",
        color: "danger",
      };
    case "en_cola":
      return { texto: "En cola", color: "default" };
    default:
      // Avisos de antes del 2026-11-05: entonces no se apuntaba.
      return { texto: "Antes del registro", color: "default" };
  }
}

function Cifra({
  etiqueta,
  valor,
  icono: Icono,
  tono,
}: {
  etiqueta: string;
  valor: string;
  icono: LucideIcon;
  tono?: "bien" | "mal" | "ojo";
}) {
  const colores =
    tono === "bien"
      ? "bg-success-50 text-success-600"
      : tono === "mal"
        ? "bg-danger-50 text-danger"
        : tono === "ojo"
          ? "bg-warning-50 text-warning-600"
          : "bg-default-100 text-default-500";

  return (
    <div className="bento-card flex items-center gap-3 p-4">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${colores}`}
      >
        <Icono className="size-4" />
      </span>
      <div className="min-w-0">
        <p
          className={[
            "text-lg font-bold leading-none tracking-tight",
            tono === "mal" ? "text-danger" : "text-foreground",
          ].join(" ")}
        >
          {valor}
        </p>
        <p className="mt-1 truncate text-[11px] text-default-500">{etiqueta}</p>
      </div>
    </div>
  );
}
