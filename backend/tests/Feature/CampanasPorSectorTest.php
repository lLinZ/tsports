<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\Campana;
use App\Models\EventoDeCampana;
use App\Models\Marca;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pruebas de las campañas por sector (pantalla de Sectores).
 * ---------------------------------------------------------------------
 * Lo que se fija aquí:
 *
 *   · Las semanas son las del calendario (lunes a domingo) recortadas al
 *     mes, y salen todas aunque estén vacías.
 *   · Cada acción cae en el sector que su marca tiene hoy, y lo que no
 *     está en el catálogo va a «Sin sector».
 *   · Un agente solo cuenta las acciones de sus marcas (regla 6).
 */
class CampanasPorSectorTest extends TestCase
{
    use RefreshDatabase;

    public function test_reparte_las_acciones_por_sector_y_semana_del_mes(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $pastora = Marca::create(['nombre_marca' => 'Azúcar la Pastora', 'sector' => 'Alimentos']);
        $polar = Marca::create(['nombre_marca' => 'Polar', 'sector' => 'Bebidas']);

        // Septiembre de 2026 empieza en martes: la semana 1 va del 1 al 6.
        $this->crearEvento($pastora, 'Visita presencial', '#1b9aaa', '2026-09-02');
        $this->crearEvento($pastora, 'Visita presencial', '#1b9aaa', '2026-09-03');
        $this->crearEvento($pastora, 'Sportbiz', '#f4c95d', '2026-09-05');
        $this->crearEvento($polar, 'Sportbiz', '#f4c95d', '2026-09-08');
        // Fuera del mes: no cuenta.
        $this->crearEvento($polar, 'Sportbiz', '#f4c95d', '2026-10-01');

        $respuesta = $this->actingAs($comercial)
            ->getJson('/api/sectores/campanas?mes=2026-09')
            ->assertOk()
            ->assertJsonPath('periodo.etiqueta', 'Septiembre de 2026')
            ->assertJsonPath('periodo.anterior', '2026-08')
            ->assertJsonPath('periodo.siguiente', '2026-10')
            ->assertJsonPath('totalDeAcciones', 4)
            ->assertJsonCount(5, 'semanas')
            ->assertJsonPath('semanas.0.desde', '2026-09-01')
            ->assertJsonPath('semanas.0.hasta', '2026-09-06')
            ->assertJsonPath('semanas.4.desde', '2026-09-28')
            ->assertJsonPath('semanas.4.hasta', '2026-09-30')
            ->assertJsonPath('sinSector', null);

        $sectores = collect($respuesta->json('sectores'))->keyBy('sector');

        $alimentos = $sectores->get('Alimentos')['semanas'];
        $this->assertCount(5, $alimentos);
        $this->assertSame(3, $alimentos[0]['total']);
        $this->assertSame(
            [['etiqueta' => 'Sportbiz', 'color' => '#f4c95d', 'total' => 1], ['etiqueta' => 'Visita presencial', 'color' => '#1b9aaa', 'total' => 2]],
            $alimentos[0]['porCampana'],
            'Las porciones van en el orden de la leyenda del mes (Sportbiz suma 2 en el mes, Visita también: a igual total, por nombre).',
        );
        $this->assertSame(0, $alimentos[1]['total']);

        $bebidas = $sectores->get('Bebidas')['semanas'];
        $this->assertSame(0, $bebidas[0]['total']);
        $this->assertSame(1, $bebidas[1]['total']);
    }

    public function test_lo_que_no_esta_en_el_catalogo_va_a_sin_sector(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $sinSector = Marca::create(['nombre_marca' => 'Sin rubro']);
        $deOtroRubro = Marca::create(['nombre_marca' => 'De Supabase', 'sector' => 'Rubro viejo']);

        $this->crearEvento($sinSector, 'Visita presencial', '#1b9aaa', '2026-09-10');
        $this->crearEvento($deOtroRubro, 'Visita presencial', '#1b9aaa', '2026-09-10');

        $respuesta = $this->actingAs($comercial)
            ->getJson('/api/sectores/campanas?mes=2026-09')
            ->assertOk()
            ->assertJsonCount(0, 'sectores');

        $this->assertSame(2, $respuesta->json('sinSector.1.total'));
    }

    public function test_un_agente_solo_cuenta_las_acciones_de_sus_marcas(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);

        $suya = Marca::create([
            'nombre_marca' => 'Suya',
            'sector' => 'Alimentos',
            'vendedor_asignado_id' => $agente->id,
        ]);
        $ajena = Marca::create(['nombre_marca' => 'Ajena', 'sector' => 'Alimentos']);

        $this->crearEvento($suya, 'Visita presencial', '#1b9aaa', '2026-09-10');
        $this->crearEvento($ajena, 'Campaña de otro', '#e4572e', '2026-09-10');

        $this->actingAs($agente)
            ->getJson('/api/sectores/campanas?mes=2026-09')
            ->assertOk()
            ->assertJsonPath('totalDeAcciones', 1)
            // Ni el nombre de la campaña ajena viaja en la respuesta.
            ->assertJsonCount(1, 'campanas')
            ->assertJsonPath('campanas.0.etiqueta', 'Visita presencial');
    }

    public function test_un_mes_mal_escrito_se_rechaza(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $this->actingAs($comercial)
            ->getJson('/api/sectores/campanas?mes=2026-13')
            ->assertStatus(422)
            ->assertJsonPath('errores.mes.0', 'El mes debe tener el formato AAAA-MM.');
    }

    public function test_un_mes_que_empieza_en_sabado_tiene_seis_semanas(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        // Agosto de 2026: sábado 1 y lunes 31, cada uno en su semana.
        $this->actingAs($comercial)
            ->getJson('/api/sectores/campanas?mes=2026-08')
            ->assertOk()
            ->assertJsonCount(6, 'semanas')
            ->assertJsonPath('semanas.0.hasta', '2026-08-02')
            ->assertJsonPath('semanas.5.desde', '2026-08-31');
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    private function crearEvento(Marca $marca, string $campana, string $color, string $fecha): void
    {
        $laCampana = Campana::firstOrCreate(['nombre' => $campana], ['color' => $color]);

        EventoDeCampana::create([
            'marca_id' => $marca->id,
            'campana_id' => $laCampana->id,
            'campana_nombre' => $campana,
            'campana_color' => $color,
            'fecha' => $fecha,
        ]);
    }

    private function crearUsuario(RolUsuario $rol): User
    {
        return User::create([
            'name' => 'Usuario '.$rol->value,
            'email' => $rol->value.'-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            'zona' => null,
            'activo' => true,
        ]);
    }
}
