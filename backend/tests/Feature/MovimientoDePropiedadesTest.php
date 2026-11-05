<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Http\Resources\RecursoUsuario;
use App\Models\Marca;
use App\Models\Propiedad;
use App\Models\PropiedadDeMarca;
use App\Models\Recordatorio;
use App\Models\RegistroActividad;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Propiedades › Movimiento: dónde está caliente cada propiedad.
 * ---------------------------------------------------------------------
 * La propuesta del 2026-11-05 («Propiedades en caliente»). Lo que tiene
 * que cumplirse:
 *
 *   · Una propiedad NO tiene estado propio: se cuentan las marcas que la
 *     llevan por su estado, sin promediar.
 *   · El estado es el de la marca, el de la tarjeta, y lo fijado a mano
 *     cuenta.
 *   · «En calientes» es el OVP de esa propiedad en sus marcas calientes.
 *   · El pronóstico total cuadra con «Pronosticado por el equipo».
 *   · El cruce suma lo mismo por filas y por columnas, y sus contadores
 *     son lo que sale al pulsarlos.
 *   · Lo ven admin y comercial; el agente recibe 403.
 *   · Exportar queda en la auditoría.
 */
class MovimientoDePropiedadesTest extends TestCase
{
    use RefreshDatabase;

    private User $comercial;

    private User $ana;

    private User $luis;

    private Propiedad $megafitness;

    private Propiedad $comite;

    private Propiedad $tachira;

    private Marca $banco;

    private Marca $clinica;

    private Marca $leti;

    private Marca $constructora;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(CarbonImmutable::parse('2026-11-05 15:00:00', 'UTC'));

        $this->comercial = $this->crearUsuario(RolUsuario::Comercial, 'Edgar');
        $this->ana = $this->crearUsuario(RolUsuario::Vendedor, 'Ana Pérez');
        $this->luis = $this->crearUsuario(RolUsuario::Vendedor, 'Luis Ramírez');

        $this->megafitness = $this->crearPropiedad('Megafitness', 40000, orden: 1);
        $this->comite = $this->crearPropiedad('Comité Olímpico', 162000, orden: 2);
        $this->tachira = $this->crearPropiedad('Dvo. Táchira', 30000, orden: 3);
        $this->crearPropiedad('Movewireless', 0, orden: 4);

        // Calientes: se movieron hace menos de 5 días (umbral de partida).
        $this->banco = $this->crearMarca('Banco Metropolitano', $this->luis, haceDias: 3);
        $this->clinica = $this->crearMarca('Clínica del Este', $this->ana, haceDias: 0);
        // Tibia: entre 6 y 15 días.
        $this->leti = $this->crearMarca('LETI', $this->ana, haceDias: 7);
        // Fría: más de 15 días.
        $this->constructora = $this->crearMarca('Constructora Andes', $this->luis, haceDias: 21);

