<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\Marca;
use App\Models\Notificacion;
use App\Models\Recordatorio;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Los recordatorios de seguimiento.
 * ---------------------------------------------------------------------
 * Lo que defienden estas pruebas:
 *
 *   · Cada persona ve en su panel lo SUYO: vencido, de hoy y próximo,
 *     con los días de Caracas.
 *   · Dejárselo a otra persona es de quien reparte, y solo a alguien que
 *     pueda ver la marca: el recordatorio lleva dentro su nombre (regla 6).
 *   · Si a alguien le quitan la marca, su recordatorio deja de salirle.
 *   · El aviso de la mañana sale UNA vez por persona y día, con todo lo
 *     de hoy dentro, aunque el comando se ejecute dos veces.
 */
class RecordatoriosTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Mediodía en Caracas (16:00 UTC): lejos de la medianoche.
        $this->travelTo(CarbonImmutable::parse('2026-10-05 16:00:00', 'UTC'));
    }

    /* ------------------------------------------------------------------
     | Dejar uno y verlo
     |-----------------------------------------------------------------*/

    public function test_un_recordatorio_para_hoy_sale_en_el_panel_y_en_la_ficha(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Ana Agente');
        $marca = Marca::create(['nombre_marca' => 'Pepsi', 'vendedor_asignado_id' => $agente->id]);

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/recordatorios", ['fecha' => '2026-10-05', 'nota' => 'Llamar a Juan'])
            ->assertCreated()
            ->assertJsonPath('data.cuando', 'hoy')
            ->assertJsonPath('data.esMio', true)
            ->assertJsonPath('data.personaNombre', 'Ana Agente');

        $this->actingAs($agente)
            ->getJson('/api/recordatorios/mios')
            ->assertOk()
            ->assertJsonCount(1, 'paraHoy')
            ->assertJsonPath('paraHoy.0.marca.nombre', 'Pepsi')
            ->assertJsonPath('paraHoy.0.nota', 'Llamar a Juan');

        $this->actingAs($agente)
            ->getJson("/api/marcas/{$marca->id}/recordatorios")
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_el_panel_separa_lo_vencido_lo_de_hoy_y_lo_proximo(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = Marca::create(['nombre_marca' => 'Banesco']);

        foreach (['2026-10-01', '2026-10-05', '2026-10-08', '2026-11-30'] as $dia) {
            Recordatorio::create(['marca_id' => $marca->id, 'persona_id' => $comercial->id, 'fecha' => $dia]);
        }

        $this->actingAs($comercial)
            ->getJson('/api/recordatorios/mios')
            ->assertJsonCount(1, 'vencidos')
            ->assertJsonCount(1, 'paraHoy')
            // El de finales de noviembre queda fuera: el panel mira una semana.
            ->assertJsonCount(1, 'proximos')
            ->assertJsonPath('vencidos.0.cuando', 'vencido');
    }

    public function test_no_se_deja_un_recordatorio_para_un_dia_que_ya_paso(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = Marca::create(['nombre_marca' => 'Polar']);

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/recordatorios", ['fecha' => '2026-10-04'])
            ->assertStatus(422)
            ->assertJsonPath('errores.fecha.0', 'El recordatorio tiene que ser para hoy o para un día por delante.');
    }

    /* ------------------------------------------------------------------
     | De quién es
     |-----------------------------------------------------------------*/

    public function test_un_agente_no_le_deja_recordatorios_a_otra_persona(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = Marca::create(['nombre_marca' => 'Digitel', 'vendedor_asignado_id' => $agente->id]);

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/recordatorios", ['fecha' => '2026-10-06', 'personaId' => $comercial->id])
            ->assertStatus(422)
            ->assertJsonPath('errores.personaId.0', 'Solo quien reparte el trabajo puede dejarle un recordatorio a otra persona.');
    }

    public function test_el_comercial_se_lo_deja_a_la_agente_solo_si_lleva_la_marca(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $laQueLaLleva = $this->crearUsuario(RolUsuario::Vendedor, 'Ana');
        $otraAgente = $this->crearUsuario(RolUsuario::Vendedor, 'Bea');
        $marca = Marca::create(['nombre_marca' => 'Movistar', 'vendedor_asignado_id' => $laQueLaLleva->id]);

        // A quien no la lleva le filtraría el nombre de la marca.
        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/recordatorios", ['fecha' => '2026-10-06', 'personaId' => $otraAgente->id])
            ->assertStatus(422);

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/recordatorios", ['fecha' => '2026-10-06', 'personaId' => $laQueLaLleva->id])
            ->assertCreated()
            ->assertJsonPath('data.esMio', false)
            ->assertJsonPath('data.personaNombre', 'Ana');
    }

    public function test_un_agente_no_ve_ni_toca_los_recordatorios_de_una_marca_ajena(): void
    {
        $duenio = $this->crearUsuario(RolUsuario::Vendedor);
        $intruso = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Farmatodo', 'vendedor_asignado_id' => $duenio->id]);
        $recordatorio = Recordatorio::create(['marca_id' => $marca->id, 'persona_id' => $duenio->id, 'fecha' => '2026-10-05']);

        $this->actingAs($intruso)->getJson("/api/marcas/{$marca->id}/recordatorios")->assertForbidden();
        $this->actingAs($intruso)->patchJson("/api/recordatorios/{$recordatorio->id}", ['cumplido' => true])->assertForbidden();
        $this->actingAs($intruso)->deleteJson("/api/recordatorios/{$recordatorio->id}")->assertForbidden();
    }

    public function test_si_le_quitan_la_marca_su_recordatorio_deja_de_salirle(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $otro = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Mercantil', 'vendedor_asignado_id' => $agente->id]);
        Recordatorio::create(['marca_id' => $marca->id, 'persona_id' => $agente->id, 'fecha' => '2026-10-05']);

        $marca->update(['vendedor_asignado_id' => $otro->id]);

        $this->actingAs($agente)
            ->getJson('/api/recordatorios/mios')
            ->assertJsonCount(0, 'paraHoy');
    }

    /* ------------------------------------------------------------------
     | Cumplirlo y posponerlo
     |-----------------------------------------------------------------*/

    public function test_cumplirlo_lo_saca_del_panel_y_se_puede_deshacer(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'Lucía');
        $marca = Marca::create(['nombre_marca' => 'Cerveza Zulia']);
        $recordatorio = Recordatorio::create(['marca_id' => $marca->id, 'persona_id' => $comercial->id, 'fecha' => '2026-10-05']);

        $this->actingAs($comercial)
            ->patchJson("/api/recordatorios/{$recordatorio->id}", ['cumplido' => true])
            ->assertOk()
            ->assertJsonPath('data.cumplido', true)
            ->assertJsonPath('data.cumplidoPorNombre', 'Lucía');

        $this->actingAs($comercial)->getJson('/api/recordatorios/mios')->assertJsonCount(0, 'paraHoy');

        // En la ficha sigue a la vista, cumplido, por si fue un error.
        $this->actingAs($comercial)
            ->getJson("/api/marcas/{$marca->id}/recordatorios")
            ->assertJsonPath('data.0.cumplido', true);

        $this->actingAs($comercial)
            ->patchJson("/api/recordatorios/{$recordatorio->id}", ['cumplido' => false])
            ->assertJsonPath('data.cumplido', false);

        $this->actingAs($comercial)->getJson('/api/recordatorios/mios')->assertJsonCount(1, 'paraHoy');
    }

    public function test_posponerlo_vuelve_a_dejarlo_pendiente_de_avisar(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = Marca::create(['nombre_marca' => 'Polar']);
        $recordatorio = Recordatorio::create([
            'marca_id' => $marca->id,
            'persona_id' => $comercial->id,
            'fecha' => '2026-10-05',
            'avisado_en' => now(),
        ]);

        $this->actingAs($comercial)
            ->patchJson("/api/recordatorios/{$recordatorio->id}", ['fecha' => '2026-10-06'])
            ->assertOk()
            ->assertJsonPath('data.cuando', 'proximo');

        $this->assertNull($recordatorio->fresh()->avisado_en);
    }

    public function test_la_tarjeta_trae_solo_el_proximo_recordatorio_de_quien_mira(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin);
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = Marca::create(['nombre_marca' => 'Pepsi']);

        Recordatorio::create(['marca_id' => $marca->id, 'persona_id' => $comercial->id, 'fecha' => '2026-10-05', 'nota' => 'Del comercial']);
        Recordatorio::create(['marca_id' => $marca->id, 'persona_id' => $admin->id, 'fecha' => '2026-10-09', 'nota' => 'Más tarde']);
        Recordatorio::create(['marca_id' => $marca->id, 'persona_id' => $admin->id, 'fecha' => '2026-10-07', 'nota' => 'El próximo']);

        $this->actingAs($admin)
            ->getJson('/api/marcas')
            ->assertJsonPath('data.0.miProximoRecordatorio.nota', 'El próximo')
            ->assertJsonPath('data.0.misRecordatoriosPendientes', 2);
    }

    /* ------------------------------------------------------------------
     | El aviso de la mañana
     |-----------------------------------------------------------------*/

    public function test_el_aviso_de_la_manana_sale_una_vez_con_todo_lo_de_hoy(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $sinNadaHoy = $this->crearUsuario(RolUsuario::Vendedor);

        foreach (['Pepsi', 'Banesco', 'Polar'] as $nombre) {
            $marca = Marca::create(['nombre_marca' => $nombre, 'vendedor_asignado_id' => $agente->id]);
            Recordatorio::create(['marca_id' => $marca->id, 'persona_id' => $agente->id, 'fecha' => '2026-10-05']);
        }

        $vieja = Marca::create(['nombre_marca' => 'Digitel', 'vendedor_asignado_id' => $agente->id]);
        Recordatorio::create(['marca_id' => $vieja->id, 'persona_id' => $agente->id, 'fecha' => '2026-10-02']);

        $deOtroDia = Marca::create(['nombre_marca' => 'Movistar', 'vendedor_asignado_id' => $sinNadaHoy->id]);
        Recordatorio::create(['marca_id' => $deOtroDia->id, 'persona_id' => $sinNadaHoy->id, 'fecha' => '2026-10-08']);

        $this->artisan('recordatorios:avisar-del-dia')->assertSuccessful();
        // Repetirlo (el servidor se reinició, alguien lo probó a mano) no
        // manda el mismo aviso otra vez.
        $this->artisan('recordatorios:avisar-del-dia')->assertSuccessful();

        $avisos = Notificacion::query()->where('tipo', Notificacion::TIPO_RECORDATORIOS_DEL_DIA)->get();

        $this->assertCount(1, $avisos);
        $this->assertSame($agente->id, $avisos[0]->destinatario_id);
        $this->assertSame('Hoy tienes 3 recordatorios', $avisos[0]->titulo);
        $this->assertSame('Pepsi, Banesco y Polar. Y 1 vencido de días anteriores.', $avisos[0]->cuerpo);
        $this->assertSame('/panel', $avisos[0]->enlaceEnElPanel());
    }

    public function test_con_un_solo_recordatorio_el_aviso_lleva_a_su_marca(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Pepsi', 'vendedor_asignado_id' => $agente->id]);
        Recordatorio::create(['marca_id' => $marca->id, 'persona_id' => $agente->id, 'fecha' => '2026-10-05', 'nota' => 'Mandar el dossier']);

        $this->artisan('recordatorios:avisar-del-dia')->assertSuccessful();

        $aviso = Notificacion::query()->sole();

        $this->assertSame('Hoy toca: Pepsi', $aviso->titulo);
        $this->assertSame('Mandar el dossier', $aviso->cuerpo);
        $this->assertSame('/marcas?abrir='.$marca->id, $aviso->enlaceEnElPanel());
    }

    public function test_no_avisa_de_una_marca_que_ya_no_es_suya(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $otro = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Secreta', 'vendedor_asignado_id' => $otro->id]);
        Recordatorio::create(['marca_id' => $marca->id, 'persona_id' => $agente->id, 'fecha' => '2026-10-05']);

        $this->artisan('recordatorios:avisar-del-dia')->assertSuccessful();

        $this->assertSame(0, Notificacion::query()->count());
    }

    /* ------------------------------------------------------------------
     | Qué toca y a qué hora
     |-----------------------------------------------------------------*/

    public function test_un_recordatorio_lleva_que_toca_y_la_hora_y_se_ordena_por_ella(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Pepsi', 'vendedor_asignado_id' => $agente->id]);

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/recordatorios", [
                'fecha' => '2026-10-06', 'hora' => '15:30', 'tipo' => 'reunion', 'nota' => 'Presentar la propuesta',
            ])
            ->assertCreated()
            ->assertJsonPath('data.hora', '15:30')
            ->assertJsonPath('data.tipo.valor', 'reunion')
            ->assertJsonPath('data.tipo.etiqueta', 'Reunión');

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/recordatorios", ['fecha' => '2026-10-06', 'hora' => '09:00', 'tipo' => 'llamada'])
            ->assertCreated();

        // Sin hora, delante: es «ese día».
        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/recordatorios", ['fecha' => '2026-10-06', 'nota' => 'Mandar el dossier'])
            ->assertCreated()
            ->assertJsonPath('data.hora', null)
            ->assertJsonPath('data.tipo', null);

        $this->actingAs($agente)
            ->getJson('/api/recordatorios/mios')
            ->assertOk()
            ->assertJsonPath('proximos.0.hora', null)
            ->assertJsonPath('proximos.1.hora', '09:00')
            ->assertJsonPath('proximos.2.hora', '15:30');

        // La tarjeta enseña el primero, con su hora y su tipo.
        $this->actingAs($agente)
            ->getJson('/api/marcas')
            ->assertOk()
            ->assertJsonPath('data.0.miProximoRecordatorio.nota', 'Mandar el dossier');
    }

    public function test_la_hora_y_el_tipo_se_corrigen_y_se_validan(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Pepsi', 'vendedor_asignado_id' => $agente->id]);
        $recordatorio = Recordatorio::create(['marca_id' => $marca->id, 'persona_id' => $agente->id, 'fecha' => '2026-10-06']);

        $this->actingAs($agente)
            ->patchJson("/api/recordatorios/{$recordatorio->id}", ['hora' => '25:00'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('hora', 'errores');

        $this->actingAs($agente)
            ->patchJson("/api/recordatorios/{$recordatorio->id}", ['tipo' => 'fax'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('tipo', 'errores');

        $this->actingAs($agente)
            ->patchJson("/api/recordatorios/{$recordatorio->id}", ['hora' => '11:15', 'tipo' => 'whatsapp'])
            ->assertOk()
            ->assertJsonPath('data.hora', '11:15')
            ->assertJsonPath('data.tipo.etiqueta', 'WhatsApp');

        // Y se quitan igual.
        $this->actingAs($agente)
            ->patchJson("/api/recordatorios/{$recordatorio->id}", ['hora' => null, 'tipo' => null])
            ->assertOk()
            ->assertJsonPath('data.hora', null)
            ->assertJsonPath('data.tipo', null);
    }

    public function test_el_aviso_de_la_manana_dice_la_hora_de_uno_solo(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Pepsi', 'vendedor_asignado_id' => $agente->id]);
        Recordatorio::create([
            'marca_id' => $marca->id, 'persona_id' => $agente->id, 'fecha' => '2026-10-05',
            'hora' => '10:00', 'tipo' => 'reunion', 'nota' => 'Reunión de seguimiento',
        ]);

        $this->artisan('recordatorios:avisar-del-dia')->assertSuccessful();

        $this->assertSame('A las 10:00: Reunión de seguimiento', Notificacion::query()->sole()->cuerpo);
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

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
