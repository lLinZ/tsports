<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\Campana;
use App\Models\Marca;
use App\Models\Propiedad;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pruebas de los productos IOP: los tres montos y su proporción.
 * ---------------------------------------------------------------------
 * Aquí se fija por escrito lo que significa cada cifra, que es lo que
 * más fácil se tuerce cuando pasan los meses:
 *
 *   · MTP      → el valor total de la propiedad (162.000).
 *   · Forecast → la meta: el porcentaje acordado sobre el MTP (20 % →
 *                32.400). Se calcula, nunca se guarda.
 *   · OVP      → lo que un vendedor pronostica venderle a UNA marca
 *                dentro de esa propiedad.
 *
 * Y la relación que pidió el cliente: de una propiedad de 7.400 con un
 * pronóstico de 500, la barra tiene que decir 6,76 %.
 *
 * La otra prueba importante es la de la prospección: marcar propiedades
 * NO la completa. Esa fase sigue dependiendo solo de los cinco datos de
 * la ficha, y si algún día alguien las mezcla, esta prueba se pone roja.
 */
class PropiedadesYForecastTest extends TestCase
{
    use RefreshDatabase;

    /* ------------------------------------------------------------------
     | Los tres montos
     |-----------------------------------------------------------------*/

    public function test_la_meta_de_venta_es_el_porcentaje_acordado_sobre_el_monto_total(): void
    {
        $comiteOlimpico = Propiedad::create([
            'nombre' => 'Comité Olímpico',
            'monto_total_usd' => 162000,
            'porcentaje_forecast' => 20,
        ]);

        $this->assertSame(32400.0, $comiteOlimpico->forecastDeVenta());
    }

    public function test_la_meta_se_recalcula_sola_al_corregir_el_monto_total(): void
    {
        $propiedad = Propiedad::create([
            'nombre' => 'Dvo. Táchira',
            'monto_total_usd' => 100000,
            'porcentaje_forecast' => 20,
        ]);

        // Se corrige el MTP: la meta tiene que seguirlo sin que nadie
        // toque una segunda columna, porque no existe tal columna.
        $propiedad->update(['monto_total_usd' => 50000]);

        $this->assertSame(10000.0, $propiedad->fresh()->forecastDeVenta());
    }

    public function test_la_proporcion_del_pronostico_es_el_porcentaje_sobre_el_monto_total(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor);

        $propiedad = Propiedad::create([
            'nombre' => 'Propiedad A',
            'monto_total_usd' => 7400,
            'porcentaje_forecast' => 20,
        ]);

        $marca = Marca::create([
            'nombre_marca' => 'Marca del ejemplo',
            'vendedor_asignado_id' => $vendedor->id,
        ]);

        $lineaDelChecklist = $marca->propiedadesOfrecidas()->create([
            'propiedad_id' => $propiedad->id,
            'ovp_usd' => 500,
        ]);

