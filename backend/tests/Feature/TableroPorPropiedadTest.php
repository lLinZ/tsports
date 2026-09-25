<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\Marca;
use App\Models\Propiedad;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * El tablero visto desde una propiedad: «Ver las marcas» de Águilas.
 * ---------------------------------------------------------------------
 * El fallo que dio pie a esto (septiembre de 2026): la propiedad decía
 * «OVP 1.000 en 2 marcas», se pulsaba «Ver las marcas» y las tarjetas
 * decían 8.000 y 0, porque cada una enseñaba el pronóstico TOTAL de la
 * marca, sumando todas sus propiedades. Para hacer un reporte había que
 * abrir las fichas una a una.
 *
 * Ahora, con el filtro por propiedad, el listado trae el resumen de esa
 * propiedad sumado sobre las marcas que se ven, y se puede ordenar por
 * lo que se pronostica de ella.
 */
class TableroPorPropiedadTest extends TestCase
{
    use RefreshDatabase;

    public function test_el_resumen_suma_solo_el_ovp_de_la_propiedad_filtrada(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $aguilas = Propiedad::create([
            'nombre' => 'Águilas del Zulia',
            'monto_total_usd' => 12000,
            'porcentaje_forecast' => 20,
        ]);
        $kombat = Propiedad::create(['nombre' => 'Kombat Challenge', 'monto_total_usd' => 50000]);

        // El caso de la captura: una marca con 1.000 de Águilas y 7.000
        // de otra propiedad, y otra con 0 de Águilas.
        $sangria = Marca::create(['nombre_marca' => 'Sangría']);
        $sangria->propiedadesOfrecidas()->create(['propiedad_id' => $aguilas->id, 'ovp_usd' => 1000]);
        $sangria->propiedadesOfrecidas()->create(['propiedad_id' => $kombat->id, 'ovp_usd' => 7000]);

        $leti = Marca::create(['nombre_marca' => 'Leti']);
        $leti->propiedadesOfrecidas()->create(['propiedad_id' => $aguilas->id, 'ovp_usd' => 0]);

        $this->actingAs($comercial)
            ->getJson("/api/marcas?propiedad={$aguilas->id}")
            ->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('resumenDeLaPropiedad.nombre', 'Águilas del Zulia')
            ->assertJsonPath('resumenDeLaPropiedad.ovpUsd', 1000)
            ->assertJsonPath('resumenDeLaPropiedad.forecastDeVentaUsd', 2400)
            ->assertJsonPath('resumenDeLaPropiedad.porcentajeSobreElTotal', 8.33);

        // Sin filtro por propiedad no hay resumen que dar.
        $this->actingAs($comercial)
            ->getJson('/api/marcas')
            ->assertOk()
            ->assertJsonPath('resumenDeLaPropiedad', null);
    }

    public function test_se_ordena_por_el_ovp_de_la_propiedad_y_no_por_el_total(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $aguilas = Propiedad::create(['nombre' => 'Águilas del Zulia', 'monto_total_usd' => 12000]);
        $kombat = Propiedad::create(['nombre' => 'Kombat Challenge', 'monto_total_usd' => 50000]);

        // «Mucho total» tiene más pronóstico sumando todo, pero menos de
        // Águilas: por el total saldría primera y aquí tiene que salir
        // segunda.
        $muchoTotal = Marca::create(['nombre_marca' => 'Mucho total']);
        $muchoTotal->propiedadesOfrecidas()->create(['propiedad_id' => $aguilas->id, 'ovp_usd' => 200]);
        $muchoTotal->propiedadesOfrecidas()->create(['propiedad_id' => $kombat->id, 'ovp_usd' => 9000]);

        $muchoDeAguilas = Marca::create(['nombre_marca' => 'Mucho de Águilas']);
        $muchoDeAguilas->propiedadesOfrecidas()->create(['propiedad_id' => $aguilas->id, 'ovp_usd' => 3000]);

        $nadaDeAguilas = Marca::create(['nombre_marca' => 'Nada de Águilas']);
        $nadaDeAguilas->propiedadesOfrecidas()->create(['propiedad_id' => $aguilas->id, 'ovp_usd' => 0]);

        $respuesta = $this->actingAs($comercial)
            ->getJson("/api/marcas?propiedad={$aguilas->id}&orden=ovp_propiedad")
            ->assertOk();

        $this->assertSame(
            ['Mucho de Águilas', 'Mucho total', 'Nada de Águilas'],
            array_column($respuesta->json('data'), 'nombreMarca'),
        );
    }

