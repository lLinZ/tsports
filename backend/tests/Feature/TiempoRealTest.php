<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Events\PruebaDeTiempoReal;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

/**
 * Pruebas de la configuración del tiempo real y del aviso de prueba.
 * ---------------------------------------------------------------------
 * La autorización de los canales privados tiene su propia prueba
 * (BroadcastingAuthTest). Aquí se comprueba lo que va alrededor:
 *
 *   · que el navegador solo reciba la clave cuando Reverb está de verdad
 *     encendido, porque con otro driver intentaría conectarse a un
 *     WebSocket que no va a recibir nada;
 *   · que el aviso de prueba vaya al buzón de la persona indicada y no
 *     diga «enviado» cuando no ha salido nada de la máquina.
 *
 * Los avisos se interceptan con Event::fake: ninguna prueba llega a
 * hablar con un Reverb real.
 */
class TiempoRealTest extends TestCase
{
    use RefreshDatabase;

    public function test_sin_sesion_no_se_entrega_la_configuracion(): void
    {
        $this->getJson('/api/tiempo-real')->assertStatus(401);
    }

    public function test_con_reverb_encendido_se_entrega_la_clave(): void
    {
        $this->encenderReverb();

        $this->actingAs($this->crearUsuario())
            ->getJson('/api/tiempo-real')
            ->assertOk()
            ->assertExactJson(['activo' => true, 'clave' => 'clave-de-prueba']);
    }

    public function test_sin_el_driver_de_reverb_la_interfaz_no_intenta_conectarse(): void
    {
        // phpunit.xml deja BROADCAST_CONNECTION=null: aunque haya clave,
        // los eventos no salen de la máquina.
        config(['broadcasting.connections.reverb.key' => 'clave-de-prueba']);

        $this->actingAs($this->crearUsuario())
            ->getJson('/api/tiempo-real')
            ->assertOk()
            ->assertExactJson(['activo' => false, 'clave' => null]);
    }

    public function test_el_aviso_de_prueba_va_al_canal_privado_de_esa_persona(): void
    {
        $this->encenderReverb();
        Event::fake([PruebaDeTiempoReal::class]);

        $destinatario = $this->crearUsuario();
        $this->crearUsuario();

        $this->artisan('tiempo-real:probar', ['correo' => $destinatario->email])
            ->assertSuccessful();

        Event::assertDispatchedTimes(PruebaDeTiempoReal::class, 1);
        Event::assertDispatched(
            PruebaDeTiempoReal::class,
            fn (PruebaDeTiempoReal $aviso): bool => array_column($aviso->broadcastOn(), 'name')
                === ['private-usuario.'.$destinatario->id],
        );
    }

    public function test_el_aviso_de_prueba_falla_con_un_correo_que_no_existe(): void
    {
        $this->encenderReverb();
        Event::fake([PruebaDeTiempoReal::class]);

        $this->artisan('tiempo-real:probar', ['correo' => 'nadie@test.test'])
            ->assertFailed();

        Event::assertNotDispatched(PruebaDeTiempoReal::class);
    }

    public function test_el_aviso_de_prueba_no_dice_enviado_si_reverb_no_esta_activo(): void
    {
        Event::fake([PruebaDeTiempoReal::class]);

        $this->artisan('tiempo-real:probar', ['correo' => $this->crearUsuario()->email])
            ->assertFailed();

        Event::assertNotDispatched(PruebaDeTiempoReal::class);
    }

    private function encenderReverb(): void
    {
        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'clave-de-prueba',
        ]);
    }

    private function crearUsuario(): User
    {
        return User::create([
            'name' => 'Usuario de prueba',
            'email' => 'persona-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => RolUsuario::Vendedor->value,
            'activo' => true,
        ]);
    }
}
