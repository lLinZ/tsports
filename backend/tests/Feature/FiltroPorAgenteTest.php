<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\Marca;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pruebas del filtro del tablero por agente.
 * ---------------------------------------------------------------------
 * Se escriben a raíz de un aviso del cliente: «tal persona tiene marcas
 * asignadas y al filtrar por su nombre no aparecen todas». Tenía razón:
 * había tres formas de que una marca fuese suya y el filtro no la
 * encontrase, y las tres se cubren aquí.
 *
 * La promesa que fijan estas pruebas es una sola: **al elegir a una
 * persona en el filtro salen todas sus marcas**. Para cumplirla el filtro
 * busca por id Y por el nombre grabado en la fila, porque una marca puede
 * llevar su nombre sin llevar su id:
 *
 *   · Cuenta duplicada: sus marcas repartidas entre dos ids.
 *   · Fila cargada contra la base de datos: nombre escrito, id vacío.
 *   · Asignada a alguien que no es vendedor activo (un comercial, un
 *     admin, una cuenta desactivada): antes esa persona ni siquiera
 *     aparecía en el desplegable, así que sus marcas no se podían pedir.
 *
 * Lo que el filtro sigue sin devolver, y es correcto, son las marcas que
 * esa persona CARGÓ pero no tiene asignadas: eso es `registrada_por`,
 * otra columna y otra pregunta.
 */
class FiltroPorAgenteTest extends TestCase
{
    use RefreshDatabase;

    /* ------------------------------------------------------------------
     | Lo que el filtro sí devuelve
     |-----------------------------------------------------------------*/

    public function test_el_filtro_por_agente_devuelve_todas_sus_marcas(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $daymar = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');
        $otroAgente = $this->crearUsuario(RolUsuario::Vendedor, 'Andrés Pérez');

        $this->crearMarca('Azúcar la Pastora', $daymar);
        $this->crearMarca('Refrescos del Caribe', $daymar);
        $this->crearMarca('Telecom Andina', $daymar);
        $this->crearMarca('Banco Metropolitano', $otroAgente);

        $respuesta = $this->actingAs($comercial)
            ->getJson('/api/marcas?vendedor='.$daymar->id);

        $respuesta->assertOk()->assertJsonPath('meta.total', 3);

        $nombres = array_column($respuesta->json('data'), 'nombreMarca');
        sort($nombres);

        $this->assertSame(
            ['Azúcar la Pastora', 'Refrescos del Caribe', 'Telecom Andina'],
            $nombres,
        );
    }

    public function test_el_filtro_no_se_queda_en_la_primera_pagina(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $daymar = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');

        // Más marcas que la página por defecto del tablero (60), para
        // descartar que el filtro «pierda» marcas por paginación.
        for ($numero = 1; $numero <= 65; $numero++) {
            $this->crearMarca('Marca '.$numero, $daymar);
        }

        $this->actingAs($comercial)
            ->getJson('/api/marcas?vendedor='.$daymar->id)
            ->assertOk()
            // El total dice la verdad completa aunque la página traiga 60.
            ->assertJsonPath('meta.total', 65)
            ->assertJsonCount(60, 'data');
    }

    public function test_un_agente_ve_su_propio_filtro_completo(): void
    {
        $daymar = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');

        $this->crearMarca('Suya uno', $daymar);
        $this->crearMarca('Suya dos', $daymar);
        $this->crearMarca('De nadie', null);

        // Un vendedor ve todas las marcas, así que su propio filtro tiene
        // que devolverle exactamente las suyas, ni una menos.
        $this->actingAs($daymar)
            ->getJson('/api/marcas?vendedor='.$daymar->id)
            ->assertOk()
            ->assertJsonPath('meta.total', 2);
    }

    /* ------------------------------------------------------------------
     | Lo que el filtro NO devuelve (y es donde nace el malentendido)
     |-----------------------------------------------------------------*/

