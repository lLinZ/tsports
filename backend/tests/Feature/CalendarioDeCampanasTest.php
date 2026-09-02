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
 * Pruebas del calendario y del historial de acciones de campaña.
 * ---------------------------------------------------------------------
 * Tres bloques:
 *
 *   · La FECHA al asignar campaña. Sin día, la acción no se puede
 *     situar en ninguna semana, así que el servidor la exige.
 *
 *   · El HISTORIAL. Cada asignación deja un registro en
 *     `eventos_de_campana`, y esa tabla es la que permite que una marca
 *     tenga varias acciones a lo largo del tiempo. Se comprueba también
 *     que guardar la ficha sin cambiar la acción NO duplica la línea.
 *
 *   · El CALENDARIO, que lee del historial: siete días siempre, sin
 *     colarse los de otras semanas, y el resumen del reporte cuadrando
 *     con lo que hay dentro.
 */
class CalendarioDeCampanasTest extends TestCase
{
    use RefreshDatabase;

    /* ------------------------------------------------------------------
     | La fecha al asignar campaña
     |-----------------------------------------------------------------*/

    public function test_asignar_una_campana_sin_fecha_se_rechaza(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $campana = Campana::create(['nombre' => 'Visita presencial']);

        $respuesta = $this->actingAs($comercial)->postJson('/api/marcas', [
            'nombreMarca' => 'Azúcar la Pastora',
            'campanaId' => $campana->id,
            // Falta fechaCampana.
        ]);

        $respuesta->assertStatus(422);
        $this->assertArrayHasKey('fechaCampana', $respuesta->json('errores'));
    }

    public function test_asignar_campana_con_fecha_se_guarda(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $campana = Campana::create(['nombre' => 'Visita presencial']);

        $respuesta = $this->actingAs($comercial)->postJson('/api/marcas', [
            'nombreMarca' => 'Azúcar la Pastora',
            'campanaId' => $campana->id,
            'fechaCampana' => '2026-09-10',
        ]);

        $respuesta->assertStatus(201);
        $respuesta->assertJsonPath('data.fechaCampana', '2026-09-10');
    }

    public function test_una_marca_sin_campana_no_necesita_fecha(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $this->actingAs($comercial)
            ->postJson('/api/marcas', ['nombreMarca' => 'Marca suelta'])
            ->assertStatus(201)
            ->assertJsonPath('data.fechaCampana', null);
    }

    public function test_quitar_la_campana_borra_tambien_la_fecha(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $campana = Campana::create(['nombre' => 'Visita presencial']);

        $marca = Marca::create([
            'nombre_marca' => 'Azúcar la Pastora',
            'campana_id' => $campana->id,
            'fecha_campana' => '2026-09-10',
        ]);

        $this->actingAs($comercial)
            ->putJson("/api/marcas/{$marca->id}", [
                'nombreMarca' => 'Azúcar la Pastora',
                'campanaId' => null,
            ])
            ->assertOk();

        $marcaActualizada = $marca->fresh();

        $this->assertNull($marcaActualizada->campana_id);
        $this->assertNull(
            $marcaActualizada->fecha_campana,
            'Al quitar la campaña la fecha debe irse con ella.',
        );
    }

    /* ------------------------------------------------------------------
     | El historial
     |-----------------------------------------------------------------*/

    public function test_asignar_una_campana_deja_registro_en_el_historial(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'Daymar Marcano');
        $campana = Campana::create(['nombre' => 'Visita presencial', 'color' => '#2563eb']);

        $respuesta = $this->actingAs($comercial)->postJson('/api/marcas', [
            'nombreMarca' => 'Azúcar la Pastora',
            'campanaId' => $campana->id,
            'fechaCampana' => '2026-09-10',
        ]);

        $respuesta->assertStatus(201);

        $evento = EventoDeCampana::query()->firstOrFail();

