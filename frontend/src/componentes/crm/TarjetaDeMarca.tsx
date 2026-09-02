/**
 * componentes/crm/TarjetaDeMarca.tsx
 * ---------------------------------------------------------------------
 * Cada marca del tablero.
 *
 * Muestra de un vistazo lo que el equipo necesita saber sin abrir la
 * ficha: logo, nombre, sector, campaña, en qué fases va, qué propiedades
 * se le están ofreciendo y con qué pronóstico, cuánto vale la propuesta
 * y quién la lleva.
 *
 * Las tres fases son pulsables: se pueden marcar y desmarcar sin abrir
 * nada, que es el gesto más repetido del día. Con dos salvedades que
 * están puestas a propósito:
 *
 *   · La PROSPECCIÓN no se puede pulsar: la calcula el servidor a
 *     partir de los datos de la ficha. Al intentarlo se abre la ficha
 *     diciendo qué falta, que es lo único que puede resolverlo.
 *
 *   · La PROPUESTA sin descripción tampoco se marca desde aquí: hace
 *     falta escribir qué se le envió a la marca, y eso solo cabe en la
 *     ficha.
 * ---------------------------------------------------------------------
 */
import {
  Listbox,
  ListboxItem,
  ListboxSection,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from "@heroui/react";
import {
  Check,
  Globe,
  Lock,
  MessageSquare,
  Package,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { useAsignarVendedor } from "@/hooks/useMarcas";
import { useVendedores } from "@/hooks/useVendedores";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import { formatearDineroAbreviado, inicialesDe } from "@/utilidades/formato";
import type { Marca } from "@/tipos/modelos";

/**
 * Cuántas propiedades del checklist se nombran en la tarjeta. Más de dos
 * no caben en una línea, y el resto se resume con un "+3".
 */
const PROPIEDADES_QUE_CABEN_EN_LA_TARJETA = 2;

/** Las tres fases, con su color y su etiqueta. El orden es el del proceso. */
const FASES_DE_LA_MARCA = [
  { clave: "aproximacion", etiqueta: "Aproximación", color: "#3b82f6" },
  { clave: "prospeccion", etiqueta: "Prospección", color: "#f59e0b" },
  { clave: "propuesta", etiqueta: "Propuesta", color: "#16c79a" },
] as const;

interface PropiedadesDeTarjetaDeMarca {
  marca: Marca;
  /** Abre la ficha completa. */
  alAbrirFicha: (marca: Marca) => void;
  /** Marca o desmarca una fase sin abrir la ficha. */
  alAlternarFase: (
    marca: Marca,
    fase: "aproximacion" | "propuesta",
    completada: boolean,
  ) => void;
}

export function TarjetaDeMarca({
  marca,
  alAbrirFicha,
  alAlternarFase,
}: PropiedadesDeTarjetaDeMarca) {
  // El checklist solo llega en el listado y en la ficha; en cualquier
  // otra respuesta viene sin él, así que se normaliza a lista vacía.
  const propiedadesOfrecidas = marca.propiedadesOfrecidas ?? [];

  /** ¿Está completada esta fase? */
  function estaCompletada(clave: (typeof FASES_DE_LA_MARCA)[number]["clave"]): boolean {
    if (clave === "aproximacion") return marca.faseAproximacionCompletada;
    if (clave === "prospeccion") return marca.faseProspeccionCompletada;

    return marca.fasePropuestaCompletada;
  }

  /** Qué ocurre al pulsar el chip de una fase. */
  function alPulsarLaFase(
    evento: React.MouseEvent,
    clave: (typeof FASES_DE_LA_MARCA)[number]["clave"],
  ) {
    // Se detiene la propagación para que el clic no abra además la ficha.
    evento.stopPropagation();

    if (!marca.puedeEditarla) return;

    // La prospección se calcula sola: lo único útil es abrir la ficha
    // para que se puedan rellenar los datos que faltan.
    if (clave === "prospeccion") {
      alAbrirFicha(marca);

      return;
    }

    // Marcar la propuesta exige describirla, y eso solo cabe en la ficha.
    const faltaDescribirLaPropuesta =
      clave === "propuesta" &&
      !marca.fasePropuestaCompletada &&
      !marca.descripcionPropuesta;

    if (faltaDescribirLaPropuesta) {
      alAbrirFicha(marca);

      return;
    }

    alAlternarFase(marca, clave, !estaCompletada(clave));
  }

  return (
    <article
      className="bento-card bento-card-interactive group relative flex flex-col gap-3 p-4"
      role="button"
      tabIndex={0}
      onClick={() => alAbrirFicha(marca)}
      onKeyDown={(evento) => {
        if (evento.key === "Enter") alAbrirFicha(marca);
      }}
    >
      {/* Distintivos de la esquina: origen web y bloqueo por permisos. */}
      <div className="absolute right-3 top-3 flex gap-1">
        {marca.origen === "web" && (
          <Tooltip content="Llegó por el formulario de la web">
            <span className="flex size-6 items-center justify-center rounded-lg bg-primary-100 text-primary dark:bg-primary-100/20">
              <Globe className="size-3" />
            </span>
          </Tooltip>
        )}

        {!marca.puedeEditarla && (
          <Tooltip content="Solo puede editarla el vendedor asignado, un comercial o un administrador">
            <span className="flex size-6 items-center justify-center rounded-lg bg-default-100 text-default-400">
              <Lock className="size-3" />
            </span>
          </Tooltip>
        )}
      </div>

      {/* Logo y nombre */}
      <div className="flex items-start gap-3 pr-12">
        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-default-100">
          {marca.logoUrl ? (
            <img
              alt={marca.nombreMarca}
              className="size-full object-cover"
              src={marca.logoUrl}
            />
          ) : (
            <span className="text-sm font-bold text-default-400">
              {inicialesDe(marca.nombreMarca)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold leading-snug text-foreground">
            {marca.nombreMarca}
          </h3>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {marca.sector && (
              <span className="text-[11px] text-default-500">{marca.sector}</span>
            )}

            {marca.sector && marca.zona && (
              <span className="text-[11px] text-default-300">·</span>
            )}

            {marca.zona && (
              <span className="text-[11px] text-default-500">{marca.zona}</span>
            )}
          </div>

          {/* Campaña a la que pertenece. El punto de color es lo que
              permite distinguirlas de un vistazo en la cuadrícula. */}
          {marca.campanaNombre && (
            <span className="mt-1 flex items-center gap-1.5 text-[11px] text-default-500">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: marca.campanaColor ?? "#94a3b8" }}
              />
              <span className="truncate">{marca.campanaNombre}</span>
            </span>
          )}
        </div>
      </div>

      {/* Propiedades IOP que se le están ofreciendo. Se enseña el
          pronóstico acumulado y, debajo, las dos primeras propiedades:
          es lo que hace falta para saber por dónde va sin abrir nada. */}
      {propiedadesOfrecidas.length > 0 && (
        <div className="rounded-xl bg-default-50 px-2.5 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-default-400">
              <Package className="size-3" />
              Pronóstico
            </span>

            <span className="text-xs font-bold text-primary">
              {formatearDineroAbreviado(marca.ovpTotalUsd ?? 0)}
            </span>
          </div>

          <p className="mt-0.5 truncate text-[10px] text-default-500">
            {propiedadesOfrecidas
              .slice(0, PROPIEDADES_QUE_CABEN_EN_LA_TARJETA)
              .map((linea) => linea.propiedadNombre)
              .join(", ")}
            {propiedadesOfrecidas.length > PROPIEDADES_QUE_CABEN_EN_LA_TARJETA &&
              ` +${propiedadesOfrecidas.length - PROPIEDADES_QUE_CABEN_EN_LA_TARJETA}`}
          </p>
        </div>
      )}

      {/* Las tres fases */}
      <div className="flex flex-col gap-1">
        {FASES_DE_LA_MARCA.map((fase) => {
          const completada = estaCompletada(fase.clave);
          const esCalculadaPorElServidor = fase.clave === "prospeccion";

          return (
            <button
              key={fase.clave}
              className={[
                "flex items-center gap-2 rounded-xl px-2 py-1.5 text-left transition",
                marca.puedeEditarla
                  ? "hover:bg-default-100"
                  : "cursor-not-allowed opacity-70",
              ].join(" ")}
              disabled={!marca.puedeEditarla}
              type="button"
              onClick={(evento) => alPulsarLaFase(evento, fase.clave)}
            >
              <span
                className="flex size-4 shrink-0 items-center justify-center rounded-md transition"
                style={{
                  backgroundColor: completada ? fase.color : "transparent",
                  border: completada ? "none" : "1.5px solid hsl(var(--heroui-default-300))",
                }}
              >
                {completada && (
                  <Check className="size-2.5 text-white" strokeWidth={3.5} />
                )}
              </span>

              <span
                className={[
                  "text-[11px]",
                  completada ? "font-medium text-foreground" : "text-default-500",
                ].join(" ")}
              >
                {fase.etiqueta}
              </span>

              {/* Detalle contextual a la derecha de cada fase. */}
              {fase.clave === "aproximacion" && completada && marca.viaAproximacion && (
                <span className="ml-auto truncate text-[10px] text-default-400">
                  {marca.viaAproximacion}
                </span>
              )}

              {esCalculadaPorElServidor && !completada && (
                <span className="ml-auto truncate text-[10px] text-warning">
                  faltan {marca.datosQueFaltan.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Pie: valor y responsable */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-default-100 pt-3">
        <span
          className={[
            "text-xs font-semibold",
            marca.fasePropuestaCompletada && marca.valorAnualUsd > 0
              ? "text-success"
              : "text-default-300",
          ].join(" ")}
        >
          {marca.fasePropuestaCompletada && marca.valorAnualUsd > 0
            ? `${formatearDineroAbreviado(marca.valorAnualUsd)} /año`
            : "—"}
        </span>

        <div className="flex items-center gap-1.5">
          {(marca.totalComentarios ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-default-400">
              <MessageSquare className="size-3" />
              {marca.totalComentarios}
            </span>
          )}

          <AvatarDelVendedor marca={marca} />
        </div>
      </div>
    </article>
  );
}

/**
 * El avatar de quien lleva la marca, en el pie de la tarjeta.
 *
 * Antes era una etiqueta con el nombre. Se cambió a avatar porque en una
 * cuadrícula de sesenta tarjetas lo que se busca es "¿cuáles son mías?",
 * y eso se responde de un vistazo con una inicial y un color, no leyendo
 * sesenta nombres. El nombre completo sigue estando a un roce del ratón.
 *
 * Para admin y comercial es además el punto donde se reparte el trabajo:
 * se pulsa y se elige a quién pasársela, sin abrir la ficha. Para todos
 * los demás es solo información, y ni siquiera se comporta como botón.
 *
 * Quién puede repartir sale de `usuario.permisos.asignaVendedores`, la
 * bandera que ya viene resuelta del servidor; aquí no se compara ningún
 * rol.
 */
function AvatarDelVendedor({ marca }: { marca: Marca }) {
  const { vendedores, puedeRepartir } = useVendedores();
  const asignarVendedor = useAsignarVendedor();

  const [elSelectorEstaAbierto, establecerSelectorAbierto] = useState(false);

  const estaSinAsignar = marca.vendedorAsignadoId === null;
  const nombre = marca.vendedorAsignadoNombre;

  function repartir(idDelVendedor: string | null) {
    establecerSelectorAbierto(false);

    asignarVendedor.mutate(
      { idDeLaMarca: marca.id, idDelVendedor },
      {
        onSuccess: () =>
          avisarDeExito(
            idDelVendedor === null
              ? "Marca devuelta al montón"
              : "Marca asignada",
          ),
        onError: (error) => avisarDeError(error, "No se pudo asignar la marca"),
      },
    );
  }

  const circulo = (
    <span
      className={[
        "flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
        estaSinAsignar
          ? "border border-dashed border-warning-400 text-warning-500"
          : "bg-primary-100 text-primary-700",
        puedeRepartir ? "transition hover:scale-110" : "",
      ].join(" ")}
    >
      {estaSinAsignar ? <UserPlus className="size-3.5" /> : inicialesDe(nombre)}
    </span>
  );

  // Sin permiso para repartir, el avatar no es un botón: que parezca
  // pulsable algo que va a responder con un 403 solo genera desconcierto.
  if (!puedeRepartir) {
    return (
      <Tooltip content={nombre ?? "Sin asignar"} placement="top">
        {circulo}
      </Tooltip>
    );
  }

  return (
    <Popover
      isOpen={elSelectorEstaAbierto}
      placement="top-end"
      onOpenChange={establecerSelectorAbierto}
    >
      <PopoverTrigger>
        {/* El clic no puede llegar a la tarjeta, que abriría la ficha. */}
        <button
          aria-label={
            estaSinAsignar
              ? "Asignar esta marca a alguien"
              : `Asignada a ${nombre}. Pulsa para cambiarlo`
          }
          className="rounded-full"
          type="button"
          onClick={(evento) => evento.stopPropagation()}
        >
          <Tooltip content={nombre ?? "Sin asignar · pulsa para asignar"} placement="top">
            {circulo}
          </Tooltip>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-60 p-0">
        <div className="w-full px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-default-500">
            ¿Quién lleva esta marca?
          </p>
        </div>

        <Listbox
          aria-label="Elegir vendedor"
          className="max-h-64 overflow-y-auto"
          selectedKeys={marca.vendedorAsignadoId ? [marca.vendedorAsignadoId] : []}
          selectionMode="single"
          onAction={(clave) => repartir(String(clave) || null)}
        >
          <ListboxSection showDivider>
            {vendedores.map((vendedor) => (
              <ListboxItem
                key={vendedor.id}
                startContent={
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">
                    {inicialesDe(vendedor.nombre)}
                  </span>
                }
                textValue={vendedor.nombre}
              >
                <span className="truncate text-sm">{vendedor.nombre}</span>
              </ListboxItem>
            ))}
          </ListboxSection>

          {/* Quitar el dueño devuelve la marca al montón, de donde
              cualquiera puede adoptarla trabajándola (regla 5). */}
          <ListboxItem
            key=""
            className="text-warning"
            color="warning"
            startContent={<UserMinus className="size-4" />}
            textValue="Dejar sin asignar"
          >
            Dejar sin asignar
          </ListboxItem>
        </Listbox>
      </PopoverContent>
    </Popover>
  );
}
