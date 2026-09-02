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
 * Pruebas de la corrección del historial de acciones de campaña.
 * ---------------------------------------------------------------------
 * Los eventos nacen solos al asignar campaña en la ficha, pero la
 * realidad se mueve: una visita se aplaza, una invitación se cancela.
 * Aquí se comprueba quién puede arreglarlos y, sobre todo, que al
 * hacerlo la marca no se quede apuntando a una acción que ya no existe.
 *
 * Permisos (siguen los de las marcas, regla 6 del CLAUDE.md):
 *   · EDITAR → admin y comercial siempre; el vendedor solo lo asignado.
 *   · BORRAR → solo admin y comercial.
 */
class EdicionDeEventosDeCampanaTest extends TestCase
{
    use RefreshDatabase;

    /* ------------------------------------------------------------------
     | Quién puede editar
     |-----------------------------------------------------------------*/

    public function test_un_comercial_puede_corregir_la_fecha_de_una_accion(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        [$marca, $evento] = $this->crearMarcaConEvento('2026-09-10');

        $respuesta = $this->actingAs($comercial)
            ->putJson("/api/eventos-de-campana/{$evento->id}", [
                'campanaId' => $evento->campana_id,
                // La visita se aplaza una semana.
                'fecha' => '2026-09-17',
            ]);

        $respuesta->assertOk()->assertJsonPath('evento.fecha', '2026-09-17');

        $this->assertSame('2026-09-17', $evento->fresh()->fecha->toDateString());

        // La acción en curso de la marca se mueve con ella.
        $this->assertSame('2026-09-17', $marca->fresh()->fecha_campana->toDateString());
    }

    public function test_un_comercial_puede_cambiar_la_campana_de_una_accion(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        [$marca, $evento] = $this->crearMarcaConEvento('2026-09-10');

        $otraCampana = Campana::create([
            'nombre' => 'Invitación a evento Sportbiz',
            'color' => '#16c79a',
        ]);

        $this->actingAs($comercial)
            ->putJson("/api/eventos-de-campana/{$evento->id}", [
                'campanaId' => $otraCampana->id,
                'fecha' => '2026-09-10',
            ])
            ->assertOk();

        $eventoCorregido = $evento->fresh();

        // El nombre y el color copiados se actualizan con la campaña
        // nueva: si no, el historial seguiría diciendo la anterior.
        $this->assertSame('Invitación a evento Sportbiz', $eventoCorregido->campana_nombre);
        $this->assertSame('#16c79a', $eventoCorregido->campana_color);
        $this->assertSame($otraCampana->id, $marca->fresh()->campana_id);
    }

    public function test_un_vendedor_puede_corregir_la_accion_de_su_marca(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor);
        [$marca, $evento] = $this->crearMarcaConEvento('2026-09-10');

        $marca->forceFill(['vendedor_asignado_id' => $vendedor->id])->save();

