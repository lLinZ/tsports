/**
 * componentes/comunes/AvisosFlotantes.tsx
 * ---------------------------------------------------------------------
 * Los avisos flotantes (los «toast» de HeroUI) y el botón que los cierra
 * todos de una vez.
 *
 * Desde el 2026-09-30 llega en vivo un aviso por cada comentario, y se
 * juntan varios enseguida. HeroUI los apila pero solo deja cerrarlos de
 * uno en uno, y la X de cada aviso solo aparece al pasar el ratón: en un
 * teléfono había que deslizarlos uno a uno. Con dos o más en pantalla
 * sale encima de la pila «Cerrar los N avisos», que llama a `closeAll`
 * de HeroUI.
 *
 * El hueco para el botón se abre bajando la pila con `toastOffset`, que
 * HeroUI anima: así el botón no tapa el primer aviso, y al quedar uno
 * solo la pila vuelve a subir.
 *
 * Y en pantallas táctiles la X de cada aviso se ve siempre: ahí no hay
 * ratón que pase por encima.
 * ---------------------------------------------------------------------
 */
import { Button, ToastProvider, closeAll, getToastQueue } from "@heroui/react";
import { X } from "lucide-react";
import { useSyncExternalStore } from "react";

/*
 * Medidas del botón y del hueco. Cada aviso lleva 4 px de margen propio
 * por arriba (el `my-1` de HeroUI), que se descuentan del hueco.
 */
const DISTANCIA_DEL_BOTON_AL_BORDE_PX = 8;
const ALTO_DEL_BOTON_PX = 32;
const SEPARACION_CON_LA_PILA_PX = 8;
const MARGEN_PROPIO_DE_CADA_AVISO_PX = 4;

const HUECO_PARA_EL_BOTON_PX =
  DISTANCIA_DEL_BOTON_AL_BORDE_PX +
  ALTO_DEL_BOTON_PX +
  SEPARACION_CON_LA_PILA_PX -
  MARGEN_PROPIO_DE_CADA_AVISO_PX;

/** La cola es de HeroUI y vive fuera de React: se escucha como tal. */
function escucharLaCola(alCambiar: () => void): () => void {
  return getToastQueue().subscribe(alCambiar);
}

function cuantosAvisosHay(): number {
  return getToastQueue().visibleToasts.length;
}

export function AvisosFlotantes() {
  const cuantos = useSyncExternalStore(escucharLaCola, cuantosAvisosHay);
  const hayVarios = cuantos >= 2;

  return (
    <>
      {/* Se apilan arriba a la derecha (en un teléfono, arriba al centro). */}
      <ToastProvider
        placement="top-right"
        toastOffset={hayVarios ? HUECO_PARA_EL_BOTON_PX : 0}
        toastProps={{
          radius: "lg",
          classNames: { closeButton: "[@media(hover:none)]:opacity-100" },
        }}
      />

      {hayVarios && (
        // Alineado con el borde derecho de los avisos: 16 px con la
        // pantalla estrecha (van a lo ancho) y 12 px con la ancha.
        // Por encima de la capa de los avisos, que va en z-100.
        <div
          className="fixed right-4 z-[101] sm:right-3"
          style={{ top: DISTANCIA_DEL_BOTON_AL_BORDE_PX }}
        >
          <Button
            className="h-8 shadow-lg"
            radius="full"
            size="sm"
            startContent={<X className="size-3.5" />}
            variant="solid"
            onPress={closeAll}
          >
            Cerrar los {cuantos} avisos
          </Button>
        </div>
      )}
    </>
  );
}
