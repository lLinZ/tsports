/**
 * componentes/chat/SelectorDeEmoji.tsx
 * ---------------------------------------------------------------------
 * El botón de la carita del chat y su panel de emojis.
 *
 * UNA LISTA ESCOGIDA A MANO, NO UNA LIBRERÍA. Un selector de emoji
 * completo son cientos de kilobytes de datos y de código que se
 * descargarían aunque nadie lo abriera, y la mayoría trae CSS moderno
 * que en el Chrome 103 de parte del equipo se ve roto. Aquí van unos
 * trescientos, por grupos, pensados para un equipo comercial deportivo:
 * caras y gestos, deporte, trabajo y símbolos de «hecho / pendiente».
 * En el móvil, además, el teclado del teléfono ya trae los suyos.
 *
 * Sin banderas: Windows no las dibuja y saldrían dos letras sueltas.
 *
 * Los últimos usados se recuerdan en este navegador (`tsports:emojis`)
 * y abren el panel: es lo que más se repite.
 * ---------------------------------------------------------------------
 */
import { Button, Popover, PopoverContent, PopoverTrigger, Tooltip } from "@heroui/react";
import { Smile } from "lucide-react";
import { useState } from "react";

const CLAVE_DE_LOS_RECIENTES = "tsports:emojis";
const CUANTOS_RECIENTES = 24;

const GRUPOS: Array<{ nombre: string; icono: string; emojis: string }> = [
  {
    nombre: "Caras",
    icono: "😀",
    emojis:
      "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 😴 😷 🤒 🥵 🥶 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😢 😭 😱 😖 😣 😞 😓 😩 😫 😤 😡 😠 🤬 😈 💩 🤡 👻 🤖",
  },
  {
    nombre: "Gestos",
    icono: "👍",
    emojis:
      "👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 💪 ✍️ 👀 🧠 🙋 🙆 🙅 🤷 🤦 💁",
  },
  {
    nombre: "Corazones",
    icono: "❤️",
    emojis: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟",
  },
  {
    nombre: "Deporte",
    icono: "⚽",
    emojis:
      "⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🏓 🏸 🏒 🏑 🥍 🏏 ⛳ 🥊 🥋 🎽 🛹 ⛸️ 🎿 🏋️ 🤸 ⛹️ 🤾 🏊 🚴 🏃 🧗 🏇 🏆 🥇 🥈 🥉 🏅 🎖️ 🏟️ 📣 🎯 🏁",
  },
  {
    nombre: "Trabajo",
    icono: "💼",
    emojis:
      "💼 📈 📉 📊 📅 📆 🗓️ ⏰ ⏳ ⌛ 📌 📍 📎 🖇️ ✏️ 📝 📋 📁 📂 🗂️ 🗃️ 💡 🔔 📢 📞 ☎️ 📱 💻 🖥️ 🖨️ 📧 ✉️ 📨 📩 📤 📥 💰 💵 💳 🧾 🏦 🚀 🎤 🎬 📸 🎥 📺 🎟️ 🎫 🎁 🏢 🚗 ✈️ 🧳",
  },
  {
    nombre: "Símbolos",
    icono: "✅",
    emojis:
      "✅ ☑️ ✔️ ❌ ❎ ⚠️ 🚫 ⛔ ❗ ❓ ‼️ ⁉️ 💯 🔥 ⭐ 🌟 ✨ ⚡ 💥 🎉 🎊 💬 💭 🗯️ 🆕 🆗 🆙 🔝 🔜 ➡️ ⬅️ ⬆️ ⬇️ 🔄 🔁 ➕ ➖ 🟢 🟡 🔴 🔵 ⚪ ⚫ 🏷️ 🔒 🔓 🔑",
  },
  {
    nombre: "Comida y ocio",
    icono: "☕",
    emojis: "☕ 🍵 🥤 🍺 🍻 🥂 🍷 🍾 🍕 🍔 🌭 🌮 🥪 🍟 🍩 🍪 🎂 🍰 🍫 🍿 🥐 🍎 🍊 🍌 🌴 🌞 🌧️ ⛈️ 🌈 🎶 🎮 🎲",
  },
];

