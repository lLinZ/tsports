<?php

declare(strict_types=1);

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * CambioEnLosDatos — «lo que tienes en pantalla ha cambiado».
 * ---------------------------------------------------------------------
 * Es lo que pone al día solas las pantallas del panel (tablero, resumen,
 * calendario, ficha abierta, propiedades…) cuando otra persona cambia
 * algo. Lo arma y lo envía App\Support\CambiosEnVivo, una vez por
 * petición; ver allí a quién le llega cada cambio.
 *
 * NO LLEVA DATOS, solo qué cambió: `{entidad: 'marca', id: '…'}`. Cada
 * navegador vuelve a pedir lo que tenga a la vista con su propia sesión,
 * igual que el chat (CambioEnElChat). Mandar los datos obligaría a
 * armarlos para cada persona —un agente no ve lo mismo que un comercial
 * (regla 6)— y a repetir aquí lo que ya decide cada controlador.
 *
 * Viaja por el canal privado de cada persona (`usuario.{id}`), el mismo
 * de la campanita, así que no hay canales nuevos que autorizar.
 *
 * `InteractsWithSockets` sirve para no mandárselo a la pestaña que hizo
 * el cambio (cabecera `X-Socket-ID`): esa ya refresca lo suyo al terminar
 * de guardar, y recibirlo le haría pedir los mismos datos dos veces. Sus
 * OTRAS pestañas sí lo reciben.
 *
 * Sin cola (ShouldBroadcastNow), como el resto: Reverb está en la misma
 * máquina y esto sale ya con la respuesta entregada.
 */
class CambioEnLosDatos implements ShouldBroadcastNow
{
    use Dispatchable;
    use InteractsWithSockets;

    /**
     * @param  list<string>  $idsDeDestinatarios
     * @param  list<array{entidad:string,id:?string}>  $cambios
     */
    public function __construct(
        public readonly array $idsDeDestinatarios,
        public readonly array $cambios,
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
        return 'datos';
    }

    /**
     * @return array<string,mixed>
     */
    public function broadcastWith(): array
    {
        return ['cambios' => $this->cambios];
    }
}
