<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\Campana;
use App\Models\EventoDeCampana;
use App\Models\Marca;
use App\Models\User;
use Database\Seeders\CampanasInicialesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pruebas del filtrado del tablero por campaña.
 * ---------------------------------------------------------------------
 * Las campañas ya tenían cubiertos los permisos, la asignación desde la
 * ficha y el borrado. Lo que falta aquí es lo que el filtro promete:
 * que al elegir una campaña salgan exactamente sus marcas y ninguna más.
 *
 * Se prueba también el catálogo inicial, porque son las acciones
 * comerciales reales que el equipo trabaja y se siembran en producción:
 * si el seeder duplicase al volver a ejecutarse, el selector se llenaría
 * de campañas repetidas y las marcas quedarían repartidas entre copias.
 */
class FiltroDeCampanasTest extends TestCase
{
    use RefreshDatabase;

    /* ------------------------------------------------------------------
     | Filtrado del tablero
     |-----------------------------------------------------------------*/

    public function test_filtrar_por_campana_devuelve_solo_sus_marcas(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $visitaPresencial = Campana::create(['nombre' => 'Visita presencial']);
        $materialPop = Campana::create(['nombre' => 'Envió material pop']);

        $this->crearMarca('Marca visitada', $visitaPresencial);
        $this->crearMarca('Otra marca visitada', $visitaPresencial);
        $this->crearMarca('Marca con material', $materialPop);
        $this->crearMarca('Marca sin campaña', null);

        $respuesta = $this->actingAs($comercial)
            ->getJson('/api/marcas?campana='.$visitaPresencial->id);

        $respuesta->assertOk();

        $nombresDevueltos = array_column($respuesta->json('data'), 'nombreMarca');

        sort($nombresDevueltos);

        $this->assertSame(['Marca visitada', 'Otra marca visitada'], $nombresDevueltos);
    }

    /**
     * El caso que descubrió Antonio mirando el panel: una campaña con
     * acciones hechas salía con CERO marcas.
     *
     * Pasa en cuanto a una marca se le asigna una campaña nueva: su
     * `campana_id` es una sola casilla y se sobreescribe, así que
     * desaparece de la anterior aunque el trabajo se hiciera. Por eso el
     * reparto devuelve dos cifras, y esta prueba fija qué significa cada
     * una.
     */
    public function test_el_reparto_cuenta_aparte_las_marcas_alcanzadas(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $invitacion = Campana::create(['nombre' => 'Invitación a evento']);
        $materialPop = Campana::create(['nombre' => 'Envió material pop']);

        // Se la invitó primero y después se le mandó material: hoy tiene
        // puesta la segunda campaña, pero las dos la alcanzaron.
        $marca = $this->crearMarca('Marca que cambió de campaña', $materialPop);

        $this->anotarAccion($marca, $invitacion, '2026-09-17');
        $this->anotarAccion($marca, $materialPop, '2026-09-28');

        $reparto = collect(
            $this->actingAs($comercial)->getJson('/api/panel/resumen')->json('porCampana'),
        )->keyBy('nombre');

        $this->assertSame(0, $reparto['Invitación a evento']['total']);
        $this->assertSame(1, $reparto['Invitación a evento']['alcanzadas']);

        $this->assertSame(1, $reparto['Envió material pop']['total']);
        $this->assertSame(1, $reparto['Envió material pop']['alcanzadas']);
    }

    /**
     * Una marca alcanzada dos veces por la misma campaña cuenta UNA vez.
     *
     * Si contara acciones en vez de marcas, la cifra podría superar al
     * total de marcas registradas y dejaría de poder compararse con el
     * resto del panel.
     */
    public function test_dos_acciones_de_la_misma_campana_no_cuentan_dos_marcas(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $visita = Campana::create(['nombre' => 'Visita presencial']);
        $marca = $this->crearMarca('Marca visitada dos veces', $visita);

        $this->anotarAccion($marca, $visita, '2026-09-10');
        $this->anotarAccion($marca, $visita, '2026-09-24');

        $reparto = collect(
            $this->actingAs($comercial)->getJson('/api/panel/resumen')->json('porCampana'),
        )->firstWhere('nombre', 'Visita presencial');

        $this->assertSame(1, $reparto['alcanzadas']);
    }

