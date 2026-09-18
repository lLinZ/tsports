<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Events\NotificacionNueva;
use App\Models\Marca;
use App\Models\Notificacion;
use App\Models\User;
use Illuminate\Broadcasting\BroadcastManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * La campanita: quién recibe cada aviso y quién puede leerlo.
 * ---------------------------------------------------------------------
 * Dos avisos reales en esta etapa:
 *
 *   · Lead nuevo desde la web → a quien reparte (admin y comercial),
 *     nunca al agente, que no ve los leads sin dueño.
 *   · Te asignaron una marca → al agente nuevo, venga del camino que
 *     venga (alta, ficha o selector del tablero), y solo si de verdad
 *     cambió.
 *
 * Y la garantía de la Etapa 2: el aviso se guarda aunque Reverb esté
 * parado. El tiempo real es una mejora, no un punto único de fallo.
 */
class NotificacionesTest extends TestCase
{
    use RefreshDatabase;

    /* ------------------------------------------------------------------
     | De quién es cada aviso
     |-----------------------------------------------------------------*/

    public function test_nadie_ve_ni_marca_las_notificaciones_de_otro(): void
    {
        $ana = $this->crearUsuario(RolUsuario::Vendedor, 'Ana');
        $beatriz = $this->crearUsuario(RolUsuario::Vendedor, 'Beatriz');
        $administrador = $this->crearUsuario(RolUsuario::Admin, 'Carla Admin');

        $deAna = $this->crearNotificacion($ana, 'Para Ana');
        $deBeatriz = $this->crearNotificacion($beatriz, 'Para Beatriz');

        $this->actingAs($ana)
            ->getJson('/api/notificaciones')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.titulo', 'Para Ana');

        $this->actingAs($ana)
            ->getJson('/api/notificaciones/sin-leer')
            ->assertOk()
            ->assertJsonPath('sinLeer', 1);

        // Escribir a mano el id de un aviso ajeno da 403, no un «correcto».
        $this->actingAs($ana)
            ->patchJson("/api/notificaciones/{$deBeatriz->id}/leida")
            ->assertForbidden();

        // Ni un administrador lee la correspondencia de otra persona.
        $this->actingAs($administrador)
            ->patchJson("/api/notificaciones/{$deAna->id}/leida")
            ->assertForbidden();

        // «Marcar todas» solo toca las de quien lo pide.
        $this->actingAs($ana)
            ->postJson('/api/notificaciones/leidas')
            ->assertOk()
            ->assertJsonPath('marcadas', 1);

        $this->assertNotNull($deAna->fresh()->leida_en);
        $this->assertNull($deBeatriz->fresh()->leida_en);
    }

    public function test_marcar_como_leida_baja_el_contador_y_no_cambia_la_hora_si_se_repite(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $primera = $this->crearNotificacion($agente, 'Primera');
        $this->crearNotificacion($agente, 'Segunda');

        $this->actingAs($agente)
            ->patchJson("/api/notificaciones/{$primera->id}/leida")
            ->assertOk()
            ->assertJsonPath('data.leida', true);

        $horaDeLectura = $primera->fresh()->leida_en;
        $this->travel(5)->minutes();

        $this->actingAs($agente)->patchJson("/api/notificaciones/{$primera->id}/leida")->assertOk();

        $this->assertEquals($horaDeLectura, $primera->fresh()->leida_en);
        $this->actingAs($agente)->getJson('/api/notificaciones/sin-leer')->assertJsonPath('sinLeer', 1);
        $this->actingAs($agente)
            ->getJson('/api/notificaciones?soloSinLeer=1')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.titulo', 'Segunda');
    }

    /* ------------------------------------------------------------------
     | Lead nuevo desde la web
     |-----------------------------------------------------------------*/

    public function test_un_lead_de_la_web_avisa_a_quien_reparte_y_no_al_agente(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $comercialDeBaja = $this->crearUsuario(RolUsuario::Comercial, activo: false);

        $this->postJson('/api/contacto', $this->datosDeUnLead())->assertCreated();

        $marca = Marca::query()->where('nombre_marca', 'Refrescos del Caribe')->sole();

        $this->assertSame(1, Notificacion::query()->where('destinatario_id', $administrador->id)->count());
        $this->assertSame(1, Notificacion::query()->where('destinatario_id', $comercial->id)->count());
        $this->assertSame(0, Notificacion::query()->where('destinatario_id', $agente->id)->count());
        $this->assertSame(0, Notificacion::query()->where('destinatario_id', $comercialDeBaja->id)->count());

        // El enlace llega resuelto: la interfaz no compone rutas.
        $this->actingAs($comercial)
            ->getJson('/api/notificaciones')
            ->assertJsonPath('data.0.tipo', Notificacion::TIPO_LEAD_NUEVO)
            ->assertJsonPath('data.0.titulo', 'Nuevo lead desde la web')
            ->assertJsonPath('data.0.enlace', '/marcas?abrir='.$marca->id)
            ->assertJsonPath('data.0.leida', false);
    }

