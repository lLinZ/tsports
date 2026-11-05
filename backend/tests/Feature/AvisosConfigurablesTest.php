<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Http\Resources\RecursoUsuario;
use App\Jobs\EnviarAvisoPush;
use App\Jobs\EnviarMensajeDeChatAlMovil;
use App\Models\AjusteDeAviso;
use App\Models\Conversacion;
use App\Models\Marca;
use App\Models\MensajeDeChat;
use App\Models\Notificacion;
use App\Models\PreferenciaDeAviso;
use App\Models\RegistroActividad;
use App\Models\User;
use App\Support\AjustesDeAvisos;
use App\Support\HorarioDeSilencio;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * El panel de avisos: qué sale, a quién y si llegó.
 * ---------------------------------------------------------------------
 * La propuesta del 2026-11-05 («Panel de avisos»). Lo que se cumple:
 *
 *   · Un aviso apagado por el administrador no se crea.
 *   · En el lead y el comentario el administrador elige los roles, y
 *     nunca puede añadir a quien no ve la marca (el agente, en el lead).
 *   · De fábrica, todo va como iba (regla 17).
 *   · Cada persona quita del móvil o del sonido lo que quiera; la
 *     campanita no se apaga.
 *   · En el horario de silencio el móvil no suena.
 *   · Cada aviso apunta qué pasó al móvil: es el registro de envíos.
 *   · La pantalla «Avisos» es del administrador; cada quien toca lo suyo.
 */
class AvisosConfigurablesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'push.vapid.clave_publica' => 'clave-publica-de-prueba',
            'push.vapid.clave_privada' => 'clave-privada-de-prueba',
        ]);
    }

    public function test_de_fabrica_los_avisos_van_como_siempre(): void
    {
        $ajustes = AjustesDeAvisos::vigentes();

        foreach (AjustesDeAvisos::TIPOS as $tipo) {
            $this->assertTrue($ajustes->estaActivo($tipo), $tipo);
        }

        $this->assertSame(['administracion' => true, 'comercial' => true], $ajustes->destinatarios(Notificacion::TIPO_LEAD_NUEVO));
        $this->assertSame(
            ['administracion' => true, 'comercial' => false, 'quienLlevaLaMarca' => true],
            $ajustes->destinatarios(Notificacion::TIPO_COMENTARIO),
        );
    }

    public function test_un_aviso_apagado_no_se_crea(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = $this->crearMarca('LETI', $agente);

        $this->actingAs($administrador)
            ->putJson('/api/avisos/'.Notificacion::TIPO_COMENTARIO, ['activo' => false])
            ->assertOk();

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Llamé a Carmen.'])
            ->assertCreated();

        $this->assertSame(0, Notificacion::query()->count());
        $this->assertSame(
            'Apagó el aviso «Comentario nuevo en la bitácora»',
            RegistroActividad::query()->where('entidad_tipo', 'aviso')->value('descripcion'),
        );
    }

    public function test_el_comercial_recibe_los_comentarios_si_se_le_pone(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = $this->crearMarca('LETI', $agente);

        $this->actingAs($administrador)
            ->putJson('/api/avisos/'.Notificacion::TIPO_COMENTARIO, [
                'activo' => true,
                'destinatarios' => ['comercial' => true],
            ])
            ->assertOk()
            ->assertJsonPath('avisos.3.destinatarios.1.llega', true);

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Llamé a Carmen.'])
            ->assertCreated();

        $this->assertEqualsCanonicalizing(
            [$administrador->id, $comercial->id],
            Notificacion::query()->pluck('destinatario_id')->all(),
        );
    }

    public function test_al_agente_no_se_le_puede_poner_el_lead(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);

        $this->actingAs($administrador)
            ->putJson('/api/avisos/'.Notificacion::TIPO_LEAD_NUEVO, [
                'activo' => true,
                'destinatarios' => ['agente' => true],
            ])
            ->assertUnprocessable();

        // Un aviso personal no tiene destinatarios que elegir.
        $this->actingAs($administrador)
            ->putJson('/api/avisos/'.Notificacion::TIPO_MARCA_ASIGNADA, [
                'activo' => true,
                'destinatarios' => ['comercial' => true],
            ])
            ->assertUnprocessable();

        $this->actingAs($administrador)->putJson('/api/avisos/inventado', ['activo' => true])->assertNotFound();
    }

    public function test_quitar_al_comercial_del_lead(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        AjusteDeAviso::create([
            'tipo' => Notificacion::TIPO_LEAD_NUEVO,
            'activo' => true,
            'destinatarios' => ['administracion' => true, 'comercial' => false],
        ]);

        app(\App\Support\Notificador::class)->avisarDeUnLeadNuevo(Marca::create(['nombre_marca' => 'Gimnasio Titán']));

        $this->assertSame([$administrador->id], Notificacion::query()->pluck('destinatario_id')->all());

        // Y deja de salirle en sus ajustes: ya no le llega.
        $tipos = collect($this->actingAs($comercial)->getJson('/api/mis-avisos')->assertOk()->json('avisos'))->pluck('tipo');
        $this->assertNotContains(Notificacion::TIPO_LEAD_NUEVO, $tipos);
    }

    public function test_con_las_menciones_apagadas_el_etiquetado_recibe_el_comentario(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = $this->crearMarca('Azúcar la Pastora');

        AjusteDeAviso::create(['tipo' => Notificacion::TIPO_MENCION, 'activo' => false]);

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", [
                'cuerpo' => 'Mira esto cuando puedas',
                'menciones' => [$administrador->id],
            ])
            ->assertCreated();

        $this->assertSame(
            Notificacion::TIPO_COMENTARIO,
            Notificacion::query()->where('destinatario_id', $administrador->id)->sole()->tipo,
        );
    }

    public function test_quitar_del_movil_no_encola_y_queda_apuntado(): void
    {
        Queue::fake();

        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = $this->crearMarca('LETI', $agente);

        $this->actingAs($administrador)
            ->putJson('/api/mis-avisos/'.Notificacion::TIPO_COMENTARIO, ['alMovil' => false, 'conSonido' => false])
            ->assertOk();

        $suyoEnLosAjustes = collect($this->actingAs($administrador)->getJson('/api/mis-avisos')->json('avisos'))
            ->firstWhere('tipo', Notificacion::TIPO_COMENTARIO);
        $this->assertFalse($suyoEnLosAjustes['alMovil']);
        $this->assertFalse($suyoEnLosAjustes['conSonido']);

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Llamé a Carmen.'])
            ->assertCreated();

        $suyo = Notificacion::query()->where('destinatario_id', $administrador->id)->sole();

        // La campanita sí: la fila existe. El móvil, no, y lo dice.
        $this->assertSame(Notificacion::MOVIL_APAGADO_POR_LA_PERSONA, $suyo->entrega_al_movil);
        $this->assertFalse($suyo->con_sonido);
        Queue::assertNotPushed(EnviarAvisoPush::class);

        $this->actingAs($administrador)
            ->getJson('/api/notificaciones/sin-leer')
            ->assertJsonPath('sinLeer', 1)
            ->assertJsonPath('sinLeerConSonido', 0);
    }

    public function test_el_horario_de_silencio_cruza_la_medianoche_y_los_fines_de_semana(): void
    {
        $persona = $this->crearUsuario(RolUsuario::Vendedor);
        $persona->forceFill([
            'silencio_activo' => true,
            'silencio_desde' => '20:00',
            'silencio_hasta' => '07:30',
            'silencio_fines_de_semana' => true,
        ])->save();

        // Jueves 5 de noviembre de 2026, en Caracas.
        $this->assertTrue(HorarioDeSilencio::estaEnSilencio($persona, CarbonImmutable::parse('2026-11-05 23:10', 'America/Caracas')));
        $this->assertTrue(HorarioDeSilencio::estaEnSilencio($persona, CarbonImmutable::parse('2026-11-05 07:29', 'America/Caracas')));
        $this->assertFalse(HorarioDeSilencio::estaEnSilencio($persona, CarbonImmutable::parse('2026-11-05 07:30', 'America/Caracas')));
        $this->assertFalse(HorarioDeSilencio::estaEnSilencio($persona, CarbonImmutable::parse('2026-11-05 12:00', 'America/Caracas')));
        // Sábado a mediodía.
        $this->assertTrue(HorarioDeSilencio::estaEnSilencio($persona, CarbonImmutable::parse('2026-11-07 12:00', 'America/Caracas')));

        $persona->forceFill(['silencio_activo' => false])->save();
        $this->assertFalse(HorarioDeSilencio::estaEnSilencio($persona, CarbonImmutable::parse('2026-11-05 23:10', 'America/Caracas')));
    }

    public function test_el_trabajo_del_movil_apunta_lo_que_paso(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);

        $sinDispositivo = $this->crearNotificacion($agente);
        (new EnviarAvisoPush($sinDispositivo->id))->handle();
        $this->assertSame(Notificacion::MOVIL_SIN_DISPOSITIVO, $sinDispositivo->fresh()->entrega_al_movil);

        $yaLeida = $this->crearNotificacion($agente, leida: true);
        (new EnviarAvisoPush($yaLeida->id))->handle();
        $this->assertSame(Notificacion::MOVIL_YA_LEIDO, $yaLeida->fresh()->entrega_al_movil);

        // En silencio no se intenta: con claves inventadas, intentarlo
        // acabaría en «fallo».
        $agente->forceFill(['silencio_activo' => true, 'silencio_fines_de_semana' => true, 'silencio_desde' => '00:00', 'silencio_hasta' => '23:59'])->save();
        $enSilencio = $this->crearNotificacion($agente);
        (new EnviarAvisoPush($enSilencio->id))->handle();
        $this->assertSame(Notificacion::MOVIL_SILENCIO, $enSilencio->fresh()->entrega_al_movil);
    }

    public function test_el_chat_respeta_lo_que_elige_cada_quien(): void
    {
        $ana = $this->crearUsuario(RolUsuario::Vendedor);
        $luis = $this->crearUsuario(RolUsuario::Vendedor);
        $pedro = $this->crearUsuario(RolUsuario::Vendedor);

        $charla = Conversacion::create(['tipo' => Conversacion::TIPO_GRUPO, 'nombre' => 'Equipo', 'creada_por_id' => $ana->id]);
        $charla->participantes()->attach([$ana->id, $luis->id, $pedro->id]);

        $mensaje = MensajeDeChat::create([
            'conversacion_id' => $charla->id,
            'autor_id' => $ana->id,
            'autor_nombre' => $ana->name,
            'tipo' => MensajeDeChat::TIPO_TEXTO,
            'cuerpo' => '¿Quién va a la reunión?',
        ]);

        PreferenciaDeAviso::create(['usuario_id' => $luis->id, 'tipo' => AjustesDeAvisos::CHAT, 'al_movil' => false]);

        $this->assertSame([$pedro->id], (new EnviarMensajeDeChatAlMovil($mensaje->id))->aQuienesLesSuena($mensaje));
    }

    public function test_la_pantalla_avisos_es_del_administrador(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $this->actingAs($comercial)->getJson('/api/avisos')->assertForbidden();
        $this->actingAs($comercial)->getJson('/api/avisos/envios')->assertForbidden();
        $this->actingAs($comercial)->putJson('/api/avisos/'.Notificacion::TIPO_COMENTARIO, ['activo' => false])->assertForbidden();

        foreach ([[RolUsuario::Admin, true], [RolUsuario::Comercial, false], [RolUsuario::Vendedor, false]] as [$rol, $configura]) {
            $permisos = (new RecursoUsuario($this->crearUsuario($rol)))->toArray(request())['permisos'];
            $this->assertSame($configura, $permisos['configuraLosAvisos'], $rol->value);
        }
    }

    public function test_el_agente_no_tiene_el_lead_en_sus_ajustes(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);

        $this->actingAs($agente)
            ->putJson('/api/mis-avisos/'.Notificacion::TIPO_LEAD_NUEVO, ['alMovil' => false])
            ->assertNotFound();

        $this->actingAs($agente)
            ->putJson('/api/mis-avisos/silencio', ['activo' => true, 'desde' => '21:00', 'hasta' => '07:00', 'finesDeSemana' => false])
            ->assertOk()
            ->assertJsonPath('silencio.activo', true)
            ->assertJsonPath('silencio.desde', '21:00');

        $this->actingAs($agente)
            ->putJson('/api/mis-avisos/silencio', ['activo' => true, 'desde' => '25:00', 'hasta' => '07:00', 'finesDeSemana' => false])
            ->assertUnprocessable();
    }

    public function test_el_registro_dice_que_paso_con_cada_aviso(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);

        $this->crearNotificacion($agente)->forceFill(['entrega_al_movil' => Notificacion::MOVIL_FALLO])->save();
        $this->crearNotificacion($agente, leida: true)->forceFill(['entrega_al_movil' => Notificacion::MOVIL_YA_LEIDO])->save();
        $this->crearNotificacion($administrador)->forceFill(['entrega_al_movil' => Notificacion::MOVIL_ENTREGADO])->save();

        $this->actingAs($administrador)
            ->getJson('/api/avisos/envios')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('resumen.total', 3)
            ->assertJsonPath('resumen.fallaronAlMovil', 1)
            ->assertJsonPath('resumen.porcentajeLeidosOEntregados', 66.7);

        // «Sin llegar»: ni leído ni entregado al móvil.
        $this->actingAs($administrador)
            ->getJson('/api/avisos/envios?resultado=sin_llegar&persona='.$agente->id)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.alMovil', Notificacion::MOVIL_FALLO);
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    private function crearNotificacion(User $destinatario, bool $leida = false): Notificacion
    {
        return Notificacion::create([
            'destinatario_id' => $destinatario->id,
            'tipo' => Notificacion::TIPO_MARCA_ASIGNADA,
            'titulo' => 'Te asignaron una marca',
            'cuerpo' => 'Edgar te asignó Clínica del Este.',
            'leida_en' => $leida ? now() : null,
        ]);
    }

    private function crearMarca(string $nombre, ?User $agente = null): Marca
    {
        return Marca::create([
            'nombre_marca' => $nombre,
            'vendedor_asignado_id' => $agente?->id,
            'vendedor_asignado_nombre' => $agente?->name,
        ]);
    }

    private function crearUsuario(RolUsuario $rol): User
    {
        return User::create([
            'name' => 'Persona '.$rol->value.' '.uniqid(),
            'email' => $rol->value.'-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            'zona' => null,
            'activo' => true,
        ]);
    }
}