        $this->actingAs($vendedor)
            ->putJson("/api/eventos-de-campana/{$evento->id}", [
                'campanaId' => $evento->campana_id,
                'fecha' => '2026-09-17',
            ])
            ->assertOk();
    }

    public function test_un_vendedor_no_puede_corregir_la_accion_de_otra_marca(): void
    {
        $vendedorPropietario = $this->crearUsuario(RolUsuario::Vendedor);
        $otroVendedor = $this->crearUsuario(RolUsuario::Vendedor);

        [$marca, $evento] = $this->crearMarcaConEvento('2026-09-10');
        $marca->forceFill(['vendedor_asignado_id' => $vendedorPropietario->id])->save();

        $this->actingAs($otroVendedor)
            ->putJson("/api/eventos-de-campana/{$evento->id}", [
                'campanaId' => $evento->campana_id,
                'fecha' => '2026-09-17',
            ])
            ->assertStatus(403);

        $this->assertSame('2026-09-10', $evento->fresh()->fecha->toDateString());
    }

    public function test_corregir_una_accion_exige_campana_y_fecha(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        [, $evento] = $this->crearMarcaConEvento('2026-09-10');

        $respuesta = $this->actingAs($comercial)
            ->putJson("/api/eventos-de-campana/{$evento->id}", []);

        $respuesta->assertStatus(422);
        $this->assertArrayHasKey('campanaId', $respuesta->json('errores'));
        $this->assertArrayHasKey('fecha', $respuesta->json('errores'));
    }

    /* ------------------------------------------------------------------
     | Quién puede borrar
     |-----------------------------------------------------------------*/

    public function test_un_comercial_puede_borrar_una_accion(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        [, $evento] = $this->crearMarcaConEvento('2026-09-10');

        $this->actingAs($comercial)
            ->deleteJson("/api/eventos-de-campana/{$evento->id}")
            ->assertOk();

        $this->assertSame(0, EventoDeCampana::query()->count());
    }

    public function test_un_vendedor_no_puede_borrar_ni_las_suyas(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor);
        [$marca, $evento] = $this->crearMarcaConEvento('2026-09-10');

        $marca->forceFill(['vendedor_asignado_id' => $vendedor->id])->save();

        // Corregir sí, borrar no: el historial es un registro, y quien
        // ejecuta la acción no debería poder hacerla desaparecer.
        $this->actingAs($vendedor)
            ->deleteJson("/api/eventos-de-campana/{$evento->id}")
            ->assertStatus(403);

        $this->assertSame(1, EventoDeCampana::query()->count());
    }

    /* ------------------------------------------------------------------
     | La acción en curso de la marca
     |-----------------------------------------------------------------*/

    public function test_borrar_la_ultima_accion_deja_la_marca_sin_campana(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        [$marca, $evento] = $this->crearMarcaConEvento('2026-09-10');

        $this->actingAs($comercial)
            ->deleteJson("/api/eventos-de-campana/{$evento->id}")
            ->assertOk();

        $marcaActualizada = $marca->fresh();

        // Sin historial no hay acción en curso: si se quedaran puestas,
        // la ficha apuntaría a un evento que ya no existe.
        $this->assertNull($marcaActualizada->campana_id);
        $this->assertNull($marcaActualizada->fecha_campana);
    }

    public function test_borrar_la_accion_mas_reciente_deja_vigente_la_anterior(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        [$marca, $eventoAntiguo] = $this->crearMarcaConEvento('2026-09-10');

        $visitaNueva = Campana::create(['nombre' => 'Invitación a evento Sportbiz']);

        $eventoReciente = EventoDeCampana::create([
            'marca_id' => $marca->id,
            'campana_id' => $visitaNueva->id,
            'campana_nombre' => $visitaNueva->nombre,
            'campana_color' => '#16c79a',
            'fecha' => '2026-09-20',
        ]);

        $marca->forceFill([
            'campana_id' => $visitaNueva->id,
            'fecha_campana' => '2026-09-20',
        ])->save();

        $this->actingAs($comercial)
            ->deleteJson("/api/eventos-de-campana/{$eventoReciente->id}")
            ->assertOk();

        $marcaActualizada = $marca->fresh();

        // Vuelve a mandar la acción que quedaba.
        $this->assertSame($eventoAntiguo->campana_id, $marcaActualizada->campana_id);
        $this->assertSame('2026-09-10', $marcaActualizada->fecha_campana->toDateString());
    }

    public function test_el_evento_corregido_desaparece_del_calendario_de_su_semana(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        [, $evento] = $this->crearMarcaConEvento('2026-09-10');

        // Estaba en la semana del 7 al 13…
        $this->actingAs($comercial)
            ->getJson('/api/panel/calendario?desde=2026-09-10')
            ->assertJsonPath('resumen.totalDeAcciones', 1);

        $this->actingAs($comercial)
            ->putJson("/api/eventos-de-campana/{$evento->id}", [
                'campanaId' => $evento->campana_id,
                'fecha' => '2026-09-17',
            ])
            ->assertOk();

        // …y tras aplazarla, ya no.
        $this->actingAs($comercial)
            ->getJson('/api/panel/calendario?desde=2026-09-10')
            ->assertJsonPath('resumen.totalDeAcciones', 0);

        $this->actingAs($comercial)
            ->getJson('/api/panel/calendario?desde=2026-09-17')
            ->assertJsonPath('resumen.totalDeAcciones', 1);
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    /**
     * @return array{0:Marca,1:EventoDeCampana}
     */
    private function crearMarcaConEvento(string $fecha): array
    {
        $campana = Campana::create(['nombre' => 'Visita presencial', 'color' => '#2563eb']);

        $marca = Marca::create([
            'nombre_marca' => 'Azúcar la Pastora',
            'campana_id' => $campana->id,
            'fecha_campana' => $fecha,
        ]);

        $evento = EventoDeCampana::create([
            'marca_id' => $marca->id,
            'campana_id' => $campana->id,
            'campana_nombre' => $campana->nombre,
            'campana_color' => $campana->color,
            'fecha' => $fecha,
        ]);

        return [$marca, $evento];
    }

    private function crearUsuario(RolUsuario $rol): User
    {
        return User::create([
            'name' => 'Usuario '.$rol->value,
            'email' => $rol->value.'-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            'zona' => null,
            'activo' => true,
        ]);
    }
}
