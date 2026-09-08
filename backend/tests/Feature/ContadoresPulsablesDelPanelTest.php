<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\Marca;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pruebas de los contadores pulsables del panel.
 * ---------------------------------------------------------------------
 * Los cuatro números grandes del resumen llevan al tablero filtrado. Lo
 * que se prueba aquí es lo único que puede romper esa promesa: que la
 * cifra del panel y el número de marcas que devuelve el filtro sean
 * SIEMPRE el mismo, incluso cuando una marca ha avanzado más de una fase.
 *
 * Es una trampa real, no teórica: el selector de avance del tablero
 * (`etapa`) clasifica cada marca en un único cajón, así que una marca
 * con aproximación Y propuesta cuenta como «con propuesta» y desaparece
 * de «en aproximación». El contador, en cambio, cuenta casillas
 * marcadas. Si los contadores enlazaran a `etapa`, pulsar «88 en
 * aproximación» enseñaría 75 marcas y nadie sabría cuál de las dos
 * pantallas está mintiendo.
 */
class ContadoresPulsablesDelPanelTest extends TestCase
{
    use RefreshDatabase;

    /* ------------------------------------------------------------------
     | El filtro por fase cuenta lo mismo que el panel
     |-----------------------------------------------------------------*/

    public function test_el_filtro_por_fase_devuelve_tantas_marcas_como_dice_el_contador(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        // Una marca en cada situación posible, incluida la que avanzó
        // dos fases: es la que separa un criterio del otro.
        $this->crearMarca('Solo aproximación', aproximacion: true);
        $this->crearMarca('Aproximación y propuesta', aproximacion: true, propuesta: true);
        $this->crearMarca('Solo propuesta', propuesta: true);
        $this->crearMarca('Sin empezar');

        $contadores = $this->actingAs($comercial)
            ->getJson('/api/panel/resumen')
            ->assertOk()
            ->json('contadores');

        $this->assertSame(2, $contadores['enAproximacion']);
        $this->assertSame(2, $contadores['conPropuesta']);

        foreach (['aproximacion' => 'enAproximacion', 'propuesta' => 'conPropuesta'] as $fase => $contador) {
            $this->actingAs($comercial)
                ->getJson('/api/marcas?fase='.$fase)
                ->assertOk()
                ->assertJsonPath('meta.total', $contadores[$contador]);
        }
    }

    public function test_la_marca_que_avanzo_dos_fases_sale_en_las_dos(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $this->crearMarca('Aproximación y propuesta', aproximacion: true, propuesta: true);

        foreach (['aproximacion', 'propuesta'] as $fase) {
            $respuesta = $this->actingAs($comercial)->getJson('/api/marcas?fase='.$fase);

            $respuesta->assertOk()->assertJsonCount(1, 'data');
            $this->assertSame('Aproximación y propuesta', $respuesta->json('data.0.nombreMarca'));
        }

        // Y por etapa sigue estando en un único cajón, que es lo que el
        // selector de avance del tablero promete.
        $this->actingAs($comercial)
            ->getJson('/api/marcas?etapa=aproximacion')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_el_filtro_por_fase_de_prospeccion_sigue_la_regla_de_los_cinco_datos(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        // La prospección no se marca a mano: se cierra sola cuando la
        // ficha tiene los cinco datos (regla 2).
        $marcaCompleta = Marca::create([
            'nombre_marca' => 'Ficha completa',
            'logo_url' => 'https://ejemplo.test/logo.png',
            'persona_contacto' => 'Antonio Linares',
            'cargo_contacto' => 'Gerente de marca',
            'email_contacto' => 'antonio@ejemplo.test',
        ]);

        $this->crearMarca('Ficha a medias');

        $this->assertTrue($marcaCompleta->fresh()->fase_prospeccion_completada);

        $respuesta = $this->actingAs($comercial)->getJson('/api/marcas?fase=prospeccion');

        $respuesta->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('Ficha completa', $respuesta->json('data.0.nombreMarca'));
    }

    /* ------------------------------------------------------------------
     | El filtro se combina, y una fase inventada no filtra nada
     |-----------------------------------------------------------------*/

    public function test_el_filtro_por_fase_se_combina_con_el_de_vendedor(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $vendedora = $this->crearUsuario(RolUsuario::Vendedor);

        // Así es como enlazan las cifras de «Mis marcas»: fase + persona.
        $suya = $this->crearMarca('Marca suya con propuesta', propuesta: true);
        $suya->forceFill(['vendedor_asignado_id' => $vendedora->id])->save();

        $this->crearMarca('Marca ajena con propuesta', propuesta: true);

        $respuesta = $this->actingAs($comercial)
            ->getJson('/api/marcas?fase=propuesta&vendedor='.$vendedora->id);

        $respuesta->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('Marca suya con propuesta', $respuesta->json('data.0.nombreMarca'));
    }

    public function test_una_fase_desconocida_no_filtra_nada(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $this->crearMarca('Una marca');
        $this->crearMarca('Otra marca', propuesta: true);

        // Un parámetro escrito a mano en la dirección no debe vaciar el
        // tablero ni reventar: simplemente no filtra.
        $this->actingAs($comercial)
            ->getJson('/api/marcas?fase=inventada')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    private function crearMarca(
        string $nombre,
        bool $aproximacion = false,
        bool $propuesta = false,
    ): Marca {
        return Marca::create([
            'nombre_marca' => $nombre,
            'fase_aproximacion_completada' => $aproximacion,
            'via_aproximacion' => $aproximacion ? 'Correo' : null,
            'fase_propuesta_completada' => $propuesta,
            'descripcion_propuesta' => $propuesta ? 'Propuesta enviada' : null,
            'valor_anual_usd' => $propuesta ? 1000 : 0,
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
            // crear el modelo lanza excepción.
            'zona' => null,
            'activo' => true,
        ]);
    }
}
