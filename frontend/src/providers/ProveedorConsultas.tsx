/**
 * providers/ProveedorConsultas.tsx
 * ---------------------------------------------------------------------
 * La caché de datos del servidor (TanStack Query).
 *
 * Se encarga de que dos pantallas que necesitan la misma lista no la
 * pidan dos veces, de refrescar en segundo plano lo que se ha quedado
 * viejo y de no reintentar lo que no tiene sentido reintentar.
 *
 * Esa última parte es la que más se nota: si el servidor contesta 403
 * ("no tienes permiso"), volver a preguntar cuatro veces no va a cambiar
 * la respuesta y solo retrasa el mensaje que la persona necesita leer.
 * ---------------------------------------------------------------------
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { esErrorDeApi } from "@/api/clienteHttp";

/** Códigos que nunca mejoran reintentando: son decisiones del servidor. */
const CODIGOS_QUE_NO_SE_REINTENTAN = [400, 401, 403, 404, 422];

/** Cuántos segundos se considera "fresco" un dato antes de refrescarlo. */
const SEGUNDOS_HASTA_CONSIDERARLO_VIEJO = 30;

export function ProveedorConsultas({ children }: { children: ReactNode }) {
  // El cliente se crea una sola vez, dentro del estado: si se crease en
  // el cuerpo del componente, cada renderizado tiraría toda la caché.
  const [clienteDeConsultas] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: SEGUNDOS_HASTA_CONSIDERARLO_VIEJO * 1000,

            // Reintentar solo los fallos que pueden ser pasajeros (una
            // caída de red, un 500 momentáneo), y como mucho dos veces.
            retry: (numeroDeIntentos, error) => {
              if (esErrorDeApi(error) && error.codigoHttp !== null) {
                if (CODIGOS_QUE_NO_SE_REINTENTAN.includes(error.codigoHttp)) {
                  return false;
                }
              }

              return numeroDeIntentos < 2;
            },

            // Volver a la pestaña refresca los datos: el CRM lo usan
            // varias personas a la vez y conviene ver lo último.
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
          },

          mutations: {
            // Una escritura nunca se reintenta sola: podría duplicar una
            // marca o un comentario sin que nadie se entere.
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={clienteDeConsultas}>
      {children}
    </QueryClientProvider>
  );
}