        $this->assertSame($respuesta->json('data.id'), $evento->marca_id);
        $this->assertSame('Visita presencial', $evento->campana_nombre);
        $this->assertSame('#2563eb', $evento->campana_color);
        $this->assertSame('2026-09-10', $evento->fecha->toDateString());
        $this->assertSame('Daymar Marcano', $evento->registrado_por_nombre);
    }

    public function test_guardar_sin_cambiar_la_accion_no_duplica_el_historial(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $campana = Campana::create(['nombre' => 'Visita presencial']);

        $idDeLaMarca = $this->actingAs($comercial)->postJson('/api/marcas', [
            'nombreMarca' => 'Azúcar la Pastora',
            'campanaId' => $campana->id,
            'fechaCampana' => '2026-09-10',
        ])->json('data.id');

        $this->assertSame(1, EventoDeCampana::query()->count());

        // Se corrige el teléfono, sin tocar campaña ni fecha.
        $this->actingAs($comercial)->putJson("/api/marcas/{$idDeLaMarca}", [
            'nombreMarca' => 'Azúcar la Pastora',
            'campanaId' => $campana->id,
            'fechaCampana' => '2026-09-10',
            'telefonoContacto' => '+58 412 000 0000',
        ])->assertOk();

        $this->assertSame(
            1,
            EventoDeCampana::query()->count(),
            'Guardar sin cambiar la acción no debe repetir la línea del historial.',
        );
    }

    public function test_cambiar_la_fecha_anota_una_accion_nueva(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $campana = Campana::create(['nombre' => 'Visita presencial']);

        $idDeLaMarca = $this->actingAs($comercial)->postJson('/api/marcas', [
            'nombreMarca' => 'Azúcar la Pastora',
            'campanaId' => $campana->id,
            'fechaCampana' => '2026-09-10',
        ])->json('data.id');

        // Se reprograma la visita para otro día.
        $this->actingAs($comercial)->putJson("/api/marcas/{$idDeLaMarca}", [
            'nombreMarca' => 'Azúcar la Pastora',
            'campanaId' => $campana->id,
            'fechaCampana' => '2026-09-17',
        ])->assertOk();

        $this->assertSame(2, EventoDeCampana::query()->count());
    }

    public function test_cambiar_de_campana_anota_una_accion_nueva(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $visita = Campana::create(['nombre' => 'Visita presencial']);
        $sportbiz = Campana::create(['nombre' => 'Invitación a evento Sportbiz']);

        $idDeLaMarca = $this->actingAs($comercial)->postJson('/api/marcas', [
            'nombreMarca' => 'Azúcar la Pastora',
            'campanaId' => $visita->id,
            'fechaCampana' => '2026-09-10',
        ])->json('data.id');

        $this->actingAs($comercial)->putJson("/api/marcas/{$idDeLaMarca}", [
            'nombreMarca' => 'Azúcar la Pastora',
            'campanaId' => $sportbiz->id,
            'fechaCampana' => '2026-09-20',
        ])->assertOk();

        $nombresEnElHistorial = EventoDeCampana::query()
            ->orderBy('fecha')
            ->pluck('campana_nombre')
            ->all();

        $this->assertSame(
            ['Visita presencial', 'Invitación a evento Sportbiz'],
            $nombresEnElHistorial,
        );
    }

    public function test_el_historial_sobrevive_al_borrado_de_la_campana(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $campana = Campana::create(['nombre' => 'Visita presencial']);

        $this->actingAs($comercial)->postJson('/api/marcas', [
            'nombreMarca' => 'Azúcar la Pastora',
            'campanaId' => $campana->id,
            'fechaCampana' => '2026-09-10',
        ])->assertStatus(201);

        // Que alguien deje de usar la campaña no borra las visitas que
        // de verdad se hicieron.
        $this->actingAs($comercial)
            ->deleteJson("/api/campanas/{$campana->id}")
            ->assertOk();

        $evento = EventoDeCampana::query()->firstOrFail();

        $this->assertNull($evento->campana_id);
        $this->assertSame(
            'Visita presencial',
            $evento->campana_nombre,
            'El nombre copiado en el evento es lo que salva el historial.',
        );
    }

    /* ------------------------------------------------------------------
     | El calendario
     |-----------------------------------------------------------------*/

    public function test_la_semana_devuelve_siempre_los_siete_dias(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $respuesta = $this->actingAs($comercial)
            ->getJson('/api/panel/calendario?desde=2026-09-10');

        $respuesta->assertOk()->assertJsonCount(7, 'dias');

        // 2026-09-10 es jueves: la semana va del lunes 7 al domingo 13.
        $respuesta->assertJsonPath('periodo.desde', '2026-09-07');
        $respuesta->assertJsonPath('periodo.hasta', '2026-09-13');
    }

    public function test_el_evento_aparece_en_el_dia_que_le_toca(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $this->crearEvento('Azúcar la Pastora', 'Visita presencial', '2026-09-10', 'Lara');

        $respuesta = $this->actingAs($comercial)
            ->getJson('/api/panel/calendario?desde=2026-09-10');

        $respuesta->assertOk();

        $dias = collect($respuesta->json('dias'));

        // El jueves 10 lleva el evento…
        $jueves = $dias->firstWhere('fecha', '2026-09-10');
        $this->assertCount(1, $jueves['eventos']);
        $this->assertSame('Azúcar la Pastora', $jueves['eventos'][0]['marcaNombre']);
        $this->assertSame('Visita presencial', $jueves['eventos'][0]['campanaNombre']);
        $this->assertSame('Lara', $jueves['eventos'][0]['zona']);

        // …y los otros seis días están vacíos, pero presentes.
        $this->assertSame(
            0,
            $dias->where('fecha', '!=', '2026-09-10')
                ->sum(fn (array $dia): int => count($dia['eventos'])),
        );
    }

    public function test_una_marca_puede_tener_varias_acciones_en_la_misma_semana(): void
    {
        // Este es el caso que las columnas de `marcas` no podían cubrir:
        // a la misma marca se la visita el lunes y se la invita el viernes.
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $marca = Marca::create(['nombre_marca' => 'Azúcar la Pastora', 'zona' => 'Lara']);

        $this->crearEventoParaLaMarca($marca, 'Visita presencial', '2026-09-07');
        $this->crearEventoParaLaMarca($marca, 'Invitación a evento Sportbiz', '2026-09-11');

        $respuesta = $this->actingAs($comercial)
            ->getJson('/api/panel/calendario?desde=2026-09-10');

        $respuesta->assertOk()->assertJsonPath('resumen.totalDeAcciones', 2);

        // Dos acciones, pero una sola marca alcanzada.
        $respuesta->assertJsonPath('resumen.marcasDistintas', 1);

        $dias = collect($respuesta->json('dias'));
        $this->assertCount(1, $dias->firstWhere('fecha', '2026-09-07')['eventos']);
        $this->assertCount(1, $dias->firstWhere('fecha', '2026-09-11')['eventos']);
    }

    public function test_los_eventos_de_otra_semana_no_se_cuelan(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $this->crearEvento('De esta semana', 'Visita presencial', '2026-09-10');
        $this->crearEvento('De la semana que viene', 'Visita presencial', '2026-09-17');

        $respuesta = $this->actingAs($comercial)
            ->getJson('/api/panel/calendario?desde=2026-09-10');

        $respuesta->assertOk()->assertJsonPath('resumen.totalDeAcciones', 1);

        $nombres = collect($respuesta->json('dias'))
            ->flatMap(fn (array $dia): array => $dia['eventos'])
            ->pluck('marcaNombre');

        $this->assertSame(['De esta semana'], $nombres->all());
    }

    public function test_una_marca_sin_ningun_evento_no_sale_en_el_calendario(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        // Como las 71 marcas importadas: existen, pero nadie les ha
        // programado ninguna acción todavía.
        Marca::create(['nombre_marca' => 'Sin acciones']);

        $this->actingAs($comercial)
            ->getJson('/api/panel/calendario?desde=2026-09-10')
            ->assertOk()
            ->assertJsonPath('resumen.totalDeAcciones', 0);
    }

    /* ------------------------------------------------------------------
     | El resumen del reporte
     |-----------------------------------------------------------------*/

    public function test_el_resumen_cuenta_por_campana_zona_y_vendedor(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        foreach ([
            ['Marca A', 'Visita presencial', 'Caracas', '2026-09-07'],
            ['Marca B', 'Visita presencial', 'Caracas', '2026-09-08'],
            ['Marca C', 'Invitación a evento Sportbiz', 'Lara', '2026-09-09'],
        ] as [$nombreDeLaMarca, $nombreDeLaCampana, $zona, $fecha]) {
            $marca = Marca::create([
                'nombre_marca' => $nombreDeLaMarca,
                'zona' => $zona,
                'vendedor_asignado_nombre' => 'Ana Vendedora',
            ]);

            $this->crearEventoParaLaMarca($marca, $nombreDeLaCampana, $fecha);
        }

        $respuesta = $this->actingAs($comercial)
            ->getJson('/api/panel/calendario?desde=2026-09-10');

        $respuesta->assertOk()->assertJsonPath('resumen.totalDeAcciones', 3);

        // Ordenado de mayor a menor: la visita presencial va primero.
        $respuesta->assertJsonPath('resumen.porCampana.0.etiqueta', 'Visita presencial');
        $respuesta->assertJsonPath('resumen.porCampana.0.total', 2);

        $respuesta->assertJsonPath('resumen.porZona.0.etiqueta', 'Caracas');
        $respuesta->assertJsonPath('resumen.porZona.0.total', 2);

        $respuesta->assertJsonPath('resumen.porVendedor.0.etiqueta', 'Ana Vendedora');
        $respuesta->assertJsonPath('resumen.porVendedor.0.total', 3);
    }

    public function test_una_fecha_con_formato_invalido_se_rechaza(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        // Mejor un error claro que caer en la semana actual sin avisar:
        // si la interfaz manda mal la fecha, hay que enterarse.
        $this->actingAs($comercial)
            ->getJson('/api/panel/calendario?desde=10-09-2026')
            ->assertStatus(422);
    }


    /* ------------------------------------------------------------------
     | La vista mensual
     |-----------------------------------------------------------------*/

    public function test_la_vista_mensual_cubre_semanas_completas(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $respuesta = $this->actingAs($comercial)
            ->getJson('/api/panel/calendario?vista=mes&desde=2026-09-10');

        $respuesta->assertOk();

        // Septiembre de 2026 empieza en martes y acaba en miércoles, así
        // que la rejilla va del lunes 31 de agosto al domingo 4 de
        // octubre: cinco semanas completas, 35 días.
        $respuesta->assertJsonPath('periodo.desde', '2026-08-31');
        $respuesta->assertJsonPath('periodo.hasta', '2026-10-04');
        $respuesta->assertJsonCount(35, 'dias');
        $respuesta->assertJsonPath('periodo.vista', 'mes');
    }

    public function test_los_dias_de_relleno_se_marcan_como_de_otro_mes(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $dias = collect(
            $this->actingAs($comercial)
                ->getJson('/api/panel/calendario?vista=mes&desde=2026-09-10')
                ->json('dias'),
        );

        // El 31 de agosto es relleno; el 1 de septiembre ya es del mes.
        $this->assertTrue($dias->firstWhere('fecha', '2026-08-31')['esDeOtroMes']);
        $this->assertFalse($dias->firstWhere('fecha', '2026-09-01')['esDeOtroMes']);
        $this->assertTrue($dias->firstWhere('fecha', '2026-10-01')['esDeOtroMes']);
    }

    public function test_la_vista_mensual_recoge_eventos_de_todo_el_mes(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        // Tres acciones repartidas por septiembre: en la vista semanal
        // solo se vería una, en la mensual las tres.
        $this->crearEvento('Marca A', 'Visita presencial', '2026-09-02');
        $this->crearEvento('Marca B', 'Visita presencial', '2026-09-10');
        $this->crearEvento('Marca C', 'Visita presencial', '2026-09-28');

        $this->actingAs($comercial)
            ->getJson('/api/panel/calendario?vista=mes&desde=2026-09-10')
            ->assertOk()
            ->assertJsonPath('resumen.totalDeAcciones', 3);

        $this->actingAs($comercial)
            ->getJson('/api/panel/calendario?vista=semana&desde=2026-09-10')
            ->assertOk()
            ->assertJsonPath('resumen.totalDeAcciones', 1);
    }

    public function test_la_etiqueta_del_mes_lleva_el_nombre_del_mes(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $this->actingAs($comercial)
            ->getJson('/api/panel/calendario?vista=mes&desde=2026-09-10')
            ->assertOk()
            ->assertJsonPath('periodo.etiqueta', 'Septiembre de 2026');
    }

    public function test_una_vista_desconocida_se_rechaza(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $this->actingAs($comercial)
            ->getJson('/api/panel/calendario?vista=trimestre')
            ->assertStatus(422);
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    /** Crea una marca con un evento de campaña en esa fecha. */
    private function crearEvento(
        string $nombreDeLaMarca,
        string $nombreDeLaCampana,
        string $fecha,
        ?string $zona = null,
    ): EventoDeCampana {
        $marca = Marca::create(['nombre_marca' => $nombreDeLaMarca, 'zona' => $zona]);

        return $this->crearEventoParaLaMarca($marca, $nombreDeLaCampana, $fecha);
    }

    /** Añade otra acción al historial de una marca que ya existe. */
    private function crearEventoParaLaMarca(
        Marca $marca,
        string $nombreDeLaCampana,
        string $fecha,
    ): EventoDeCampana {
        $campana = Campana::firstOrCreate(['nombre' => $nombreDeLaCampana]);

        return EventoDeCampana::create([
            'marca_id' => $marca->id,
            'campana_id' => $campana->id,
            'campana_nombre' => $campana->nombre,
            'campana_color' => $campana->color ?? '#1b9aaa',
            'fecha' => $fecha,
        ]);
    }

    private function crearUsuario(
        RolUsuario $rol,
        string $nombre = 'Usuario de prueba',
    ): User {
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
