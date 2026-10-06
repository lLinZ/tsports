<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\EventoDeCampana;
use App\Models\Marca;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * El sistema va en hora de Venezuela.
 * ---------------------------------------------------------------------
 * Hasta el 2026-10-05 la aplicación iba en UTC (config/app.php lo tenía
 * escrito a mano y no leía el APP_TIMEZONE del .env). Desde las 20:00 de
 * Caracas, que ya son las 00:00 en UTC, el calendario del panel marcaba
 * el día siguiente como «hoy» y las acciones de ese día dejaban de contar
 * como «por delante».
 *
 * Estas pruebas se hacen a las 21:30 de Caracas, que es justo la franja
 * donde fallaba.
 */
class HoraDeVenezuelaTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // 21:30 del lunes 5 en Caracas = 01:30 del martes 6 en UTC.
        $this->travelTo(CarbonImmutable::parse('2026-10-06 01:30:00', 'UTC'));
    }

    public function test_la_aplicacion_y_la_base_van_en_hora_de_venezuela(): void
    {
        $this->assertSame('America/Caracas', config('app.timezone'));

        // Las dos tienen que ir juntas: con la aplicación en Caracas y la
        // conexión en UTC, todo lo guardado se correría cuatro horas.
        $this->assertSame('-04:00', config('database.connections.mariadb.timezone'));
        $this->assertSame('-04:00', config('database.connections.mysql.timezone'));
    }

    public function test_a_las_nueve_de_la_noche_el_calendario_sigue_en_el_mismo_dia(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $dias = $this->actingAs($comercial)
            ->getJson('/api/panel/calendario')
            ->assertOk()
            ->json('dias');

        $hoy = collect($dias)->firstWhere('esHoy', true);

        $this->assertSame('2026-10-05', $hoy['fecha']);
    }

    public function test_la_accion_de_hoy_sigue_por_delante_hasta_medianoche_de_caracas(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Pepsi', 'vendedor_asignado_id' => $agente->id]);

        EventoDeCampana::create([
            'marca_id' => $marca->id,
            'campana_nombre' => 'Visita presencial',
            'campana_color' => '#2563eb',
            'fecha' => '2026-10-05',
        ]);

        $this->actingAs($agente)
            ->getJson('/api/panel/resumen')
            ->assertJsonPath('misNumeros.accionesPorDelante', 1);
    }

    public function test_las_horas_salen_con_el_desfase_de_venezuela(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin);
        $marca = Marca::create(['nombre_marca' => 'Banesco']);

        $this->actingAs($admin)
            ->getJson("/api/marcas/{$marca->id}")
            ->assertJsonPath('data.creadaEn', '2026-10-05T21:30:00-04:00');
    }

    private function crearUsuario(RolUsuario $rol): User
    {
        return User::create([
            'name' => 'Usuario de prueba',
            'email' => $rol->value.'-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            'zona' => null,
            'activo' => true,
        ]);
    }
}
