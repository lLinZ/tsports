<?php

declare(strict_types=1);

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * CambioEnElChat — «algo se movió en esta charla»: un mensaje nuevo,
 * alguien leyó, cambió el grupo.
 * ---------------------------------------------------------------------
 * Viaja por el canal privado de cada participante (`usuario.{id}`), el
 * mismo de la campanita, así que no hace falta autorizar canales nuevos
 * y nadie de fuera de la charla se entera ni de que existe.
 *
 * NO LLEVA EL MENSAJE, solo de qué charla es y qué pasó. Cada navegador
 * lo pide después con su propia sesión, y es a propósito: el mensaje se
 * pinta distinto según quién lo mire —una marca etiquetada solo lleva
 * logo y enlace para quien puede abrirla—, y mandar el mismo contenido
 * a todos obligaría a mandar lo de quien más ve.
 *
 * Sin cola (ShouldBroadcastNow), como NotificacionNueva: Reverb está en
 * la misma máquina. Si falla, quien lo lanza se traga el error: el
 * mensaje ya está guardado y el sondeo del navegador lo traerá.
 */
class CambioEnElChat implements ShouldBroadcastNow
{
    use Dispatchable;

    public const TIPO_MENSAJE = 'mensaje';

    public const TIPO_LEIDO = 'leido';

    public const TIPO_CONVERSACION = 'conversacion';

    /**
     * @param  list<string>  $idsDeDestinatarios
     */
    public function __construct(
        public readonly array $idsDeDestinatarios,
        public readonly string $tipo,
        public readonly string $idDeLaConversacion,
        public readonly ?int $idDelMensaje = null,
    ) {}

    /** @return list<PrivateChannel> */
    public function broadcastOn(): array
    {
        return array_map(
            fn (string $idDeUsuario): PrivateChannel => new PrivateChannel('usuario.'.$idDeUsuario),
            $this->idsDeDestinatarios,
        );
    }

    public function broadcastAs(): string
    {
        return 'chat';
    }

    /**
     * @return array<string,mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'tipo' => $this->tipo,
            'conversacionId' => $this->idDeLaConversacion,
            'mensajeId' => $this->idDelMensaje,
        ];
    }
}
