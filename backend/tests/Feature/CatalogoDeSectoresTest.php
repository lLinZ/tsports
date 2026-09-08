<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\Marca;
use App\Models\Sector;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pruebas del catálogo de sectores.
 * ---------------------------------------------------------------------
 * Los rubros eran una lista escrita en el código y ahora se gestionan
 * desde el panel. Lo que se fija aquí no es el CRUD —eso lo hace
 * cualquiera— sino las dos reglas que impiden que el catálogo y las
 * marcas se separen, que es la única forma en que esto puede romperse:
 *
 *   · La marca guarda el sector como TEXTO. Renombrar un sector tiene
 *     que arrastrar el cambio a sus marcas; si no, desaparecen del
 *     reparto por sector del resumen.
 *   · Un sector EN USO no se borra. Se desactiva, que lo quita del
 *     selector sin tocar las marcas que ya lo llevan. Y una marca con un
 *     sector desactivado tiene que poder seguir guardándose.
 */
class CatalogoDeSectoresTest extends TestCase
{
    use RefreshDatabase;

    /* ------------------------------------------------------------------
     | Alta y catálogo
     |-----------------------------------------------------------------*/

    public function test_el_comercial_puede_anadir_un_sector_y_sale_en_los_catalogos(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $this->actingAs($comercial)
            ->postJson('/api/sectores', ['nombre' => 'Turismo'])
            ->assertCreated()
            ->assertJsonPath('data.nombre', 'Turismo')
            ->assertJsonPath('data.activo', true)
            ->assertJsonPath('data.totalMarcas', 0);

        // El selector de la ficha se puebla desde /api/catalogos, así que
        // el sector nuevo tiene que aparecer ahí sin tocar nada más.
        $this->actingAs($comercial)
            ->getJson('/api/catalogos')
            ->assertOk()
            ->assertJsonFragment(['Turismo']);
    }

    public function test_no_se_repiten_los_nombres(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $this->actingAs($comercial)->postJson('/api/sectores', ['nombre' => 'Turismo'])->assertCreated();

        // Dos rubros con el mismo nombre serían el mismo rubro partido en
        // dos filas del reparto por sector.
        $this->actingAs($comercial)
            ->postJson('/api/sectores', ['nombre' => 'Turismo'])
            ->assertStatus(422)
            ->assertJsonPath('errores.nombre.0', 'Ya existe un sector con ese nombre.');
    }

    public function test_una_marca_se_puede_clasificar_en_un_sector_nuevo(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $this->actingAs($comercial)->postJson('/api/sectores', ['nombre' => 'Turismo']);

        // Antes esto se rechazaba: la validación miraba una lista fija
        // escrita en el código.
        $this->actingAs($comercial)
            ->postJson('/api/marcas', ['nombreMarca' => 'Agencia Caribe', 'sector' => 'Turismo'])
            ->assertCreated()
            ->assertJsonPath('data.sector', 'Turismo');
    }

    /* ------------------------------------------------------------------
     | Renombrar arrastra a las marcas
     |-----------------------------------------------------------------*/

    public function test_renombrar_un_sector_arrastra_sus_marcas(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $sector = Sector::query()->where('nombre', 'Tecnología')->firstOrFail();

        Marca::create(['nombre_marca' => 'Una', 'sector' => 'Tecnología']);
        Marca::create(['nombre_marca' => 'Otra', 'sector' => 'Tecnología']);
        Marca::create(['nombre_marca' => 'De otro rubro', 'sector' => 'Bebidas']);

        $this->actingAs($comercial)
            ->putJson('/api/sectores/'.$sector->id, ['nombre' => 'Tecnología e informática'])
            ->assertOk()
            ->assertJsonPath('data.nombre', 'Tecnología e informática')
            ->assertJsonPath('data.totalMarcas', 2);

        // Las dos marcas se van con el nombre nuevo; la de otro rubro no
        // se toca.
        $this->assertSame(2, Marca::query()->where('sector', 'Tecnología e informática')->count());
        $this->assertSame(0, Marca::query()->where('sector', 'Tecnología')->count());
        $this->assertSame(1, Marca::query()->where('sector', 'Bebidas')->count());
    }

    /* ------------------------------------------------------------------
     | Borrar y desactivar
     |-----------------------------------------------------------------*/

