/**
 * paginas/PaginaCatalogoWeb.tsx
 * ---------------------------------------------------------------------
 * Todo lo que decide qué propiedades ven los clientes en la web, en una
 * sola pantalla. Desde el 2026-10-01.
 *
 * Antes estaba repartido: «Publicar en la web» dentro de la ventana de
 * cada propiedad, el usuario de invitado en una ventana escondida tras un
 * botón de Propiedades, y nada que dijera por qué la sección no salía en
 * la web. En producción no salía porque faltaban las dos cosas, y nadie
 * lo podía saber desde el panel.
 *
 * De arriba abajo:
 *
 *   1. SI SE VE O NO, y qué falta. Se ve con las mismas dos condiciones
 *      que comprueba el servidor (PropiedadesEnLaWebController::acceso):
 *      hay usuario de invitado y hay al menos una propiedad activa y
 *      publicada.
 *   2. El usuario y la contraseña de invitado, a la vista.
 *   3. Las propiedades, con un interruptor para publicarlas o retirarlas
 *      y lo que les falta para lucir (fotos, texto para clientes).
 *   4. Cómo se monta una propiedad en la web, paso a paso.
 *
 * Qué sale de cada propiedad en la web lo sigue decidiendo el servidor
 * (RecursoPropiedadEnLaWeb, regla 21): aquí solo se enseña.
 * ---------------------------------------------------------------------
 */
