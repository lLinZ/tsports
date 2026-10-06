<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\ComentarioMarca;
use App\Models\EventoDeCampana;
use App\Models\Marca;
use App\Models\Notificacion;
use App\Models\Recordatorio;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * El botón «Contacté» y la cifra «Sin siguiente paso».
 * ---------------------------------------------------------------------
 * Lo que defienden estas pruebas:
 *
 *   · «Contacté» deja la entrada en la bitácora (con su tipo) y el
 *     recordatorio a la vez, y los «N días» los cuenta el servidor desde
 *     el día de Caracas.
 *   · La entrada es una entrada como las demás: calienta la marca y
 *     avisa a quien avisa un comentario.
 *   · Sin siguiente paso es no tener ni recordatorio pendiente ni acción
 *     de campaña por delante; la cifra del resumen y el filtro del tablero
 *     dicen lo mismo, y por persona en «Carga por agente».
 */
class ContactoYSiguientePasoTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // 22:00 en Caracas, que en UTC ya es el día 7: si los días se
        // contaran en UTC, «en 3 días» caería el 10 y no el 9.
        $this->travelTo(CarbonImmutable::parse('2026-10-07 02:00:00', 'UTC'));
    }

    /* ------------------------------------------------------------------
     | «Contacté»
     |-----------------------------------------------------------------*/

    public function test_contacte_deja_la_entrada_y_el_siguiente_paso_contando_desde_caracas(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Ana Agente');
        $marca = Marca::create(['nombre_marca' => 'Pepsi', 'vendedor_asignado_id' => $agente->id]);

        // El movimiento solo avanza: en el mismo instante del alta, el
        // motivo seguiría siendo el alta.
        $this->travel(10)->minutes();

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/contactos", [
                'tipo' => 'llamada',
                'cuerpo' => 'Pidió el dossier de Kombat Challenge',
                'retomarEnDias' => 3,
            ])
            ->assertCreated()
            ->assertJsonPath('recordatorio.fecha', '2026-10-09')
            ->assertJsonPath('recordatorio.nota', 'Volver a llamar')
            ->assertJsonPath('recordatorio.esMio', true);

        $entrada = ComentarioMarca::query()->sole();
        $this->assertSame('Pidió el dossier de Kombat Challenge', $entrada->cuerpo);
        $this->assertSame('llamada', $entrada->tipo_de_contacto->value);

        // Calienta la marca, con el motivo propio de un contacto.
        $this->actingAs($agente)
            ->getJson("/api/marcas/{$marca->id}")
            ->assertOk()
            ->assertJsonPath('data.estado', 'caliente')
            ->assertJsonPath('data.ultimoMovimiento.motivo', 'contacto');

        // Y en la bitácora sale con su etiqueta.
        $this->actingAs($agente)
            ->getJson("/api/marcas/{$marca->id}/comentarios")
            ->assertOk()
            ->assertJsonPath('data.0.tipoDeContacto.etiqueta', 'Llamada');
    }

    public function test_el_siguiente_paso_puede_ser_un_dia_concreto_con_su_nota_o_ninguno(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = Marca::create(['nombre_marca' => 'Banesco']);

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/contactos", [
                'tipo' => 'reunion',
                'cuerpo' => 'Reunión con mercadeo',
                'retomarEl' => '2026-10-20',
                'notaDelSiguientePaso' => 'Mandar la propuesta',
            ])
            ->assertCreated()
            ->assertJsonPath('recordatorio.fecha', '2026-10-20')
            ->assertJsonPath('recordatorio.nota', 'Mandar la propuesta');

        // «No hace falta»: entrada sí, recordatorio no.
        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/contactos", [
                'tipo' => 'correo',
                'cuerpo' => 'Dijeron que este año no',
            ])
            ->assertCreated()
            ->assertJsonPath('recordatorio', null);

        $this->assertSame(2, ComentarioMarca::query()->count());
        $this->assertSame(1, Recordatorio::query()->count());
    }

    public function test_contacte_cumple_el_recordatorio_que_tocaba(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Pepsi', 'vendedor_asignado_id' => $agente->id]);
        $otraMarca = Marca::create(['nombre_marca' => 'Otra', 'vendedor_asignado_id' => $agente->id]);

        $queTocaba = Recordatorio::create(['marca_id' => $marca->id, 'persona_id' => $agente->id, 'fecha' => '2026-10-06']);
        $deOtraMarca = Recordatorio::create(['marca_id' => $otraMarca->id, 'persona_id' => $agente->id, 'fecha' => '2026-10-06']);

        // El de otra marca no se puede cumplir desde aquí.
        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/contactos", [
                'tipo' => 'llamada', 'cuerpo' => 'Hablé con Juan', 'recordatorioCumplidoId' => $deOtraMarca->id,
            ])
            ->assertUnprocessable();

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/contactos", [
                'tipo' => 'llamada', 'cuerpo' => 'Hablé con Juan', 'retomarEnDias' => 7, 'recordatorioCumplidoId' => $queTocaba->id,
            ])
            ->assertCreated();

        $this->assertNotNull($queTocaba->fresh()->cumplido_en);
        $this->assertNull($deOtraMarca->fresh()->cumplido_en);

        // En «Para hoy» ya no sale; sale el nuevo, para dentro de una semana.
        $this->actingAs($agente)
            ->getJson('/api/recordatorios/mios')
            ->assertJsonCount(1, 'paraHoy')
            ->assertJsonPath('paraHoy.0.marca.nombre', 'Otra');
    }

    public function test_no_se_acepta_un_dia_pasado_ni_las_dos_formas_a_la_vez(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = Marca::create(['nombre_marca' => 'Polar']);

        // El 6 es HOY en Caracas: vale. El 5 ya pasó.
        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/contactos", ['tipo' => 'llamada', 'cuerpo' => 'x', 'retomarEl' => '2026-10-05'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('retomarEl', 'errores');

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/contactos", ['tipo' => 'llamada', 'cuerpo' => 'x', 'retomarEl' => '2026-10-06'])
            ->assertCreated();

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/contactos", [
                'tipo' => 'llamada', 'cuerpo' => 'x', 'retomarEl' => '2026-10-10', 'retomarEnDias' => 3,
            ])
            ->assertUnprocessable();

        // Sin decir qué se habló no hay entrada.
        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/contactos", ['tipo' => 'llamada', 'cuerpo' => '   '])
            ->assertUnprocessable();
    }

    public function test_un_agente_no_anota_contactos_en_una_marca_ajena(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $otraAgente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Ajena', 'vendedor_asignado_id' => $otraAgente->id]);

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/contactos", ['tipo' => 'llamada', 'cuerpo' => 'Hola'])
            ->assertForbidden();

        $this->assertSame(0, ComentarioMarca::query()->count());
    }

    public function test_el_contacto_avisa_como_un_comentario(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Pepsi', 'vendedor_asignado_id' => $agente->id]);

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/contactos", ['tipo' => 'whatsapp', 'cuerpo' => 'Le mandé el dossier'])
            ->assertCreated();

        $aviso = Notificacion::query()->where('destinatario_id', $administrador->id)->sole();
        $this->assertSame(Notificacion::TIPO_COMENTARIO, $aviso->tipo);

        // A quien lo escribió no le llega nada.
        $this->assertSame(0, Notificacion::query()->where('destinatario_id', $agente->id)->count());
    }

    /* ------------------------------------------------------------------
     | Sin siguiente paso
     |-----------------------------------------------------------------*/

    public function test_sin_siguiente_paso_es_no_tener_ni_recordatorio_pendiente_ni_accion_por_delante(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $ana = $this->crearUsuario(RolUsuario::Vendedor, 'Ana');
        $luis = $this->crearUsuario(RolUsuario::Vendedor, 'Luis');

        // Con siguiente paso: un recordatorio pendiente (aunque vencido) o
        // una acción de campaña de hoy en adelante.
        $conRecordatorio = Marca::create(['nombre_marca' => 'Con recordatorio', 'vendedor_asignado_id' => $ana->id]);
        Recordatorio::create(['marca_id' => $conRecordatorio->id, 'persona_id' => $ana->id, 'fecha' => '2026-10-01']);

        $conAccion = Marca::create(['nombre_marca' => 'Con acción', 'vendedor_asignado_id' => $ana->id]);
        $this->anotarAccion($conAccion, '2026-10-06');

        // Sin siguiente paso: lo cumplido y lo que ya pasó no cuentan.
        $cumplido = Marca::create(['nombre_marca' => 'Cumplido', 'vendedor_asignado_id' => $ana->id]);
        Recordatorio::create([
            'marca_id' => $cumplido->id, 'persona_id' => $ana->id, 'fecha' => '2026-10-02', 'cumplido_en' => now(),
        ]);

        $accionPasada = Marca::create(['nombre_marca' => 'Acción pasada', 'vendedor_asignado_id' => $luis->id]);
        $this->anotarAccion($accionPasada, '2026-10-05');

        Marca::create(['nombre_marca' => 'Nada', 'vendedor_asignado_id' => $luis->id]);
        Marca::create(['nombre_marca' => 'Sin dueño']);

        $panel = $this->actingAs($administrador)->getJson('/api/panel/resumen')->assertOk();

        $this->assertSame(4, $panel->json('contadores.sinSiguientePaso'));

        $porAgente = collect($panel->json('porVendedor'))->keyBy('vendedorId');
        $this->assertSame(1, $porAgente[$ana->id]['sinSiguientePaso']);
        $this->assertSame(2, $porAgente[$luis->id]['sinSiguientePaso']);

        // Pulsar la cifra abre exactamente esas.
        $nombres = collect(
            $this->actingAs($administrador)->getJson('/api/marcas?siguientePaso=sin')->assertOk()->json('data'),
        )->pluck('nombreMarca')->sort()->values()->all();

        $this->assertSame(['Acción pasada', 'Cumplido', 'Nada', 'Sin dueño'], $nombres);

        // Y el agente ve la suya entre las suyas.
        $this->actingAs($ana)
            ->getJson('/api/panel/resumen')
            ->assertOk()
            ->assertJsonPath('misNumeros.sinSiguientePaso', 1);

        $this->actingAs($ana)
            ->getJson('/api/marcas?siguientePaso=sin')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.nombreMarca', 'Cumplido');
    }

    public function test_contacte_con_siguiente_paso_saca_a_la_marca_de_la_lista(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Pepsi', 'vendedor_asignado_id' => $agente->id]);

        $this->actingAs($agente)->getJson('/api/panel/resumen')->assertJsonPath('misNumeros.sinSiguientePaso', 1);

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/contactos", ['tipo' => 'llamada', 'cuerpo' => 'No contestó', 'retomarEnDias' => 1])
            ->assertCreated();

        $this->actingAs($agente)->getJson('/api/panel/resumen')->assertJsonPath('misNumeros.sinSiguientePaso', 0);
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    private function anotarAccion(Marca $marca, string $dia): void
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
