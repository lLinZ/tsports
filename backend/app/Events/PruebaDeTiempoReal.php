<?php

declare(strict_types=1);

namespace App\Events;

use App\Models\User;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/**
 * PruebaDeTiempoReal — un aviso sin contenido para comprobar la tubería.
 * ---------------------------------------------------------------------
 * Lo manda `php artisan tiempo-real:probar {correo}` y la interfaz lo
 * enseña como un aviso flotante. Recorre el mismo camino que recorrerán
 * los avisos de verdad —backend → Reverb → nginx → navegador, por el
 * canal privado de la persona—, así que si este llega, un aviso real
 * que no llega no es cosa de la tubería.
 *
 * Va con ShouldBroadcastNow, sin pasar por la cola, a propósito: se
 * prueba un demonio cada vez. Si fuera por la cola y no llegase, no se
 * sabría si ha fallado Reverb o el trabajador.
 */
class PruebaDeTiempoReal implements ShouldBroadcastNow
{
    public function __construct(public readonly User $destinatario) {}

    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('usuario.'.$this->destinatario->id);
    }

    /** La interfaz lo escucha como `.prueba-de-conexion`. */
    public function broadcastAs(): string
    {
        return 'prueba-de-conexion';
    }

    /**
     * Sin esto, Laravel mandaría las propiedades públicas del evento, es
     * decir, el modelo entero de la persona.
     *
     * @return array<string, string>
     */
    public function broadcastWith(): array
    {
        return ['enviadaEn' => now()->toIso8601String()];
    }
}
