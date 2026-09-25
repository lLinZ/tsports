<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Support\ConexionesEnVivo;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response;
use Illuminate\Broadcasting\Broadcasters\PusherBroadcaster;
use Illuminate\Support\Facades\Broadcast;
use Pusher\Pusher;
use Tests\TestCase;

/**
 * Pruebas de cómo se lee la respuesta de Reverb a «¿quién está conectado?».
 * ---------------------------------------------------------------------
 * Reverb contesta con la forma de la API de Pusher, y esa forma cambia
 * con el resultado: con canales ocupados, `channels` es un OBJETO (el
 * nombre del canal es la clave); sin ninguno, una LISTA vacía. La
 * librería de Pusher solo sabe leer la primera y con la segunda lanzaba
 * un TypeError: la pantalla «Tiempo real» del administrador daba un 500
 * justo cuando no había nadie conectado. Se descubrió el 2026-09-25, al
 * encender Reverb en producción.
 *
 * Aquí no hay ningún Reverb: la petición la contesta un Guzzle de mentira
 * con el cuerpo tal y como lo manda Reverb.
 */
class ConexionesEnVivoTest extends TestCase
{
    public function test_sin_nadie_conectado_devuelve_una_lista_vacia(): void
    {
        $this->reverbContesta('{"channels":[]}');

        $this->assertSame([], app(ConexionesEnVivo::class)->idsDeLasPersonasConectadas());
    }

    public function test_con_gente_conectada_devuelve_sus_ids(): void
    {
        $this->reverbContesta('{"channels":{"private-usuario.id-de-ana":{},"private-usuario.id-de-luis":{}}}');

        $this->assertSame(
            ['id-de-ana', 'id-de-luis'],
            app(ConexionesEnVivo::class)->idsDeLasPersonasConectadas(),
        );
    }

    public function test_si_reverb_contesta_con_un_error_no_se_sabe(): void
    {
        $this->reverbContesta('{"error":"Unauthorized"}', 401);

        $this->assertNull(app(ConexionesEnVivo::class)->idsDeLasPersonasConectadas());
    }

    private function reverbContesta(string $cuerpo, int $estado = 200): void
    {
        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'clave-de-prueba',
            'broadcasting.connections.reverb.secret' => 'secreto-de-prueba',
            'broadcasting.connections.reverb.app_id' => 'app-de-prueba',
        ]);

        $cliente = new Client(['handler' => HandlerStack::create(new MockHandler([
            new Response($estado, ['Content-Type' => 'application/json'], $cuerpo),
        ]))]);

        /** @var PusherBroadcaster $emisor */
        $emisor = Broadcast::connection('reverb');
        $emisor->setPusher(new Pusher('clave-de-prueba', 'secreto-de-prueba', 'app-de-prueba', [], $cliente));
    }
}
