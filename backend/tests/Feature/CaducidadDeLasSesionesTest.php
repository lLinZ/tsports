<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Cuándo deja de valer una sesión abierta: al desactivar la cuenta, y
 * tras 30 días sin usarse.
 * ---------------------------------------------------------------------
 * Los tokens de Sanctum no caducan solos. Si desactivar una cuenta solo
 * impidiera volver a entrar, quien deja la agencia seguiría viendo el
 * tablero, el pronóstico y la bitácora con la pestaña que ya tenía
 * abierta, y la desactivación no serviría de nada.
 */
class CaducidadDeLasSesionesTest extends TestCase
{
    use RefreshDatabase;

    public function test_desactivar_desde_equipo_cierra_las_sesiones_abiertas(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $tokenDelComercial = $comercial->createToken('portatil')->plainTextToken;

        $this->withToken($tokenDelComercial)->getJson('/api/reportes/pronostico')->assertOk();
        $this->app['auth']->forgetGuards();

        $this->actingAs($administrador)
            ->putJson("/api/admin/usuarios/{$comercial->id}", ['activo' => false])
            ->assertOk();
        $this->app['auth']->forgetGuards();

        $this->withToken($tokenDelComercial)->getJson('/api/reportes/pronostico')->assertUnauthorized();
        $this->assertSame(0, $comercial->tokens()->count());
    }

    public function test_un_token_de_una_cuenta_desactivada_no_abre_nada(): void
    {
        // Desactivada por cualquier otro camino (la base de datos a mano,
        // un comando): el token que quedara vivo tampoco sirve.
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $tokenDelComercial = $comercial->createToken('portatil')->plainTextToken;
        $comercial->forceFill(['activo' => false])->save();

        // Las tres primeras no tienen política que pregunte por `activo`:
        // antes respondían 200, el reporte con la bitácora de la agencia.
        $rutas = [
            '/api/bitacora/reporte?desde=2026-01-01&hasta=2026-12-31',
            '/api/chat/conversaciones',
            '/api/notificaciones',
            '/api/auth/yo',
            '/api/reportes/pronostico',
        ];

        foreach ($rutas as $ruta) {
            $this->app['auth']->forgetGuards();
            $this->withToken($tokenDelComercial)->getJson($ruta)->assertUnauthorized();
        }
    }

    public function test_una_sesion_que_lleva_un_mes_sin_usarse_caduca(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $deAyer = $comercial->createToken('movil');
        $deAyer->accessToken->forceFill(['last_used_at' => now()->subDay(), 'created_at' => now()->subYear()])->save();

        $olvidada = $comercial->createToken('ordenador-de-la-oficina');
        $olvidada->accessToken->forceFill(['last_used_at' => now()->subDays(31)])->save();

        // Nunca usado: cuenta desde que se creó.
        $sinEstrenar = $comercial->createToken('tablet');
        $sinEstrenar->accessToken->forceFill(['last_used_at' => null, 'created_at' => now()->subDays(31)])->save();

        $this->withToken($deAyer->plainTextToken)->getJson('/api/auth/yo')->assertOk();

        foreach ([$olvidada, $sinEstrenar] as $caducado) {
            $this->app['auth']->forgetGuards();
            $this->withToken($caducado->plainTextToken)->getJson('/api/auth/yo')->assertUnauthorized();
        }
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
