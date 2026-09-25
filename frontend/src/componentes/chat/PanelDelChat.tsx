/**
 * componentes/chat/PanelDelChat.tsx
 * ---------------------------------------------------------------------
 * El chat entero —lista, charla, equipo, grupos— y cómo se reparte en
 * pantalla. Lo usan la ventana flotante y la página del chat, con una
 * diferencia:
 *
 *   · En la VENTANA (y en la página en un teléfono) cabe una cosa cada
 *     vez: la lista, o una charla con su flecha para volver.
 *   · En la PÁGINA, en pantalla grande, van lado a lado: la lista a la
 *     izquierda y la charla a la derecha.
 *
 * Qué charla está abierta lo decide quien lo monta (el estado de la
 * ventana, o la dirección `/chat/<id>` en la página), para que el botón
 * de atrás del navegador y los avisos al móvil lleven al sitio correcto.
 * ---------------------------------------------------------------------
 */
import { MessagesSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { DetallesDelGrupo, FormularioDeGrupo } from "@/componentes/chat/EquipoYGruposDelChat";
import { ListaDeConversaciones } from "@/componentes/chat/ListaDeConversaciones";
import { VistaDeConversacion } from "@/componentes/chat/VistaDeConversacion";
import { useChat } from "@/providers/ProveedorChat";

/** Lo que enseña la columna de la lista. */
type VistaLateral = "charlas" | "nuevoGrupo";

/** Lo que enseña la columna de la charla. */
type VistaDeLaCharla = "mensajes" | "detalles" | "anadir";

export function PanelDelChat({
  modo,
  idDeLaConversacion,
  alElegirConversacion,
  alCerrar,
}: {
  modo: "ventana" | "pagina";
  idDeLaConversacion: string | null;
  alElegirConversacion: (idDeLaConversacion: string | null) => void;
  alCerrar?: () => void;
}) {
  const { anotarChatAbierto } = useChat();

  const [vistaLateral, establecerVistaLateral] = useState<VistaLateral>("charlas");
  const [vistaDeLaCharla, establecerVistaDeLaCharla] = useState<VistaDeLaCharla>("mensajes");

  // Con el chat abierto, el latido se acelera (ver ProveedorChat).
  useEffect(() => anotarChatAbierto(), [anotarChatAbierto]);

  // Al cambiar de charla, se vuelve a sus mensajes y a la lista.
  useEffect(() => {
    establecerVistaDeLaCharla("mensajes");
    if (idDeLaConversacion !== null) establecerVistaLateral("charlas");
  }, [idDeLaConversacion]);

  const enVentana = modo === "ventana";
  const hayCharla = idDeLaConversacion !== null;

  const lateral =
    vistaLateral === "nuevoGrupo" ? (
      <FormularioDeGrupo
        alTerminar={(id) => {
          establecerVistaLateral("charlas");
          alElegirConversacion(id);
        }}
        alVolver={() => establecerVistaLateral("charlas")}
      />
    ) : (
      <ListaDeConversaciones
        alCerrar={enVentana ? alCerrar : undefined}
        alElegir={alElegirConversacion}
        alNuevoGrupo={() => establecerVistaLateral("nuevoGrupo")}
        conTitulo={enVentana}
        idSeleccionada={idDeLaConversacion}
      />
    );

  const charla =
    idDeLaConversacion === null ? (
      <SinCharlaElegida />
    ) : vistaDeLaCharla === "detalles" ? (
      <DetallesDelGrupo
        alAnadir={() => establecerVistaDeLaCharla("anadir")}
        alSalir={() => alElegirConversacion(null)}
        alVolver={() => establecerVistaDeLaCharla("mensajes")}
        idDelGrupo={idDeLaConversacion}
      />
    ) : vistaDeLaCharla === "anadir" ? (
      <FormularioDeGrupo
        alTerminar={() => establecerVistaDeLaCharla("detalles")}
        alVolver={() => establecerVistaDeLaCharla("detalles")}
        idDelGrupo={idDeLaConversacion}
      />
    ) : (
      <VistaDeConversacion
        key={idDeLaConversacion}
        alCerrar={enVentana ? alCerrar : undefined}
        alVerDetalles={() => establecerVistaDeLaCharla("detalles")}
        alVolver={() => alElegirConversacion(null)}
        enLaVentana={enVentana}
        idDeLaConversacion={idDeLaConversacion}
      />
    );

  if (enVentana) {
    return <div className="flex h-full min-h-0 flex-col">{hayCharla ? charla : lateral}</div>;
  }

  // Página: lado a lado en pantalla grande; una cosa cada vez en el
  // teléfono, igual que la ventana. Ocupa el hueco entero, sin caja
  // alrededor: la lista va con el fondo de la barra lateral, como una
  // columna más del panel, y la charla con el del contenido.
  return (
    <div className="flex h-full min-h-0">
      <div
        className={[
          "min-h-0 w-full flex-col bg-content1 lg:flex lg:w-80 lg:shrink-0 lg:border-r lg:border-default-200 xl:w-96",
          hayCharla ? "hidden" : "flex",
        ].join(" ")}
      >
        {lateral}
      </div>

      <div className={["min-h-0 min-w-0 flex-1 flex-col lg:flex", hayCharla ? "flex" : "hidden"].join(" ")}>
        {charla}
      </div>
    </div>
  );
}

function SinCharlaElegida() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary-100 text-primary dark:bg-primary-100/20">
        <MessagesSquare className="size-7" />
      </span>
      <p className="text-sm font-semibold text-foreground">Elige una charla</p>
      <p className="max-w-xs text-xs text-default-500">
        O a alguien del equipo en la lista, para escribirle. Con <strong>#</strong> puedes etiquetar una marca en
        el mensaje y quien la lleve podrá abrirla desde ahí.
      </p>
    </div>
  );
}
