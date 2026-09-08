<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\Marca;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pruebas del acceso de un agente a su propia cartera.
 * ---------------------------------------------------------------------
 * Cambia una regla de negocio del sistema: hasta ahora el agente veía
 * TODAS las marcas y solo editaba las suyas. Ahora ve únicamente las que
 * tiene asignadas. Admin y comercial siguen viéndolas todas, porque son
 * quienes reparten el trabajo y no se puede asignar lo que no se ve.
 *
 * Lo que estas pruebas vigilan, y que es donde este tipo de cambio se
 * queda a medias:
 *
 *   · El corte lo hace el SERVIDOR. Que la marca ajena no aparezca en la
 *     pantalla no basta: no debe salir en la respuesta, o se lee desde
 *     el inspector del navegador.
 *   · La ficha se cierra igual. Escribir a mano la dirección de una
 *     marca ajena es el camino que queda cuando solo se acota el listado.
 *   · «Suya» se decide por ID y nunca por nombre. Dos personas del
 *     equipo pueden llamarse igual —las hay— y el nombre se puede
 *     editar; usarlo para dar acceso sería abrirle a una la cartera de
 *     la otra.
 */
class AccesoDeAgenteASusMarcasTest extends TestCase
{
    use RefreshDatabase;

    /* ------------------------------------------------------------------
     | El tablero
     |-----------------------------------------------------------------*/

    public function test_el_agente_solo_recibe_sus_marcas(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');
        $companiera = $this->crearUsuario(RolUsuario::Vendedor, 'Elianna Nodas');

        $this->crearMarca('Suya uno', $agente);
        $this->crearMarca('Suya dos', $agente);
        $this->crearMarca('De la compañera', $companiera);
        $this->crearMarca('Sin dueño', null);

        $respuesta = $this->actingAs($agente)->getJson('/api/marcas');

        $respuesta->assertOk()->assertJsonPath('meta.total', 2);

        $nombres = array_column($respuesta->json('data'), 'nombreMarca');
        sort($nombres);

        $this->assertSame(['Suya dos', 'Suya uno'], $nombres);
    }

    public function test_la_marca_ajena_no_viaja_en_la_respuesta(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');
        $companiera = $this->crearUsuario(RolUsuario::Vendedor, 'Elianna Nodas');

        $this->crearMarca('Suya', $agente);
        $ajena = $this->crearMarca('Secreto Comercial de la compañera', $companiera);
        $ajena->forceFill(['email_contacto' => 'contacto.privado@ejemplo.test'])->save();

        // Ni el nombre ni el contacto de la marca ajena pueden aparecer
        // en el cuerpo: esconderlos al pintar los dejaría legibles.
        $this->actingAs($agente)
            ->getJson('/api/marcas')
            ->assertOk()
            ->assertDontSee('Secreto Comercial')
            ->assertDontSee('contacto.privado@ejemplo.test');
    }

    public function test_el_agente_no_ve_las_marcas_sin_dueno(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');

        $this->crearMarca('Suya', $agente);
        $this->crearMarca('Lead de la web sin dueño', null);

        // Consecuencia buscada del cambio: los leads sin dueño dejan de
        // adoptarse solos y pasa a repartirlos el comercial.
        $this->actingAs($agente)
            ->getJson('/api/marcas')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_el_comercial_y_el_admin_siguen_viendolas_todas(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'El Comercial');
        $admin = $this->crearUsuario(RolUsuario::Admin, 'La Administradora');

        $this->crearMarca('De la agente', $agente);
        $this->crearMarca('Sin dueño', null);

        foreach ([$comercial, $admin] as $quienReparte) {
            $this->actingAs($quienReparte)
                ->getJson('/api/marcas')
                ->assertOk()
                ->assertJsonPath('meta.total', 2);
        }
    }

    /* ------------------------------------------------------------------
     | La ficha, escribiendo la dirección a mano
     |-----------------------------------------------------------------*/

    public function test_el_agente_no_abre_la_ficha_de_una_marca_ajena(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');
        $companiera = $this->crearUsuario(RolUsuario::Vendedor, 'Elianna Nodas');

        $suya = $this->crearMarca('Suya', $agente);
        $ajena = $this->crearMarca('De la compañera', $companiera);

        $this->actingAs($agente)->getJson("/api/marcas/{$suya->id}")->assertOk();
        $this->actingAs($agente)->getJson("/api/marcas/{$ajena->id}")->assertForbidden();
    }

