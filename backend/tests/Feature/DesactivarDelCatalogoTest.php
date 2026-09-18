<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\Campana;
use App\Models\Marca;
use App\Models\Propiedad;
use App\Models\RegistroActividad;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pruebas de desactivar propiedades y campañas desde su tarjeta.
 * ---------------------------------------------------------------------
 * Lo pidió el equipo con un caso concreto: la Carrera 10K de Barquisimeto
 * ya se corrió, y la única forma que encontraron de «darla de baja» fue
 * borrarla, que se lleva sus líneas del checklist en todas las marcas.
 * Pero el evento vuelve el año que viene, y lo hablado con cada marca
 * sirve entonces.
 *
 * Lo que fijan estas pruebas es la diferencia con borrar: desactivar saca
 * la propiedad o la campaña de lo que se ofrece HOY y no toca nada de lo
 * que ya estaba hecho.
 */
class DesactivarDelCatalogoTest extends TestCase
{
    use RefreshDatabase;

    /* ------------------------------------------------------------------
     | Propiedades
     |-----------------------------------------------------------------*/

    public function test_desactivar_una_propiedad_la_deja_de_ofrecer_pero_las_marcas_la_conservan(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = Propiedad::create(['nombre' => 'Carrera 10K', 'monto_total_usd' => 5000]);
        $marca = Marca::create(['nombre_marca' => 'Marca que la llevaba']);
        $marca->propiedadesOfrecidas()->create(['propiedad_id' => $propiedad->id, 'ovp_usd' => 500]);

        $this->actingAs($comercial)
            ->patchJson("/api/propiedades/{$propiedad->id}/activa", ['activa' => false])
            ->assertOk()
            ->assertJsonPath('data.activa', false);

        // Ya no se ofrece en el checklist de la ficha...
        $this->actingAs($comercial)
            ->getJson('/api/propiedades?soloActivas=1')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        // ...pero la marca la sigue llevando, con su pronóstico.
        $this->assertDatabaseHas('propiedades_de_marca', [
            'marca_id' => $marca->id,
            'propiedad_id' => $propiedad->id,
        ]);
    }

    public function test_una_propiedad_desactivada_se_reactiva_tal_cual(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = Propiedad::create(['nombre' => 'Carrera 10K', 'monto_total_usd' => 5000]);
        $marca = Marca::create(['nombre_marca' => 'Marca que la llevaba']);
        $marca->propiedadesOfrecidas()->create(['propiedad_id' => $propiedad->id, 'ovp_usd' => 500]);

        $this->actingAs($comercial)->patchJson("/api/propiedades/{$propiedad->id}/activa", ['activa' => false]);
        $this->actingAs($comercial)
            ->patchJson("/api/propiedades/{$propiedad->id}/activa", ['activa' => true])
            ->assertOk()
            ->assertJsonPath('data.activa', true);

        $this->actingAs($comercial)
            ->getJson('/api/propiedades?soloActivas=1')
            ->assertJsonCount(1, 'data');
        $this->assertDatabaseCount('propiedades_de_marca', 1);
    }

    public function test_un_vendedor_no_puede_desactivar_propiedades(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor);
        $propiedad = Propiedad::create(['nombre' => 'Carrera 10K', 'monto_total_usd' => 5000]);

        $this->actingAs($vendedor)
            ->patchJson("/api/propiedades/{$propiedad->id}/activa", ['activa' => false])
            ->assertForbidden();

        $this->assertTrue($propiedad->fresh()->activa);
    }

    /* ------------------------------------------------------------------
     | Campañas
     |-----------------------------------------------------------------*/

    public function test_desactivar_una_campana_no_se_la_quita_a_sus_marcas(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $campana = Campana::create(['nombre' => 'Temporada 2026']);
        $marca = Marca::create(['nombre_marca' => 'Marca de la campaña', 'campana_id' => $campana->id]);

        $this->actingAs($comercial)
            ->patchJson("/api/campanas/{$campana->id}/activa", ['activa' => false])
            ->assertOk()
            ->assertJsonPath('data.activa', false)
            ->assertJsonPath('data.totalMarcas', 1);

        // Deja de ofrecerse en el selector de la ficha...
        $this->actingAs($comercial)
            ->getJson('/api/campanas?soloActivas=1')
            ->assertJsonCount(0, 'data');

        // ...y la marca sigue en ella, que es justo lo que borrar perdía.
        $this->assertSame($campana->id, $marca->fresh()->campana_id);
    }

    public function test_un_vendedor_no_puede_desactivar_campanas(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor);
        $campana = Campana::create(['nombre' => 'Temporada 2026']);

        $this->actingAs($vendedor)
            ->patchJson("/api/campanas/{$campana->id}/activa", ['activa' => false])
            ->assertForbidden();

        $this->assertTrue($campana->fresh()->activa);
    }

    /* ------------------------------------------------------------------
     | Comunes
     |-----------------------------------------------------------------*/

    public function test_desactivar_queda_en_la_auditoria_una_sola_vez(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = Propiedad::create(['nombre' => 'Carrera 10K', 'monto_total_usd' => 5000]);

        // La segunda vez no cambia nada, así que no debe dejar otra línea.
        $this->actingAs($comercial)->patchJson("/api/propiedades/{$propiedad->id}/activa", ['activa' => false]);
        $this->actingAs($comercial)->patchJson("/api/propiedades/{$propiedad->id}/activa", ['activa' => false]);

        $this->assertSame(
            ['Desactivó la propiedad Carrera 10K'],
            RegistroActividad::where('entidad_id', $propiedad->id)->pluck('descripcion')->all(),
        );
    }

    public function test_hay_que_decir_si_queda_activa_o_no(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = Propiedad::create(['nombre' => 'Carrera 10K', 'monto_total_usd' => 5000]);

        $this->actingAs($comercial)
            ->patchJson("/api/propiedades/{$propiedad->id}/activa", [])
            ->assertStatus(422)
            ->assertJsonPath('errores.activa.0', 'Indica si la propiedad queda activa o desactivada.');

        $this->assertTrue($propiedad->fresh()->activa);
    }

    private function crearUsuario(RolUsuario $rol): User
    {
        return User::create([
            'name' => 'Usuario '.$rol->value,
            'email' => $rol->value.'-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            // Con las comprobaciones estrictas de Eloquent, leer una
            // columna que no se asignó al crear lanza excepción.
            'zona' => null,
            'activo' => true,
        ]);
    }
}