        $this->ofrecer($this->banco, $this->megafitness, 6000);
        $this->ofrecer($this->banco, $this->comite, 40000);
        $this->ofrecer($this->clinica, $this->megafitness, 5000);
        $this->ofrecer($this->leti, $this->megafitness, 5400);
        $this->ofrecer($this->constructora, $this->comite, 22000);
        $this->ofrecer($this->constructora, $this->tachira, 3000);
    }

    public function test_el_ranking_cuenta_las_marcas_por_estado_sin_promediar(): void
    {
        $ranking = $this->actingAs($this->comercial)
            ->getJson('/api/propiedades/movimiento')
            ->assertOk();

        // Por más calientes: Megafitness (2), Comité (1), Táchira (0).
        $this->assertSame(
            ['Megafitness', 'Comité Olímpico', 'Dvo. Táchira'],
            array_column($ranking->json('propiedades'), 'nombre'),
        );

        $ranking->assertJsonPath('propiedades.0.marcas', 3)
            ->assertJsonPath('propiedades.0.porEstado.caliente.marcas', 2)
            ->assertJsonPath('propiedades.0.porEstado.tibia.marcas', 1)
            ->assertJsonPath('propiedades.0.porEstado.fria.marcas', 0)
            // El OVP de Megafitness en Banco y Clínica, no el total de esas marcas.
            ->assertJsonPath('propiedades.0.ovpEnCalientesUsd', 11000)
            ->assertJsonPath('propiedades.0.ovpUsd', 16400)
            ->assertJsonPath('propiedades.0.porcentajeSobreElTotal', 41)
            ->assertJsonPath('propiedades.0.ultimoMovimiento.marcaNombre', 'Clínica del Este')
            ->assertJsonPath('propiedades.0.ultimoMovimiento.haceDias', 0)
            ->assertJsonPath('propiedades.2.porEstado.fria.marcas', 1)
            ->assertJsonPath('propiedades.2.ovpEnCalientesUsd', 0)
            ->assertJsonPath('propiedades.2.ultimoMovimiento.haceDias', 21)
            // La que no está en ninguna marca va aparte, y dice si tiene MTP.
            ->assertJsonPath('sinMarcas.0.nombre', 'Movewireless')
            ->assertJsonPath('sinMarcas.0.tieneMtp', false)
            ->assertJsonPath('totales.ovpUsd', 81400)
            ->assertJsonPath('totales.ovpEnCalientesUsd', 51000)
            ->assertJsonPath('totales.montoTotalUsd', 232000);

        // El mismo total que «Pronosticado por el equipo» en Propiedades.
        $totalDePropiedades = collect(
            $this->actingAs($this->comercial)->getJson('/api/propiedades?conTotales=1')->json('data'),
        )->sum('ovpAcumuladoUsd');
        $this->assertEqualsWithDelta($totalDePropiedades, $ranking->json('totales.ovpUsd'), 0.001);
    }

    public function test_el_estado_fijado_a_mano_cuenta_igual_que_en_la_tarjeta(): void
    {
        $this->constructora->forceFill(['estado_fijado' => 'caliente'])->saveQuietly();

        $ranking = $this->actingAs($this->comercial)->getJson('/api/propiedades/movimiento')->assertOk();
        $tachira = collect($ranking->json('propiedades'))->firstWhere('nombre', 'Dvo. Táchira');

        $this->assertSame(1, $tachira['porEstado']['caliente']['marcas']);
        $this->assertEquals(3000, $tachira['ovpEnCalientesUsd']);
    }

    public function test_cuenta_las_marcas_que_se_le_anadieron_este_mes(): void
    {
        // La de Comité en Constructora se añadió en octubre.
        PropiedadDeMarca::query()
            ->where('marca_id', $this->constructora->id)
            ->where('propiedad_id', $this->comite->id)
            ->update(['created_at' => '2026-10-20 12:00:00']);

        $ranking = $this->actingAs($this->comercial)->getJson('/api/propiedades/movimiento')->assertOk();
        $comite = collect($ranking->json('propiedades'))->firstWhere('nombre', 'Comité Olímpico');

        $this->assertSame(1, $comite['nuevasEsteMes']);
    }

    public function test_los_ordenes_del_ranking_llevan_desempate(): void
    {
        $porPronostico = $this->actingAs($this->comercial)
            ->getJson('/api/propiedades/movimiento?orden=pronostico')
            ->assertOk()
            ->assertJsonPath('orden', 'pronostico')
            ->json('propiedades');

        $this->assertSame(['Comité Olímpico', 'Megafitness', 'Dvo. Táchira'], array_column($porPronostico, 'nombre'));

        // Un orden que no existe cae en el de partida.
        $this->actingAs($this->comercial)
            ->getJson('/api/propiedades/movimiento?orden=inventado')
            ->assertJsonPath('orden', 'calientes');
    }

    public function test_la_ficha_reparte_las_marcas_y_dice_el_siguiente_paso(): void
    {
        Recordatorio::create([
            'marca_id' => $this->clinica->id,
            'persona_id' => $this->ana->id,
            'fecha' => '2026-11-06',
            'hora' => '10:00',
            'tipo' => 'reunion',
        ]);
        $this->banco->forceFill(['fase_propuesta_completada' => true, 'descripcion_propuesta' => 'Stand'])->saveQuietly();

        $ficha = $this->actingAs($this->comercial)
            ->getJson("/api/propiedades/{$this->megafitness->id}/movimiento")
            ->assertOk()
            ->assertJsonPath('propiedad.nombre', 'Megafitness')
            ->assertJsonPath('porEstado.caliente.marcas', 2)
            ->assertJsonPath('porEstado.caliente.ovpUsd', 11000)
            ->assertJsonPath('porEstado.tibia.ovpUsd', 5400);

        $marcas = collect($ficha->json('marcas'))->keyBy('nombre');

        // Primero la que más pronostica en esta propiedad.
        $this->assertSame('Banco Metropolitano', $ficha->json('marcas.0.nombre'));
        $this->assertEquals(6000, $marcas['Banco Metropolitano']['ovpUsd']);
        $this->assertSame('Propuesta enviada', $marcas['Banco Metropolitano']['fase']['etiqueta']);
        $this->assertSame('Luis Ramírez', $marcas['Banco Metropolitano']['agente']['nombre']);
        $this->assertNull($marcas['Banco Metropolitano']['siguientePaso']);

        $this->assertSame('recordatorio', $marcas['Clínica del Este']['siguientePaso']['clase']);
        $this->assertSame(1, $marcas['Clínica del Este']['siguientePaso']['diasHasta']);
        $this->assertSame('10:00', $marcas['Clínica del Este']['siguientePaso']['hora']);
        $this->assertSame('Reunión', $marcas['Clínica del Este']['siguientePaso']['etiqueta']);
    }

    public function test_el_cruce_cuadra_por_filas_y_por_columnas(): void
    {
        $cruce = $this->actingAs($this->comercial)
            ->getJson('/api/propiedades/movimiento/cruce')
            ->assertOk()
            ->assertJsonPath('ovpUsd', 81400)
            ->assertJsonPath('contadores.todas', 4)
            ->assertJsonPath('contadores.caliente', 2)
            ->assertJsonPath('contadores.tibia', 1)
            ->assertJsonPath('contadores.fria', 1)
            // Primero la marca con más pronóstico entre todas sus propiedades.
            ->assertJsonPath('filas.0.nombre', 'Banco Metropolitano')
            ->assertJsonPath('filas.0.ovpUsd', 46000);

        $this->assertSame(
            ['Megafitness', 'Comité Olímpico', 'Dvo. Táchira'],
            array_column($cruce->json('columnas'), 'nombre'),
        );

        $columnas = collect($cruce->json('totalesPorColumna'))->keyBy('propiedadId');
        $this->assertEquals(16400, $columnas[$this->megafitness->id]['ovpUsd']);
        $this->assertSame(2, $columnas[$this->megafitness->id]['calientes']);
        $this->assertSame(3, $columnas[$this->megafitness->id]['marcas']);
        $this->assertEqualsWithDelta(
            $cruce->json('ovpUsd'),
            $columnas->sum('ovpUsd'),
            0.001,
        );
    }

    public function test_los_contadores_del_cruce_no_cambian_con_el_filtro_de_estado(): void
    {
        $this->actingAs($this->comercial)
            ->getJson('/api/propiedades/movimiento/cruce?estado=caliente&agente='.$this->ana->id)
            ->assertOk()
            ->assertJsonCount(1, 'filas')
            ->assertJsonPath('filas.0.nombre', 'Clínica del Este')
            // Los de Ana: una caliente y una tibia, con o sin filtro de estado.
            ->assertJsonPath('contadores.todas', 2)
            ->assertJsonPath('contadores.caliente', 1)
            ->assertJsonPath('contadores.tibia', 1)
            // Las columnas siguen siendo las mismas.
            ->assertJsonCount(3, 'columnas');
    }

    public function test_el_agente_no_ve_el_movimiento_ni_de_sus_marcas(): void
    {
        foreach ([
            '/api/propiedades/movimiento',
            '/api/propiedades/movimiento/cruce',
            "/api/propiedades/{$this->megafitness->id}/movimiento",
            '/api/propiedades/movimiento/exportacion?vista=ranking',
        ] as $direccion) {
            $this->actingAs($this->ana)->getJson($direccion)->assertForbidden();
        }

        // El catálogo lo sigue viendo como siempre.
        $this->actingAs($this->ana)->getJson('/api/propiedades')->assertOk();
    }

    public function test_el_permiso_llega_a_admin_y_comercial_y_no_al_agente(): void
    {
        foreach ([[RolUsuario::Admin, true], [RolUsuario::Comercial, true], [RolUsuario::Vendedor, false]] as [$rol, $loVe]) {
            $permisos = (new RecursoUsuario($this->crearUsuario($rol, 'Alguien')))->toArray(request())['permisos'];

            $this->assertSame($loVe, $permisos['veElMovimientoDeLasPropiedades'], $rol->value);
        }
    }

    public function test_exportar_queda_en_la_auditoria(): void
    {
        $this->actingAs($this->comercial)
            ->getJson("/api/propiedades/movimiento/exportacion?vista=ficha&propiedad={$this->comite->id}")
            ->assertOk()
            ->assertJsonPath('propiedad.nombre', 'Comité Olímpico')
            ->assertJsonStructure(['generadoEn']);

        $this->actingAs($this->comercial)
            ->getJson('/api/propiedades/movimiento/exportacion?vista=cruce&estado=fria')
            ->assertOk()
            ->assertJsonCount(1, 'filas');

        $this->assertSame(
            ['Exportó las marcas de Comité Olímpico a Excel', 'Exportó el cruce de marcas y propiedades a Excel'],
            RegistroActividad::query()
                ->where('accion', RegistroActividad::ACCION_EXPORTO)
                ->orderBy('created_at')
                ->orderBy('id')
                ->pluck('descripcion')
                ->all(),
        );

        // La ficha sin propiedad no se exporta.
        $this->actingAs($this->comercial)
            ->getJson('/api/propiedades/movimiento/exportacion?vista=ficha')
            ->assertUnprocessable();
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    private function crearMarca(string $nombre, User $agente, int $haceDias): Marca
    {
        $marca = Marca::create([
            'nombre_marca' => $nombre,
            'vendedor_asignado_id' => $agente->id,
            'vendedor_asignado_nombre' => $agente->name,
        ]);

        // Sin eventos del modelo: guardar no tiene que volver a moverla.
        $marca->forceFill(['ultimo_movimiento_en' => now()->subDays($haceDias)])->saveQuietly();

        return $marca;
    }

    private function ofrecer(Marca $marca, Propiedad $propiedad, float $ovp): void
    {
        PropiedadDeMarca::create([
            'marca_id' => $marca->id,
            'propiedad_id' => $propiedad->id,
            'ovp_usd' => $ovp,
        ]);
    }

    private function crearPropiedad(string $nombre, float $monto, int $orden): Propiedad
    {
        return Propiedad::create([
            'nombre' => $nombre,
            'monto_total_usd' => $monto,
            'porcentaje_forecast' => 20,
            'asignada_a_todos' => true,
            'orden' => $orden,
            'activa' => true,
        ]);
    }

    private function crearUsuario(RolUsuario $rol, string $nombre): User
    {
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
