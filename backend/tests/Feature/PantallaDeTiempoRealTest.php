<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Events\PruebaDeTiempoReal;
use App\Models\User;
use App\Support\ConexionesEnVivo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

/**
 * Pruebas de la pantalla de pruebas del tiempo real (solo admin).
 * ---------------------------------------------------------------------
 * Lo que se fija aquí:
 *
 *   · Solo un administrador entra. Un aviso a «todo el equipo» le salta
 *     en pantalla a cada persona: no es algo que pueda mandar cualquiera.
 *   · «Quién está conectado» distingue «nadie» de «no se sabe». Con
 *     Reverb parado no se puede preguntar, y pintar a todos como
 *     desconectados haría buscar el fallo en los navegadores.
 *   · «Todo el equipo» es el equipo ACTIVO: una cuenta desactivada no
 *     tiene sesión y no pinta nada en la lista de canales.
 *
 * ConexionesEnVivo se sustituye por una versión de mentira: en las
 * pruebas no hay ningún Reverb al que preguntar. Los avisos se
 * interceptan con Event::fake y tampoco salen de aquí.
 */
class PantallaDeTiempoRealTest extends TestCase
{
    use RefreshDatabase;

    public function test_solo_un_administrador_entra_en_la_pantalla_de_pruebas(): void
    {
        $this->encenderReverb();
        Event::fake([PruebaDeTiempoReal::class]);

        foreach ([RolUsuario::Comercial, RolUsuario::Vendedor] as $rol) {
            $persona = $this->crearUsuario($rol);

            $this->actingAs($persona)->getJson('/api/admin/tiempo-real')->assertForbidden();
            $this->actingAs($persona)
                ->postJson('/api/admin/tiempo-real/prueba', ['destinatario' => 'todos'])
                ->assertForbidden();
        }

        Event::assertNotDispatched(PruebaDeTiempoReal::class);
    }

    public function test_la_pantalla_dice_quien_tiene_el_panel_abierto(): void
    {
        $this->encenderReverb();
        $administrador = $this->crearUsuario(RolUsuario::Admin, 'Ana Admin');
        $conectada = $this->crearUsuario(RolUsuario::Vendedor, 'Beatriz Conectada');
        $sinConectar = $this->crearUsuario(RolUsuario::Vendedor, 'Carla Sin Conectar');
        $this->fingirConectados([$conectada->id]);

        $respuesta = $this->actingAs($administrador)->getJson('/api/admin/tiempo-real')->assertOk();

        $respuesta->assertJsonPath('activo', true)->assertJsonPath('seSabeQuienEstaConectado', true);
        $conectadaPorId = collect($respuesta->json('personas'))->pluck('conectada', 'id');
        $this->assertTrue($conectadaPorId[$conectada->id]);
        $this->assertFalse($conectadaPorId[$sinConectar->id]);
    }

    public function test_con_reverb_parado_la_pantalla_dice_que_no_se_sabe(): void
    {
        $this->encenderReverb();
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $this->fingirConectados(null);

        $this->actingAs($administrador)
            ->getJson('/api/admin/tiempo-real')
            ->assertOk()
            ->assertJsonPath('seSabeQuienEstaConectado', false)
            ->assertJsonPath('personas.0.conectada', false);
    }

    public function test_un_aviso_a_una_persona_va_solo_a_su_canal_con_el_texto_escrito(): void
    {
        $this->encenderReverb();
        Event::fake([PruebaDeTiempoReal::class]);
        $administrador = $this->crearUsuario(RolUsuario::Admin, 'Ana Admin');
        $destinataria = $this->crearUsuario(RolUsuario::Vendedor, 'Beatriz');
        $this->crearUsuario(RolUsuario::Vendedor, 'Otra persona');

        $this->actingAs($administrador)
            ->postJson('/api/admin/tiempo-real/prueba', [
                'destinatario' => $destinataria->id,
                'titulo' => '  ¿Me lees?  ',
                'mensaje' => 'Prueba desde la pantalla',
            ])
            ->assertOk()
            ->assertJsonPath('enviados', 1)
            ->assertJsonPath('mensaje', 'Aviso enviado a Beatriz.');

        Event::assertDispatched(
            PruebaDeTiempoReal::class,
            fn (PruebaDeTiempoReal $aviso): bool => array_column($aviso->broadcastOn(), 'name') === ['private-usuario.'.$destinataria->id]
                && $aviso->broadcastWith()['titulo'] === '¿Me lees?'
                && $aviso->broadcastWith()['mensaje'] === 'Prueba desde la pantalla'
                && $aviso->broadcastWith()['enviadoPor'] === 'Ana Admin',
        );
    }

