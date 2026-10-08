<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\EventoDeCampana;
use App\Models\Marca;
use App\Models\Recordatorio;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * El reporte «Lo que viene».
 * ---------------------------------------------------------------------
 * Lo que defienden estas pruebas:
 *
 *   · Los periodos («esta semana», «la próxima», «este mes», «el
 *     próximo») los cuenta el servidor con el día de Caracas.
 *   · Junta los recordatorios del equipo (con qué toca y la hora) y las
 *     acciones de campaña, día por día y en orden.
 *   · Cada quien ve lo de las marcas que ve (regla 6): un agente, lo de
 *     su cartera, y no puede pedir la agenda de otra persona.
 *   · Lo que nadie va a hacer no sale: el recordatorio de alguien que ya
 *     no ve la marca o cuya cuenta está desactivada.
 *   · Lo atrasado va aparte, y lo ya hecho del periodo sale como hecho.
 */
class ReporteDeLoQueVieneTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Miércoles 7 a las 22:00 en Caracas, que en UTC ya es el jueves 8:
        // contando en UTC, «esta semana» empezaría un día tarde.
        $this->travelTo(CarbonImmutable::parse('2026-10-08 02:00:00', 'UTC'));
    }

    public function test_los_periodos_se_cuentan_con_el_dia_de_caracas(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin);

        $esperados = [
            'esta_semana' => ['2026-10-07', '2026-10-11'],
            'proxima_semana' => ['2026-10-12', '2026-10-18'],
            'este_mes' => ['2026-10-07', '2026-10-31'],
            'proximo_mes' => ['2026-11-01', '2026-11-30'],
        ];

        foreach ($esperados as $periodo => [$desde, $hasta]) {
            $this->actingAs($admin)
                ->getJson("/api/reportes/lo-que-viene?periodo={$periodo}")
                ->assertOk()
                ->assertJsonPath('periodo.desde', $desde)
                ->assertJsonPath('periodo.hasta', $hasta)
                ->assertJsonPath('periodo.hoy', '2026-10-07');
        }

        $this->actingAs($admin)
            ->getJson('/api/reportes/lo-que-viene?periodo=proxima_semana')
            ->assertJsonPath('periodo.etiqueta', 'del 12 al 18 de octubre de 2026');

        // Sin periodo, esta semana.
        $this->actingAs($admin)
            ->getJson('/api/reportes/lo-que-viene')
            ->assertJsonPath('periodo.clave', 'esta_semana');
    }

    public function test_junta_recordatorios_y_acciones_dia_por_dia_y_en_orden(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin);
        $ana = $this->crearUsuario(RolUsuario::Vendedor, 'Ana Agente');
        $pepsi = Marca::create(['nombre_marca' => 'Pepsi', 'vendedor_asignado_id' => $ana->id, 'vendedor_asignado_nombre' => 'Ana Agente']);
        $polar = Marca::create(['nombre_marca' => 'Polar']);

        $this->recordatorio($pepsi, $ana, '2026-10-13', ['hora' => '15:30', 'tipo' => 'reunion', 'nota' => 'Presentar la propuesta']);
        $this->recordatorio($pepsi, $ana, '2026-10-13', ['hora' => '09:00', 'tipo' => 'llamada']);
        $this->recordatorio($polar, $admin, '2026-10-13', ['nota' => 'Mandar el dossier']);
        $this->recordatorio($polar, $admin, '2026-10-15', ['tipo' => 'reunion']);
        $this->accion($pepsi, '2026-10-13');
        // Fuera del periodo: no sale.
        $this->recordatorio($polar, $admin, '2026-10-20', ['tipo' => 'llamada']);

        $respuesta = $this->actingAs($admin)
            ->getJson('/api/reportes/lo-que-viene?periodo=proxima_semana')
            ->assertOk()
            ->assertJsonPath('alcance', 'empresa')
            ->assertJsonCount(2, 'dias')
            ->assertJsonPath('dias.0.fecha', '2026-10-13')
            ->assertJsonPath('dias.0.etiqueta', 'martes 13 de octubre')
            // Primero la acción de campaña (todo el día), después lo que
            // no tiene hora y por último por hora.
            ->assertJsonPath('dias.0.cosas.0.clase', 'campana')
            ->assertJsonPath('dias.0.cosas.0.agenteNombre', 'Ana Agente')
            ->assertJsonPath('dias.0.cosas.1.nota', 'Mandar el dossier')
            ->assertJsonPath('dias.0.cosas.2.hora', '09:00')
            ->assertJsonPath('dias.0.cosas.3.hora', '15:30')
            ->assertJsonPath('dias.0.cosas.3.tipo.etiqueta', 'Reunión')
            ->assertJsonPath('dias.0.cosas.3.persona.nombre', 'Ana Agente')
            ->assertJsonPath('dias.0.cosas.3.marca.nombre', 'Pepsi')
            ->assertJsonPath('dias.1.fecha', '2026-10-15')
            ->assertJsonPath('resumen.porHacer', 4)
            ->assertJsonPath('resumen.acciones', 1)
            ->assertJsonPath('resumen.marcas', 2);

        $porTipo = collect($respuesta->json('resumen.porTipo'))->keyBy('etiqueta');
        $this->assertSame(2, $porTipo['Reunión']['total']);
        $this->assertSame(1, $porTipo['Llamada']['total']);
        $this->assertSame(1, $porTipo['Otros recordatorios']['total']);

        $deAna = collect($respuesta->json('resumen.porPersona'))->firstWhere('nombre', 'Ana Agente');
        $this->assertSame(2, $deAna['porHacer']);
        $this->assertSame(1, $deAna['acciones']);
        $this->assertSame(1, $deAna['porTipo']['reunion']);

        // El filtro de personas solo le llega a quien puede usarlo.
        $this->assertNotEmpty($respuesta->json('personas'));
    }

    public function test_un_agente_solo_ve_lo_de_sus_marcas_y_no_pide_la_agenda_de_otro(): void
    {
        $ana = $this->crearUsuario(RolUsuario::Vendedor, 'Ana Agente');
        $luis = $this->crearUsuario(RolUsuario::Vendedor, 'Luis Agente');
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'Carla Comercial');

        $deAna = Marca::create(['nombre_marca' => 'Pepsi', 'vendedor_asignado_id' => $ana->id]);
        $deLuis = Marca::create(['nombre_marca' => 'Secreta', 'vendedor_asignado_id' => $luis->id]);

        $this->recordatorio($deAna, $ana, '2026-10-09', ['tipo' => 'llamada']);
        // El comercial también trabaja la de Ana: a Ana le sale (la ve en
        // la ficha igual).
        $this->recordatorio($deAna, $comercial, '2026-10-10', ['tipo' => 'reunion']);
        $this->recordatorio($deLuis, $luis, '2026-10-09', ['tipo' => 'llamada']);
        $this->accion($deLuis, '2026-10-10');

        $respuesta = $this->actingAs($ana)
            ->getJson('/api/reportes/lo-que-viene?periodo=esta_semana')
            ->assertOk()
            ->assertJsonPath('alcance', 'personal')
            ->assertJsonPath('resumen.porHacer', 2)
            ->assertJsonPath('resumen.acciones', 0)
            ->assertJsonPath('personas', []);

        $this->assertStringNotContainsString('Secreta', $respuesta->getContent());

        $this->actingAs($ana)
            ->getJson("/api/reportes/lo-que-viene?persona={$luis->id}")
            ->assertForbidden();

        // A sí misma sí.
        $this->actingAs($ana)
            ->getJson("/api/reportes/lo-que-viene?persona={$ana->id}")
            ->assertOk()
            ->assertJsonPath('resumen.porHacer', 1);
    }

    public function test_el_filtro_por_persona_deja_sus_recordatorios_y_las_acciones_de_sus_marcas(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin);
        $ana = $this->crearUsuario(RolUsuario::Vendedor, 'Ana Agente');
        $luis = $this->crearUsuario(RolUsuario::Vendedor, 'Luis Agente');

        $deAna = Marca::create(['nombre_marca' => 'Pepsi', 'vendedor_asignado_id' => $ana->id]);
        $deLuis = Marca::create(['nombre_marca' => 'Polar', 'vendedor_asignado_id' => $luis->id]);

        $this->recordatorio($deAna, $ana, '2026-10-09');
        $this->recordatorio($deLuis, $luis, '2026-10-09');
        $this->accion($deAna, '2026-10-10');
        $this->accion($deLuis, '2026-10-10');

        $this->actingAs($admin)
            ->getJson("/api/reportes/lo-que-viene?persona={$ana->id}")
            ->assertOk()
            ->assertJsonPath('persona.nombre', 'Ana Agente')
            ->assertJsonPath('resumen.porHacer', 1)
            ->assertJsonPath('resumen.acciones', 1)
            ->assertJsonPath('dias.0.cosas.0.marca.nombre', 'Pepsi')
            ->assertJsonPath('dias.1.cosas.0.marca.nombre', 'Pepsi');
    }

    public function test_lo_atrasado_va_aparte_lo_hecho_se_ve_hecho_y_lo_que_nadie_hara_no_sale(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin);
        $ana = $this->crearUsuario(RolUsuario::Vendedor, 'Ana Agente');
        $baja = $this->crearUsuario(RolUsuario::Vendedor, 'Cuenta de baja');
        $luis = $this->crearUsuario(RolUsuario::Vendedor, 'Luis Agente');

        $pepsi = Marca::create(['nombre_marca' => 'Pepsi', 'vendedor_asignado_id' => $ana->id]);
        $polar = Marca::create(['nombre_marca' => 'Polar', 'vendedor_asignado_id' => $baja->id]);

        $this->recordatorio($pepsi, $ana, '2026-10-02', ['nota' => 'Atrasado']);
        $this->recordatorio($pepsi, $ana, '2026-10-01', ['nota' => 'Ya hecho antes', 'cumplido_en' => now()]);
        $this->recordatorio($pepsi, $ana, '2026-10-09', ['nota' => 'Hecho por adelantado', 'cumplido_en' => now(), 'cumplido_por_nombre' => 'Ana Agente']);
        // A Luis le quitaron Pepsi: su recordatorio no le sale a nadie.
        $this->recordatorio($pepsi, $luis, '2026-10-09', ['nota' => 'De Luis']);
        $this->recordatorio($polar, $baja, '2026-10-09', ['nota' => 'De la cuenta de baja']);
        $baja->forceFill(['activo' => false])->save();

        $respuesta = $this->actingAs($admin)
            ->getJson('/api/reportes/lo-que-viene?periodo=esta_semana')
            ->assertOk()
            ->assertJsonPath('resumen.porHacer', 0)
            ->assertJsonPath('resumen.hechos', 1)
            ->assertJsonPath('resumen.atrasados', 1)
            ->assertJsonPath('atrasados.0.nota', 'Atrasado')
            ->assertJsonPath('atrasados.0.vencido', true)
            ->assertJsonPath('dias.0.cosas.0.nota', 'Hecho por adelantado')
            ->assertJsonPath('dias.0.cosas.0.cumplido', true)
            ->assertJsonCount(1, 'dias.0.cosas');

        $this->assertStringNotContainsString('De Luis', $respuesta->getContent());
        $this->assertStringNotContainsString('De la cuenta de baja', $respuesta->getContent());
    }

    public function test_cuenta_las_marcas_sin_siguiente_paso_como_el_resumen(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin);
        $ana = $this->crearUsuario(RolUsuario::Vendedor);

        $conPaso = Marca::create(['nombre_marca' => 'Con paso', 'vendedor_asignado_id' => $ana->id]);
        Marca::create(['nombre_marca' => 'Sin paso', 'vendedor_asignado_id' => $ana->id]);
        Marca::create(['nombre_marca' => 'Sin paso ni agente']);
        $this->recordatorio($conPaso, $ana, '2026-11-20');

        $this->actingAs($admin)
            ->getJson('/api/reportes/lo-que-viene')
            ->assertJsonPath('resumen.sinSiguientePaso', 2);

        $this->actingAs($admin)
            ->getJson("/api/reportes/lo-que-viene?persona={$ana->id}")
            ->assertJsonPath('resumen.sinSiguientePaso', 1);

        $this->actingAs($admin)
            ->getJson('/api/panel/resumen')
            ->assertJsonPath('contadores.sinSiguientePaso', 2);
    }

    public function test_otras_fechas_se_validan(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin);

        $this->actingAs($admin)
            ->getJson('/api/reportes/lo-que-viene?periodo=otro')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['desde', 'hasta'], 'errores');

        $this->actingAs($admin)
            ->getJson('/api/reportes/lo-que-viene?periodo=otro&desde=2026-10-20&hasta=2026-10-10')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('hasta', 'errores');

        $this->actingAs($admin)
            ->getJson('/api/reportes/lo-que-viene?periodo=otro&desde=2026-10-01&hasta=2027-12-31')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('hasta', 'errores');

        $this->actingAs($admin)
            ->getJson('/api/reportes/lo-que-viene?periodo=otro&desde=2026-10-20&hasta=2026-11-05')
            ->assertOk()
            ->assertJsonPath('periodo.etiqueta', 'del 20 de octubre al 5 de noviembre de 2026');

        $this->actingAs($admin)
            ->getJson('/api/reportes/lo-que-viene?periodo=cuando_sea')
            ->assertUnprocessable();
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    /** @param  array<string,mixed>  $mas */
    private function recordatorio(Marca $marca, User $persona, string $dia, array $mas = []): Recordatorio
    {
        return Recordatorio::create([
            'marca_id' => $marca->id,
            'persona_id' => $persona->id,
            'fecha' => $dia,
            ...$mas,
        ]);
    }

    private function accion(Marca $marca, string $dia): void
    {
        EventoDeCampana::create([
            'marca_id' => $marca->id,
            'campana_nombre' => 'Campaña de prueba',
            'campana_color' => '#16c79a',
            'fecha' => $dia,
        ]);
    }

    private function crearUsuario(RolUsuario $rol, string $nombre = 'Usuario de prueba'): User
    {
        return User::create([
            'name' => $nombre,
            'email' => $rol->value.'-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            'zona' => null,
            'activo' => true,
        ]);
    }
}
