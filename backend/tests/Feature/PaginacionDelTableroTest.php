<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\Marca;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Pruebas de la paginación del tablero.
 * ---------------------------------------------------------------------
 * El tablero se recorre con scroll infinito: la interfaz va pidiendo
 * páginas conforme se baja. Antes solo pedía la primera y las marcas de
 * la 61 en adelante no había forma de verlas.
 *
 * Lo que se vigila aquí es la única forma real de que esto falle: que
 * las páginas no encajen entre sí. Si el orden no es estable, la base de
 * datos puede devolver las mismas filas en distinto orden en cada
 * petición y el recorrido acaba repitiendo unas marcas y saltándose
 * otras, sin ningún mensaje de error.
 */
class PaginacionDelTableroTest extends TestCase
{
    use RefreshDatabase;

    public function test_recorrer_todas_las_paginas_devuelve_cada_marca_una_sola_vez(): void
    {
        $comercial = $this->crearComercial();

        // 140 marcas creadas en el MISMO instante, que es justo el caso
        // que rompe una paginación sin desempate: así entraron las 102
        // de la migración.
        $mismoInstante = Carbon::parse('2026-09-01 10:00:00');

        for ($numero = 1; $numero <= 140; $numero++) {
            $marca = Marca::create(['nombre_marca' => 'Marca '.$numero]);
            Marca::query()->whereKey($marca->id)->update(['created_at' => $mismoInstante]);
        }

        $identificadoresVistos = [];
        $pagina = 1;

        do {
            $respuesta = $this->actingAs($comercial)->getJson('/api/marcas?page='.$pagina);
            $respuesta->assertOk();

            $identificadoresVistos = array_merge(
                $identificadoresVistos,
                array_column($respuesta->json('data'), 'id'),
            );

            $ultimaPagina = $respuesta->json('meta.last_page');
            $pagina++;
        } while ($pagina <= $ultimaPagina);

        // Ni una repetida ni una perdida.
        $this->assertCount(140, $identificadoresVistos);
        $this->assertCount(140, array_unique($identificadoresVistos));
        $this->assertSame(140, Marca::query()->count());
    }

    public function test_el_orden_no_cambia_entre_dos_peticiones_iguales(): void
    {
        $comercial = $this->crearComercial();

        $mismoInstante = Carbon::parse('2026-09-01 10:00:00');

        for ($numero = 1; $numero <= 30; $numero++) {
            $marca = Marca::create(['nombre_marca' => 'Empatada', 'valor_anual_usd' => 0]);
            Marca::query()->whereKey($marca->id)->update(['created_at' => $mismoInstante]);
        }

        // Mismo nombre, mismo valor y misma fecha: sin desempate, el
        // orden lo decidiría la base de datos y podría variar.
        foreach (['recientes', 'nombre', 'valor_desc'] as $criterio) {
            $primera = $this->actingAs($comercial)->getJson('/api/marcas?orden='.$criterio);
            $segunda = $this->actingAs($comercial)->getJson('/api/marcas?orden='.$criterio);

            $this->assertSame(
                array_column($primera->json('data'), 'id'),
                array_column($segunda->json('data'), 'id'),
                'El orden cambió entre dos peticiones con criterio '.$criterio,
            );
        }
    }

    public function test_el_total_es_el_del_listado_entero_y_no_el_de_la_pagina(): void
    {
        $comercial = $this->crearComercial();

        for ($numero = 1; $numero <= 75; $numero++) {
            Marca::create(['nombre_marca' => 'Marca '.$numero]);
        }

        // La cabecera del tablero dice el total, no lo que hay cargado.
        $this->actingAs($comercial)
            ->getJson('/api/marcas')
            ->assertOk()
            ->assertJsonPath('meta.total', 75)
            ->assertJsonCount(60, 'data');
    }

    public function test_los_filtros_siguen_puestos_en_las_paginas_siguientes(): void
    {
        $comercial = $this->crearComercial();

        for ($numero = 1; $numero <= 70; $numero++) {
            Marca::create(['nombre_marca' => 'Con propuesta '.$numero])
                ->forceFill([
                    'fase_propuesta_completada' => true,
                    'descripcion_propuesta' => 'Enviada',
                ])->save();
        }

        Marca::create(['nombre_marca' => 'Sin propuesta']);

        // Al pedir la segunda página el filtro viaja otra vez; si se
        // perdiera, aparecerían marcas que no cumplen el criterio.
        $segunda = $this->actingAs($comercial)
            ->getJson('/api/marcas?fase=propuesta&page=2');

        $segunda->assertOk()->assertJsonPath('meta.total', 70);

        foreach ($segunda->json('data') as $marca) {
            $this->assertTrue($marca['fasePropuestaCompletada']);
        }
    }

    private function crearComercial(): User
    {
        return User::create([
            'name' => 'La Comercial',
            'email' => 'comercial-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => RolUsuario::Comercial->value,
            'zona' => null,
            'activo' => true,
        ]);
    }
}
