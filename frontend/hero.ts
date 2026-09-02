/**
 * hero.ts
 * ---------------------------------------------------------------------
 * Plugin de tema de HeroUI para Tailwind CSS v4.
 *
 * Aquí se define la paleta base de TS Sports (azul marino corporativo +
 * turquesa) y el radio de las esquinas, que en todo el sistema es
 * generoso y redondeado. El color de acento personal de cada usuario se
 * inyecta encima en tiempo de ejecución mediante variables CSS
 * (ver src/providers/ProveedorTema.tsx), así que estos valores son
 * únicamente el punto de partida.
 * ---------------------------------------------------------------------
 */
import { heroui } from "@heroui/theme";

export default heroui({
  // Todos los componentes heredan esquinas muy redondeadas (estilo bento).
  layout: {
    radius: { small: "0.625rem", medium: "0.875rem", large: "1.25rem" },
    borderWidth: { small: "1px", medium: "1px", large: "2px" },
  },
  themes: {
    light: {
      colors: {
        background: "#f6f8fb",
        foreground: "#0a1f3c",
        primary: {
          50: "#e6f7f9", 100: "#c3ecf1", 200: "#9ce0e8", 300: "#6fd2dd",
          400: "#41c1cf", 500: "#1b9aaa", 600: "#157e8c", 700: "#10626d",
          800: "#0b464e", 900: "#062a2f",
          DEFAULT: "#1b9aaa", foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#0a1f3c", foreground: "#ffffff",
        },
        success: { DEFAULT: "#16c79a", foreground: "#04231b" },
        focus: "#1b9aaa",
      },
    },
    dark: {
      colors: {
        background: "#080d16",
        foreground: "#e8eef7",
        content1: "#0f1826",
        content2: "#162133",
        content3: "#1e2c42",
        content4: "#273750",
        primary: {
          50: "#062a2f", 100: "#0b464e", 200: "#10626d", 300: "#157e8c",
          400: "#1b9aaa", 500: "#41c1cf", 600: "#6fd2dd", 700: "#9ce0e8",
          800: "#c3ecf1", 900: "#e6f7f9",
          DEFAULT: "#2bb8c9", foreground: "#04181c",
        },
        secondary: { DEFAULT: "#8fa9d0", foreground: "#080d16" },
        success: { DEFAULT: "#16c79a", foreground: "#04231b" },
        focus: "#2bb8c9",
      },
    },
  },
});