import { Button, Chip, Switch, Tooltip } from "@heroui/react";
import {
  CircleCheck,
  CircleDashed,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  ImageOff,
  KeyRound,
  ListChecks,
  Package,
  Pencil,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { mensajeDeError } from "@/api/clienteHttp";
import { BloqueDeCarga, BloqueDeError, EstadoVacio } from "@/componentes/comunes/EstadosDePantalla";
import { RejillaBento, TarjetaBento } from "@/componentes/comunes/TarjetaBento";
import { ModalDePropiedad } from "@/componentes/crm/ModalDePropiedad";
import { PanelDeAccesoDeInvitados } from "@/componentes/crm/PanelDeAccesoDeInvitados";
import {
  useAccesoDeInvitados,
  useCambiarPublicacionDePropiedad,
  useCatalogoDePropiedades,
} from "@/hooks/usePropiedades";
import { avisarDeError, avisarDeExito, avisarDeInformacion } from "@/utilidades/avisos";
import type { Propiedad } from "@/tipos/modelos";

/** Las fotos de una propiedad que de verdad salen en la web. */
function fotosParaLaWeb(propiedad: Propiedad): number {
  return (propiedad.galeria ?? []).filter((pieza) => pieza.tipo === "imagen" && pieza.enLaWeb).length;
}

export function PaginaCatalogoWeb() {
  const catalogo = useCatalogoDePropiedades();
  const consultaDelAcceso = useAccesoDeInvitados(true);

  const [elModalEstaAbierto, establecerModalAbierto] = useState(false);
  const [propiedadEnEdicion, establecerPropiedadEnEdicion] = useState<Propiedad | null>(null);

  function abrirLaPropiedad(propiedad: Propiedad | null) {
    establecerPropiedadEnEdicion(propiedad);
    establecerModalAbierto(true);
  }

  const { propiedades } = catalogo;
  const activas = propiedades.filter((propiedad) => propiedad.activa);
  const enLaWeb = activas.filter((propiedad) => propiedad.publicadaEnLaWeb);
  const enLaWebSinFotos = enLaWeb.filter((propiedad) => fotosParaLaWeb(propiedad) === 0);

  const hayAcceso = consultaDelAcceso.data != null;
  const seSabeSiHayAcceso = !consultaDelAcceso.isLoading;
  const seVe = hayAcceso && enLaWeb.length > 0;

  return (
    <div className="space-y-5">
      <RejillaBento>
        {/* 1. Si se ve o no, y qué falta */}
        <TarjetaBento columnas={12}>
          {catalogo.estaCargando || !seSabeSiHayAcceso ? (
            <BloqueDeCarga alto="min-h-24" mensaje="Comprobando el catálogo…" />
          ) : (
            <EstadoDelCatalogo
              enLaWeb={enLaWeb.length}
              enLaWebSinFotos={enLaWebSinFotos.map((propiedad) => propiedad.nombre)}
              hayAcceso={hayAcceso}
              seVe={seVe}
            />
          )}
        </TarjetaBento>

        {/* 2. El usuario y la contraseña de invitado */}
        <TarjetaBento
          columnas={6}
          descripcion="Con este usuario y esta contraseña entra un cliente a ver las propiedades en la web. Es el mismo para todos los clientes."
          icono={<KeyRound className="size-4" />}
          titulo="Usuario de invitado"
        >
          <PanelDeAccesoDeInvitados />
        </TarjetaBento>

        {/* 3. Las propiedades */}
        <TarjetaBento
          accionDeCabecera={
            <Button
              color="primary"
              radius="lg"
              size="sm"
              startContent={<Plus className="size-4" />}
              onPress={() => abrirLaPropiedad(null)}
            >
              Nueva
            </Button>
          }
          columnas={6}
          descripcion="Enciende las que quieres enseñar. Pulsa «Editar» para subirles fotos o escribirles el texto."
          icono={<Package className="size-4" />}
          titulo="Propiedades en la web"
        >
          {catalogo.estaCargando ? (
            <BloqueDeCarga alto="min-h-40" mensaje="Cargando las propiedades…" />
          ) : catalogo.error ? (
            <BloqueDeError
              alReintentar={() => void catalogo.recargar()}
              mensaje={mensajeDeError(catalogo.error)}
            />
          ) : activas.length === 0 ? (
            <EstadoVacio
              descripcion="Crea la primera con «Nueva» y súbele las fotos."
              icono={<Package className="size-5" />}
              titulo="No hay propiedades en venta"
            />
          ) : (
            <ul className="-mx-1 divide-y divide-default-100">
              {activas.map((propiedad) => (
                <FilaDePropiedad
                  key={propiedad.id}
                  propiedad={propiedad}
                  alEditar={() => abrirLaPropiedad(propiedad)}
                />
              ))}
            </ul>
          )}

          {propiedades.length > activas.length && (
            <p className="mt-3 text-[11px] leading-relaxed text-default-400">
              {propiedades.length - activas.length === 1
                ? "Hay 1 propiedad desactivada: no sale en la web aunque esté publicada."
                : `Hay ${propiedades.length - activas.length} propiedades desactivadas: no salen en la web aunque estén publicadas.`}{" "}
              Se reactivan desde Propiedades.
            </p>
          )}
        </TarjetaBento>

        {/* 4. El tutorial */}
        <TarjetaBento
          columnas={12}
          descripcion="Lo que hay que hacer para que una propiedad salga en la web, en orden."
          icono={<ListChecks className="size-4" />}
          titulo="Cómo poner una propiedad en la web"
        >
          <PasosParaPublicar />
        </TarjetaBento>
      </RejillaBento>

      <ModalDePropiedad
        alCerrar={() => establecerModalAbierto(false)}
        // Recién creada, la ventana sigue abierta sobre ella para subirle
        // las fotos sin tener que buscarla y volver a entrar.
        alCrear={(propiedadCreada) => establecerPropiedadEnEdicion(propiedadCreada)}
        estaAbierto={elModalEstaAbierto}
        propiedadEnEdicion={propiedadEnEdicion}
      />
    </div>
  );
}

/* ==================================================================== */
/* Piezas                                                               */
/* ==================================================================== */

function EstadoDelCatalogo({
  seVe,
  hayAcceso,
  enLaWeb,
  enLaWebSinFotos,
}: {
  seVe: boolean;
  hayAcceso: boolean;
  enLaWeb: number;
  enLaWebSinFotos: string[];
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3">
        <span
          className={[
            "flex size-11 shrink-0 items-center justify-center rounded-2xl",
            seVe ? "bg-success-100 text-success-700" : "bg-warning-100 text-warning-700",
          ].join(" ")}
        >
          {seVe ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
        </span>

        <div>
          <h3 className="text-base font-semibold text-foreground">
            {seVe ? "El catálogo se ve en la web" : "El catálogo todavía no se ve en la web"}
          </h3>
          <p className="mt-0.5 text-sm text-default-500">
            {seVe
              ? `Los clientes que entren con el usuario de invitado ven ${enLaWeb === 1 ? "1 propiedad" : `${enLaWeb} propiedades`}.`
              : "Para que salga la sección «Propiedades» en la web hacen falta las dos cosas de la lista."}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:items-end">
        <ul className="space-y-1.5">
          <Requisito cumplido={hayAcceso}>
            {hayAcceso ? "Hay usuario de invitado" : "Falta el usuario de invitado"}
          </Requisito>
          <Requisito cumplido={enLaWeb > 0}>
            {enLaWeb > 0
              ? `${enLaWeb === 1 ? "1 propiedad publicada" : `${enLaWeb} propiedades publicadas`}`
              : "Falta publicar al menos una propiedad"}
          </Requisito>
          {enLaWebSinFotos.length > 0 && (
            <li className="flex items-start gap-2 text-xs text-warning-700 dark:text-warning">
              <TriangleAlert className="mt-px size-4 shrink-0" />
              <span>
                Sin fotos para la web: {enLaWebSinFotos.join(", ")}. Salen con su logo o sus iniciales en lugar de foto.
              </span>
            </li>
          )}
        </ul>

        {seVe && (
          <Button
            as="a"
            href="/#propiedades"
            radius="lg"
            rel="noreferrer"
            size="sm"
            startContent={<ExternalLink className="size-4" />}
            target="_blank"
            variant="flat"
          >
            Verlo como un cliente
          </Button>
        )}
      </div>
    </div>
  );
}

function Requisito({ cumplido, children }: { cumplido: boolean; children: ReactNode }) {
  return (
    <li
      className={[
        "flex items-center gap-2 text-xs",
        cumplido ? "text-success-700 dark:text-success" : "font-medium text-foreground",
      ].join(" ")}
    >
      {cumplido ? (
        <CircleCheck className="size-4 shrink-0" />
      ) : (
        <CircleDashed className="size-4 shrink-0 text-warning" />
      )}
      {children}
    </li>
  );
}

function FilaDePropiedad({
  propiedad,
  alEditar,
}: {
  propiedad: Propiedad;
  alEditar: () => void;
}) {
  const cambiarPublicacion = useCambiarPublicacionDePropiedad();
  const fotos = fotosParaLaWeb(propiedad);
  const sinTexto = !propiedad.textoWebEs;

  async function publicarORetirar(publicada: boolean) {
    try {
      await cambiarPublicacion.mutateAsync({ idDeLaPropiedad: propiedad.id, publicada });

      if (publicada) {
        avisarDeExito(`${propiedad.nombre} ya sale en la web`);
      } else {
        avisarDeInformacion(`${propiedad.nombre} retirada de la web`, "Sus fotos y su texto se quedan guardados.");
      }
    } catch (error) {
      avisarDeError(error, "No se pudo cambiar la propiedad");
    }
  }

  return (
    <li className="flex items-center gap-3 px-1 py-3">
      {propiedad.portadaUrl ? (
        <img
          alt=""
          className="size-12 shrink-0 rounded-xl object-cover"
          loading="lazy"
          src={propiedad.portadaUrl}
        />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-default-100 text-default-400">
          <ImageOff className="size-5" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{propiedad.nombre}</p>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {propiedad.publicadaEnLaWeb ? (
            <Chip color="success" radius="lg" size="sm" startContent={<Globe className="ml-1 size-3" />} variant="flat">
              En la web
            </Chip>
          ) : (
            <Chip radius="lg" size="sm" variant="flat">
              No publicada
            </Chip>
          )}

          <span className={["text-[11px]", fotos === 0 ? "text-warning-700 dark:text-warning" : "text-default-500"].join(" ")}>
            {fotos === 0 ? "Sin fotos para la web" : fotos === 1 ? "1 foto" : `${fotos} fotos`}
          </span>

          {sinTexto && (
            <span className="text-[11px] text-default-400">· sin texto para clientes</span>
          )}
        </div>
      </div>

      <Tooltip content="Fotos, texto y demás datos">
        <Button
          isIconOnly
          aria-label={`Editar ${propiedad.nombre}`}
          radius="lg"
          size="sm"
          variant="flat"
          onPress={alEditar}
        >
          <Pencil className="size-3.5" />
        </Button>
      </Tooltip>

      {/* El nombre va como hijo oculto y no como aria-label: HeroUI deja
          el aria-label en la envoltura y el interruptor se quedaba sin
          nombre para un lector de pantalla. */}
      <Switch
        color="success"
        isDisabled={!propiedad.puedoEditarla || cambiarPublicacion.isPending}
        isSelected={propiedad.publicadaEnLaWeb}
        size="sm"
        onValueChange={(publicada) => void publicarORetirar(publicada)}
      >
        <span className="sr-only">Publicar {propiedad.nombre} en la web</span>
      </Switch>
    </li>
  );
}

/** Los pasos, con el nombre exacto de cada botón tal como sale en pantalla. */
const PASOS: Array<{ titulo: string; texto: ReactNode }> = [
  {
    titulo: "Abre la propiedad",
    texto: (
      <>
        Pulsa el lápiz de la propiedad en la lista de arriba, o «Nueva» si todavía no existe.
        También se puede desde la pantalla Propiedades.
      </>
    ),
  },
  {
    titulo: "Sube las fotos",
    texto: (
      <>
        En el apartado «Fotos, planos y dossier» arrastra las fotos o pulsa para elegirlas. Las
        fotos salen en la web; los PDF (dossier, tarifas) no salen nunca. Si una foto es solo para
        el equipo, ábrele el menú «⋯» y pulsa «No enseñarla en la web».
      </>
    ),
  },
  {
    titulo: "Elige la portada",
    texto: (
      <>
        En el menú «⋯» de la foto que quieras que se vea primero, «Usar como portada». Es la foto
        grande de la tarjeta.
      </>
    ),
  },
  {
    titulo: "Escribe el texto para clientes",
    texto: (
      <>
        Enciende «Publicar en la web» dentro de la ventana y rellena «Texto para la web» y, si
        quieres, «El mismo texto, en inglés». La «Descripción» de arriba es una nota del equipo y
        no sale fuera. Guarda.
      </>
    ),
  },
  {
    titulo: "Comprueba que está encendida",
    texto: (
      <>
        En la lista de arriba tiene que decir «En la web», con el interruptor encendido. Una
        propiedad desactivada no sale aunque esté publicada.
      </>
    ),
  },
  {
    titulo: "Pon el usuario de invitado",
    texto: (
      <>
        Solo la primera vez: elige un usuario y una contraseña en «Usuario de invitado» y pulsa
        «Crear el acceso». Sin él la sección no aparece en la web.
      </>
    ),
  },
  {
    titulo: "Mándaselo al cliente",
    texto: (
      <>
        «Copiar el mensaje para el cliente» deja la dirección, el usuario y la contraseña listos
        para pegar en un WhatsApp o un correo. El cliente entra en la web, sección «Propiedades».
      </>
    ),
  },
];

function PasosParaPublicar() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <ol className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {PASOS.map((paso, posicion) => (
          <li key={paso.titulo} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {posicion + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{paso.titulo}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-default-500">{paso.texto}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="space-y-3 rounded-2xl bg-default-100 p-4 text-xs leading-relaxed text-default-600">
        <p className="text-sm font-semibold text-foreground">Lo que nunca sale en la web</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>Los montos: MTP, meta y pronósticos.</li>
          <li>La «Descripción», que es la nota del equipo.</li>
          <li>Los PDF de la galería.</li>
          <li>Las fotos marcadas «Solo para el equipo».</li>
        </ul>
        <p>
          Si cambias la contraseña de invitado, todos los clientes que ya entraron tienen que
          volver a entrar con la nueva.
        </p>
      </div>
    </div>
  );
}
