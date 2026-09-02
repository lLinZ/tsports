/**
 * componentes/comunes/CampoDeImagen.tsx
 * ---------------------------------------------------------------------
 * Campo para poner una imagen, con las dos formas que hacen falta en el
 * día a día: subir un fichero del ordenador, o pegar la URL de una que
 * ya está en internet.
 *
 * Se usa en el logo de una marca y en todas las imágenes del
 * administrador de la web. Las dos vías acaban en lo mismo: una cadena
 * con la URL, que es lo único que se guarda en la base de datos.
 *
 * Detalle de comodidad: acepta también arrastrar y soltar el fichero
 * encima, que es como la mayoría de la gente espera subir una imagen.
 * ---------------------------------------------------------------------
 */
import { Button, Input, Spinner } from "@heroui/react";
import { ImageOff, Trash2, Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { subirImagen, type PropositoDeImagen } from "@/api/sistema";
import { avisarDeError } from "@/utilidades/avisos";

interface PropiedadesDeCampoDeImagen {
  /** URL actual de la imagen (cadena vacía si no hay ninguna). */
  valor: string;
  /** Se llama con la URL nueva cada vez que cambia. */
  alCambiar: (nuevaUrl: string) => void;

  etiqueta: string;
  /** Texto de ayuda bajo el campo: qué imagen es y para qué se usa. */
  ayuda?: string;

  /** Determina en qué carpeta del servidor acaba el fichero. */
  proposito?: PropositoDeImagen;

  /** Proporción de la vista previa. Un logo es cuadrado; un hero, ancho. */
  formaDeLaVistaPrevia?: "cuadrada" | "ancha";

  isDisabled?: boolean;
}

export function CampoDeImagen({
  valor,
  alCambiar,
  etiqueta,
  ayuda,
  proposito = "contenido_web",
  formaDeLaVistaPrevia = "ancha",
  isDisabled = false,
}: PropiedadesDeCampoDeImagen) {
  const [estaSubiendo, establecerEstaSubiendo] = useState(false);
  const [estaArrastrandoEncima, establecerArrastrandoEncima] = useState(false);

  const referenciaAlInputDeFichero = useRef<HTMLInputElement>(null);
  const idDelInputDeFichero = useId();

  /** Sube el fichero al servidor y deja su URL en el campo. */
  async function subirElFichero(fichero: File) {
    // Comprobación en el cliente para dar el aviso al instante en vez de
    // esperar a que el servidor rechace 8 MB después de subirlos.
    const TAMANO_MAXIMO_EN_BYTES = 5 * 1024 * 1024;

    if (fichero.size > TAMANO_MAXIMO_EN_BYTES) {
      avisarDeError(
        "La imagen no puede pesar más de 5 MB. Prueba a reducirla antes de subirla.",
        "Imagen demasiado grande",
      );

      return;
    }

    if (!fichero.type.startsWith("image/")) {
      avisarDeError("El fichero elegido no es una imagen.", "Formato no admitido");

      return;
    }

    establecerEstaSubiendo(true);

    try {
      const imagenSubida = await subirImagen(fichero, proposito);

      alCambiar(imagenSubida.url);
    } catch (error) {
      avisarDeError(error, "No se pudo subir la imagen");
    } finally {
      establecerEstaSubiendo(false);
    }
  }

  const clasesDeLaVistaPrevia =
    formaDeLaVistaPrevia === "cuadrada"
      ? "size-24 shrink-0"
      : "h-24 w-40 shrink-0";

  return (
    <div className="flex flex-col gap-2">
      <label
        className="text-xs font-semibold text-default-600"
        htmlFor={idDelInputDeFichero}
      >
        {etiqueta}
      </label>

      <div className="flex flex-wrap items-start gap-3">
        {/* Vista previa. También es la zona donde se puede soltar. */}
        <div
          className={[
            clasesDeLaVistaPrevia,
            "relative flex items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition",
            estaArrastrandoEncima
              ? "border-primary bg-primary-50 dark:bg-primary-100/10"
              : "border-default-200 bg-default-50",
          ].join(" ")}
          onDragLeave={() => establecerArrastrandoEncima(false)}
          onDragOver={(evento) => {
            evento.preventDefault();

            if (!isDisabled) establecerArrastrandoEncima(true);
          }}
          onDrop={(evento) => {
            evento.preventDefault();
            establecerArrastrandoEncima(false);

            if (isDisabled) return;

            const ficheroSoltado = evento.dataTransfer.files?.[0];

            if (ficheroSoltado) void subirElFichero(ficheroSoltado);
          }}
        >
          {estaSubiendo ? (
            <Spinner color="primary" size="sm" />
          ) : valor ? (
            <img
              alt={etiqueta}
              className="size-full object-cover"
              src={valor}
              // Si la URL pegada no carga, se avisa en la propia caja en
              // lugar de dejar el icono roto del navegador.
              onError={(evento) => {
                evento.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-default-400">
              <ImageOff className="size-5" />
              <span className="text-[10px]">Sin imagen</span>
            </div>
          )}
        </div>

        {/* Controles: subir fichero o pegar URL. */}
        <div className="flex min-w-52 flex-1 flex-col gap-2">
          <div className="flex gap-2">
            <Button
              className="flex-1"
              isDisabled={isDisabled || estaSubiendo}
              radius="lg"
              size="sm"
              startContent={<Upload className="size-4" />}
              variant="flat"
              onPress={() => referenciaAlInputDeFichero.current?.click()}
            >
              Subir imagen
            </Button>

            {valor && (
              <Button
                isIconOnly
                aria-label="Quitar la imagen"
                color="danger"
                isDisabled={isDisabled}
                radius="lg"
                size="sm"
                variant="light"
                onPress={() => alCambiar("")}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>

          <Input
            id={idDelInputDeFichero}
            isDisabled={isDisabled || estaSubiendo}
            placeholder="…o pega aquí la URL de una imagen"
            radius="lg"
            size="sm"
            value={valor}
            variant="bordered"
            onValueChange={alCambiar}
          />

          {ayuda && (
            <p className="text-[11px] leading-relaxed text-default-500">{ayuda}</p>
          )}
        </div>
      </div>

      {/* El input real queda oculto: lo abre el botón de arriba. */}
      <input
        ref={referenciaAlInputDeFichero}
        accept="image/*"
        className="hidden"
        type="file"
        onChange={(evento) => {
          const ficheroElegido = evento.target.files?.[0];

          if (ficheroElegido) void subirElFichero(ficheroElegido);

          // Se limpia el valor para que elegir dos veces el mismo fichero
          // vuelva a disparar el evento onChange.
          evento.target.value = "";
        }}
      />
    </div>
  );
}