    public function test_el_agente_no_lee_la_bitacora_de_una_marca_ajena(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');
        $companiera = $this->crearUsuario(RolUsuario::Vendedor, 'Elianna Nodas');

        $ajena = $this->crearMarca('De la compañera', $companiera);

        $this->actingAs($agente)
            ->getJson("/api/marcas/{$ajena->id}/comentarios")
            ->assertForbidden();
    }

    /* ------------------------------------------------------------------
     | «Suya» se decide por id, nunca por nombre
     |-----------------------------------------------------------------*/

    public function test_dos_personas_con_el_mismo_nombre_no_se_ven_la_cartera(): void
    {
        // Pasa de verdad: en el equipo hay nombres que se repiten y el
        // nombre además se puede editar desde el perfil.
        $una = $this->crearUsuario(RolUsuario::Vendedor, 'Marcano');
        $otra = $this->crearUsuario(RolUsuario::Vendedor, 'Marcano');

        $deUna = $this->crearMarca('De la primera', $una);

        $this->actingAs($otra)->getJson("/api/marcas/{$deUna->id}")->assertForbidden();

        $this->actingAs($otra)
            ->getJson('/api/marcas')
            ->assertOk()
            ->assertJsonPath('meta.total', 0);
    }

    public function test_una_marca_con_su_nombre_pero_sin_su_id_no_es_suya(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');

        // Fila que quedó con el nombre escrito y el id vacío. Para el
        // sistema es trabajo SIN asignar: el comercial la localiza con el
        // filtro por agente —que sí busca por nombre— y la asigna bien.
        $suelta = Marca::create(['nombre_marca' => 'Con su nombre y sin su id']);
        $suelta->forceFill(['vendedor_asignado_nombre' => 'Daymar Marcano'])->save();

        $this->actingAs($agente)
            ->getJson('/api/marcas')
            ->assertOk()
            ->assertJsonPath('meta.total', 0);

        $this->actingAs($agente)->getJson("/api/marcas/{$suelta->id}")->assertForbidden();
    }

    /* ------------------------------------------------------------------
     | El reparto del equipo no se le enseña a un agente
     |-----------------------------------------------------------------*/

    public function test_el_agente_no_puede_pedir_el_reparto_del_equipo(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'El Comercial');

        $this->crearMarca('Una', $agente);

        // Dice quién lleva cuántas marcas de toda la agencia: es la
        // información con la que se reparte el trabajo.
        $this->actingAs($agente)->getJson('/api/marcas/agentes')->assertForbidden();
        $this->actingAs($comercial)->getJson('/api/marcas/agentes')->assertOk();
    }

    public function test_el_panel_del_agente_cuenta_lo_mismo_que_su_tablero(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Daymar Marcano');
        $companiera = $this->crearUsuario(RolUsuario::Vendedor, 'Elianna Nodas');

        $this->crearMarca('Suya uno', $agente);
        $this->crearMarca('Suya dos', $agente);
        $this->crearMarca('De la compañera', $companiera);

        $resumen = $this->actingAs($agente)
            ->getJson('/api/panel/resumen')
            ->assertOk()
            ->json();

        // Las dos pantallas tienen que decirle lo mismo a la misma
        // persona: un panel que diga 3 y un tablero que enseñe 2 es lo
        // que hace que nadie se fíe de ninguna de las dos.
        $this->assertSame('personal', $resumen['alcance']);
        $this->assertSame(2, $resumen['misNumeros']['totalMarcas']);

        $this->assertSame(
            2,
            $this->actingAs($agente)->getJson('/api/marcas')->json('meta.total'),
        );
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    private function crearMarca(string $nombre, ?User $duenia): Marca
    {
        $marca = Marca::create(['nombre_marca' => $nombre]);

        if ($duenia !== null) {
            $marca->forceFill([
                'vendedor_asignado_id' => $duenia->id,
                'vendedor_asignado_nombre' => $duenia->nombreParaMostrar(),
            ])->save();
        }

        return $marca;
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
