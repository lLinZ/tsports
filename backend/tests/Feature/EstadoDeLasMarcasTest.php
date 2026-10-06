<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\Campana;
use App\Models\ComentarioMarca;
use App\Models\EventoDeCampana;
use App\Models\Marca;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Caliente, tibia o fría.
 * ---------------------------------------------------------------------
 * El estado de una marca se calcula solo con lo que va pasando en ella
 * (App\Support\EstadoDeLasMarcas). Lo que estas pruebas defienden es lo
 * que haría que el equipo dejase de mirarlo:
 *
 *   · LA ACTIVIDAD NUNCA ENFRÍA. Un comentario, una fase o una acción
 *     calientan la marca, venga del estado que venga.
 *   · CORREGIR DATOS NO LA MUEVE. Arreglar el teléfono no es trabajarla.
 *   · LO FIJADO A MANO MANDA hasta que alguien lo suelta.
 *   · EL FILTRO Y SUS CONTADORES CUENTAN LO MISMO, y cada quien cuenta
 *     solo lo que ve (regla 6).
 *
 * Los umbrales de partida son los de la propuesta: caliente hasta 5 días,
 * tibia hasta 15, fría después.
 */
class EstadoDeLasMarcasTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Mediodía en Caracas: lejos de la medianoche, para que los días
        // de las pruebas no dependan de la zona horaria.
        $this->travelTo(CarbonImmutable::parse('2026-10-05 16:00:00', 'UTC'));
    }

    /* ------------------------------------------------------------------
     | El paso del tiempo
     |-----------------------------------------------------------------*/

    public function test_una_marca_recien_registrada_esta_caliente_y_se_enfria_sola(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin);
        $marca = Marca::create(['nombre_marca' => 'Pepsi']);

        $this->estadoDe($marca, $admin)
            ->assertJsonPath('data.estado', 'caliente')
            ->assertJsonPath('data.ultimoMovimiento.motivo', 'alta')
            ->assertJsonPath('data.ultimoMovimiento.haceDias', 0);

        $this->travel(5)->days();
        $this->estadoDe($marca, $admin)->assertJsonPath('data.estado', 'caliente');

        $this->travel(1)->days();
        $this->estadoDe($marca, $admin)
            ->assertJsonPath('data.estado', 'tibia')
            ->assertJsonPath('data.ultimoMovimiento.haceDias', 6);

        $this->travel(10)->days();
        $this->estadoDe($marca, $admin)->assertJsonPath('data.estado', 'fria');
    }

    /* ------------------------------------------------------------------
     | Lo que la mueve, y lo que no
     |-----------------------------------------------------------------*/

    public function test_un_comentario_deja_caliente_una_marca_fria(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin);
        $marca = Marca::create(['nombre_marca' => 'Movistar']);

        $this->travel(40)->days();
        $this->estadoDe($marca, $admin)->assertJsonPath('data.estado', 'fria');

        $this->actingAs($admin)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Llamé y quieren reunión'])
            ->assertCreated();

        $this->estadoDe($marca, $admin)
            ->assertJsonPath('data.estado', 'caliente')
            ->assertJsonPath('data.ultimoMovimiento.motivo', 'comentario')
            ->assertJsonPath('data.ultimoMovimiento.etiqueta', 'Comentario en la bitácora');
    }

    public function test_corregir_el_telefono_no_cambia_el_estado(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin);
        $marca = Marca::create(['nombre_marca' => 'Banesco', 'telefono_contacto' => '0212-555-0000']);

        $this->travel(20)->days();

        $marca->update(['telefono_contacto' => '0212-555-1234', 'notas' => 'Ojo, cambió de número']);

        $this->estadoDe($marca, $admin)
            ->assertJsonPath('data.estado', 'fria')
            ->assertJsonPath('data.ultimoMovimiento.motivo', 'alta');
    }

    public function test_marcar_una_fase_calienta_la_marca(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = Marca::create(['nombre_marca' => 'Polar', 'via_aproximacion' => 'Llamada']);

        $this->travel(30)->days();

        $this->actingAs($comercial)
            ->patchJson("/api/marcas/{$marca->id}/fase", ['fase' => 'aproximacion', 'completada' => true])
            ->assertOk()
            ->assertJsonPath('data.estado', 'caliente')
            ->assertJsonPath('data.ultimoMovimiento.motivo', 'fase');
    }

    public function test_un_comentario_con_fecha_antigua_no_le_quita_el_sitio_a_lo_reciente(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin);
        $marca = Marca::create(['nombre_marca' => 'Farmatodo']);

        // Lo que hace el importador: una entrada vieja, con su fecha.
        $comentarioViejo = new ComentarioMarca([
            'marca_id' => $marca->id,
            'autor_nombre' => 'Alguien',
            'cuerpo' => 'De antes de migrar',
        ]);
        $comentarioViejo->created_at = now()->subDays(90);
        $comentarioViejo->save();

        $this->estadoDe($marca, $admin)
            ->assertJsonPath('data.estado', 'caliente')
            ->assertJsonPath('data.ultimoMovimiento.motivo', 'alta');
    }

    /* ------------------------------------------------------------------
     | Las acciones de campaña
     |-----------------------------------------------------------------*/

    public function test_una_accion_por_delante_la_mantiene_caliente_hasta_que_pasa_el_dia(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin);
        $campana = Campana::create(['nombre' => 'Visita presencial']);
        $marca = Marca::create(['nombre_marca' => 'Cerveza Zulia']);

        EventoDeCampana::create([
            'marca_id' => $marca->id,
            'campana_id' => $campana->id,
            'campana_nombre' => $campana->nombre,
            'campana_color' => '#2563eb',
            'fecha' => '2026-11-14',
        ]);

        // Un mes sin tocarla, pero con la visita por delante.
        $this->travelTo(CarbonImmutable::parse('2026-11-04 16:00:00', 'UTC'));

        $this->estadoDe($marca, $admin)
            ->assertJsonPath('data.estado', 'caliente')
            ->assertJsonPath('data.proximaAccionEl', '2026-11-14');

        // Pasada la visita, se enfría contando desde ella, no desde que
        // se anotó: a los tres días sigue caliente…
        $this->travelTo(CarbonImmutable::parse('2026-11-17 16:00:00', 'UTC'));

        $this->estadoDe($marca, $admin)
            ->assertJsonPath('data.estado', 'caliente')
            ->assertJsonPath('data.proximaAccionEl', null)
            ->assertJsonPath('data.ultimoMovimiento.el', '2026-11-14')
            ->assertJsonPath('data.ultimoMovimiento.motivo', 'accion_de_campana');

        // …y a los dieciséis ya está fría.
        $this->travelTo(CarbonImmutable::parse('2026-11-30 16:00:00', 'UTC'));
        $this->estadoDe($marca, $admin)->assertJsonPath('data.estado', 'fria');
    }

    /* ------------------------------------------------------------------
     | Fijarlo a mano
     |-----------------------------------------------------------------*/

    public function test_el_estado_fijado_no_lo_pisa_el_calculo_automatico(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin, 'Ana Admin');
        $marca = Marca::create(['nombre_marca' => 'Digitel']);

        $this->actingAs($admin)
            ->patchJson("/api/marcas/{$marca->id}/estado", ['estado' => 'fria'])
            ->assertOk()
            ->assertJsonPath('data.estado', 'fria')
            ->assertJsonPath('data.estadoAutomatico', 'caliente')
            ->assertJsonPath('data.estadoFijado.porNombre', 'Ana Admin');

        // Un comentario la mueve, pero lo fijado sigue mandando.
        $this->actingAs($admin)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Dijeron que no este año'])
            ->assertCreated();

        $this->estadoDe($marca, $admin)->assertJsonPath('data.estado', 'fria');

        // Al soltarla vuelve al cálculo.
        $this->actingAs($admin)
            ->patchJson("/api/marcas/{$marca->id}/estado", ['estado' => null])
            ->assertOk()
            ->assertJsonPath('data.estado', 'caliente')
            ->assertJsonPath('data.estadoFijado', null);
    }

    public function test_solo_fija_el_estado_quien_puede_editar_la_marca(): void
    {
        $duenio = $this->crearUsuario(RolUsuario::Vendedor);
        $otroAgente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Movilnet', 'vendedor_asignado_id' => $duenio->id]);

        $this->actingAs($otroAgente)
            ->patchJson("/api/marcas/{$marca->id}/estado", ['estado' => 'caliente'])
            ->assertForbidden();

        $this->actingAs($duenio)
            ->patchJson("/api/marcas/{$marca->id}/estado", ['estado' => 'tibia'])
            ->assertOk()
            ->assertJsonPath('data.estado', 'tibia');
    }

    /* ------------------------------------------------------------------
     | El filtro del tablero y sus contadores
     |-----------------------------------------------------------------*/

    public function test_el_filtro_y_sus_contadores_cuentan_lo_mismo(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin);

        Marca::create(['nombre_marca' => 'Fría vieja']);
        $this->travel(10)->days();
        Marca::create(['nombre_marca' => 'Tibia']);
        $this->travel(10)->days();
        Marca::create(['nombre_marca' => 'Caliente 1']);
        $fijada = Marca::create(['nombre_marca' => 'Caliente pero fijada fría']);
        $fijada->forceFill(['estado_fijado' => 'fria'])->save();

        $respuesta = $this->actingAs($admin)->getJson('/api/marcas?estado=caliente')->assertOk();

        $this->assertSame(['Caliente 1'], array_column($respuesta->json('data'), 'nombreMarca'));
        $this->assertSame(
            ['caliente' => 1, 'tibia' => 1, 'fria' => 2],
            $respuesta->json('contadoresDeEstado'),
        );

        // Cada contador dice cuántas salen al pulsarlo.
        $this->assertCount(2, $this->actingAs($admin)->getJson('/api/marcas?estado=fria')->json('data'));
        $this->assertCount(1, $this->actingAs($admin)->getJson('/api/marcas?estado=tibia')->json('data'));
    }

    public function test_un_agente_solo_cuenta_sus_marcas(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $otro = $this->crearUsuario(RolUsuario::Vendedor);

        Marca::create(['nombre_marca' => 'Suya', 'vendedor_asignado_id' => $agente->id]);
        Marca::create(['nombre_marca' => 'Ajena', 'vendedor_asignado_id' => $otro->id]);

        $this->actingAs($agente)
            ->getJson('/api/marcas')
            ->assertJsonPath('contadoresDeEstado.caliente', 1);

        $this->actingAs($agente)
            ->getJson('/api/panel/resumen')
            ->assertJsonPath('porEstado.caliente', 1)
            ->assertJsonPath('porEstado.fria', 0);
    }

    /* ------------------------------------------------------------------
     | Los umbrales
     |-----------------------------------------------------------------*/

    public function test_solo_el_administrador_cambia_los_umbrales_y_recolorean_al_momento(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin);
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = Marca::create(['nombre_marca' => 'Pepsi']);

        $this->travel(4)->days();
        $this->estadoDe($marca, $admin)->assertJsonPath('data.estado', 'caliente');

        $this->actingAs($comercial)
            ->putJson('/api/umbrales-del-estado', ['diasCaliente' => 2, 'diasTibia' => 3])
            ->assertForbidden();

        $this->actingAs($admin)
            ->putJson('/api/umbrales-del-estado', ['diasCaliente' => 2, 'diasTibia' => 3])
            ->assertOk()
            ->assertJsonPath('data.diasCaliente', 2);

        $this->estadoDe($marca, $admin)->assertJsonPath('data.estado', 'fria');
    }

    public function test_tibia_tiene_que_durar_mas_que_caliente(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin);

        $this->actingAs($admin)
            ->putJson('/api/umbrales-del-estado', ['diasCaliente' => 10, 'diasTibia' => 10])
            ->assertStatus(422)
            ->assertJsonPath('errores.diasTibia.0', 'Tibia tiene que durar más días que caliente.');
    }

    /* ------------------------------------------------------------------
     | Los días son los de Caracas
     |-----------------------------------------------------------------*/

    public function test_lo_de_esta_noche_en_caracas_cuenta_como_hoy_y_no_como_manana(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin);

        // 21:30 en Caracas es la 01:30 del día siguiente en UTC.
        $this->travelTo(CarbonImmutable::parse('2026-10-06 01:30:00', 'UTC'));
        $marca = Marca::create(['nombre_marca' => 'Nocturna']);

        // A la mañana siguiente en Caracas fue «ayer», no «hoy».
        $this->travelTo(CarbonImmutable::parse('2026-10-06 13:00:00', 'UTC'));

        $this->estadoDe($marca, $admin)
            ->assertJsonPath('data.ultimoMovimiento.el', '2026-10-05')
            ->assertJsonPath('data.ultimoMovimiento.haceDias', 1);
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    private function estadoDe(Marca $marca, User $quienMira): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($quienMira)->getJson("/api/marcas/{$marca->id}")->assertOk();
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
