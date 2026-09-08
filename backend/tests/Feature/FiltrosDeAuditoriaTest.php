<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\RegistroActividad;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Pruebas de los filtros del historial de auditoría.
 * ---------------------------------------------------------------------
 * El historial crece con cada guardado, así que sin filtros deja de
 * servir enseguida. Lo que se prueba aquí es que los cuatro criterios
 * —fecha, persona, acción y tipo— acotan de verdad y se combinan.
 *
 * Los dos detalles que más fácil se tuercen y que quedan fijados:
 *
 *   · El rango de fechas es INCLUSIVO por días. "Hasta el 8" tiene que
 *     traer lo del día 8 entero, no lo anterior a su medianoche.
 *   · La persona se puede pedir por su nombre y no solo por el id de su
 *     cuenta, porque el historial guarda las dos cosas y hay que poder
 *     seguir consultando lo que hizo alguien cuya cuenta ya no existe.
 */
class FiltrosDeAuditoriaTest extends TestCase
{
    use RefreshDatabase;

    /* ------------------------------------------------------------------
     | Por fecha
     |-----------------------------------------------------------------*/

    public function test_el_rango_de_fechas_incluye_los_dos_extremos(): void
    {
        $admin = $this->crearAdmin();

        $this->anotarEn('2026-09-05', 'Movimiento del 5');
        $this->anotarEn('2026-09-06', 'Movimiento del 6');
        // A última hora del día: es el que se pierde si el filtro compara
        // contra la medianoche en vez de contra el día.
        $this->anotarEn('2026-09-08 23:47:00', 'Movimiento del 8 por la noche');
        $this->anotarEn('2026-09-09', 'Movimiento del 9');

        $descripciones = $this->descripcionesDe(
            $admin,
            '?desde=2026-09-06&hasta=2026-09-08',
        );

        sort($descripciones);

        $this->assertSame(
            ['Movimiento del 6', 'Movimiento del 8 por la noche'],
            $descripciones,
        );
    }

    public function test_solo_desde_deja_fuera_lo_anterior(): void
    {
        $admin = $this->crearAdmin();

        $this->anotarEn('2026-09-01', 'Viejo');
        $this->anotarEn('2026-09-08', 'Nuevo');

        $this->assertSame(['Nuevo'], $this->descripcionesDe($admin, '?desde=2026-09-08'));
    }

    public function test_una_fecha_mal_escrita_se_rechaza_con_un_mensaje(): void
    {
        $admin = $this->crearAdmin();

        $this->anotarEn('2026-09-08', 'Movimiento');

        // Escribir a mano en la dirección no debe devolver una lista
        // vacía sin explicación: eso parecería que no hay movimientos.
        $this->actingAs($admin)
            ->getJson('/api/admin/auditoria?desde=el-lunes')
            ->assertStatus(422)
            ->assertJsonPath('errores.desde.0', 'La fecha «desde» tiene que ser AAAA-MM-DD.');
    }

    /* ------------------------------------------------------------------
     | Por persona, acción y tipo
     |-----------------------------------------------------------------*/

    public function test_filtrar_por_persona_trae_solo_lo_suyo(): void
    {
        $admin = $this->crearAdmin();
        $daymar = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');

        RegistroActividad::anotar($daymar, RegistroActividad::ACCION_CREO, 'marca', null, 'Creó Azúcar');
        RegistroActividad::anotar($daymar, RegistroActividad::ACCION_ACTUALIZO, 'marca', null, 'Editó Azúcar');
        RegistroActividad::anotar($admin, RegistroActividad::ACCION_CREO, 'marca', null, 'Creó otra');

        $this->actingAs($admin)
            ->getJson('/api/admin/auditoria?usuario='.$daymar->id)
            ->assertOk()
            ->assertJsonPath('meta.total', 2);
    }

    public function test_se_puede_filtrar_por_alguien_que_ya_no_tiene_cuenta(): void
    {
        $admin = $this->crearAdmin();

        // Movimiento con el nombre grabado y sin cuenta detrás: es lo que
        // queda cuando se borra a alguien del equipo.
        RegistroActividad::create([
            'usuario_id' => null,
            'usuario_nombre' => 'Persona que se fue',
            'accion' => RegistroActividad::ACCION_ACTUALIZO,
            'entidad_tipo' => 'marca',
            'descripcion' => 'Editó una marca antes de irse',
        ]);

        RegistroActividad::anotar($admin, RegistroActividad::ACCION_CREO, 'marca', null, 'Creó otra');

        $respuesta = $this->actingAs($admin)
            ->getJson('/api/admin/auditoria?usuario='.urlencode('Persona que se fue'));

        $respuesta->assertOk()->assertJsonPath('meta.total', 1);
        $this->assertSame(
            'Editó una marca antes de irse',
            $respuesta->json('data.0.descripcion'),
        );
    }

