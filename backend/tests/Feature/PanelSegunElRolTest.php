<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\Campana;
use App\Models\EventoDeCampana;
use App\Models\Marca;
use App\Models\Propiedad;
use App\Models\PropiedadDeMarca;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * El panel y el calendario NO enseñan lo mismo a todo el mundo.
 * ---------------------------------------------------------------------
 * Un agente ve su cartera y su agenda; admin y comercial ven el cuadro
 * de toda la agencia, que es con lo que reparten el trabajo.
 *
 * Lo que de verdad protege este fichero es que el corte lo haga el
 * SERVIDOR. Es tentador mandar siempre las mismas cifras y que la
 * interfaz esconda las que no tocan, pero entonces el pipeline entero
 * seguiría viajando en la respuesta y se leería desde el inspector del
 * navegador. Por eso las pruebas no miran la pantalla: miran que las
 * claves con cifras de la agencia NO ESTÉN en el JSON.
 */
class PanelSegunElRolTest extends TestCase
{
    use RefreshDatabase;

    /** Las claves del resumen que hablan de toda la agencia. */
    private const CLAVES_DE_LA_EMPRESA = [
        'contadores',
        'porZona',
        'porSector',
        'porVendedor',
        'inversionPorZona',
        'propiedades',
        'forecastPorProspector',
        'porCampana',
        'actividadReciente',
    ];

    /* ------------------------------------------------------------------
     | El resumen
     |-----------------------------------------------------------------*/

    public function test_el_agente_no_recibe_ninguna_cifra_de_la_empresa(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);

        // Marcas de otra persona: son las que NO tienen que contarse.
        $companero = $this->crearUsuario(RolUsuario::Vendedor, 'Compañero');
        $this->crearMarca('Marca ajena una', $companero);
        $this->crearMarca('Marca ajena dos', $companero);

        $this->crearMarca('Marca propia', $agente);

        $respuesta = $this->actingAs($agente)
            ->getJson('/api/panel/resumen')
            ->assertOk()
            ->assertJsonPath('alcance', 'personal')
            // Solo cuenta la suya, no las tres que hay en la base.
            ->assertJsonPath('misNumeros.totalMarcas', 1);

