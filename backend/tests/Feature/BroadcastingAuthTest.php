<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pruebas de la autenticación de canales privados de Reverb.
 * ---------------------------------------------------------------------
 * No hay todavía ninguna notificación real que viajar por estos
 * canales (eso es la Etapa 1, pendiente): lo que se prueba aquí es solo
 * el mecanismo de permiso, que es lo único ya construido de la Etapa 2.
 *
 * La ruta vive en /api/broadcasting/auth, bajo auth:sanctum — NO en
 * /broadcasting/auth, que es donde la registraría Laravel por defecto
 * (grupo `web`, pensado para cookie de sesión). Si alguien reintroduce
 * el registro por defecto, esta prueba de 401 sin token seguiría
 * pasando pero por la ruta equivocada; por eso se pide explícitamente la
 * de /api.
 */
class BroadcastingAuthTest extends TestCase
{
    use RefreshDatabase;

    /**
     * phpunit.xml fuerza BROADCAST_CONNECTION=null en todas las pruebas
     * —de fábrica, para que ninguna prueba dispare un aviso real— y con
     * el driver "null" la autenticación de canales no hace nada: siempre
     * responde 200 vacío, sin mirar routes/channels.php. Aquí es
     * justamente lo que se quiere probar, así que se fuerza el driver de
     * verdad solo en esta clase.
     *
     * routes/channels.php ya se cargó una vez durante el arranque de la
     * aplicación —con el driver "null" todavía puesto—, así que
     * Broadcast::channel() registró el canal en ESE broadcaster, no en
     * el de Reverb. Cambiar la config no mueve el registro ya hecho: hay
     * que volver a requerir el fichero para que se registre en el
     * broadcaster correcto.
     */
    protected function setUp(): void
    {
        parent::setUp();

        config(['broadcasting.default' => 'reverb']);

        require base_path('routes/channels.php');
    }

    public function test_sin_token_no_se_puede_autenticar_ningun_canal(): void
    {
        $usuario = $this->crearUsuario(RolUsuario::Vendedor);

        $this->postJson('/api/broadcasting/auth', [
            'channel_name' => 'private-usuario.'.$usuario->id,
            'socket_id' => '1234.1234',
        ])->assertStatus(401);
    }

    public function test_una_persona_se_autentica_en_su_propio_canal(): void
    {
        $usuario = $this->crearUsuario(RolUsuario::Vendedor);

        $this->actingAs($usuario)
            ->postJson('/api/broadcasting/auth', [
                'channel_name' => 'private-usuario.'.$usuario->id,
                'socket_id' => '1234.1234',
            ])
            ->assertOk()
            ->assertJsonStructure(['auth']);
    }

    public function test_nadie_se_autentica_en_el_canal_de_otra_persona(): void
    {
        $usuario = $this->crearUsuario(RolUsuario::Vendedor);
        $otraPersona = $this->crearUsuario(RolUsuario::Vendedor);

        $this->actingAs($usuario)
            ->postJson('/api/broadcasting/auth', [
                'channel_name' => 'private-usuario.'.$otraPersona->id,
                'socket_id' => '1234.1234',
            ])
            ->assertStatus(403);
    }

    private function crearUsuario(RolUsuario $rol): User
    {
        return User::create([
            'name' => 'Usuario '.$rol->value,
            'email' => $rol->value.'-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            'activo' => true,
        ]);
    }
}