    /**
     * Al pulsar «alcanzadas» tiene que salir esa misma lista.
     *
     * Es la regla que sostiene todo el panel: una cifra que lleva a una
     * lista con otro número es peor que una cifra sin enlace.
     */
    public function test_el_filtro_por_alcanzadas_trae_las_que_ya_cambiaron_de_campana(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $invitacion = Campana::create(['nombre' => 'Invitación a evento']);
        $materialPop = Campana::create(['nombre' => 'Envió material pop']);

        $laQueCambio = $this->crearMarca('Marca que cambió de campaña', $materialPop);
        $this->anotarAccion($laQueCambio, $invitacion, '2026-09-17');

        $laQueSigue = $this->crearMarca('Marca invitada y quieta', $invitacion);
        $this->anotarAccion($laQueSigue, $invitacion, '2026-09-18');

        // Y una que nunca tuvo nada que ver con esa campaña.
        $this->crearMarca('Marca ajena', $materialPop);

        $nombres = array_column(
            $this->actingAs($comercial)
                ->getJson('/api/marcas?campanaAlcanzada='.$invitacion->id)
                ->assertOk()
                ->json('data'),
            'nombreMarca',
        );

        sort($nombres);

        $this->assertSame(
            ['Marca invitada y quieta', 'Marca que cambió de campaña'],
            $nombres,
        );
    }

    /**
     * Renombrar una campaña no le quita sus marcas alcanzadas.
     *
     * El historial guarda el nombre viejo dentro de cada acción a
     * propósito (regla 13), así que el reparto tiene que agrupar por id;
     * agrupando por nombre, renombrar vaciaría la cifra de golpe.
     */
    public function test_renombrar_la_campana_no_pierde_sus_alcanzadas(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $campana = Campana::create(['nombre' => 'Invitación a evento']);
        $marca = $this->crearMarca('Marca invitada', $campana);

        $this->anotarAccion($marca, $campana, '2026-09-17');

        $campana->update(['nombre' => 'Invitación a evento de enamorados']);

        $reparto = collect(
            $this->actingAs($comercial)->getJson('/api/panel/resumen')->json('porCampana'),
        )->firstWhere('nombre', 'Invitación a evento de enamorados');

        $this->assertSame(1, $reparto['alcanzadas']);
    }

    public function test_el_filtro_sin_campana_trae_las_que_no_tienen_ninguna(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $campana = Campana::create(['nombre' => 'Invitación a evento Sportbiz']);

        $this->crearMarca('Marca invitada', $campana);
        $this->crearMarca('Marca huérfana', null);
        $this->crearMarca('Otra huérfana', null);

        $respuesta = $this->actingAs($comercial)->getJson('/api/marcas?campana=sin_campana');

        $respuesta->assertOk();

        $nombresDevueltos = array_column($respuesta->json('data'), 'nombreMarca');

        sort($nombresDevueltos);

        $this->assertSame(['Marca huérfana', 'Otra huérfana'], $nombresDevueltos);
    }

