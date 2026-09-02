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
 * Los dos gestos que se hacen sin abrir la ficha.
 * ---------------------------------------------------------------------
 * El tablero es donde el equipo se pasa el día, y hay dos cosas que se
 * hacen a diario y no merecen abrir un formulario entero:
 *
 *   · ANOTAR UNA ACCIÓN DE CAMPAÑA. Se acaba de visitar a una marca y se
 *     quiere dejar apuntado en el calendario. Antes había que rellenar
 *     la ficha y pulsar "Guardar cambios", con lo que apuntar una visita
 *     dependía de que el resto del formulario estuviera correcto.
 *
 *   · REPARTIR UNA MARCA. Asignarle vendedor desde la propia tarjeta.
 *
 * Los permisos NO son los mismos para los dos, y es la diferencia que
 * más importa de este fichero: anotar una acción es trabajar la marca
 * (la puede hacer su vendedor), pero repartirla es decidir quién
 * trabaja qué, y eso es de admin y comercial (regla 6 del CLAUDE.md).
 */
class AccionesRapidasDesdeElTableroTest extends TestCase
{
    use RefreshDatabase;

    /* ------------------------------------------------------------------
     | Anotar una acción de campaña sin guardar la ficha
     |-----------------------------------------------------------------*/

    public function test_anotar_una_accion_la_deja_en_el_calendario_al_momento(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $campana = Campana::create(['nombre' => 'Visita presencial', 'color' => '#2563eb']);
        $marca = Marca::create(['nombre_marca' => 'Azúcar la Pastora']);

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/acciones-de-campana", [
                'campanaId' => $campana->id,
                'fecha' => '2026-10-01',
            ])
            ->assertOk()
            ->assertJsonPath('data.campanaId', $campana->id)
            ->assertJsonPath('data.fechaCampana', '2026-10-01');

        // El evento es lo que alimenta el calendario (regla 13).
        $evento = EventoDeCampana::where('marca_id', $marca->id)->first();

        $this->assertNotNull($evento);
        $this->assertSame('2026-10-01', $evento->fecha->toDateString());
        $this->assertSame('Visita presencial', $evento->campana_nombre);
        $this->assertSame($comercial->id, $evento->registrado_por_id);
    }

    public function test_anotar_dos_veces_la_misma_accion_no_repite_la_linea(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $campana = Campana::create(['nombre' => 'Envió material pop']);
        $marca = Marca::create(['nombre_marca' => 'Azúcar la Pastora']);

        $datos = ['campanaId' => $campana->id, 'fecha' => '2026-10-01'];

        $this->actingAs($comercial)->postJson("/api/marcas/{$marca->id}/acciones-de-campana", $datos)->assertOk();
        $this->actingAs($comercial)->postJson("/api/marcas/{$marca->id}/acciones-de-campana", $datos)->assertOk();

        // Pulsar dos veces el botón —o dudar y volver a darle— no puede
        // dejar la marca con la misma visita apuntada dos veces.
        $this->assertSame(1, EventoDeCampana::where('marca_id', $marca->id)->count());
    }

    public function test_cambiar_la_fecha_si_anota_una_accion_nueva(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $campana = Campana::create(['nombre' => 'Visita presencial']);
        $marca = Marca::create(['nombre_marca' => 'Azúcar la Pastora']);

        $this->actingAs($comercial)->postJson("/api/marcas/{$marca->id}/acciones-de-campana", [
            'campanaId' => $campana->id, 'fecha' => '2026-10-01',
        ])->assertOk();

        // Volver a visitarla otro día SÍ es una acción distinta.
        $this->actingAs($comercial)->postJson("/api/marcas/{$marca->id}/acciones-de-campana", [
            'campanaId' => $campana->id, 'fecha' => '2026-11-15',
        ])->assertOk();

        $this->assertSame(2, EventoDeCampana::where('marca_id', $marca->id)->count());
    }

    public function test_anotar_una_accion_exige_campana_y_fecha(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = Marca::create(['nombre_marca' => 'Azúcar la Pastora']);

        // Los errores viajan bajo "errores", no bajo el "errors" de
        // Laravel: toda la API usa la forma única de la sección 7 del
        // CLAUDE.md, para que el cliente los lea siempre igual.
        $respuesta = $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/acciones-de-campana", []);

        $respuesta->assertStatus(422);

        $this->assertArrayHasKey('campanaId', $respuesta->json('errores'));
        $this->assertArrayHasKey('fecha', $respuesta->json('errores'));
    }

    public function test_un_vendedor_no_puede_anotar_en_una_marca_ajena(): void
    {
        $duenio = $this->crearUsuario(RolUsuario::Vendedor);
        $intruso = $this->crearUsuario(RolUsuario::Vendedor);
        $campana = Campana::create(['nombre' => 'Visita presencial']);

        $marca = Marca::create([
            'nombre_marca' => 'Azúcar la Pastora',
            'vendedor_asignado_id' => $duenio->id,
            'vendedor_asignado_nombre' => $duenio->nombreParaMostrar(),
        ]);

        $this->actingAs($intruso)
            ->postJson("/api/marcas/{$marca->id}/acciones-de-campana", [
                'campanaId' => $campana->id, 'fecha' => '2026-10-01',
            ])
            ->assertForbidden();

        $this->assertSame(0, EventoDeCampana::where('marca_id', $marca->id)->count());
    }

    public function test_anotar_en_una_marca_sin_dueno_la_adopta(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');
        $campana = Campana::create(['nombre' => 'Visita presencial']);
        $marca = Marca::create(['nombre_marca' => 'Lead de la web']);

        $this->actingAs($vendedor)
            ->postJson("/api/marcas/{$marca->id}/acciones-de-campana", [
                'campanaId' => $campana->id, 'fecha' => '2026-10-01',
            ])
            ->assertOk();

        // Regla 5: el primero que trabaja un lead sin dueño se lo queda.
        $this->assertSame($vendedor->id, $marca->fresh()->vendedor_asignado_id);
    }

    /* ------------------------------------------------------------------
     | Repartir la marca desde la tarjeta
     |-----------------------------------------------------------------*/

    public function test_un_comercial_asigna_vendedor_desde_la_tarjeta(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');
        $marca = Marca::create(['nombre_marca' => 'Azúcar la Pastora']);

        $this->actingAs($comercial)
            ->patchJson("/api/marcas/{$marca->id}/vendedor", [
                'vendedorAsignadoId' => $vendedor->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.vendedorAsignadoNombre', 'Daymar Marcano');

        $this->assertSame($vendedor->id, $marca->fresh()->vendedor_asignado_id);
    }

    public function test_se_puede_dejar_una_marca_sin_vendedor(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor);

        $marca = Marca::create([
            'nombre_marca' => 'Azúcar la Pastora',
            'vendedor_asignado_id' => $vendedor->id,
            'vendedor_asignado_nombre' => $vendedor->nombreParaMostrar(),
        ]);

        // Devolverla al montón es un estado legítimo: así vuelve a estar
        // disponible para que la adopte quien la trabaje (regla 5).
        $this->actingAs($comercial)
            ->patchJson("/api/marcas/{$marca->id}/vendedor", ['vendedorAsignadoId' => null])
            ->assertOk();

        $marcaActualizada = $marca->fresh();

        $this->assertNull($marcaActualizada->vendedor_asignado_id);
        $this->assertNull($marcaActualizada->vendedor_asignado_nombre);
    }

    public function test_un_vendedor_no_puede_reasignar_ni_su_propia_marca(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor);
        $companero = $this->crearUsuario(RolUsuario::Vendedor);

        $marca = Marca::create([
            'nombre_marca' => 'Azúcar la Pastora',
            'vendedor_asignado_id' => $vendedor->id,
            'vendedor_asignado_nombre' => $vendedor->nombreParaMostrar(),
        ]);

        // Puede editarla —es suya— pero repartir trabajo no es cosa suya.
        $this->actingAs($vendedor)
            ->patchJson("/api/marcas/{$marca->id}/vendedor", [
                'vendedorAsignadoId' => $companero->id,
            ])
            ->assertForbidden();

        $this->assertSame($vendedor->id, $marca->fresh()->vendedor_asignado_id);
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
