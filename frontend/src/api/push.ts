/**
 * api/push.ts
 * ---------------------------------------------------------------------
 * Los avisos al móvil con el panel cerrado: dar de alta y de baja ESTE
 * navegador.
 *
 * Quién recibe qué no se decide aquí ni en ninguna pantalla: lo decide
 * `App\Support\Notificador` en el servidor, igual que con la campanita.
 * Esto es solo la libreta de direcciones.
 * ---------------------------------------------------------------------
 */
import { clienteHttp } from "@/api/clienteHttp";

/** Si el servidor puede mandar avisos al móvil, y con qué clave. */
export interface ConfiguracionDelPush {
  activo: boolean;
  /** Clave pública VAPID. No es secreta: el navegador la necesita. */
  clavePublica: string | null;
}

export async function obtenerConfiguracionDelPush(): Promise<ConfiguracionDelPush> {
  const { data } = await clienteHttp.get<ConfiguracionDelPush>("/push");

  return data;
}

/**
 * Lo que el navegador entrega al aceptar los avisos.
 *
 * `p256dh` y `auth` se llaman así porque así los llama el estándar del
 * Push API; traducirlos aquí obligaría a destraducirlos en el servidor.
 * Las dos son claves DEL NAVEGADOR y sirven para cifrar el contenido,
 * de modo que el servicio de entrega transporte algo que no puede leer.
 */
export interface SuscripcionParaGuardar {
  endpoint: string;
  p256dh: string;
  auth: string;
  dispositivo: string | null;
}

export async function guardarSuscripcionDePush(
  suscripcion: SuscripcionParaGuardar,
): Promise<void> {
  await clienteHttp.post("/push/suscripciones", suscripcion);
}

export async function borrarSuscripcionDePush(endpoint: string): Promise<void> {
  // El cuerpo de un DELETE va en `data` con axios.
  await clienteHttp.delete("/push/suscripciones", { data: { endpoint } });
}

/**
 * Quita este dispositivo de la libreta del servidor al cerrar sesión.
 *
 * Es lo que evita que, en el ordenador compartido de la oficina, los
 * avisos de quien acaba de salir le suenen al siguiente.
 *
 * NO se cancela la suscripción en el navegador, solo se borra la fila
 * del servidor. La diferencia importa: dejándola viva, cuando esa misma
 * persona vuelva a entrar en SU teléfono el registro se rehace solo y no
 * hay que volver a pedirle nada. Si se cancelara, tendría que activarlo
 * a mano cada vez que caduca la sesión.
 *
 * Nunca lanza. Cerrar sesión tiene que funcionar aunque no haya red.
 */
export async function darDeBajaEsteDispositivo(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;

    const registro = await navigator.serviceWorker.getRegistration("/");
    const suscripcion = await registro?.pushManager.getSubscription();

    if (suscripcion) {
      await borrarSuscripcionDePush(suscripcion.endpoint);
    }
  } catch {
    /* Sin red, o sin suscripción: no hay nada más que hacer aquí. */
  }
}
