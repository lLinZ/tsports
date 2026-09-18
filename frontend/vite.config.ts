/**
 * vite.config.ts
 * ---------------------------------------------------------------------
 * Configuración del bundler del frontend (React + TypeScript + HeroUI).
 *
 * Qué resuelve este fichero:
 *  · Registra el plugin de React y el de Tailwind CSS v4.
 *  · Crea el alias "@" para importar desde src/ sin rutas relativas largas.
 *  · Redirige en desarrollo las llamadas a /api hacia el backend Laravel,
 *    de modo que el navegador ve un único origen y no hay problemas de CORS.
 *  · Hace lo mismo con el WebSocket de Reverb (/app/), para que en local
 *    el tiempo real se conecte igual que en el VPS, donde lo reenvía nginx.
 * ---------------------------------------------------------------------
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// URL donde escucha el backend Laravel durante el desarrollo local.
const URL_BACKEND_LOCAL = "http://127.0.0.1:8000";

// Donde escucha `php artisan reverb:start` en local (REVERB_SERVER_PORT).
const URL_REVERB_LOCAL = "ws://127.0.0.1:8080";

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  server: {
    port: 5173,
    proxy: {
      // Todo lo que empiece por /api viaja al Laravel local.
      "/api": { target: URL_BACKEND_LOCAL, changeOrigin: true },
      // Las imágenes subidas se sirven desde storage/ del backend.
      "/storage": { target: URL_BACKEND_LOCAL, changeOrigin: true },
      // El WebSocket del tiempo real. Con expresión regular y la barra
      // final para no llevarse por delante nada que solo empiece por
      // "/app" (ningún recurso de la aplicación, pero por si acaso).
      "^/app/": { target: URL_REVERB_LOCAL, ws: true },
    },
  },

  build: {
    outDir: "dist",
    sourcemap: false,
    // El CSS tiene que funcionar en Chrome 103, que es el tope en macOS
    // 10.12 y lo usa al menos un Mac del equipo. Tailwind v4 escribe las
    // media queries con la sintaxis de rango, `(width >= 64rem)`, que
    // Chrome no entiende hasta la 104: sin esta línea, allí no se aplica
    // ningún `sm:`/`lg:` y el panel entero sale con la maqueta de móvil
    // (sin barra lateral ni columna de bitácora). Lightning CSS, el
    // minificador de Vite, las reescribe como `min-width` para ese
    // destino. Lo que no sabe reescribir va en index.css
    // («Navegadores antiguos»).
    cssTarget: ["chrome103", "safari15", "firefox115", "edge103"],
    // Separamos las librerías grandes en paquetes aparte para que el
    // navegador las cachee entre despliegues y la carga inicial sea menor.
    rollupOptions: {
      output: {
        manualChunks(rutaDelModulo: string) {
          if (!rutaDelModulo.includes("node_modules")) return undefined;
          if (/[\/]node_modules[\/](react|react-dom|react-router)/.test(rutaDelModulo)) {
            return "vendor-react";
          }
          if (/[\/]node_modules[\/](@heroui|framer-motion|@react-aria|@react-stately)/.test(rutaDelModulo)) {
            return "vendor-heroui";
          }
          return "vendor";
        },
      },
    },
  },
});
