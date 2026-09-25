/**
 * componentes/chat/ChatFlotante.tsx
 * ---------------------------------------------------------------------
 * La burbuja del chat, abajo a la derecha en todas las pantallas del
 * panel, y la ventana que abre.
 *
 *   · En un ordenador, la ventana flota encima de la burbuja y deja ver
 *     la pantalla de detrás: se puede tener el tablero a la vista y
 *     contestar a la vez.
 *   · En un teléfono ocupa la pantalla entera, como cualquier chat.
 *
 * El número rojo de la burbuja es la suma de «sin leer» de todas las
 * charlas, contada por el servidor. En la página del chat la burbuja no
 * sale: sería un botón para abrir lo que ya está abierto.
 * ---------------------------------------------------------------------
 */
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, X } from "lucide-react";
import { useEffect, type KeyboardEvent } from "react";
import { useLocation } from "react-router-dom";
import { PanelDelChat } from "@/componentes/chat/PanelDelChat";
import { useChat } from "@/providers/ProveedorChat";

export function ChatFlotante() {
  const {
    sinLeer,
    ventanaAbierta,
    abrirVentana,
    cerrarVentana,
    conversacionDeLaVentana,
    elegirConversacionDeLaVentana,
  } = useChat();
  const ubicacion = useLocation();

  const enLaPaginaDelChat = ubicacion.pathname.startsWith("/chat");

  // En la página del chat la ventana sobra.
  useEffect(() => {
    if (enLaPaginaDelChat && ventanaAbierta) cerrarVentana();
  }, [enLaPaginaDelChat, ventanaAbierta, cerrarVentana]);

  if (enLaPaginaDelChat) return null;

  return (
    <>
      <AnimatePresence>
        {ventanaAbierta && (
          <motion.section
            key="ventana-del-chat"
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-label="Chat"
            className={[
              // Teléfono: pantalla entera, por encima de todo.
              "fixed inset-0 z-50 flex flex-col overflow-hidden bg-content1",
              // Ordenador: ventana flotante sobre la burbuja.
              "sm:inset-auto sm:bottom-24 sm:right-5 sm:z-40 sm:h-[min(640px,calc(100vh-8rem))] sm:w-[400px]",
              "sm:bento-card sm:shadow-2xl",
            ].join(" ")}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            role="dialog"
            // Escape cierra la ventana, pero solo con el foco dentro de
            // ella: pulsado en el tablero de detrás, no es para el chat. Y
            // el de un desplegable de dentro (emoji) lo detiene él antes.
            onKeyDown={(evento: KeyboardEvent) => {
              if (evento.key === "Escape" && !evento.defaultPrevented) {
                evento.stopPropagation();
                cerrarVentana();
              }
            }}
            style={{ transformOrigin: "bottom right" }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <PanelDelChat
              alCerrar={cerrarVentana}
              alElegirConversacion={elegirConversacionDeLaVentana}
              idDeLaConversacion={conversacionDeLaVentana}
              modo="ventana"
            />
          </motion.section>
        )}
      </AnimatePresence>

      <button
        aria-label={
          ventanaAbierta
            ? "Cerrar el chat"
            : sinLeer > 0
              ? `Abrir el chat, ${sinLeer} ${sinLeer === 1 ? "mensaje" : "mensajes"} sin leer`
              : "Abrir el chat"
        }
        className={[
          "burbuja-del-chat fixed z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105 active:scale-95",
          // En el teléfono la ventana abierta tapa la pantalla: la burbuja
          // sobra, y se cierra con la X de la ventana.
          ventanaAbierta ? "hidden sm:flex" : "",
        ].join(" ")}
        type="button"
        onClick={() => (ventanaAbierta ? cerrarVentana() : abrirVentana())}
      >
        {ventanaAbierta ? <X className="size-6" /> : <MessageCircle className="size-6" />}

        {!ventanaAbierta && sinLeer > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white ring-2 ring-background">
            {sinLeer > 99 ? "99+" : sinLeer}
          </span>
        )}
      </button>
    </>
  );
}
