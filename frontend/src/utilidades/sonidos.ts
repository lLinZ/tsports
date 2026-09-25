/**
 * utilidades/sonidos.ts
 * ---------------------------------------------------------------------
 * Los dos sonidos del panel: el «ding» de un aviso nuevo de la campanita
 * y el «pop» de un mensaje del chat.
 *
 * SE GENERAN, NO SE DESCARGAN. Salen de la Web Audio API con dos o tres
 * osciladores: ningún fichero que servir ni que el service worker tenga
 * que guardar, ninguna licencia de por medio, y suenan igual en el
 * Chrome 103 del equipo que en uno actual.
 *
 * TRES CONDICIONES PARA SONAR:
 *   · Que la persona no los haya apagado en este dispositivo (menú de la
 *     cuenta). La preferencia es del aparato y no de la cuenta: quien
 *     quiere silencio en la oficina puede querer sonido en casa.
 *   · Que la pestaña esté a la vista. Con el panel escondido, el aviso ya
 *     llega como notificación del sistema, que suena por su cuenta: sonar
 *     aquí también lo haría dos veces.
 *   · Que la persona haya tocado la página al menos una vez. Es una regla
 *     de los navegadores contra la publicidad con sonido: hasta el primer
 *     clic o tecla, el audio está bloqueado. `prepararLosSonidos` deja el
 *     motor listo en ese primer gesto.
 *
 * Varios mensajes que llegan juntos suenan una vez: cada sonido tiene
 * una pausa mínima antes de poder repetirse.
 * ---------------------------------------------------------------------
 */

/** Dónde se guarda, en este dispositivo, si los sonidos están apagados. */
const CLAVE_DE_LA_PREFERENCIA = "tsports:sonidos";

/** Menos que esto entre dos sonidos iguales, y el segundo no suena. */
const PAUSA_MINIMA_MS = 700;

/** Volumen general: los avisos acompañan, no sobresaltan. */
const VOLUMEN = 0.22;

type ConstructorDeAudio = typeof AudioContext;

let motor: AudioContext | null = null;
const ultimaVez: Record<string, number> = {};

function constructorDeAudio(): ConstructorDeAudio | null {
  const ventana = window as unknown as {
    AudioContext?: ConstructorDeAudio;
    webkitAudioContext?: ConstructorDeAudio;
  };

  return ventana.AudioContext ?? ventana.webkitAudioContext ?? null;
}

function elMotor(): AudioContext | null {
  if (motor !== null) return motor;

  const Constructor = constructorDeAudio();
  if (Constructor === null) return null;

  try {
    motor = new Constructor();
  } catch {
    return null;
  }

  return motor;
}

/**
 * Deja el audio desbloqueado en el primer gesto de la persona. Se llama
 * una vez al arrancar la aplicación; los escuchadores se quitan solos.
 */
export function prepararLosSonidos(): void {
  const eventos = ["pointerdown", "keydown", "touchstart"] as const;

  const desbloquear = () => {
    const contexto = elMotor();
    if (contexto !== null && contexto.state === "suspended") {
      void contexto.resume().catch(() => undefined);
    }
    for (const evento of eventos) window.removeEventListener(evento, desbloquear, true);
  };

  for (const evento of eventos) {
    window.addEventListener(evento, desbloquear, { capture: true, passive: true });
  }
}

/* ==================================================================== */
/* La preferencia                                                      */
/* ==================================================================== */

export function sonidosActivados(): boolean {
  try {
    return localStorage.getItem(CLAVE_DE_LA_PREFERENCIA) !== "apagados";
  } catch {
    return true;
  }
}

export function guardarSonidosActivados(activados: boolean): void {
  try {
    if (activados) localStorage.removeItem(CLAVE_DE_LA_PREFERENCIA);
    else localStorage.setItem(CLAVE_DE_LA_PREFERENCIA, "apagados");
  } catch {
    /* Almacenamiento bloqueado: la preferencia dura lo que la pestaña. */
  }
}

