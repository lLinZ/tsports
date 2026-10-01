<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\Marca;
use App\Models\Propiedad;
use App\Models\PropiedadDeMarca;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * El reporte «Pronóstico por marca»: en qué marcas está el OVP.
 * ---------------------------------------------------------------------
 * Nació de la pregunta de Antonio el 2026-10-01: la pantalla de
 * Propiedades decía «$53,3 k pronosticados» y no había forma de saber
 * de qué marcas salían. Lo que tiene que cumplirse:
 *
 *   · El total es el mismo que el de la pantalla de Propiedades.
 *   · Una línea sin cifra no mete a la marca en el reporte.
 *   · El agente solo ve lo de sus marcas, también en los totales.
 */
class ReporteDePronosticoTest extends TestCase
{
    use RefreshDatabase;

    public function test_reparte_el_pronostico_por_marca_y_cuadra_con_propiedades(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $comite = $this->crearPropiedad('Comité Olímpico');
        $kombat = $this->crearPropiedad('Kombat Challenge');
        $antigua = $this->crearPropiedad('Carrera 10K', activa: false);

        $catania = Marca::create(['nombre_marca' => 'CATANIA']);
        $sangria = Marca::create(['nombre_marca' => 'SANGRIA MAL PORTADA']);
        $sinCifra = Marca::create(['nombre_marca' => 'Marca sin cifra']);

        $this->ofrecer($catania, $comite, 20000);
        $this->ofrecer($sangria, $comite, 3000);
        $this->ofrecer($sangria, $kombat, 4000);
        $this->ofrecer($sangria, $antigua, 1000);
        $this->ofrecer($sinCifra, $kombat, 0);

        $reporte = $this->actingAs($comercial)->getJson('/api/reportes/pronostico')->assertOk();

        $reporte->assertJsonPath('alcance', 'empresa')
            ->assertJsonPath('resumen.totalOvpUsd', 28000)
            ->assertJsonPath('resumen.totalMarcas', 2)
            ->assertJsonPath('porMarca.0.nombre', 'CATANIA')
            ->assertJsonPath('porMarca.0.ovpUsd', 20000)
            ->assertJsonPath('porMarca.1.nombre', 'SANGRIA MAL PORTADA')
            ->assertJsonPath('porMarca.1.ovpUsd', 8000)
            // Dentro de la marca, primero la propiedad con más dinero.
            ->assertJsonPath('porMarca.1.propiedades.0.nombre', 'Kombat Challenge')
            ->assertJsonPath('porMarca.1.propiedades.2.activa', false);

        // El mismo total que «Pronosticado por el equipo» en Propiedades.
        $totalDePropiedades = collect(
            $this->actingAs($comercial)->getJson('/api/propiedades?conTotales=1')->json('data'),
        )->sum('ovpAcumuladoUsd');
        $this->assertEqualsWithDelta($totalDePropiedades, $reporte->json('resumen.totalOvpUsd'), 0.001);
    }

    /**
     * La hoja por propiedad: las activas salen todas, con o sin marcas;
     * una desactivada solo si aún tiene dinero anotado.
     */
    public function test_la_vista_por_propiedad_enseña_los_eventos_vacios(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $comite = $this->crearPropiedad('Comité Olímpico', orden: 1);
        $this->crearPropiedad('Megafitness', orden: 2);
        $this->crearPropiedad('Desactivada sin dinero', activa: false, orden: 3);
        $conDinero = $this->crearPropiedad('Desactivada con dinero', activa: false, orden: 4);

        $marca = Marca::create(['nombre_marca' => 'LIDER POLLO', 'logo_url' => 'https://ejemplo.test/lider.png']);
        $this->ofrecer($marca, $comite, 7000);
        $this->ofrecer($marca, $conDinero, 500);

        $porPropiedad = $this->actingAs($comercial)
            ->getJson('/api/reportes/pronostico')
            ->assertOk()
            ->json('porPropiedad');

        $this->assertSame(
            ['Comité Olímpico', 'Megafitness', 'Desactivada con dinero'],
            array_column($porPropiedad, 'nombre'),
        );
        $this->assertSame('LIDER POLLO', $porPropiedad[0]['marcas'][0]['nombre']);
        $this->assertSame('https://ejemplo.test/lider.png', $porPropiedad[0]['marcas'][0]['logoUrl']);
        $this->assertSame([], $porPropiedad[1]['marcas']);
    }

    public function test_el_agente_solo_ve_el_dinero_de_sus_marcas(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $otroAgente = $this->crearUsuario(RolUsuario::Vendedor);

        $comite = $this->crearPropiedad('Comité Olímpico');

        $suya = Marca::create(['nombre_marca' => 'Suya', 'vendedor_asignado_id' => $agente->id]);
        $ajena = Marca::create(['nombre_marca' => 'Ajena', 'vendedor_asignado_id' => $otroAgente->id]);

        $this->ofrecer($suya, $comite, 1500);
        $this->ofrecer($ajena, $comite, 9000);

        $reporte = $this->actingAs($agente)->getJson('/api/reportes/pronostico')->assertOk();

        $reporte->assertJsonPath('alcance', 'personal')
            ->assertJsonPath('resumen.totalOvpUsd', 1500)
            ->assertJsonPath('resumen.totalMarcas', 1)
            ->assertJsonPath('porPropiedad.0.ovpUsd', 1500);

        $this->assertSame(['Suya'], array_column($reporte->json('porPropiedad.0.marcas'), 'nombre'));
        $this->assertStringNotContainsString('Ajena', $reporte->getContent());
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    private function ofrecer(Marca $marca, Propiedad $propiedad, float $ovp): void
    {
        PropiedadDeMarca::create([
            'marca_id' => $marca->id,
            'propiedad_id' => $propiedad->id,
            'ovp_usd' => $ovp,
        ]);
    }

    private function crearPropiedad(string $nombre, bool $activa = true, int $orden = 0): Propiedad
    {
        return Propiedad::create([
            'nombre' => $nombre,
            'monto_total_usd' => 100000,
            'porcentaje_forecast' => 20,
            'asignada_a_todos' => true,
            'orden' => $orden,
            'activa' => $activa,
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
