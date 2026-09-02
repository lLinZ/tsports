/**
 * componentes/comunes/ControlesDeApariencia.tsx
 * ---------------------------------------------------------------------
 * Los dos controles con los que cada persona personaliza su interfaz:
 * el tema (claro / oscuro / automático) y el color de acento del perfil.
 *
 * Los dos escriben en el proveedor de tema, que se encarga de guardar la
 * preferencia en el servidor y en el navegador. Aquí solo está la parte
 * visual.
 * ---------------------------------------------------------------------
 */
import {
  Button,
  Tooltip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from "@heroui/react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTema } from "@/providers/ProveedorTema";
import type { ColorDeAcento, PreferenciaDeTema } from "@/tipos/modelos";

/* ==================================================================== */
/* Tema                                                                */
/* ==================================================================== */

/**
 * Botón de un solo toque para pasar de claro a oscuro y al revés.
 *
 * Es el control que va en la barra superior: el 95 % de las veces lo que
 * se quiere es exactamente esto, y el modo automático se elige una vez y
 * no se vuelve a tocar (para eso está <SelectorDeTema>).
 */
export function BotonDeTema() {
  const { estaEnModoOscuro, alternarTema } = useTema();

  const textoDeLaAyuda = estaEnModoOscuro
    ? "Cambiar a tema claro"
    : "Cambiar a tema oscuro";

  return (
    <Tooltip content={textoDeLaAyuda} placement="bottom">
      <Button
        isIconOnly
        aria-label={textoDeLaAyuda}
        radius="full"
        size="sm"
        variant="light"
        onPress={alternarTema}
      >
        {estaEnModoOscuro ? (
          <Sun className="size-4" />
        ) : (
          <Moon className="size-4" />
        )}
      </Button>
    </Tooltip>
  );
}

/** Las tres opciones de tema, con su icono y su explicación. */
const OPCIONES_DE_TEMA: Array<{
  valor: PreferenciaDeTema;
  etiqueta: string;
  descripcion: string;
  icono: typeof Sun;
}> = [
  {
    valor: "claro",
    etiqueta: "Claro",
    descripcion: "Siempre en claro",
    icono: Sun,
  },
  {
    valor: "oscuro",
    etiqueta: "Oscuro",
    descripcion: "Siempre en oscuro",
    icono: Moon,
  },
  {
    valor: "sistema",
    etiqueta: "Automático",
    descripcion: "Sigue a tu sistema operativo",
    icono: Monitor,
  },
];

/**
 * Selector completo de las tres opciones. Va en la página de perfil,
 * donde sí interesa poder elegir el modo automático.
 */
export function SelectorDeTema() {
  const { preferenciaDeTema, cambiarPreferenciaDeTema } = useTema();

  return (
    <div className="grid grid-cols-3 gap-2">
      {OPCIONES_DE_TEMA.map((opcion) => {
        const estaElegida = preferenciaDeTema === opcion.valor;
        const IconoDeLaOpcion = opcion.icono;

        return (
          <button
            key={opcion.valor}
            aria-pressed={estaElegida}
            className={[
              "flex flex-col items-center gap-2 rounded-2xl border p-4 transition",
              estaElegida
                ? "border-primary bg-primary-50 text-primary shadow-sm dark:bg-primary-100/10"
                : "border-default-200 text-default-600 hover:border-default-300 hover:bg-default-100",
            ].join(" ")}
            type="button"
            onClick={() => cambiarPreferenciaDeTema(opcion.valor)}
          >
            <IconoDeLaOpcion className="size-5" />
            <span className="text-xs font-semibold">{opcion.etiqueta}</span>
            <span className="text-center text-[11px] leading-tight text-default-500">
              {opcion.descripcion}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ==================================================================== */
/* Color de acento                                                     */
/* ==================================================================== */

/**
 * Paleta de reserva, por si los catálogos del servidor aún no llegaron.
 * Coincide con CatalogosDelCrm::COLORES_DE_ACENTO del backend.
 */
const COLORES_DE_RESERVA: ColorDeAcento[] = [
  { nombre: "Turquesa", hex: "#1b9aaa" },
  { nombre: "Océano", hex: "#2563eb" },
  { nombre: "Violeta", hex: "#7c3aed" },
  { nombre: "Magenta", hex: "#db2777" },
  { nombre: "Coral", hex: "#f0533f" },
  { nombre: "Ámbar", hex: "#f59e0b" },
  { nombre: "Esmeralda", hex: "#16c79a" },
  { nombre: "Grafito", hex: "#475569" },
];

/**
 * Rejilla de muestras de color para elegir el acento del perfil.
 *
 * El cambio se ve al instante en TODA la interfaz porque el proveedor de
 * tema reescribe las variables CSS de HeroUI: no hace falta recargar ni
 * volver a renderizar nada.
 */
export function SelectorDeColorAcento({
  coloresDisponibles,
}: {
  coloresDisponibles?: ColorDeAcento[];
}) {
  const { colorAcento, cambiarColorAcento } = useTema();

  const paleta =
    coloresDisponibles && coloresDisponibles.length > 0
      ? coloresDisponibles
      : COLORES_DE_RESERVA;

  return (
    <div className="flex flex-wrap gap-3">
      {paleta.map((color) => {
        const estaElegido = colorAcento.toLowerCase() === color.hex.toLowerCase();

        return (
          <Tooltip key={color.hex} content={color.nombre} placement="bottom">
            <button
              aria-label={`Usar el color ${color.nombre}`}
              aria-pressed={estaElegido}
              className={[
                "relative flex size-10 items-center justify-center rounded-full transition",
                "ring-offset-2 ring-offset-content1",
                estaElegido
                  ? "ring-2 ring-foreground scale-105"
                  : "ring-1 ring-default-200 hover:scale-105",
              ].join(" ")}
              style={{ backgroundColor: color.hex }}
              type="button"
              onClick={() => cambiarColorAcento(color.hex)}
            >
              {estaElegido && (
                <Check className="size-4 text-white drop-shadow" strokeWidth={3} />
              )}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * Versión compacta del selector de color, para el menú de la barra
 * superior: una fila de puntos sin etiquetas.
 */
export function MenuDeColorAcento({
  coloresDisponibles,
}: {
  coloresDisponibles?: ColorDeAcento[];
}) {
  const { colorAcento, cambiarColorAcento } = useTema();

  const paleta =
    coloresDisponibles && coloresDisponibles.length > 0
      ? coloresDisponibles
      : COLORES_DE_RESERVA;

  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <Button
          isIconOnly
          aria-label="Cambiar el color de mi perfil"
          radius="full"
          size="sm"
          variant="light"
        >
          <span
            className="size-4 rounded-full ring-1 ring-default-300"
            style={{ backgroundColor: colorAcento }}
          />
        </Button>
      </DropdownTrigger>

      <DropdownMenu aria-label="Color de perfil" variant="flat">
        <DropdownItem key="titulo" isReadOnly className="opacity-100" textValue="Color">
          <span className="text-xs font-semibold text-default-500">
            Color de mi perfil
          </span>
        </DropdownItem>

        <DropdownItem
          key="paleta"
          isReadOnly
          className="cursor-default data-[hover=true]:bg-transparent"
          textValue="Paleta de colores"
        >
          <div className="grid grid-cols-4 gap-2 py-1">
            {paleta.map((color) => {
              const estaElegido =
                colorAcento.toLowerCase() === color.hex.toLowerCase();

              return (
                <button
                  key={color.hex}
                  aria-label={color.nombre}
                  className={[
                    "flex size-7 items-center justify-center rounded-full transition",
                    estaElegido
                      ? "ring-2 ring-foreground ring-offset-1 ring-offset-content1"
                      : "hover:scale-110",
                  ].join(" ")}
                  style={{ backgroundColor: color.hex }}
                  type="button"
                  onClick={() => cambiarColorAcento(color.hex)}
                >
                  {estaElegido && (
                    <Check className="size-3 text-white" strokeWidth={3} />
                  )}
                </button>
              );
            })}
          </div>
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
}