/* ==================================================================== */
/* Los sonidos                                                         */
/* ==================================================================== */

/**
 * Si este sonido puede sonar ahora. Anota la hora si la respuesta es sí.
 *
 * `esUnaPrueba` es el sonido de muestra al encenderlos desde el menú: la
 * persona acaba de pulsar, así que la pestaña está delante y el gesto
 * vale para desbloquear el audio aunque sea el primero.
 */
function puedeSonar(nombre: string, esUnaPrueba: boolean): AudioContext | null {
  if (!esUnaPrueba && !sonidosActivados()) return null;
  if (!esUnaPrueba && document.visibilityState !== "visible") return null;

  const ahora = Date.now();
  if (ahora - (ultimaVez[nombre] ?? 0) < PAUSA_MINIMA_MS) return null;

  const contexto = elMotor();
  if (contexto === null) return null;

  if (contexto.state === "suspended") {
    // Sin un gesto de la persona, el navegador no dejaría sonar nada y
    // el intento solo ensuciaría la consola. En la prueba sí lo hay.
    if (!esUnaPrueba) return null;
    void contexto.resume().catch(() => undefined);
  }

  ultimaVez[nombre] = ahora;

  return contexto;
}

/** Una nota con ataque corto y caída suave. */
function nota(
  contexto: AudioContext,
  { frecuencia, empieza, dura, volumen, forma = "sine" }: {
    frecuencia: number;
    empieza: number;
    dura: number;
    volumen: number;
    forma?: OscillatorType;
  },
): void {
  const oscilador = contexto.createOscillator();
  const ganancia = contexto.createGain();
  const inicio = contexto.currentTime + empieza;

  oscilador.type = forma;
  oscilador.frequency.setValueAtTime(frecuencia, inicio);
  ganancia.gain.setValueAtTime(0.0001, inicio);
  ganancia.gain.exponentialRampToValueAtTime(volumen, inicio + 0.012);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + dura);

  oscilador.connect(ganancia).connect(contexto.destination);
  oscilador.start(inicio);
  oscilador.stop(inicio + dura + 0.02);
}

/**
 * «Ding» de dos notas (mi y si agudos), para un aviso nuevo de la
 * campanita: un lead de la web, una marca asignada, una mención.
 *
 * `esUnaPrueba`: la muestra que suena al encenderlos desde el menú.
 */
export function sonarAviso({ esUnaPrueba = false } = {}): void {
  const contexto = puedeSonar("aviso", esUnaPrueba);
  if (contexto === null) return;

  nota(contexto, { frecuencia: 1318.5, empieza: 0, dura: 0.45, volumen: VOLUMEN });
  nota(contexto, { frecuencia: 1975.5, empieza: 0.11, dura: 0.6, volumen: VOLUMEN * 0.8 });
  // Un armónico bajo, apenas audible, para que no suene a pitido.
  nota(contexto, { frecuencia: 659.25, empieza: 0, dura: 0.35, volumen: VOLUMEN * 0.25, forma: "triangle" });
}

/**
 * «Pop» corto, para un mensaje del chat: un tono que sube de golpe y se
 * apaga en una décima de segundo, como una burbuja.
 */
export function sonarMensaje(): void {
  const contexto = puedeSonar("mensaje", false);
  if (contexto === null) return;

  const oscilador = contexto.createOscillator();
  const ganancia = contexto.createGain();
  const inicio = contexto.currentTime;

  oscilador.type = "sine";
  oscilador.frequency.setValueAtTime(380, inicio);
  oscilador.frequency.exponentialRampToValueAtTime(1150, inicio + 0.06);
  ganancia.gain.setValueAtTime(0.0001, inicio);
  ganancia.gain.exponentialRampToValueAtTime(VOLUMEN * 1.3, inicio + 0.008);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.13);

  oscilador.connect(ganancia).connect(contexto.destination);
  oscilador.start(inicio);
  oscilador.stop(inicio + 0.15);
}
