<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\Campana;
use App\Models\Marca;
use App\Models\Propiedad;
use App\Models\PropiedadDeMarca;
use App\Models\Recordatorio;
use App\Models\RegistroActividad;
use App\Models\Sector;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Las herramientas del día a día (etapa 7): el buscador único, las metas
 * por agente y las exportaciones.
 * ---------------------------------------------------------------------
 * Lo que defienden:
 *
 *   · El buscador no encuentra lo que la pantalla no enseñaría: a un
 *     agente, ni una marca ajena (regla 6).
 *   · La meta se guarda; el avance se mide al leer contra el OVP de las
 *     marcas de esa persona, y cambia en cuanto cambia un pronóstico.
 *   · El Excel del tablero lleva lo mismo que la pantalla —sus filtros y
 *     el corte por rol— y queda en la auditoría, como la ficha en PDF.
 */
class HerramientasDelDiaADiaTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(CarbonImmutable::parse('2026-10-05 16:00:00', 'UTC'));
    }

    /* ------------------------------------------------------------------
     | El buscador
     |-----------------------------------------------------------------*/

    public function test_el_buscador_no_le_ensena_a_un_agente_marcas_ajenas(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $otra = $this->crearUsuario(RolUsuario::Vendedor);

        Marca::create(['nombre_marca' => 'Pepsi Venezuela', 'vendedor_asignado_id' => $agente->id]);
        Marca::create(['nombre_marca' => 'Pepsico Andina', 'vendedor_asignado_id' => $otra->id]);
        Marca::create(['nombre_marca' => 'Pepsi sin dueño']);

        $marcas = $this->actingAs($agente)
            ->getJson('/api/buscar?q=peps')
            ->assertOk()
            ->json('resultados.marcas');

        $this->assertSame(['Pepsi Venezuela'], array_column($marcas, 'titulo'));
        $this->assertSame('/marcas?abrir='.Marca::where('nombre_marca', 'Pepsi Venezuela')->value('id'), $marcas[0]['enlace']);
    }

    public function test_el_buscador_encuentra_el_catalogo_y_al_equipo(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'Lucía Comercial');
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Kevin Agente');

        $propiedad = $this->crearPropiedad('Kombat Challenge');
        Campana::create(['nombre' => 'Invitación a Kombat Night']);
        Sector::create(['nombre' => 'Kosher', 'orden' => 1]);

        $resultados = $this->actingAs($comercial)->getJson('/api/buscar?q=k')->assertOk()->json('resultados');

        // Una sola letra todavía no busca.
        $this->assertSame([], $resultados['propiedades']);

        $resultados = $this->actingAs($comercial)->getJson('/api/buscar?q=ko')->json('resultados');

        $this->assertSame('/marcas?propiedad='.$propiedad->id.'&orden=ovp_propiedad', $resultados['propiedades'][0]['enlace']);
        $this->assertSame('Invitación a Kombat Night', $resultados['campanas'][0]['titulo']);
        $this->assertSame('/marcas?sector=Kosher', $resultados['sectores'][0]['enlace']);

        // Quien reparte llega a la cartera de cada persona…
        $personas = $this->actingAs($comercial)->getJson('/api/buscar?q=kev')->json('resultados.personas');
        $this->assertSame('/marcas?vendedor='.$agente->id, $personas[0]['enlace']);

        // …y un agente, a escribirle: la cartera de los demás no la ve.
        $personas = $this->actingAs($agente)->getJson('/api/buscar?q=luc')->json('resultados.personas');
        $this->assertSame('Lucía Comercial', $personas[0]['titulo']);
        $this->assertNull($personas[0]['enlace']);
    }

    /* ------------------------------------------------------------------
     | Las metas
     |-----------------------------------------------------------------*/

    public function test_el_avance_de_la_meta_sale_del_ovp_y_se_mueve_con_el(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Ana Agente');
        $propiedad = $this->crearPropiedad('Dvo. Lara');
        $marca = Marca::create(['nombre_marca' => 'Polar', 'vendedor_asignado_id' => $agente->id]);
        $linea = PropiedadDeMarca::create(['marca_id' => $marca->id, 'propiedad_id' => $propiedad->id, 'ovp_usd' => 15000]);

        $this->actingAs($comercial)
            ->putJson("/api/metas/{$agente->id}", ['anio' => 2026, 'montoUsd' => 60000])
            ->assertOk()
            ->assertJsonPath('data.porcentaje', 25);

        $this->actingAs($agente)
            ->getJson('/api/panel/resumen')
            ->assertJsonPath('miMeta.metaUsd', 60000)
            ->assertJsonPath('miMeta.ovpUsd', 15000)
            ->assertJsonPath('miMeta.porcentaje', 25)
            // Las del equipo no le llegan a un agente.
            ->assertJsonMissingPath('metasDelEquipo');

        // Se corrige el pronóstico: el avance se recalcula solo.
        $linea->update(['ovp_usd' => 30000]);

        $this->actingAs($agente)
            ->getJson('/api/panel/resumen')
            ->assertJsonPath('miMeta.porcentaje', 50);

        $this->assertTrue(RegistroActividad::query()->where('entidad_tipo', 'meta')->exists());
    }

    public function test_un_agente_no_pone_metas(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);

        $this->actingAs($agente)
            ->putJson("/api/metas/{$agente->id}", ['anio' => 2026, 'montoUsd' => 1000000])
            ->assertForbidden();
    }

    public function test_quien_reparte_ve_a_todo_el_equipo_tenga_meta_o_no(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin);
        $conMeta = $this->crearUsuario(RolUsuario::Vendedor, 'Con meta');
        $sinMeta = $this->crearUsuario(RolUsuario::Vendedor, 'Sin meta');

        $this->actingAs($admin)->putJson("/api/metas/{$conMeta->id}", ['anio' => 2026, 'montoUsd' => 10000])->assertOk();

        $personas = $this->actingAs($admin)
            ->getJson('/api/panel/resumen')
            ->assertJsonPath('metasDelEquipo.anio', 2026)
            ->json('metasDelEquipo.personas');

        $this->assertSame(['Con meta', 'Sin meta'], array_column($personas, 'nombre'));
        // Sin meta no hay porcentaje: un cero diría «no ha vendido nada».
        $this->assertNull($personas[1]['porcentaje']);

        // Y quitarla la deja como a quien nunca la tuvo.
        $this->actingAs($admin)
            ->putJson("/api/metas/{$conMeta->id}", ['anio' => 2026, 'montoUsd' => null])
            ->assertOk()
            ->assertJsonPath('data', null);

        $personas = $this->actingAs($admin)->getJson('/api/panel/resumen')->json('metasDelEquipo.personas');

        $this->assertSame([null, null], array_column($personas, 'metaUsd'));
        $this->assertContains($sinMeta->id, array_column($personas, 'personaId'));
    }

    /* ------------------------------------------------------------------
     | Las exportaciones
     |-----------------------------------------------------------------*/

    public function test_el_excel_del_tablero_respeta_el_corte_por_rol_y_los_filtros(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $otra = $this->crearUsuario(RolUsuario::Vendedor);
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        Marca::create(['nombre_marca' => 'Suya en Caracas', 'zona' => 'Caracas', 'vendedor_asignado_id' => $agente->id]);
        Marca::create(['nombre_marca' => 'Suya en Lara', 'zona' => 'Lara', 'vendedor_asignado_id' => $agente->id]);
        Marca::create(['nombre_marca' => 'Ajena en Caracas', 'zona' => 'Caracas', 'vendedor_asignado_id' => $otra->id]);

        $deLaAgente = $this->actingAs($agente)->getJson('/api/marcas/exportacion?zona=Caracas')->assertOk()->json('data');
        $this->assertSame(['Suya en Caracas'], array_column($deLaAgente, 'nombreMarca'));

        $delComercial = $this->actingAs($comercial)->getJson('/api/marcas/exportacion?zona=Caracas&orden=nombre')->json('data');
        $this->assertSame(['Ajena en Caracas', 'Suya en Caracas'], array_column($delComercial, 'nombreMarca'));

        $anotada = RegistroActividad::query()
            ->where('accion', RegistroActividad::ACCION_EXPORTO)
            ->where('usuario_id', $agente->id)
            ->first();

        $this->assertNotNull($anotada);
        $this->assertSame('Exportó el tablero a Excel (1 marca)', $anotada->descripcion);
    }

    public function test_la_ficha_en_pdf_solo_la_saca_quien_ve_la_marca(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $otra = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Digitel', 'vendedor_asignado_id' => $agente->id]);
        Recordatorio::create(['marca_id' => $marca->id, 'persona_id' => $agente->id, 'fecha' => '2026-10-09', 'nota' => 'Mandar el dossier']);

        $this->actingAs($otra)->getJson("/api/marcas/{$marca->id}/exportacion")->assertForbidden();

        $this->actingAs($agente)
            ->getJson("/api/marcas/{$marca->id}/exportacion")
            ->assertOk()
            ->assertJsonPath('data.nombreMarca', 'Digitel')
            ->assertJsonPath('recordatorios.0.nota', 'Mandar el dossier');

        $this->assertTrue(RegistroActividad::query()
            ->where('descripcion', 'Exportó la ficha de Digitel a PDF')
            ->exists());
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    private function crearPropiedad(string $nombre): Propiedad
    {
        return Propiedad::create([
            'nombre' => $nombre,
            'monto_total_usd' => 100000,
            'porcentaje_forecast' => 20,
            'asignada_a_todos' => true,
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