        // El ejemplo exacto del cliente: 500 de 7.400.
        $this->assertSame(6.76, $lineaDelChecklist->porcentajeSobreElTotal());
    }

    public function test_una_propiedad_sin_monto_cargado_no_inventa_porcentajes(): void
    {
        $propiedad = Propiedad::create(['nombre' => 'Sin monto todavía']);

        $marca = Marca::create(['nombre_marca' => 'Marca cualquiera']);

        $linea = $marca->propiedadesOfrecidas()->create([
            'propiedad_id' => $propiedad->id,
            'ovp_usd' => 900,
        ]);

        // Ni división entre cero ni un 100 % que no significa nada.
        $this->assertSame(0.0, $linea->porcentajeSobreElTotal());
        $this->assertSame(0.0, $propiedad->forecastDeVenta());
    }

    /* ------------------------------------------------------------------
     | El checklist desde la ficha de una marca
     |-----------------------------------------------------------------*/

    public function test_el_checklist_se_guarda_desde_la_ficha_de_la_marca(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $propiedad = Propiedad::create([
            'nombre' => 'Kombat Challenge',
            'monto_total_usd' => 40000,
        ]);

        $respuesta = $this->actingAs($comercial)->postJson('/api/marcas', [
            'nombreMarca' => 'Marca con propiedades',
            'propiedades' => [
                ['propiedadId' => $propiedad->id, 'ovpUsd' => 5000, 'nota' => 'Paquete de temporada'],
            ],
        ]);

        $respuesta->assertStatus(201);

        $checklistDevuelto = $respuesta->json('data.propiedadesOfrecidas');

        $this->assertCount(1, $checklistDevuelto);
        $this->assertEquals(5000, $checklistDevuelto[0]['ovpUsd']);
        $this->assertEquals(12.5, $checklistDevuelto[0]['porcentajeSobreElTotal']);
        $this->assertEquals(5000, $respuesta->json('data.ovpTotalUsd'));
    }

    public function test_desmarcar_una_propiedad_la_quita_del_checklist(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = Propiedad::create(['nombre' => 'Megafitness', 'monto_total_usd' => 20000]);

        $marca = Marca::create(['nombre_marca' => 'Marca a limpiar']);
        $marca->propiedadesOfrecidas()->create([
            'propiedad_id' => $propiedad->id,
            'ovp_usd' => 1000,
        ]);

        $this->actingAs($comercial)
            ->putJson("/api/marcas/{$marca->id}", [
                'nombreMarca' => 'Marca a limpiar',
                'propiedades' => [],
            ])
            ->assertOk();

        $this->assertDatabaseCount('propiedades_de_marca', 0);
    }

    public function test_guardar_sin_enviar_el_checklist_no_lo_borra(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = Propiedad::create(['nombre' => 'Movewireless', 'monto_total_usd' => 15000]);

        $marca = Marca::create(['nombre_marca' => 'Marca con checklist']);
        $marca->propiedadesOfrecidas()->create([
            'propiedad_id' => $propiedad->id,
            'ovp_usd' => 2000,
        ]);

        // Un cuerpo que no sabe de propiedades no puede llevarse por
        // delante el trabajo de prospección de nadie.
        $this->actingAs($comercial)
            ->putJson("/api/marcas/{$marca->id}", ['nombreMarca' => 'Nombre nuevo'])
            ->assertOk();

        $this->assertDatabaseCount('propiedades_de_marca', 1);
    }

    public function test_el_pronostico_no_puede_pasar_del_monto_total_de_la_propiedad(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = Propiedad::create(['nombre' => 'Dvo. Lara', 'monto_total_usd' => 7400]);

        $respuesta = $this->actingAs($comercial)->postJson('/api/marcas', [
            'nombreMarca' => 'Marca optimista',
            'propiedades' => [
                ['propiedadId' => $propiedad->id, 'ovpUsd' => 9000],
            ],
        ]);

        $respuesta->assertStatus(422);
        $this->assertArrayHasKey('propiedades.0.ovpUsd', $respuesta->json('errores'));
    }

    public function test_no_se_puede_ofrecer_dos_veces_la_misma_propiedad(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = Propiedad::create(['nombre' => 'Sportbiz Venezuela']);

        $respuesta = $this->actingAs($comercial)->postJson('/api/marcas', [
            'nombreMarca' => 'Marca repetida',
            'propiedades' => [
                ['propiedadId' => $propiedad->id, 'ovpUsd' => 100],
                ['propiedadId' => $propiedad->id, 'ovpUsd' => 200],
            ],
        ]);

        $respuesta->assertStatus(422);
    }

    /* ------------------------------------------------------------------
     | La prospección sigue siendo la de siempre
     |-----------------------------------------------------------------*/

    public function test_marcar_propiedades_no_completa_la_prospeccion(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = Propiedad::create(['nombre' => 'Comité Olímpico', 'monto_total_usd' => 162000]);

        $respuesta = $this->actingAs($comercial)->postJson('/api/marcas', [
            // Faltan logo, contacto, cargo y correo.
            'nombreMarca' => 'Marca a medio rellenar',
            'propiedades' => [['propiedadId' => $propiedad->id, 'ovpUsd' => 10000]],
        ]);

        $respuesta->assertStatus(201);

        // El checklist está lleno, pero la fase sigue sin cerrarse.
        $this->assertFalse($respuesta->json('data.faseProspeccionCompletada'));
        $this->assertCount(4, $respuesta->json('data.datosQueFaltan'));
    }

    /* ------------------------------------------------------------------
     | Asignación de propiedades a prospectores
     |-----------------------------------------------------------------*/

    public function test_un_vendedor_no_puede_ofrecer_una_propiedad_que_no_tiene_asignada(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor);
        $otroVendedor = $this->crearUsuario(RolUsuario::Vendedor);

        $propiedadAjena = Propiedad::create([
            'nombre' => 'Dvo. Táchira',
            'monto_total_usd' => 80000,
            'asignada_a_todos' => false,
        ]);
        $propiedadAjena->prospectores()->attach($otroVendedor->id);

        $marca = Marca::create([
            'nombre_marca' => 'Marca propia',
            'vendedor_asignado_id' => $vendedor->id,
        ]);

        $respuesta = $this->actingAs($vendedor)->putJson("/api/marcas/{$marca->id}", [
            'nombreMarca' => 'Marca propia',
            'propiedades' => [['propiedadId' => $propiedadAjena->id, 'ovpUsd' => 1000]],
        ]);

        $respuesta->assertStatus(422);
        $this->assertDatabaseCount('propiedades_de_marca', 0);
    }

    public function test_una_propiedad_rechazada_no_deja_la_marca_creada_a_medias(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor);
        $otroVendedor = $this->crearUsuario(RolUsuario::Vendedor);

        $propiedadAjena = Propiedad::create([
            'nombre' => 'Comité Olímpico',
            'monto_total_usd' => 162000,
            'asignada_a_todos' => false,
        ]);
        $propiedadAjena->prospectores()->attach($otroVendedor->id);

        $this->actingAs($vendedor)
            ->postJson('/api/marcas', [
                'nombreMarca' => 'Marca que no llega a nacer',
                'propiedades' => [['propiedadId' => $propiedadAjena->id, 'ovpUsd' => 5000]],
            ])
            ->assertStatus(422);

        // Si la marca se hubiera quedado creada, al reintentar el alta
        // el equipo se encontraría la misma marca dos veces.
        $this->assertDatabaseCount('marcas', 0);
    }

    public function test_un_vendedor_si_puede_ofrecer_la_propiedad_que_tiene_asignada(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor);

        $propiedadPropia = Propiedad::create([
            'nombre' => 'Dvo. Lara',
            'monto_total_usd' => 60000,
            'asignada_a_todos' => false,
        ]);
        $propiedadPropia->prospectores()->attach($vendedor->id);

        $marca = Marca::create([
            'nombre_marca' => 'Marca propia',
            'vendedor_asignado_id' => $vendedor->id,
        ]);

        $this->actingAs($vendedor)
            ->putJson("/api/marcas/{$marca->id}", [
                'nombreMarca' => 'Marca propia',
                'propiedades' => [['propiedadId' => $propiedadPropia->id, 'ovpUsd' => 3000]],
            ])
            ->assertOk();

        $this->assertDatabaseCount('propiedades_de_marca', 1);
    }

    public function test_una_propiedad_abierta_a_todos_la_puede_ofrecer_cualquiera(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor);

        $propiedadDeTodos = Propiedad::create([
            'nombre' => 'Sportbiz Venezuela',
            'monto_total_usd' => 30000,
            'asignada_a_todos' => true,
        ]);

        $marca = Marca::create([
            'nombre_marca' => 'Marca propia',
            'vendedor_asignado_id' => $vendedor->id,
        ]);

        $this->actingAs($vendedor)
            ->putJson("/api/marcas/{$marca->id}", [
                'nombreMarca' => 'Marca propia',
                'propiedades' => [['propiedadId' => $propiedadDeTodos->id, 'ovpUsd' => 2500]],
            ])
            ->assertOk();

        $this->assertDatabaseCount('propiedades_de_marca', 1);
    }

    /* ------------------------------------------------------------------
     | Permisos del catálogo
     |-----------------------------------------------------------------*/

    public function test_un_vendedor_no_puede_crear_propiedades(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor);

        $this->actingAs($vendedor)
            ->postJson('/api/propiedades', [
                'nombre' => 'Propiedad inventada',
                'montoTotalUsd' => 1000,
                'asignadaATodos' => true,
            ])
            ->assertStatus(403);

        $this->assertDatabaseCount('propiedades', 0);
    }

    public function test_un_comercial_si_puede_crear_propiedades(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $respuesta = $this->actingAs($comercial)->postJson('/api/propiedades', [
            'nombre' => 'Comité Olímpico',
            'montoTotalUsd' => 162000,
            'porcentajeForecast' => 20,
            'asignadaATodos' => true,
        ]);

        $respuesta->assertStatus(201);
        $this->assertEquals(32400, $respuesta->json('data.forecastDeVentaUsd'));
    }

    public function test_una_propiedad_reservada_exige_decir_a_quien(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $respuesta = $this->actingAs($comercial)->postJson('/api/propiedades', [
            'nombre' => 'Propiedad sin dueño',
            'asignadaATodos' => false,
            'prospectoresIds' => [],
        ]);

        // Sin nadie asignado desaparecería del checklist de todo el mundo.
        $respuesta->assertStatus(422);
        $this->assertArrayHasKey('prospectoresIds', $respuesta->json('errores'));
    }

    public function test_un_vendedor_no_puede_crear_campanas(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor);

        $this->actingAs($vendedor)
            ->postJson('/api/campanas', ['nombre' => 'Campaña inventada'])
            ->assertStatus(403);
    }

    /* ------------------------------------------------------------------
     | Lo que suma el tablero
     |-----------------------------------------------------------------*/

    public function test_el_resumen_suma_la_meta_del_catalogo_y_el_pronostico_del_equipo(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor, 'Ana Prospectora');

        $comiteOlimpico = Propiedad::create([
            'nombre' => 'Comité Olímpico',
            'monto_total_usd' => 162000,
            'porcentaje_forecast' => 20,
        ]);

        $kombat = Propiedad::create([
            'nombre' => 'Kombat Challenge',
            'monto_total_usd' => 40000,
            'porcentaje_forecast' => 20,
        ]);

        $marca = Marca::create([
            'nombre_marca' => 'Marca con pronóstico',
            'vendedor_asignado_id' => $vendedor->id,
            // El nombre va desnormalizado junto al id, igual que lo
            // guarda el controlador, para que el informe siga siendo
            // legible aunque la cuenta se dé de baja.
            'vendedor_asignado_nombre' => $vendedor->nombreParaMostrar(),
        ]);

        $marca->propiedadesOfrecidas()->create([
            'propiedad_id' => $comiteOlimpico->id,
            'ovp_usd' => 12000,
        ]);
        $marca->propiedadesOfrecidas()->create([
            'propiedad_id' => $kombat->id,
            'ovp_usd' => 3000,
        ]);

        $respuesta = $this->actingAs($comercial)->getJson('/api/panel/resumen');

        $respuesta->assertOk();

        // Meta del catálogo: 20 % de 162.000 + 20 % de 40.000.
        $this->assertEquals(40400, $respuesta->json('contadores.forecastDePropiedades'));
        $this->assertEquals(15000, $respuesta->json('contadores.ovpPronosticado'));

        // Y el pronóstico se le apunta al vendedor asignado de la marca.
        $forecastDelEquipo = $respuesta->json('forecastPorProspector');

        $this->assertSame('Ana Prospectora', $forecastDelEquipo[0]['vendedorNombre']);
        $this->assertEquals(15000, $forecastDelEquipo[0]['ovpUsd']);
        $this->assertSame(2, $forecastDelEquipo[0]['totalPropiedades']);
    }

    public function test_el_resumen_cuenta_las_empresas_por_zona_segun_si_ya_invierten(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        Marca::create([
            'nombre_marca' => 'Ya patrocina',
            'zona' => 'Caracas',
            'invierte_actualmente' => 'si',
        ]);
        Marca::create([
            'nombre_marca' => 'No patrocina',
            'zona' => 'Caracas',
            'invierte_actualmente' => 'no',
        ]);
        Marca::create([
            'nombre_marca' => 'Sin averiguar',
            'zona' => 'Caracas',
        ]);

        $respuesta = $this->actingAs($comercial)->getJson('/api/panel/resumen');

        $caracas = collect($respuesta->json('inversionPorZona'))
            ->firstWhere('zona', 'Caracas');

        $this->assertSame(3, $caracas['total']);
        $this->assertSame(1, $caracas['siInvierte']);
        $this->assertSame(1, $caracas['noInvierte']);
        $this->assertSame(1, $caracas['sinDefinir']);
    }

    /* ------------------------------------------------------------------
     | Campañas
     |-----------------------------------------------------------------*/

    public function test_la_campana_de_una_marca_se_asigna_desde_su_ficha(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $campana = Campana::create(['nombre' => 'Temporada 2026', 'color' => '#1b9aaa']);

        $respuesta = $this->actingAs($comercial)->postJson('/api/marcas', [
            'nombreMarca' => 'Marca de la campaña',
            'campanaId' => $campana->id,
            // Desde que existe el calendario, asignar campaña exige decir
            // qué día se hace la acción.
            'fechaCampana' => '2026-09-10',
        ]);

        $respuesta->assertStatus(201);
        $this->assertSame($campana->id, $respuesta->json('data.campanaId'));
        $this->assertSame('Temporada 2026', $respuesta->json('data.campanaNombre'));
    }

    public function test_borrar_una_campana_deja_las_marcas_sin_campana_pero_no_las_borra(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $campana = Campana::create(['nombre' => 'Cierre de año']);
        $marca = Marca::create([
            'nombre_marca' => 'Marca de la campaña',
            'campana_id' => $campana->id,
        ]);

        $this->actingAs($comercial)
            ->deleteJson("/api/campanas/{$campana->id}")
            ->assertOk();

        $this->assertDatabaseCount('marcas', 1);
        $this->assertNull($marca->fresh()->campana_id);
    }

    public function test_borrar_una_propiedad_la_quita_del_checklist_de_las_marcas(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $propiedad = Propiedad::create(['nombre' => 'Propiedad retirada', 'monto_total_usd' => 5000]);
        $marca = Marca::create(['nombre_marca' => 'Marca afectada']);

        $marca->propiedadesOfrecidas()->create([
            'propiedad_id' => $propiedad->id,
            'ovp_usd' => 500,
        ]);

        $this->actingAs($comercial)
            ->deleteJson("/api/propiedades/{$propiedad->id}")
            ->assertOk();

        // La marca sigue ahí; solo desaparece la línea del checklist.
        $this->assertDatabaseCount('marcas', 1);
        $this->assertDatabaseCount('propiedades_de_marca', 0);
    }

    /* ------------------------------------------------------------------
     | Ayudante
     |-----------------------------------------------------------------*/

    private function crearUsuario(RolUsuario $rol, string $nombre = 'Usuario de prueba'): User
    {
        return User::create([
            'name' => $nombre,
            'email' => strtolower(str_replace(' ', '.', $nombre)).'-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            // La zona se fija aunque sea nula: con las comprobaciones
            // estrictas de Eloquent, leer una columna que no se asignó al
            // crear el modelo lanza excepción, y el controlador la lee
            // para heredarla en las marcas nuevas.
            'zona' => null,
            'activo' => true,
        ]);
    }
}
