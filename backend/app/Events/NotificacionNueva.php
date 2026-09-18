<?php

declare(strict_types=1);

namespace App\Events;

use App\Http\Resources\RecursoNotificacion;
use App\Models\Notificacion;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * NotificacionNueva — empuja un aviso recién guardado a quien lo recibe.
 * ---------------------------------------------------------------------
 * Viaja por el canal privado de la persona (`usuario.{id}`), el mismo
 * que ya autoriza `routes/channels.php`: nadie recibe avisos ajenos.
 *
 * Lleva el aviso entero, con la misma forma que el listado, para que la
 * campanita pueda enseñarlo sin volver a preguntar.
 *
 * SIN COLA, A PROPÓSITO
 * Se envía en el momento (ShouldBroadcastNow): Reverb está en la misma
 * máquina y contesta en milisegundos, y así el aviso no depende de que
 * el trabajador de la cola esté vivo. Si Reverb falla, quien lo envía
 * (`App\Support\Notificador`) se traga el error: el aviso ya está
 * guardado y se verá al entrar.
 */
class NotificacionNueva implements ShouldBroadcastNow
{
    use Dispatchable;

    public function __construct(public readonly Notificacion $notificacion) {}

    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('usuario.'.$this->notificacion->destinatario_id);
    }

    public function broadcastAs(): string
    {
        return 'notificacion-nueva';
    }

    /**
     * @return array<string,mixed>
     */
    public function broadcastWith(): array
    {
        return (new RecursoNotificacion($this->notificacion))->resolve();
    }
}