    public function test_una_marca_cargada_por_alguien_no_queda_asignada_a_esa_persona(): void
    {
        $daymar = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');
        $administradora = $this->crearUsuario(RolUsuario::Admin, 'Antonio Linares');

        // Un admin da de alta una marca sin tocar el selector de agente:
        // el formulario manda el campo vacío.
        $this->actingAs($administradora)
            ->postJson('/api/marcas', [
                'nombreMarca' => 'Azúcar la Pastora',
                'vendedorAsignadoId' => null,
            ])
            ->assertCreated();

        $marca = Marca::query()->where('nombre_marca', 'Azúcar la Pastora')->firstOrFail();

        // Queda registrada a nombre de quien la cargó, pero SIN agente.
        $this->assertSame('Antonio Linares', $marca->registrada_por_nombre);
        $this->assertNull($marca->vendedor_asignado_id);

        // Por eso no sale al filtrar por ninguna persona…
        $this->actingAs($administradora)
            ->getJson('/api/marcas?vendedor='.$daymar->id)
            ->assertOk()
            ->assertJsonPath('meta.total', 0);

        // …y sí sale en «Sin asignar», que es donde de verdad está.
        $this->actingAs($administradora)
            ->getJson('/api/marcas?vendedor=sin_asignar')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_sin_asignar_son_las_que_no_tienen_ni_id_ni_nombre(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $daymar = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');

        $this->crearMarca('Suya', $daymar);
        $this->crearMarca('De nadie', null);

        // Con el nombre escrito ya tiene quien la lleve, así que no es
        // huérfana aunque le falte el id.
        $conNombreSuelto = Marca::create(['nombre_marca' => 'Con nombre suelto']);
        $conNombreSuelto->forceFill(['vendedor_asignado_nombre' => 'Daymar Marcano'])->save();

        $this->actingAs($comercial)
            ->getJson('/api/marcas?vendedor=sin_asignar')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.nombreMarca', 'De nadie');
    }

    /* ------------------------------------------------------------------
     | Los tres casos que antes perdían marcas
     |-----------------------------------------------------------------*/

    public function test_el_filtro_recoge_las_marcas_de_una_cuenta_duplicada(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        // La misma persona, dada de alta dos veces. Es lo que pasa cuando
        // se rehace una cuenta en vez de reactivarla.
        $cuentaNueva = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');
        $cuentaVieja = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');

        $this->crearMarca('Azúcar la Pastora', $cuentaNueva);
        $this->crearMarca('Refrescos del Caribe', $cuentaVieja);
        $this->crearMarca('Telecom Andina', $cuentaVieja);

        // Se filtra por la cuenta que ofrece el desplegable y salen las
        // tres, no solo la suya.
        $this->actingAs($comercial)
            ->getJson('/api/marcas?vendedor='.$cuentaNueva->id)
            ->assertOk()
            ->assertJsonPath('meta.total', 3);
    }

    public function test_el_filtro_recoge_las_marcas_con_su_nombre_y_sin_id(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $daymar = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');

        $this->crearMarca('Marca asignada por la aplicación', $daymar);

        // Fila cargada contra la base: el nombre escrito y el id vacío.
        $cargadaAMano = Marca::create(['nombre_marca' => 'Marca cargada a mano']);
        $cargadaAMano->forceFill(['vendedor_asignado_nombre' => '  daymar marcano '])->save();

        $respuesta = $this->actingAs($comercial)
            ->getJson('/api/marcas?vendedor='.$daymar->id);

        // Sale también, sin importar espacios ni mayúsculas.
        $respuesta->assertOk()->assertJsonPath('meta.total', 2);

        // Y deja de contar como huérfana, porque ya tiene quien la lleve.
        $this->actingAs($comercial)
            ->getJson('/api/panel/resumen')
            ->assertOk()
            ->assertJsonPath('contadores.sinAsignar', 0);
    }

    public function test_se_puede_filtrar_por_alguien_que_no_es_vendedor_activo(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin, 'Antonio Linares');
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'Lucía Herrera');

        // Una marca se puede asignar a cualquier cuenta, no solo a un
        // vendedor: el servidor lo permite y el equipo lo hace.
        $this->crearMarca('Marca del comercial', $comercial);

        $respuesta = $this->actingAs($admin)
            ->getJson('/api/marcas?vendedor='.$comercial->id);

        $respuesta->assertOk()->assertJsonPath('meta.total', 1);

        // Y esa persona tiene que salir en el desplegable del filtro: si
        // no, su marca no se podría pedir por ningún agente.
        $agentes = $this->actingAs($admin)
            ->getJson('/api/marcas/agentes')
            ->assertOk()
            ->json('data');

