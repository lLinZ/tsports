/**
 * componentes/chat/AvataresDelChat.tsx
 * ---------------------------------------------------------------------
 * Las caras del chat: la de una persona, con su punto verde si está en
 * línea, y la de una charla (la de la otra persona o la de un grupo).
 *
 * Sin foto, el avatar lleva las iniciales sobre el COLOR DE PERFIL de
 * esa persona, el mismo que ve ella en su barra superior: así se
 * reconoce a cada uno en el chat igual que en el resto del panel.
 * ---------------------------------------------------------------------
 */
import { Users } from "lucide-react";
import { colorDeTextoLegibleSobre } from "@/theme/colorAcento";
import type { ConversacionDelChat, PersonaDelChat } from "@/tipos/modelos";
import { inicialesDe } from "@/utilidades/formato";

const TAMANOS = {
  sm: { caja: "size-7", letra: "text-[10px]", punto: "size-2.5" },
  md: { caja: "size-10", letra: "text-xs", punto: "size-3" },
  lg: { caja: "size-12", letra: "text-sm", punto: "size-3.5" },
} as const;

type Tamano = keyof typeof TAMANOS;

export function AvatarDePersona({
  persona,
  enLinea = false,
  tamano = "md",
}: {
  persona: Pick<PersonaDelChat, "nombre" | "colorAcento" | "urlAvatar">;
  enLinea?: boolean;
  tamano?: Tamano;
}) {
  const medidas = TAMANOS[tamano];
  const color = persona.colorAcento ?? "#1b9aaa";

  return (
    <span className={`relative inline-flex ${medidas.caja} shrink-0`}>
      {persona.urlAvatar ? (
        <img
          alt=""
          className={`${medidas.caja} rounded-full object-cover`}
          src={persona.urlAvatar}
        />
      ) : (
        <span
          className={`flex ${medidas.caja} items-center justify-center rounded-full font-bold ${medidas.letra}`}
          style={{ backgroundColor: color, color: `hsl(${colorDeTextoLegibleSobre(color)})` }}
        >
          {inicialesDe(persona.nombre)}
        </span>
      )}

      {enLinea && (
        <span
          aria-label="En línea"
          className={`absolute -bottom-0.5 -right-0.5 ${medidas.punto} rounded-full bg-success ring-2 ring-content1`}
          role="img"
        />
      )}
    </span>
  );
}

/**
 * La cara de una charla. Directa: la de la otra persona, con su punto de
 * «en línea». Grupo: un icono de grupo sobre el color de acento.
 */
export function AvatarDeConversacion({
  conversacion,
  idPropio,
  enLinea,
  tamano = "md",
}: {
  conversacion: ConversacionDelChat;
  idPropio: string;
  enLinea: Set<string>;
  tamano?: Tamano;
}) {
  const medidas = TAMANOS[tamano];

  if (conversacion.esGrupo) {
    return (
      <span
        className={`flex ${medidas.caja} shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-100/20 dark:text-primary-400`}
      >
        <Users className="size-1/2" />
      </span>
    );
  }

  const otra = conversacion.participantes.find((persona) => persona.id !== idPropio);

  if (otra === undefined) {
    return <AvatarDePersona persona={{ nombre: conversacion.nombre, colorAcento: null, urlAvatar: null }} tamano={tamano} />;
  }

  return <AvatarDePersona enLinea={enLinea.has(otra.id)} persona={otra} tamano={tamano} />;
}
