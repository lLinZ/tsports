/**
 * main.tsx
 * ---------------------------------------------------------------------
 * Punto de entrada del frontend. Monta el árbol de React dentro de
 * #root envolviéndolo en los proveedores globales (HeroUI, tema,
 * enrutador, caché de datos y sesión).
 * ---------------------------------------------------------------------
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/App";
import "@/index.css";
import { prepararLosSonidos } from "@/utilidades/sonidos";

// El navegador no deja sonar nada hasta el primer clic o tecla: el audio
// queda listo en ese gesto (ver utilidades/sonidos.ts).
prepararLosSonidos();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
