<?php

declare(strict_types=1);

namespace App\Events;

use App\Models\User;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/**
 * PruebaDeTiempoReal — un aviso de prueba para comprobar la tubería.
 * ---------------------------------------------------------------------
 * Lo mandan `php artisan tiempo-real:probar {correo}` y la pantalla de
 * pruebas del administrador, y la interfaz lo enseña como un aviso
 * flotante. Recorre el mismo camino que recorrerán los avisos de verdad
 * —backend → Reverb → nginx → navegador, por el canal privado de cada
 * persona—, así que si este llega, un aviso real que no llega no es
 * cosa de la tubería.
 *
 * Va con ShouldBroadcastNow, sin pasar por la cola, a propósito: se
 * prueba un demonio cada vez. Si fuera por la cola y no llegase, no se
 * sabría si ha fallado Reverb o el trabajador.
 *
 * Varios destinatarios salen en UNA sola llamada a Reverb (un evento
 * con varios canales), no en una por persona.
 */
class PruebaDeTiempoReal implements ShouldBroadcastNow
{
    /**
     * @param  list<User>  $destinatarios
     * @param  ?string  $enviadoPor  el nombre, no el modelo: es lo único que viaja
     */
    public function __construct(
        public readonly array $destinatarios,
        public readonly ?string $titulo = null,
        public readonly ?string $mensaje = null,
        public readonly ?string $enviadoPor = null,
    ) {}

    /** @return list<PrivateChannel> */
    public function broadcastOn(): array
    {
        return array_map(
            fn (User $destinatario): PrivateChannel => new PrivateChannel('usuario.'.$destinatario->id),
            $this->destinatarios,
        );
    }

    /** La interfaz lo escucha como `.prueba-de-conexion`. */
    public function broadcastAs(): string
    {
        return 'prueba-de-conexion';
    }

    /**
     * Sin esto, Laravel mandaría las propiedades públicas del evento, es
     * decir, los modelos enteros de los destinatarios.
     *
     * La hora va con milisegundos: la pantalla de pruebas la usa para
     * enseñar cuánto tardó el aviso en llegar.
     *
     * @return array<string, ?string>
     */
    public function broadcastWith(): array
    {
        return [
            'titulo' => $this->titulo,
            'mensaje' => $this->mensaje,
            'enviadoPor' => $this->enviadoPor,
            'enviadaEn' => now()->format(DATE_RFC3339_EXTENDED),
        ];
    }
}