    public function test_un_aviso_a_todos_llega_a_cada_cuenta_activa_y_no_a_las_desactivadas(): void
    {
        $this->encenderReverb();
        Event::fake([PruebaDeTiempoReal::class]);
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $activa = $this->crearUsuario(RolUsuario::Vendedor);
        $desactivada = $this->crearUsuario(RolUsuario::Vendedor, activo: false);

        $this->actingAs($administrador)
            ->postJson('/api/admin/tiempo-real/prueba', ['destinatario' => 'todos'])
            ->assertOk()
            ->assertJsonPath('enviados', 2);

        // Un solo evento con los dos canales: una única llamada a Reverb.
        Event::assertDispatchedTimes(PruebaDeTiempoReal::class, 1);
        Event::assertDispatched(PruebaDeTiempoReal::class, function (PruebaDeTiempoReal $aviso) use ($administrador, $activa, $desactivada): bool {
            $canales = array_column($aviso->broadcastOn(), 'name');

            return in_array('private-usuario.'.$administrador->id, $canales, true)
                && in_array('private-usuario.'.$activa->id, $canales, true)
                && ! in_array('private-usuario.'.$desactivada->id, $canales, true);
        });
    }

    public function test_un_destinatario_que_no_existe_se_rechaza(): void
    {
        $this->encenderReverb();
        Event::fake([PruebaDeTiempoReal::class]);
        $administrador = $this->crearUsuario(RolUsuario::Admin);

        $this->actingAs($administrador)
            ->postJson('/api/admin/tiempo-real/prueba', ['destinatario' => 'nadie'])
            ->assertStatus(422)
            ->assertJsonPath('errores.destinatario.0', 'No hay ninguna cuenta activa con ese destinatario.');

        Event::assertNotDispatched(PruebaDeTiempoReal::class);
    }

    public function test_con_el_tiempo_real_apagado_se_explica_por_que_no_salio(): void
    {
        // phpunit.xml deja BROADCAST_CONNECTION=null: no hay tiempo real.
        Event::fake([PruebaDeTiempoReal::class]);
        $administrador = $this->crearUsuario(RolUsuario::Admin);

        $respuesta = $this->actingAs($administrador)
            ->postJson('/api/admin/tiempo-real/prueba', ['destinatario' => 'todos'])
            ->assertStatus(503);

        $this->assertStringContainsString('no está activo', $respuesta->json('mensaje'));
        Event::assertNotDispatched(PruebaDeTiempoReal::class);
    }

    private function encenderReverb(): void
    {
        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'clave-de-prueba',
        ]);
    }

    /** @param list<string>|null $idsConectados null = Reverb no contesta */
    private function fingirConectados(?array $idsConectados): void
    {
        $this->app->instance(ConexionesEnVivo::class, new class($idsConectados) extends ConexionesEnVivo
        {
            public function __construct(private readonly ?array $ids) {}

            public function idsDeLasPersonasConectadas(): ?array
            {
                return $this->ids;
            }
        });
    }

    private function crearUsuario(RolUsuario $rol, string $nombre = 'Persona de prueba', bool $activo = true): User
    {
        return User::create([
            'name' => $nombre,
            'email' => $rol->value.'-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            'zona' => null,
            'activo' => $activo,
        ]);
    }
}