    public function test_no_se_borra_un_sector_que_tiene_marcas(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        // Ya existe: lo puso la migración.
        $sector = Sector::query()->where('nombre', 'Bebidas')->firstOrFail();
        Marca::create(['nombre_marca' => 'Refrescos del Caribe', 'sector' => 'Bebidas']);

        $respuesta = $this->actingAs($comercial)->deleteJson('/api/sectores/'.$sector->id);

        $respuesta->assertStatus(422);
        $this->assertStringContainsString(
            'Desactívalo',
            $respuesta->json('errores.nombre.0'),
        );

        // Y sigue ahí: la marca no se queda con un rubro fuera del
        // catálogo.
        $this->assertDatabaseHas('sectores', ['nombre' => 'Bebidas']);
    }

    public function test_un_sector_sin_marcas_si_se_borra(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $sector = Sector::create(['nombre' => 'Sin usar', 'orden' => 1]);

        $this->actingAs($comercial)->deleteJson('/api/sectores/'.$sector->id)->assertOk();

        $this->assertDatabaseMissing('sectores', ['nombre' => 'Sin usar']);
    }

    public function test_un_sector_desactivado_sale_del_selector_pero_sus_marcas_se_siguen_guardando(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $sector = Sector::query()->where('nombre', 'Bebidas')->firstOrFail();
        $marca = Marca::create(['nombre_marca' => 'Refrescos del Caribe', 'sector' => 'Bebidas']);

        $this->actingAs($comercial)
            ->putJson('/api/sectores/'.$sector->id, ['nombre' => 'Bebidas', 'activo' => false])
            ->assertOk()
            ->assertJsonPath('data.activo', false);

        // Fuera del selector…
        $catalogos = $this->actingAs($comercial)->getJson('/api/catalogos')->json();
        $this->assertNotContains('Bebidas', $catalogos['sectores']);

        // …pero la marca que ya lo llevaba se sigue guardando. Si no,
        // editarle el teléfono fallaría por un campo que nadie tocó.
        $this->actingAs($comercial)
            ->putJson('/api/marcas/'.$marca->id, [
                'nombreMarca' => 'Refrescos del Caribe',
                'sector' => 'Bebidas',
                'telefonoContacto' => '0412-1234567',
            ])
            ->assertOk();
    }

    /* ------------------------------------------------------------------
     | Permisos
     |-----------------------------------------------------------------*/

    public function test_un_agente_ve_el_catalogo_pero_no_lo_toca(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);

        $sector = Sector::query()->where('nombre', 'Bebidas')->firstOrFail();

        // Verlo sí: lo necesita para el selector de la ficha.
        $this->actingAs($agente)->getJson('/api/sectores')->assertOk();

        $this->actingAs($agente)->postJson('/api/sectores', ['nombre' => 'Turismo'])->assertForbidden();
        $this->actingAs($agente)->putJson('/api/sectores/'.$sector->id, ['nombre' => 'Otro'])->assertForbidden();
        $this->actingAs($agente)->deleteJson('/api/sectores/'.$sector->id)->assertForbidden();
    }

    /* ------------------------------------------------------------------
     | El catálogo de partida
     |-----------------------------------------------------------------*/

    public function test_la_migracion_deja_el_catalogo_con_los_doce_sectores(): void
    {
        // Sin sembrar nada: los pone la propia migración, y tiene que ser
        // así porque el guion de despliegue aplica migraciones pero no
        // siembra. Con la tabla vacía la validación rechazaría CUALQUIER
        // marca con sector, que son todas.
        $this->assertSame(12, Sector::query()->count());

        // Los nombres tienen que ser EXACTOS: las marcas guardan el
        // sector como texto y una tilde de más las dejaría huérfanas.
        $this->assertDatabaseHas('sectores', ['nombre' => 'Tecnología']);
        $this->assertDatabaseHas('sectores', ['nombre' => 'Banca y finanzas']);

        // Y en el orden en que el equipo los nombra, no alfabético.
        $this->assertSame(
            ['Alimentos', 'Bebidas', 'Telecomunicaciones'],
            array_slice(Sector::nombresActivos(), 0, 3),
        );
    }

    public function test_una_marca_de_las_que_ya_existen_se_puede_guardar(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        // La comprobación que de verdad protege el despliegue: las 102
        // marcas de producción tienen rubro, y si el catálogo llegara
        // vacío ninguna se podría guardar.
        $this->actingAs($comercial)
            ->postJson('/api/marcas', ['nombreMarca' => 'Refrescos', 'sector' => 'Bebidas'])
            ->assertCreated();
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

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
