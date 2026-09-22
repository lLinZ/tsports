/**
 * componentes/layout/BotonDeInstalacion.tsx
 * ---------------------------------------------------------------------
 * «Instalar la aplicación», en el pie de la barra lateral.
 *
 * Una aplicación instalable que nadie descubre no sirve de nada: el
 * navegador solo la ofrece en un menú que casi nadie abre. Por eso se
 * ofrece aquí, donde el equipo ya mira.
 *
 * Se esconde sola en cuanto no tiene sentido: si ya está instalada y
 * abierta como aplicación, o si el navegador no la admite.
 *
 * EL IPHONE VA APARTE. Safari no tiene el diálogo de instalación de
 * Chrome, así que ahí no hay botón que pulsar: se explica el camino
 * (Compartir → Añadir a pantalla de inicio). Importa más de lo que
 * parece, porque en iPhone el aviso al móvil no existe si la aplicación
 * no está instalada.
 * ---------------------------------------------------------------------
 */
import { Button, Popover, PopoverContent, PopoverTrigger } from "@heroui/react";
import { Share, SquarePlus } from "lucide-react";
import { useAplicacion } from "@/providers/ProveedorAplicacion";
import { avisarDeExito } from "@/utilidades/avisos";

export function BotonDeInstalacion() {
  const { sePuedeInstalar, instalar, estaAbiertaComoAplicacion, seInstalaAMano } =
    useAplicacion();

  // Ya está dentro de la aplicación: no hay nada que ofrecer.
  if (estaAbiertaComoAplicacion) {
    return null;
  }

  if (seInstalaAMano) {
    return (
      <Popover placement="top">
        <PopoverTrigger>
          <Button
            className="mt-2 w-full justify-start"
            radius="lg"
            size="sm"
            startContent={<SquarePlus className="size-4" />}
            variant="flat"
          >
            Instalar la aplicación
          </Button>
        </PopoverTrigger>

        <PopoverContent className="max-w-64 px-4 py-3">
          <p className="text-tiny text-default-600">
            En iPhone y iPad se añade a mano: toca{" "}
            <Share className="inline size-3.5 align-text-bottom" /> Compartir, y
            después <strong className="text-foreground">Añadir a pantalla de inicio</strong>.
          </p>
        </PopoverContent>
      </Popover>
    );
  }

  // Chrome y Edge solo dan el evento cuando la página cumple todos los
  // requisitos. Hasta entonces no se promete nada.
  if (!sePuedeInstalar) {
    return null;
  }

  return (
    <Button
      className="mt-2 w-full justify-start"
      radius="lg"
      size="sm"
      startContent={<SquarePlus className="size-4" />}
      variant="flat"
      onPress={() => {
        void instalar().then((laAcepto) => {
          if (laAcepto) {
            avisarDeExito("Instalada. Ya la tienes con el resto de aplicaciones.");
          }
        });
      }}
    >
      Instalar la aplicación
    </Button>
  );
}