    public function test_sin_filtro_de_campana_salen_todas_las_marcas(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $campana = Campana::create(['nombre' => 'Invitación a nuestros medios']);

        $this->crearMarca('Con campaña', $campana);
        $this->crearMarca('Sin campaña', null);

        $this->actingAs($comercial)
            ->getJson('/api/marcas')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_el_filtro_de_campana_se_combina_con_los_demas(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $campana = Campana::create(['nombre' => 'Visita presencial']);

        // Dos marcas en la misma campaña, en zonas distintas: al filtrar
        // por campaña Y zona solo debe quedar una.
        $marcaDeCaracas = $this->crearMarca('Marca de Caracas', $campana);
        $marcaDeCaracas->forceFill(['zona' => 'Caracas'])->save();

        $marcaDeOriente = $this->crearMarca('Marca de Oriente', $campana);
        $marcaDeOriente->forceFill(['zona' => 'Oriente'])->save();

        $respuesta = $this->actingAs($comercial)
            ->getJson('/api/marcas?campana='.$campana->id.'&zona=Caracas');

        $respuesta->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('Marca de Caracas', $respuesta->json('data.0.nombreMarca'));
    }

    public function test_la_ficha_devuelve_el_nombre_de_la_campana(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $campana = Campana::create([
            'nombre' => 'Invitación a evento enamorados del marketing deportivo',
        ]);

        $marca = $this->crearMarca('Marca invitada', $campana);

        // La interfaz pinta el nombre en la tarjeta, así que tiene que
        // venir resuelto del servidor y no solo el identificador.
        $this->actingAs($comercial)
            ->getJson("/api/marcas/{$marca->id}")
            ->assertOk()
            ->assertJsonPath('data.campanaNombre', 'Invitación a evento enamorados del marketing deportivo');
    }

    /* ------------------------------------------------------------------
     | Catálogo inicial
     |-----------------------------------------------------------------*/

    public function test_el_catalogo_inicial_carga_las_cinco_campanas(): void
    {
        $this->seed(CampanasInicialesSeeder::class);

        $this->assertSame(5, Campana::query()->count());

        $nombresEsperados = [
            'Visita presencial',
            'Envió material pop',
            'Invitación a nuestros medios',
            'Invitación a evento enamorados del marketing deportivo',
            'Invitación a evento Sportbiz',
        ];

        foreach ($nombresEsperados as $nombreEsperado) {
            $this->assertDatabaseHas('campanas', [
                'nombre' => $nombreEsperado,
                'activa' => true,
            ]);
        }
    }

    public function test_volver_a_sembrar_no_duplica_las_campanas(): void
    {
        $this->seed(CampanasInicialesSeeder::class);
        $this->seed(CampanasInicialesSeeder::class);

        $this->assertSame(5, Campana::query()->count());
    }

    public function test_volver_a_sembrar_respeta_lo_que_cambio_el_equipo(): void
    {
        $this->seed(CampanasInicialesSeeder::class);

        // El equipo desactiva una campaña y le cambia el color desde el
        // panel; una segunda siembra no debe deshacer ese trabajo.
        $campana = Campana::query()->where('nombre', 'Visita presencial')->firstOrFail();
        $campana->forceFill(['activa' => false, 'color' => '#000000'])->save();

        $this->seed(CampanasInicialesSeeder::class);

        $campanaTrasResembrar = $campana->fresh();

        $this->assertFalse($campanaTrasResembrar->activa);
        $this->assertSame('#000000', $campanaTrasResembrar->color);
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    private function crearMarca(string $nombre, ?Campana $campana): Marca
    {
        return Marca::create([
            'nombre_marca' => $nombre,
            'campana_id' => $campana?->id,
        ]);
    }

    /**
     * Deja una acción en el historial de la marca.
     *
     * El nombre y el color se copian dentro del evento, igual que hace
     * el sistema al asignar campaña desde la ficha (regla 13).
     */
    private function anotarAccion(Marca $marca, Campana $campana, string $fecha): EventoDeCampana
    {
        return EventoDeCampana::create([
            'marca_id' => $marca->id,
            'campana_id' => $campana->id,
            'campana_nombre' => $campana->nombre,
            'campana_color' => $campana->color ?? '#1b9aaa',
            'fecha' => $fecha,
        ]);
    }

    private function crearUsuario(RolUsuario $rol): User
    {
        return User::create([
            'name' => 'Usuario '.$rol->value,
            'email' => $rol->value.'-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            // La zona se fija aunque sea nula: con las comprobaciones
            // estrictas de Eloquent, leer una columna que no se asignó al
            // crear el modelo lanza excepción, y el controlador la lee
            // para heredarla en las marcas nuevas.
            'zona' => null,
            'activo' => true,
        ]);
    }
}
