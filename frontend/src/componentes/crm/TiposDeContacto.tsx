/**
 * componentes/crm/TiposDeContacto.tsx
 * ---------------------------------------------------------------------
 * Los cuatro tipos de contacto —llamada, WhatsApp, reunión y correo—
 * con su icono. Salen en tres sitios y por eso viven aquí:
 *
 *   · «Contacté»: cómo fue el contacto y qué toca después.
 *   · El recordatorio de la ficha: qué hay que hacer ese día.
 *   · El reporte «Lo que viene»: la etiqueta de cada cosa planificada.
 *
 * La lista es la misma que App\Enums\TipoDeContacto, y las notas por
 * defecto son las que pone el servidor cuando no se escribe ninguna
 * (TipoDeContacto::notaDelSiguientePaso). Lo que se enseña de un
 * recordatorio ya guardado lleva su etiqueta del servidor; esto es para
 * elegir.
 * ---------------------------------------------------------------------
 */
import { Mail, MessageCircle, Phone, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { TipoDeContacto } from "@/tipos/modelos";

export const TIPOS_DE_CONTACTO: Array<{
  valor: TipoDeContacto;
  etiqueta: string;
  icono: ReactNode;
  /** La que pone el servidor al siguiente paso si no se escribe otra. */
  notaPorDefecto: string;
}> = [
  { valor: "llamada", etiqueta: "Llamada", icono: <Phone className="size-3.5" />, notaPorDefecto: "Volver a llamar" },
  {
    valor: "whatsapp",
    etiqueta: "WhatsApp",
    icono: <MessageCircle className="size-3.5" />,
    notaPorDefecto: "Volver a escribir por WhatsApp",
  },
  { valor: "reunion", etiqueta: "Reunión", icono: <Users className="size-3.5" />, notaPorDefecto: "Reunión de seguimiento" },
  { valor: "correo", etiqueta: "Correo", icono: <Mail className="size-3.5" />, notaPorDefecto: "Volver a escribir" },
];

/** El icono de un tipo, para una lista; nada si no lleva tipo. */
export function IconoDelTipo({ tipo, className = "size-3.5" }: { tipo: TipoDeContacto | null | undefined; className?: string }) {
  switch (tipo) {
    case "llamada":
      return <Phone className={className} />;
    case "whatsapp":
      return <MessageCircle className={className} />;
    case "reunion":
      return <Users className={className} />;
    case "correo":
      return <Mail className={className} />;
    default:
      return null;
  }
}