        foreach (self::CLAVES_DE_LA_EMPRESA as $clave) {
            $respuesta->assertJsonMissingPath($clave);
        }
    }

    public function test_el_comercial_si_recibe_el_cuadro_completo(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);

        $this->crearMarca('Marca de alguien', $agente);
        $this->crearMarca('Marca sin dueño');

        $respuesta = $this->actingAs($comercial)
            ->getJson('/api/panel/resumen')
            ->assertOk()
            ->assertJsonPath('alcance', 'empresa')
            ->assertJsonPath('contadores.totalMarcas', 2);

        foreach (self::CLAVES_DE_LA_EMPRESA as $clave) {
            $respuesta->assertJsonStructure([$clave]);
        }
    }

    public function test_el_pronostico_del_agente_solo_suma_sus_marcas(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $companero = $this->crearUsuario(RolUsuario::Vendedor, 'Compañero');

        $propiedad = Propiedad::create([
            'nombre' => 'Comité Olímpico',
            'monto_total_usd' => 162000,
        ]);

        $this->anotarPronostico($this->crearMarca('Mía', $agente), $propiedad, 5000);
        $this->anotarPronostico($this->crearMarca('Suya', $companero), $propiedad, 9000);

        $this->actingAs($agente)
            ->getJson('/api/panel/resumen')
            ->assertOk()
            ->assertJsonPath('misNumeros.miPronostico', 5000)
            // Y en "mis propiedades", la misma cifra: la de sus marcas.
            ->assertJsonPath('misPropiedades.0.ovpUsd', 5000)
            ->assertJsonPath('misPropiedades.0.totalMarcas', 1);
    }

    public function test_mis_propiedades_no_lleva_el_monto_ni_la_meta_del_catalogo(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);

        $propiedad = Propiedad::create([
            'nombre' => 'Dvo. Táchira',
            'monto_total_usd' => 90000,
        ]);

        $this->anotarPronostico($this->crearMarca('Mía', $agente), $propiedad, 4000);

        $respuesta = $this->actingAs($agente)
            ->getJson('/api/panel/resumen')
            ->assertOk();

        // El MTP y la meta son cifras de la agencia: dicen cuánto vale el
        // producto, no cuánto lleva vendido esta persona.
        $respuesta->assertJsonMissingPath('misPropiedades.0.montoTotalUsd');
        $respuesta->assertJsonMissingPath('misPropiedades.0.forecastDeVentaUsd');
    }

    /* ------------------------------------------------------------------
     | El calendario
     |-----------------------------------------------------------------*/

    /**
     * «Mis campañas» tiene que seguir enseñando una campaña que el agente
     * trabajó aunque sus marcas ya hayan pasado a otra.
     *
     * La casilla `campana_id` de la marca solo guarda la última, así que
     * la lista salía solo de ella y el trabajo de hace un mes
     * desaparecía del panel sin dejar rastro.
     */
    public function test_mis_campanas_conserva_las_que_ya_trabajo(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);

        // Con color explícito: `anotarEvento` lo copia dentro del evento
        // y esa columna no admite nulo.
        $invitacion = Campana::create([
            'nombre' => 'Invitación a evento',
            'color' => '#db2777',
        ]);
        $materialPop = Campana::create([
            'nombre' => 'Envió material pop',
            'color' => '#f59e0b',
        ]);

        $suMarca = $this->crearMarca('Marca del agente', $agente);
        $suMarca->update(['campana_id' => $materialPop->id]);

        $this->anotarEvento($suMarca, $invitacion, '2026-09-17');
        $this->anotarEvento($suMarca, $materialPop, '2026-09-28');

        // La misma campaña en una marca AJENA no debe sumarle nada.
        $deOtro = $this->crearMarca('Marca de otro', $this->crearUsuario(
            RolUsuario::Vendedor,
            'Otro agente',
        ));
        $this->anotarEvento($deOtro, $invitacion, '2026-09-17');

        $misCampanas = collect(
            $this->actingAs($agente)->getJson('/api/panel/resumen')->json('misCampanas'),
        )->keyBy('nombre');

        // La que trabajó y ya no tiene puesta: cero ahora, una alcanzada.
        $this->assertSame(0, $misCampanas['Invitación a evento']['total']);
        $this->assertSame(1, $misCampanas['Invitación a evento']['alcanzadas']);

        // La que tiene puesta hoy.
        $this->assertSame(1, $misCampanas['Envió material pop']['total']);
        $this->assertSame(1, $misCampanas['Envió material pop']['alcanzadas']);

        // Primero lo que tiene puesto hoy, que es lo que le toca.
        $this->assertSame('Envió material pop', $misCampanas->keys()->first());
    }

    public function test_el_calendario_del_agente_solo_trae_sus_acciones(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $companero = $this->crearUsuario(RolUsuario::Vendedor, 'Compañero');

        $campana = Campana::create(['nombre' => 'Visita presencial', 'color' => '#2563eb']);
        $hoy = now()->toDateString();

        $this->anotarEvento($this->crearMarca('Mía', $agente), $campana, $hoy);
        $this->anotarEvento($this->crearMarca('Suya', $companero), $campana, $hoy);
        $this->anotarEvento($this->crearMarca('De nadie'), $campana, $hoy);

        $this->actingAs($agente)
            ->getJson('/api/panel/calendario')
            ->assertOk()
            ->assertJsonPath('periodo.esSoloMia', true)
            ->assertJsonPath('resumen.totalDeAcciones', 1)
            ->assertJsonPath('resumen.porVendedor.0.etiqueta', 'Agente de prueba');
    }

    public function test_el_calendario_del_comercial_trae_las_de_todo_el_equipo(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);

        $campana = Campana::create(['nombre' => 'Visita presencial', 'color' => '#2563eb']);
        $hoy = now()->toDateString();

        $this->anotarEvento($this->crearMarca('Una', $agente), $campana, $hoy);
        $this->anotarEvento($this->crearMarca('Otra'), $campana, $hoy);

        $this->actingAs($comercial)
            ->getJson('/api/panel/calendario')
            ->assertOk()
            ->assertJsonPath('periodo.esSoloMia', false)
            ->assertJsonPath('resumen.totalDeAcciones', 2);
    }

    /* ------------------------------------------------------------------
     | Ayudas
     |-----------------------------------------------------------------*/

    private function crearUsuario(
        RolUsuario $rol,
        string $nombre = 'Agente de prueba',
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

    private function crearMarca(string $nombre, ?User $duenio = null): Marca
    {
        return Marca::create([
            'nombre_marca' => $nombre,
            'vendedor_asignado_id' => $duenio?->id,
            'vendedor_asignado_nombre' => $duenio?->name,
        ]);
    }

    private function anotarPronostico(
        Marca $marca,
        Propiedad $propiedad,
        float $ovp,
    ): void {
        PropiedadDeMarca::create([
            'marca_id' => $marca->id,
            'propiedad_id' => $propiedad->id,
            'ovp_usd' => $ovp,
        ]);
    }

    private function anotarEvento(Marca $marca, Campana $campana, string $fecha): void
    {
        EventoDeCampana::create([
            'marca_id' => $marca->id,
            'campana_id' => $campana->id,
            'campana_nombre' => $campana->nombre,
            'campana_color' => $campana->color,
            'fecha' => $fecha,
        ]);
    }
}