    public function test_filtrar_por_accion_y_por_tipo(): void
    {
        $admin = $this->crearAdmin();

        RegistroActividad::anotar($admin, RegistroActividad::ACCION_CREO, 'marca', null, 'Creó una marca');
        RegistroActividad::anotar($admin, RegistroActividad::ACCION_ELIMINO, 'marca', null, 'Borró una marca');
        RegistroActividad::anotar($admin, RegistroActividad::ACCION_CREO, 'usuario', null, 'Creó una cuenta');

        $this->actingAs($admin)
            ->getJson('/api/admin/auditoria?accion=creo')
            ->assertOk()
            ->assertJsonPath('meta.total', 2);

        // Combinados: creaciones, pero solo de marcas.
        $respuesta = $this->actingAs($admin)
            ->getJson('/api/admin/auditoria?accion=creo&entidad=marca');

        $respuesta->assertOk()->assertJsonPath('meta.total', 1);
        $this->assertSame('Creó una marca', $respuesta->json('data.0.descripcion'));
    }

    public function test_los_cuatro_filtros_se_combinan(): void
    {
        $admin = $this->crearAdmin();
        $daymar = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');

        $this->anotarEn('2026-09-08', 'La que se busca', $daymar, RegistroActividad::ACCION_CREO, 'marca');
        // Cada una de estas falla por un motivo distinto.
        $this->anotarEn('2026-09-01', 'Fuera de fecha', $daymar, RegistroActividad::ACCION_CREO, 'marca');
        $this->anotarEn('2026-09-08', 'De otra persona', $admin, RegistroActividad::ACCION_CREO, 'marca');
        $this->anotarEn('2026-09-08', 'Otra acción', $daymar, RegistroActividad::ACCION_ELIMINO, 'marca');
        $this->anotarEn('2026-09-08', 'Otro tipo', $daymar, RegistroActividad::ACCION_CREO, 'usuario');

        $descripciones = $this->descripcionesDe(
            $admin,
            '?desde=2026-09-05&hasta=2026-09-08&usuario='.$daymar->id.'&accion=creo&entidad=marca',
        );

        $this->assertSame(['La que se busca'], $descripciones);
    }

    /* ------------------------------------------------------------------
     | La lista de personas del filtro
     |-----------------------------------------------------------------*/

    public function test_la_lista_de_personas_sale_del_historial_con_sus_totales(): void
    {
        $admin = $this->crearAdmin('Antonio Linares');
        $daymar = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');

        RegistroActividad::anotar($daymar, RegistroActividad::ACCION_CREO, 'marca', null, 'Una');
        RegistroActividad::anotar($daymar, RegistroActividad::ACCION_CREO, 'marca', null, 'Dos');
        RegistroActividad::anotar($admin, RegistroActividad::ACCION_CREO, 'marca', null, 'Tres');

        $personas = $this->actingAs($admin)
            ->getJson('/api/admin/auditoria/personas')
            ->assertOk()
            ->json('data');

        $totalesPorNombre = array_column($personas, 'totalMovimientos', 'nombre');

        $this->assertSame(2, $totalesPorNombre['Daymar Marcano']);
        $this->assertSame(1, $totalesPorNombre['Antonio Linares']);
    }

