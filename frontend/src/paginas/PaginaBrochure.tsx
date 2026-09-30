/**
 * paginas/PaginaBrochure.tsx
 * ---------------------------------------------------------------------
 * El brochure de propiedades: se eligen las propiedades, el idioma y,
 * si se quiere, a qué marca va dirigido, y sale un PDF para mandarle a
 * un patrocinador. Vive en Reportes, junto a la bitácora por fechas.
 *
 * El documento lo arma utilidades/brochureDePropiedades.ts, y ahí están
 * las reglas de qué sale: el texto para clientes (nunca la nota interna),
 * las fotos que salen en la web y ningún monto. Esta pantalla solo avisa,
 * propiedad por propiedad, de a cuál le falta texto o fotos, para que no
 * se descubra al abrir el PDF.
 *
 * Lo saca todo el equipo: quien vende es quien lo manda. De partida van
 * marcadas las propiedades publicadas en la web, que son las que ya
 * tienen su texto y sus fotos para clientes.
 * ---------------------------------------------------------------------
 */
import { Button, Checkbox, Chip, Input } from "@heroui/react";
import { BookOpen, FileDown, ImageOff, Languages, Package, TextCursorInput } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { obtenerContenidoPublico } from "@/api/sitio";
import { BloqueDeCarga, EstadoVacio } from "@/componentes/comunes/EstadosDePantalla";
import { PestanasDeReportes } from "@/componentes/comunes/PestanasDeReportes";
import { RejillaBento, TarjetaBento } from "@/componentes/comunes/TarjetaBento";
import { usePropiedadesOfrecibles } from "@/hooks/usePropiedades";
import type { IdiomaDeLaWeb, Propiedad } from "@/tipos/modelos";
import { avisarDeError } from "@/utilidades/avisos";
import {
  fotosParaElBrochure,
  imprimirElBrochure,
  paginasDelBrochure,
  textoParaElBrochure,
} from "@/utilidades/brochureDePropiedades";