    public function test_el_orden_por_ovp_sin_propiedad_no_rompe_el_listado(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        Marca::create(['nombre_marca' => 'Una']);
        Marca::create(['nombre_marca' => 'Otra']);

        // Una dirección guardada de antes, o escrita a mano: se ignora el
        // orden y el tablero sale como siempre.
        $this->actingAs($comercial)
            ->getJson('/api/marcas?orden=ovp_propiedad')
            ->assertOk()
            ->assertJsonPath('meta.total', 2);
    }

    public function test_el_agente_solo_suma_el_pronostico_de_su_cartera(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Agente Uno');
        $otroAgente = $this->crearUsuario(RolUsuario::Vendedor, 'Agente Dos');

        $aguilas = Propiedad::create([
            'nombre' => 'Águilas del Zulia',
            'monto_total_usd' => 12000,
            'asignada_a_todos' => true,
        ]);

        $suya = Marca::create(['nombre_marca' => 'Suya', 'vendedor_asignado_id' => $agente->id]);
        $suya->propiedadesOfrecidas()->create(['propiedad_id' => $aguilas->id, 'ovp_usd' => 500]);

        $ajena = Marca::create(['nombre_marca' => 'Ajena', 'vendedor_asignado_id' => $otroAgente->id]);
        $ajena->propiedadesOfrecidas()->create(['propiedad_id' => $aguilas->id, 'ovp_usd' => 4000]);

        // La cabecera suma lo mismo que las tarjetas que tiene debajo: el
        // pronóstico de una marca ajena no se cuela en la cifra.
        $this->actingAs($agente)
            ->getJson("/api/marcas?propiedad={$aguilas->id}")
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('resumenDeLaPropiedad.ovpUsd', 500);
    }

    public function test_el_resumen_del_panel_va_en_ranking_con_las_propiedades_sin_mtp_al_final(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);

        $sinMtp = Propiedad::create(['nombre' => 'Sin MTP', 'orden' => 1]);
        $poco = Propiedad::create(['nombre' => 'Poco avance', 'monto_total_usd' => 10000, 'orden' => 2]);
        $mucho = Propiedad::create(['nombre' => 'Mucho avance', 'monto_total_usd' => 10000, 'orden' => 3]);

        $marca = Marca::create(['nombre_marca' => 'Marca']);
        $marca->propiedadesOfrecidas()->create(['propiedad_id' => $sinMtp->id, 'ovp_usd' => 90000]);
        $marca->propiedadesOfrecidas()->create(['propiedad_id' => $poco->id, 'ovp_usd' => 500]);
        $marca->propiedadesOfrecidas()->create(['propiedad_id' => $mucho->id, 'ovp_usd' => 4000]);

        $respuesta = $this->actingAs($administrador)
            ->getJson('/api/panel/resumen')
            ->assertOk();

        // Aunque «Sin MTP» tiene el OVP más alto y va primera en el
        // catálogo, sin MTP no hay porcentaje que comparar: al final.
        $this->assertSame(
            ['Mucho avance', 'Poco avance', 'Sin MTP'],
            array_column($respuesta->json('propiedades'), 'nombre'),
        );
    }

    private function crearUsuario(RolUsuario $rol, string $nombre = 'Usuario de prueba'): User
    {
        return User::create([
            'name' => $nombre,
            'email' => strtolower(str_replace(' ', '.', $nombre)).'-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            'zona' => null,
            'activo' => true,
        ]);
    }
}