function leerRecientes(): string[] {
  try {
    const guardados = JSON.parse(localStorage.getItem(CLAVE_DE_LOS_RECIENTES) ?? "[]");

    return Array.isArray(guardados) ? guardados.filter((emoji) => typeof emoji === "string") : [];
  } catch {
    return [];
  }
}

function guardarReciente(emoji: string): void {
  try {
    const recientes = [emoji, ...leerRecientes().filter((guardado) => guardado !== emoji)].slice(
      0,
      CUANTOS_RECIENTES,
    );

    localStorage.setItem(CLAVE_DE_LOS_RECIENTES, JSON.stringify(recientes));
  } catch {
    /* Sin almacenamiento, simplemente no se recuerdan. */
  }
}

export function SelectorDeEmoji({
  alElegir,
  alCerrar,
  deshabilitado = false,
}: {
  alElegir: (emoji: string) => void;
  /** Al cerrar el panel, para devolver el foco al cuadro de texto. */
  alCerrar?: () => void;
  deshabilitado?: boolean;
}) {
  const [estaAbierto, establecerAbierto] = useState(false);
  const [recientes, establecerRecientes] = useState<string[]>([]);
  const [grupoElegido, establecerGrupoElegido] = useState<string>("recientes");

  const grupos = [
    ...(recientes.length > 0 ? [{ nombre: "Recientes", icono: "🕘", emojis: recientes.join(" "), clave: "recientes" }] : []),
    ...GRUPOS.map((grupo) => ({ ...grupo, clave: grupo.nombre })),
  ];

  const grupoVisible = grupos.find((grupo) => grupo.clave === grupoElegido) ?? grupos[0];

  function elegir(emoji: string) {
    guardarReciente(emoji);
    alElegir(emoji);
    // Se queda abierto: se suelen poner dos o tres seguidos.
  }

  return (
    <Popover
      isOpen={estaAbierto}
      placement="top-start"
      onOpenChange={(abierto) => {
        if (abierto) {
          const guardados = leerRecientes();
          establecerRecientes(guardados);
          establecerGrupoElegido(guardados.length > 0 ? "recientes" : GRUPOS[0].nombre);
        } else {
          alCerrar?.();
        }
        establecerAbierto(abierto);
      }}
    >
      <PopoverTrigger>
        <Button
          isIconOnly
          aria-label="Poner un emoji"
          isDisabled={deshabilitado}
          radius="full"
          size="sm"
          variant="light"
        >
          <Smile className="size-5 text-default-500" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[19rem] max-w-[calc(100vw-2rem)] p-0">
        <div className="flex w-full flex-col">
          <div className="flex gap-0.5 overflow-x-auto border-b border-default-100 px-1.5 py-1">
            {grupos.map((grupo) => (
              <Tooltip key={grupo.clave} content={grupo.nombre} placement="top">
                <button
                  aria-label={grupo.nombre}
                  className={[
                    "flex size-8 shrink-0 items-center justify-center rounded-lg text-lg transition",
                    grupo.clave === grupoVisible.clave ? "bg-default-100" : "opacity-60 hover:opacity-100",
                  ].join(" ")}
                  type="button"
                  onClick={() => establecerGrupoElegido(grupo.clave)}
                >
                  {grupo.icono}
                </button>
              </Tooltip>
            ))}
          </div>

          <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-default-400">
            {grupoVisible.nombre}
          </p>

          <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto p-1.5">
            {grupoVisible.emojis.split(" ").filter(Boolean).map((emoji) => (
              <button
                key={emoji}
                aria-label={emoji}
                className="flex aspect-square items-center justify-center rounded-lg text-xl transition hover:bg-default-100"
                type="button"
                onClick={() => elegir(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