export function PaginaBrochure() {
  const { propiedades, estaCargando } = usePropiedadesOfrecibles();

  // Los colores y el contacto del brochure son los de la web.
  const consultaDelContenido = useQuery({
    queryKey: ["contenido-web", "publico"],
    queryFn: obtenerContenidoPublico,
    staleTime: 5 * 60 * 1000,
  });

  /** Nulo mientras nadie toque la lista: entonces van las publicadas. */
  const [idsElegidos, establecerIdsElegidos] = useState<string[] | null>(null);
  const [idioma, establecerIdioma] = useState<IdiomaDeLaWeb>("es");
  const [destinatario, establecerDestinatario] = useState("");
  const [estaGenerando, establecerEstaGenerando] = useState(false);

  const publicadas = propiedades.filter((propiedad) => propiedad.publicadaEnLaWeb);
  const seleccion = new Set(
    idsElegidos ?? (publicadas.length > 0 ? publicadas : propiedades).map((p) => p.id),
  );
  const elegidas = propiedades.filter((propiedad) => seleccion.has(propiedad.id));

  const paginas = paginasDelBrochure(elegidas.length);

  function alternar(idDeLaPropiedad: string) {
    const nueva = new Set(seleccion);

    if (nueva.has(idDeLaPropiedad)) nueva.delete(idDeLaPropiedad);
    else nueva.add(idDeLaPropiedad);

    establecerIdsElegidos([...nueva]);
  }

  async function generar() {
    if (!consultaDelContenido.data) return;

    establecerEstaGenerando(true);

    try {
      await imprimirElBrochure({
        propiedades: elegidas,
        idioma,
        destinatario,
        contenido: consultaDelContenido.data,
      });
    } catch (error) {
      avisarDeError(error, "No se pudo generar el brochure");
    } finally {
      establecerEstaGenerando(false);
    }
  }

  return (
    <div className="space-y-5">
      <PestanasDeReportes />

      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Brochure de propiedades
        </h2>
        <p className="mt-0.5 text-sm text-default-500">
          Un PDF para mandar a un patrocinador: portada, cada propiedad con sus fotos y cómo
          contactar con la agencia.
        </p>
      </div>

      <RejillaBento>
        <TarjetaBento
          columnas={8}
          descripcion="Salen en el orden del catálogo. Solo con su texto para clientes y las fotos que salen en la web."
          icono={<Package className="size-4" />}
          titulo="Qué propiedades"
          accionDeCabecera={
            <div className="flex flex-wrap gap-1.5">
              <Chip
                as="button"
                className="cursor-pointer"
                radius="lg"
                size="sm"
                variant="flat"
                onClick={() => establecerIdsElegidos(publicadas.map((p) => p.id))}
              >
                Las de la web
              </Chip>
              <Chip
                as="button"
                className="cursor-pointer"
                radius="lg"
                size="sm"
                variant="flat"
                onClick={() => establecerIdsElegidos(propiedades.map((p) => p.id))}
              >
                Todas
              </Chip>
              <Chip
                as="button"
                className="cursor-pointer"
                radius="lg"
                size="sm"
                variant="flat"
                onClick={() => establecerIdsElegidos([])}
              >
                Ninguna
              </Chip>
            </div>
          }
        >
          {estaCargando ? (
            <BloqueDeCarga alto="min-h-60" mensaje="Cargando el catálogo…" />
          ) : propiedades.length === 0 ? (
            <EstadoVacio
              descripcion="Cuando haya propiedades activas en el catálogo, se podrán poner en el brochure."
              icono={<Package className="size-6" />}
              titulo="No hay propiedades en venta"
            />
          ) : (
            <ul className="divide-y divide-default-100">
              {propiedades.map((propiedad) => (
                <FilaDePropiedad
                  key={propiedad.id}
                  estaElegida={seleccion.has(propiedad.id)}
                  idioma={idioma}
                  propiedad={propiedad}
                  alAlternar={() => alternar(propiedad.id)}
                />
              ))}
            </ul>
          )}
        </TarjetaBento>

        <TarjetaBento
          columnas={4}
          descripcion="Se abre el diálogo de impresión: elige «Guardar como PDF»."
          icono={<BookOpen className="size-4" />}
          titulo="Cómo sale"
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Languages className="size-3.5 text-default-400" />
                Idioma
              </span>
              <div className="flex gap-1 rounded-xl bg-default-100 p-1" role="radiogroup">
                {(
                  [
                    ["es", "Español"],
                    ["en", "English"],
                  ] as const
                ).map(([valor, etiqueta]) => (
                  <button
                    key={valor}
                    aria-checked={idioma === valor}
                    className={[
                      "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                      idioma === valor
                        ? "bg-content1 text-foreground shadow-sm"
                        : "text-default-500 hover:text-foreground",
                    ].join(" ")}
                    role="radio"
                    type="button"
                    onClick={() => establecerIdioma(valor)}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
            </div>

            <Input
              description="Sale en la portada. Déjalo vacío para un brochure general."
              label="Preparado para"
              labelPlacement="outside"
              placeholder="Ej. Refrescos del Caribe"
              radius="lg"
              value={destinatario}
              variant="bordered"
              onValueChange={establecerDestinatario}
            />

            <div className="rounded-2xl bg-default-100 px-4 py-3 text-xs leading-relaxed text-default-600">
              {elegidas.length === 0 ? (
                "Elige al menos una propiedad."
              ) : (
                <>
                  <span className="font-semibold text-foreground">
                    {elegidas.length} {elegidas.length === 1 ? "propiedad" : "propiedades"} ·{" "}
                    {paginas} páginas
                  </span>
                  <br />
                  Portada{elegidas.length >= 2 ? ", índice" : ""}, dos páginas por propiedad (su foto
                  y su ficha con la galería) y, al final, el contacto de la agencia.
                </>
              )}
            </div>

            <Button
              color="primary"
              isDisabled={elegidas.length === 0 || !consultaDelContenido.data}
              isLoading={estaGenerando}
              radius="lg"
              startContent={estaGenerando ? null : <FileDown className="size-4" />}
              onPress={() => void generar()}
            >
              {estaGenerando ? "Preparando las fotos…" : "Generar el PDF"}
            </Button>
          </div>
        </TarjetaBento>
      </RejillaBento>
    </div>
  );
}

function FilaDePropiedad({
  propiedad,
  idioma,
  estaElegida,
  alAlternar,
}: {
  propiedad: Propiedad;
  idioma: IdiomaDeLaWeb;
  estaElegida: boolean;
  alAlternar: () => void;
}) {
  const fotos = fotosParaElBrochure(propiedad);
  const tieneTexto = textoParaElBrochure(propiedad, idioma) !== "";
  const portada = fotos[0];

  return (
    <li className="flex items-center gap-3 py-2.5">
      <Checkbox
        aria-label={`Poner ${propiedad.nombre} en el brochure`}
        isSelected={estaElegida}
        radius="md"
        onValueChange={alAlternar}
      />

      {portada ? (
        <img
          alt=""
          className="h-10 w-16 shrink-0 rounded-lg object-cover"
          src={portada.urlMiniatura ?? portada.url}
        />
      ) : (
        <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-lg bg-default-100 text-default-400">
          <ImageOff className="size-4" />
        </span>
      )}

      <button className="min-w-0 flex-1 text-left" type="button" onClick={alAlternar}>
        <span className="block truncate text-sm font-semibold text-foreground">
          {propiedad.nombre}
        </span>
        <span className="block text-[11px] text-default-500">
          {fotos.length === 0
            ? "Sin fotos para clientes"
            : `${fotos.length} ${fotos.length === 1 ? "foto" : "fotos"}`}
          {propiedad.publicadaEnLaWeb ? " · en la web" : ""}
        </span>
      </button>

      {!tieneTexto && (
        <Chip
          color="warning"
          radius="lg"
          size="sm"
          startContent={<TextCursorInput className="ml-1 size-3" />}
          variant="flat"
        >
          Sin texto para clientes
        </Chip>
      )}
    </li>
  );
}
