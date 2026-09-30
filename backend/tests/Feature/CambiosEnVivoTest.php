<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Events\CambioEnLosDatos;
use App\Events\NotificacionNueva;
use App\Models\Campana;
use App\Models\Marca;
use App\Models\User;
use App\Support\CambiosEnVivo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

/**
 * Las pantallas se ponen al día solas: a quién le llega cada aviso.
 * ---------------------------------------------------------------------
 * Regla 22 del CLAUDE.md. Lo que más daño haría si se torciera es el
 * primer punto:
 *
 *   1. **Lo de una marca solo le llega a quien puede verla.** Un agente
 *      no recibe ni el id de una marca ajena (regla 6). Si la marca
 *      cambió de agente, el anterior sí lo recibe, para que desaparezca
 *      de su tablero.
 *   2. **Un aviso por petición**, aunque la petición toque varias tablas.
 *   3. **Lo del catálogo, a todo el equipo.**
 *   4. **El latido del chat no avisa de nada**: si lo hiciera, sería un
 *      aviso cada medio minuto por persona.
 *   5. **La pestaña que hizo el cambio no lo recibe** (ya refresca lo
 *      suyo), y sin tiempo real no se envía nada.
 */
class CambiosEnVivoTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'clave-de-prueba',
            'broadcasting.connections.reverb.secret' => 'secreto-de-prueba',
            'broadcasting.connections.reverb.app_id' => 'app-de-prueba',
        ]);

        // Los avisos de la campanita también se interceptan: aquí no
        // interesan y, sin Reverb escuchando, cada uno sería un intento
        // de conexión fallido.
        Event::fake([CambioEnLosDatos::class, NotificacionNueva::class]);
    }

    public function test_lo_de_una_marca_solo_le_llega_a_quien_la_ve(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $otroAgente = $this->crearUsuario(RolUsuario::Vendedor);
        $campana = Campana::create(['nombre' => 'Visita presencial']);
        $marca = Marca::create(['nombre_marca' => 'Azúcar la Pastora', 'vendedor_asignado_id' => $agente->id]);
        $this->olvidarLoDeLaPreparacion();

        // Toca la marca Y crea un evento de campaña: un solo aviso.
        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/acciones-de-campana", [
                'campanaId' => $campana->id,
                'fecha' => '2026-10-01',
            ])
            ->assertOk();

        Event::assertDispatchedTimes(CambioEnLosDatos::class, 1);
        Event::assertDispatched(
            CambioEnLosDatos::class,
            fn (CambioEnLosDatos $aviso): bool => $this->canales($aviso) === $this->canalesDe($administrador, $comercial, $agente)
                && $aviso->broadcastAs() === 'datos'
                && $aviso->broadcastWith() === ['cambios' => [['entidad' => 'marca', 'id' => $marca->id]]],
        );

        Event::assertNotDispatched(
            CambioEnLosDatos::class,
            fn (CambioEnLosDatos $aviso): bool => in_array('private-usuario.'.$otroAgente->id, $this->canales($aviso), true),
        );
    }

    public function test_al_reasignar_una_marca_tambien_se_entera_el_agente_anterior(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agenteAnterior = $this->crearUsuario(RolUsuario::Vendedor);
        $agenteNuevo = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = Marca::create(['nombre_marca' => 'Azúcar la Pastora', 'vendedor_asignado_id' => $agenteAnterior->id]);
        $this->olvidarLoDeLaPreparacion();

        $this->actingAs($comercial)
            ->patchJson("/api/marcas/{$marca->id}/vendedor", ['vendedorAsignadoId' => $agenteNuevo->id])
            ->assertOk();

        // Sin el aviso, la marca seguiría en su tablero hasta recargar.
        Event::assertDispatched(
            CambioEnLosDatos::class,
            fn (CambioEnLosDatos $aviso): bool => in_array('private-usuario.'.$agenteAnterior->id, $this->canales($aviso), true)
                && in_array('private-usuario.'.$agenteNuevo->id, $this->canales($aviso), true),
        );
    }

    public function test_un_comentario_avisa_de_la_bitacora_de_esa_marca(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = Marca::create(['nombre_marca' => 'Azúcar la Pastora']);
        $this->olvidarLoDeLaPreparacion();

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Visitada.'])
            ->assertCreated();

        Event::assertDispatched(
            CambioEnLosDatos::class,
            fn (CambioEnLosDatos $aviso): bool => $aviso->broadcastWith()['cambios'] === [['entidad' => 'bitacora', 'id' => $marca->id]],
        );
    }

    public function test_lo_del_catalogo_le_llega_a_todo_el_equipo(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $this->olvidarLoDeLaPreparacion();

        $this->actingAs($administrador)
            ->postJson('/api/sectores', ['nombre' => 'Farmacia'])
            ->assertCreated();

        Event::assertDispatchedTimes(CambioEnLosDatos::class, 1);
        Event::assertDispatched(
            CambioEnLosDatos::class,
            fn (CambioEnLosDatos $aviso): bool => $this->canales($aviso) === $this->canalesDe($administrador, $comercial, $agente)
                && $aviso->broadcastWith()['cambios'] === [['entidad' => 'sectores', 'id' => null]],
        );
    }

    public function test_un_lead_de_la_web_aparece_en_el_tablero_de_quien_reparte(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $this->olvidarLoDeLaPreparacion();

        $this->postJson('/api/contacto', [
            'nombre' => 'Laura Pérez',
            'email' => 'laura@refrescos.test',
            'empresa' => 'Refrescos del Caribe',
            'mensaje' => 'Queremos patrocinar un evento deportivo.',
        ])->assertCreated();

        Event::assertDispatched(
            CambioEnLosDatos::class,
            fn (CambioEnLosDatos $aviso): bool => in_array('private-usuario.'.$comercial->id, $this->canales($aviso), true)
                && ! in_array('private-usuario.'.$agente->id, $this->canales($aviso), true),
        );
    }

    public function test_el_latido_del_chat_no_avisa_de_nada(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $this->olvidarLoDeLaPreparacion();

        $this->actingAs($agente)->postJson('/api/chat/latido', ['visible' => true])->assertOk();

        Event::assertNotDispatched(CambioEnLosDatos::class);
    }

    public function test_la_pestana_que_hizo_el_cambio_no_lo_recibe(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = Marca::create(['nombre_marca' => 'Azúcar la Pastora']);
        $this->olvidarLoDeLaPreparacion();

        $this->actingAs($comercial)
            ->withHeader('X-Socket-ID', '1234.5678')
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Visitada.'])
            ->assertCreated();

        Event::assertDispatched(
            CambioEnLosDatos::class,
            fn (CambioEnLosDatos $aviso): bool => $aviso->socket === '1234.5678',
        );
    }

    public function test_sin_tiempo_real_no_se_envia_nada(): void
    {
        config(['broadcasting.default' => 'null']);

        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = Marca::create(['nombre_marca' => 'Azúcar la Pastora']);

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Visitada.'])
            ->assertCreated();

        Event::assertNotDispatched(CambioEnLosDatos::class);
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    /**
     * Lo que se creó para preparar la prueba también se anotó; se tira
     * para que la prueba mire solo lo que hace la petición.
     */
    private function olvidarLoDeLaPreparacion(): void
    {
        $this->app->make(CambiosEnVivo::class)->descartar();
    }

    /** @return list<string> */
    private function canales(CambioEnLosDatos $aviso): array
    {
        $nombres = array_map(fn ($canal): string => $canal->name, $aviso->broadcastOn());
        sort($nombres);

        return $nombres;
    }

    /** @return list<string> */
    private function canalesDe(User ...$personas): array
    {
        $nombres = array_map(fn (User $persona): string => 'private-usuario.'.$persona->id, $personas);
        sort($nombres);

        return $nombres;
    }

    private function crearUsuario(RolUsuario $rol): User
    {
        return User::create([
            'name' => 'Persona de prueba',
            'email' => $rol->value.'-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            'zona' => null,
            'activo' => true,
        ]);
    }
}