    public function test_cada_persona_del_desplegable_devuelve_sus_movimientos(): void
    {
        $admin = $this->crearAdmin('Antonio Linares');
        $daymar = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');
        $dayrene = $this->crearUsuario(RolUsuario::Vendedor, 'Dayrene Marcano');
        // La misma persona con la cuenta duplicada: el desplegable la
        // enseña una vez y con todo lo suyo, así que el filtro tiene que
        // devolver también lo que hizo desde la otra cuenta.
        $daymarDuplicada = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');

        foreach ([$admin, $daymar, $daymar, $dayrene, $daymarDuplicada] as $autor) {
            RegistroActividad::anotar($autor, RegistroActividad::ACCION_CREO, 'marca', null, 'Algo');
        }

        RegistroActividad::create([
            'usuario_id' => null,
            'usuario_nombre' => 'Persona que se fue',
            'accion' => RegistroActividad::ACCION_ACTUALIZO,
            'entidad_tipo' => 'marca',
            'descripcion' => 'Lo último que hizo',
        ]);

        $personas = $this->actingAs($admin)
            ->getJson('/api/admin/auditoria/personas')
            ->assertOk()
            ->json('data');

        // Esta es la prueba que faltaba y por la que el fallo llegó a
        // producción: no basta con que el desplegable liste a la gente y
        // sus totales, tiene que poder PEDIRSE lo de cada uno con el
        // identificador que él mismo devuelve.
        foreach ($personas as $persona) {
            $devueltos = $this->actingAs($admin)
                ->getJson('/api/admin/auditoria?usuario='.urlencode((string) $persona['id']))
                ->assertOk()
                ->json('meta.total');

            $this->assertSame(
                $persona['totalMovimientos'],
                $devueltos,
                'El desplegable y el filtro no coinciden para '.$persona['nombre'],
            );
        }

        // Y ninguna clave se repite: dos personas con el mismo
        // identificador harían que el desplegable perdiera a una.
        $identificadores = array_column($personas, 'id');

        $this->assertSame(
            count($identificadores),
            count(array_unique($identificadores)),
            'Hay personas compartiendo identificador en el desplegable.',
        );

        // Y lo que suman todas las personas es el historial entero: si
        // algún movimiento no fuera de nadie, esta cuenta no cuadraría.
        $this->assertSame(
            RegistroActividad::query()->count(),
            array_sum(array_column($personas, 'totalMovimientos')),
        );
    }

    public function test_el_identificador_del_desplegable_es_el_de_la_cuenta(): void
    {
        $admin = $this->crearAdmin();
        $daymar = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');

        RegistroActividad::anotar($daymar, RegistroActividad::ACCION_CREO, 'marca', null, 'Algo');

        $personas = $this->actingAs($admin)
            ->getJson('/api/admin/auditoria/personas')
            ->assertOk()
            ->json('data');

        $suya = collect($personas)->firstWhere('nombre', 'Daymar Marcano');

        // El identificador tiene que ser su UUID entero. Cuando se leía
        // con el modelo, Eloquent lo casteaba al tipo de la clave
        // primaria de `registros_actividad` —un entero— y llegaba un "1".
        $this->assertSame($daymar->id, $suya['id']);
    }

    public function test_las_cuentas_que_aun_no_han_hecho_nada_salen_con_cero(): void
    {
        $admin = $this->crearAdmin();
        $recienLlegada = $this->crearUsuario(RolUsuario::Vendedor, 'Recién Llegada');

        RegistroActividad::anotar($admin, RegistroActividad::ACCION_CREO, 'marca', null, 'Algo');

        $personas = $this->actingAs($admin)
            ->getJson('/api/admin/auditoria/personas')
            ->assertOk()
            ->json('data');

        $suya = collect($personas)->firstWhere('nombre', 'Recién Llegada');

        // Que alguien falte del desplegable se lee como un fallo del
        // sistema; verlo con un cero contesta la pregunta.
        $this->assertNotNull($suya, 'La cuenta sin movimientos no sale en el desplegable.');
        $this->assertSame(0, $suya['totalMovimientos']);
        $this->assertSame($recienLlegada->id, $suya['id']);
    }

    /* ------------------------------------------------------------------
     | Permisos
     |-----------------------------------------------------------------*/

    public function test_el_historial_sigue_siendo_solo_para_administradores(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');

        $this->actingAs($vendedor)->getJson('/api/admin/auditoria')->assertForbidden();
        $this->actingAs($vendedor)->getJson('/api/admin/auditoria/personas')->assertForbidden();
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    private function anotarEn(
        string $fecha,
        string $descripcion,
        ?User $autor = null,
        string $accion = RegistroActividad::ACCION_ACTUALIZO,
        string $entidad = 'marca',
    ): void {
        $registro = RegistroActividad::create([
            'usuario_id' => $autor?->id,
            'usuario_nombre' => $autor?->nombreParaMostrar() ?? 'Sistema',
            'accion' => $accion,
            'entidad_tipo' => $entidad,
            'descripcion' => $descripcion,
        ]);

        // `created_at` la pone Eloquent al guardar, así que se corrige
        // después con una consulta directa.
        RegistroActividad::query()
            ->whereKey($registro->id)
            ->update(['created_at' => Carbon::parse($fecha)]);
    }

    /** @return list<string> */
    private function descripcionesDe(User $admin, string $consulta): array
    {
        $respuesta = $this->actingAs($admin)->getJson('/api/admin/auditoria'.$consulta);

        $respuesta->assertOk();

        return array_column($respuesta->json('data'), 'descripcion');
    }

    private function crearAdmin(string $nombre = 'Administradora'): User
    {
        return $this->crearUsuario(RolUsuario::Admin, $nombre);
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
