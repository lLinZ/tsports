/**
 * utilidades/iconosDeAvisos.ts
 * ---------------------------------------------------------------------
 * El icono de cada aviso, el mismo en la campanita, en la pantalla
 * «Avisos» y en los ajustes de cada persona. Un tipo que la interfaz aún
 * no conozca (un servidor más nuevo que la pestaña) sale con la campana.
 * ---------------------------------------------------------------------
 */
import {
  AlarmClock,
  AtSign,
  Bell,
  Globe,
  MessageCircle,
  MessageSquare,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import type { TipoDeAviso } from "@/tipos/modelos";

const ICONOS_POR_TIPO: Partial<Record<TipoDeAviso, LucideIcon>> = {
  lead_nuevo: Globe,
  marca_asignada: UserCheck,
  mencion_en_bitacora: AtSign,
  comentario_en_bitacora: MessageSquare,
  recordatorios_del_dia: AlarmClock,
  mensaje_de_chat: MessageCircle,
};

export function iconoDelAviso(tipo: TipoDeAviso | string): LucideIcon {
  return ICONOS_POR_TIPO[tipo as TipoDeAviso] ?? Bell;
}
