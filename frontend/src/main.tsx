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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