        $this->assertContains('Lucía Herrera', array_column($agentes, 'nombre'));
    }

    /* ------------------------------------------------------------------
     | El desplegable del filtro
     |-----------------------------------------------------------------*/

    public function test_el_desplegable_dice_cuantas_marcas_lleva_cada_persona(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $daymar = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');
        $recienLlegado = $this->crearUsuario(RolUsuario::Vendedor, 'Recién Llegado');

        $this->crearMarca('Una', $daymar);
        $this->crearMarca('Otra', $daymar);
        $this->crearMarca('Sin dueño', null);

        $respuesta = $this->actingAs($comercial)->getJson('/api/marcas/agentes');

        $respuesta->assertOk();

        $porNombre = array_column($respuesta->json('data'), 'totalMarcas', 'nombre');

        // El total del desplegable es el mismo que devuelve el filtro:
        // es lo que permite comprobar de un vistazo que no falta ninguna.
        $this->assertSame(2, $porNombre['Daymar Marcano']);
        $this->assertSame(
            2,
            $this->actingAs($comercial)
                ->getJson('/api/marcas?vendedor='.$daymar->id)
                ->json('meta.total'),
        );

        // Quien todavía no lleva ninguna también sale, con cero.
        $this->assertSame(0, $porNombre[$recienLlegado->nombreParaMostrar()]);

        $respuesta->assertJsonPath('sinAsignar', 1);
    }

    public function test_las_dos_cuentas_de_la_misma_persona_salen_como_una(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $cuentaUno = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');
        $cuentaDos = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');

        $this->crearMarca('Una', $cuentaUno);
        $this->crearMarca('Otra', $cuentaDos);

        $agentes = $this->actingAs($comercial)->getJson('/api/marcas/agentes')->json('data');

        $conEseNombre = array_filter(
            $agentes,
            static fn (array $agente): bool => $agente['nombre'] === 'Daymar Marcano',
        );

        // Una sola entrada, con las dos marcas: el equipo ve una persona,
        // no dos cuentas.
        $this->assertCount(1, $conEseNombre);
        $this->assertSame(2, reset($conEseNombre)['totalMarcas']);
    }

    public function test_entre_todos_los_agentes_y_los_sin_asignar_no_se_pierde_ninguna(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $daymar = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');
        $cuentaDuplicada = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');
        $otro = $this->crearUsuario(RolUsuario::Admin, 'Antonio Linares');

        // Una marca de cada clase, incluidas las torcidas.
        $this->crearMarca('Por su cuenta', $daymar);
        $this->crearMarca('Por la cuenta duplicada', $cuentaDuplicada);
        $this->crearMarca('De un admin', $otro);
        $this->crearMarca('De nadie', null);

        $soloNombre = Marca::create(['nombre_marca' => 'Solo con el nombre']);
        $soloNombre->forceFill(['vendedor_asignado_nombre' => 'daymar marcano'])->save();

        $respuesta = $this->actingAs($comercial)->getJson('/api/marcas/agentes')->json();

        // Esta es la comprobación que de verdad importa: lo que suman
        // todas las personas del desplegable más las que no tienen dueño
        // tiene que ser EXACTAMENTE el total de marcas. Si algo se
        // escapa —una cuenta duplicada, un nombre suelto, alguien que no
        // es vendedor— esta cuenta deja de cuadrar y salta la prueba.
        $sumaDelDesplegable = array_sum(array_column($respuesta['data'], 'totalMarcas'));

        $this->assertSame(
            Marca::query()->count(),
            $sumaDelDesplegable + $respuesta['sinAsignar'],
        );

        // Y cada cifra del desplegable es la que devuelve su filtro.
        foreach ($respuesta['data'] as $agente) {
            $devueltas = $this->actingAs($comercial)
                ->getJson('/api/marcas?vendedor='.urlencode($agente['id']))
                ->json('meta.total');

            $this->assertSame(
                $agente['totalMarcas'],
                $devueltas,
                'El desplegable y el filtro no coinciden para '.$agente['nombre'],
            );
        }
    }

    public function test_las_variantes_de_un_mismo_nombre_se_suman(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $daymar = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');

        $this->crearMarca('Bien escrita', $daymar);

        foreach (['daymar marcano', '  DAYMAR MARCANO  '] as $variante) {
            $marca = Marca::create(['nombre_marca' => 'Escrita como '.$variante]);
            $marca->forceFill(['vendedor_asignado_nombre' => $variante])->save();
        }

        $agentes = $this->actingAs($comercial)->getJson('/api/marcas/agentes')->json('data');

        $conEseNombre = array_values(array_filter(
            $agentes,
            static fn (array $agente): bool => mb_strtolower($agente['nombre']) === 'daymar marcano',
        ));

        // Una sola entrada, con el nombre bien escrito y las tres marcas.
        $this->assertCount(1, $conEseNombre);
        $this->assertSame('Daymar Marcano', $conEseNombre[0]['nombre']);
        $this->assertSame(3, $conEseNombre[0]['totalMarcas']);
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    private function crearMarca(string $nombre, ?User $vendedor): Marca
    {
        $marca = Marca::create(['nombre_marca' => $nombre]);

        if ($vendedor !== null) {
            $marca->forceFill([
                'vendedor_asignado_id' => $vendedor->id,
                'vendedor_asignado_nombre' => $vendedor->nombreParaMostrar(),
            ])->save();
        }

        return $marca;
    }

    private function crearUsuario(RolUsuario $rol, ?string $nombre = null): User
    {
        return User::create([
            'name' => $nombre ?? 'Usuario '.$rol->value,
            'email' => $rol->value.'-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            'zona' => null,
            'activo' => true,
        ]);
    }
}