    public function test_el_robot_que_cae_en_la_trampa_no_genera_avisos(): void
    {
        $this->crearUsuario(RolUsuario::Comercial);

        $this->postJson('/api/contacto', [...$this->datosDeUnLead(), 'sitioWeb' => 'https://spam.test'])
            ->assertCreated();

        $this->assertSame(0, Notificacion::query()->count());
    }

    /* ------------------------------------------------------------------
     | Te asignaron una marca
     |-----------------------------------------------------------------*/

    public function test_asignar_una_marca_desde_el_tablero_avisa_al_agente(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'Carla Comercial');
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Azúcar la Pastora']);

        $this->actingAs($comercial)
            ->patchJson("/api/marcas/{$marca->id}/vendedor", ['vendedorAsignadoId' => $agente->id])
            ->assertOk();

        $aviso = Notificacion::query()->where('destinatario_id', $agente->id)->sole();

        $this->assertSame(Notificacion::TIPO_MARCA_ASIGNADA, $aviso->tipo);
        $this->assertSame('Te asignaron una marca', $aviso->titulo);
        $this->assertSame('Carla Comercial te asignó Azúcar la Pastora.', $aviso->cuerpo);
        $this->assertSame('/marcas?abrir='.$marca->id, $aviso->enlaceEnElPanel());
    }

    public function test_no_avisa_si_el_agente_no_cambia_ni_al_quitarlo(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Azúcar la Pastora']);
        $ruta = "/api/marcas/{$marca->id}/vendedor";

        $this->actingAs($comercial)->patchJson($ruta, ['vendedorAsignadoId' => $agente->id])->assertOk();
        $this->actingAs($comercial)->patchJson($ruta, ['vendedorAsignadoId' => $agente->id])->assertOk();
        $this->actingAs($comercial)->patchJson($ruta, ['vendedorAsignadoId' => null])->assertOk();

        $this->assertSame(1, Notificacion::query()->count());
    }

    public function test_la_ficha_solo_avisa_cuando_cambia_el_agente(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Refrescos del Caribe']);
        $ruta = '/api/marcas/'.$marca->id;

        $this->actingAs($comercial)
            ->putJson($ruta, ['nombreMarca' => 'Refrescos del Caribe', 'vendedorAsignadoId' => $agente->id])
            ->assertOk();

        // Guardar la ficha otra vez para corregir un teléfono no repite el aviso.
        $this->actingAs($comercial)
            ->putJson($ruta, [
                'nombreMarca' => 'Refrescos del Caribe',
                'vendedorAsignadoId' => $agente->id,
                'telefonoContacto' => '0412-1234567',
            ])
            ->assertOk();

        $this->assertSame(1, Notificacion::query()->where('destinatario_id', $agente->id)->count());
    }

    public function test_dar_de_alta_una_marca_ya_asignada_avisa_al_agente(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);

        $this->actingAs($comercial)
            ->postJson('/api/marcas', ['nombreMarca' => 'Marca nueva', 'vendedorAsignadoId' => $agente->id])
            ->assertCreated();

        $this->assertSame(1, Notificacion::query()->where('destinatario_id', $agente->id)->count());
    }

    public function test_nadie_recibe_aviso_de_lo_que_hizo_el_mismo(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        // Un agente que registra una marca se la queda: no hace falta
        // avisarle de que se la asignó a sí mismo.
        $this->actingAs($agente)->postJson('/api/marcas', ['nombreMarca' => 'Marca propia'])->assertCreated();

        // Y un comercial que se asigna una marca a sí mismo, tampoco.
        $marca = Marca::create(['nombre_marca' => 'Otra marca']);
        $this->actingAs($comercial)
            ->patchJson("/api/marcas/{$marca->id}/vendedor", ['vendedorAsignadoId' => $comercial->id])
            ->assertOk();

        $this->assertSame(0, Notificacion::query()->count());
    }

    /* ------------------------------------------------------------------
     | En vivo
     |-----------------------------------------------------------------*/

    public function test_el_aviso_se_empuja_por_el_canal_privado_de_quien_lo_recibe(): void
    {
        $this->encenderReverb();
        Event::fake([NotificacionNueva::class]);

        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Azúcar la Pastora']);

        $this->actingAs($comercial)
            ->patchJson("/api/marcas/{$marca->id}/vendedor", ['vendedorAsignadoId' => $agente->id])
            ->assertOk();

        Event::assertDispatchedTimes(NotificacionNueva::class, 1);
        Event::assertDispatched(
            NotificacionNueva::class,
            fn (NotificacionNueva $evento): bool => $evento->broadcastOn()->name === 'private-usuario.'.$agente->id
                && $evento->broadcastAs() === 'notificacion-nueva'
                && $evento->broadcastWith()['titulo'] === 'Te asignaron una marca'
                && $evento->broadcastWith()['enlace'] === '/marcas?abrir='.$marca->id,
        );
    }

    public function test_con_el_tiempo_real_apagado_no_se_intenta_empujar_pero_se_guarda(): void
    {
        // Como producción hoy: sin Reverb configurado.
        config(['broadcasting.default' => 'null']);
        Event::fake([NotificacionNueva::class]);

        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Azúcar la Pastora']);

        $this->actingAs($comercial)
            ->patchJson("/api/marcas/{$marca->id}/vendedor", ['vendedorAsignadoId' => $agente->id])
            ->assertOk();

        Event::assertNotDispatched(NotificacionNueva::class);
        $this->assertSame(1, Notificacion::query()->where('destinatario_id', $agente->id)->count());
    }

    /**
     * La garantía que dejó pendiente la Etapa 2: con Reverb caído, la
     * petición sale bien y el aviso espera en la campanita a que la
     * persona entre.
     */
    public function test_con_reverb_parado_la_notificacion_se_guarda_igual(): void
    {
        $this->encenderReverb();
        // Un puerto donde no escucha nadie: la conexión se rechaza.
        config([
            'broadcasting.connections.reverb.options.host' => '127.0.0.1',
            'broadcasting.connections.reverb.options.port' => 1,
            'broadcasting.connections.reverb.options.scheme' => 'http',
            'broadcasting.connections.reverb.options.useTLS' => false,
        ]);
        // El cliente de Reverb se construyó al arrancar con la
        // configuración de antes; se tira para que use la de arriba.
        $this->app->make(BroadcastManager::class)->purge('reverb');
        Log::spy();

        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        // Un lead avisa a dos personas: quien envía el formulario no ve
        // ningún error y los dos avisos quedan guardados.
        $this->postJson('/api/contacto', $this->datosDeUnLead())->assertCreated();

        $this->assertSame(1, Notificacion::query()->where('destinatario_id', $administrador->id)->count());
        $this->assertSame(1, Notificacion::query()->where('destinatario_id', $comercial->id)->count());

        // Y se intenta UNA vez, no una por aviso: con el primer fallo ya se
        // sabe que Reverb no está, y cada intento es otra espera.
        Log::shouldHaveReceived('warning')->once();
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    private function encenderReverb(): void
    {
        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'clave-de-prueba',
            'broadcasting.connections.reverb.secret' => 'secreto-de-prueba',
            'broadcasting.connections.reverb.app_id' => 'app-de-prueba',
        ]);
    }

    /** @return array<string,string> */
    private function datosDeUnLead(): array
    {
        return [
            'nombre' => 'Laura Pérez',
            'email' => 'laura@refrescos.test',
            'empresa' => 'Refrescos del Caribe',
            'mensaje' => 'Queremos patrocinar un evento deportivo.',
        ];
    }

    private function crearNotificacion(User $destinatario, string $titulo): Notificacion
    {
        return Notificacion::create([
            'destinatario_id' => $destinatario->id,
            'tipo' => Notificacion::TIPO_MARCA_ASIGNADA,
            'titulo' => $titulo,
        ]);
    }

    private function crearUsuario(RolUsuario $rol, string $nombre = 'Persona de prueba', bool $activo = true): User
    {
        return User::create([
            'name' => $nombre,
            'email' => $rol->value.'-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            'zona' => null,
            'activo' => $activo,
        ]);
    }
}
