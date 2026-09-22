<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\Notificacion;
use App\Models\SuscripcionPush;
use App\Support\Push;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * EnviarAvisoPush — lleva un aviso ya guardado a los móviles de quien lo
 * recibió.
 * ---------------------------------------------------------------------
 * POR QUÉ ESTO ES UN TRABAJO EN COLA Y NO UNA LÍNEA MÁS EN EL NOTIFICADOR
 *
 * Cada push es una petición de red A UN SERVIDOR DE OTRO (el de Google,
 * el de Mozilla, el de Apple), y una persona puede tener el móvil y el
 * portátil. Hacerlo dentro de la petición significaría que asignar una
 * marca tarda lo que tarde el servidor de Google esa tarde. Con la cola,
 * la petición contesta al instante y el aviso sale por detrás.
 *
 * Y NO PASA NADA SI ESTO NO CORRE. La notificación ya está guardada
 * antes de encolar esto: sin trabajador de colas, el aviso espera en la
 * campanita igual que ha hecho siempre. El push es una salida más del
 * mismo registro, nunca la única.
 *
 * SE GUARDA EL ID, NO EL OBJETO. Si entre encolar y enviar la
 * notificación se borró, no hay nada que mandar y el trabajo termina
 * tranquilo.
 */
class EnviarAvisoPush implements ShouldQueue
{
    use Queueable;

    /**
     * Un solo intento.
     *
     * Reintentar un push no tiene sentido: el aviso ya está guardado y
     * la persona lo verá al entrar. Lo que sí tendría consecuencias es
     * reintentar y acabar mandando el mismo aviso tres veces al teléfono
     * de alguien.
     */
    public int $tries = 1;

    public function __construct(private readonly string $idDeLaNotificacion) {}

    public function handle(): void
    {
        if (! Push::estaActivo()) {
            return;
        }

        $notificacion = Notificacion::find($this->idDeLaNotificacion);

        if ($notificacion === null) {
            return;
        }

        // Si le dio tiempo a leerla en el panel antes de que llegase su
        // turno en la cola, no hay que hacerle sonar el teléfono.
        if ($notificacion->estaLeida()) {
            return;
        }

        $suscripciones = SuscripcionPush::query()
            ->where('usuario_id', $notificacion->destinatario_id)
            ->get();

        if ($suscripciones->isEmpty()) {
            return;
        }

        try {
            $muertos = Push::enviar($suscripciones, $notificacion);
        } catch (Throwable $error) {
            // El aviso está guardado; que el envío falle no puede dejar
            // el trabajo en la tabla de fallidos ni disparar alarmas.
            Log::warning('No se pudo enviar el aviso al móvil.', [
                'notificacion' => $notificacion->id,
                'error' => $error->getMessage(),
            ]);

            return;
        }

        if ($muertos !== []) {
            // Navegadores que ya no existen: desinstalaron la aplicación,
            // limpiaron los datos del sitio o quitaron el permiso.
            SuscripcionPush::query()->whereIn('endpoint', $muertos)->delete();
        }
    }
}
