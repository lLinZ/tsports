/**
 * paginas/PaginaChat.tsx
 * ---------------------------------------------------------------------
 * El chat a pantalla completa: la lista de charlas a la izquierda y la
 * charla abierta a la derecha. Es la misma pieza que la ventana
 * flotante (PanelDelChat), con más sitio.
 *
 * La charla abierta va en la dirección (`/chat/<id>`), y no en un estado
 * de la pantalla, por tres motivos: el aviso al móvil lleva ahí
 * directamente, el botón de atrás del navegador vuelve a la lista, y el
 * enlace se puede pasar a un compañero (que solo la abrirá si está
 * dentro de la charla: lo comprueba el servidor).
 * ---------------------------------------------------------------------
 */
import { useNavigate, useParams } from "react-router-dom";
import { PanelDelChat } from "@/componentes/chat/PanelDelChat";

export function PaginaChat() {
  const { idDeLaConversacion } = useParams<{ idDeLaConversacion?: string }>();
  const navegar = useNavigate();

  return (
    <div className="bento-card alto-del-chat overflow-hidden">
      <PanelDelChat
        alElegirConversacion={(id) => navegar(id === null ? "/chat" : `/chat/${id}`)}
        idDeLaConversacion={idDeLaConversacion ?? null}
        modo="pagina"
      />
    </div>
  );
}
