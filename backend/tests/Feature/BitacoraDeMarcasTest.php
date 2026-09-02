<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\Marca;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pruebas de la bitácora de cada marca.
 * ---------------------------------------------------------------------
 * La bitácora es el hilo de la columna derecha de la ficha. Sus reglas
 * son dos y conviene que queden fijadas:
 *
 *   · COMENTAR → cualquiera que pueda ver la marca, aunque no pueda
 *     editarla. Si un vendedor se entera de algo de una marca que
 *     trabaja otro, lo natural es que pueda avisarle por el hilo.
 *   · BORRAR   → solo el autor de la entrada, o un administrador.
 */
class BitacoraDeMarcasTest extends TestCase
{
    use RefreshDatabase;

    public function test_quien_ve_la_marca_puede_comentarla_aunque_no_pueda_editarla(): void
    {
        $vendedorPropietario = $this->crearUsuario(RolUsuario::Vendedor);
        $otroVendedor = $this->crearUsuario(RolUsuario::Vendedor, 'Otro Vendedor');

        $marca = Marca::create([
            'nombre_marca' => 'Marca ajena',
            'vendedor_asignado_id' => $vendedorPropietario->id,
        ]);

        $respuesta = $this->actingAs($otroVendedor)
            ->postJson("/api/marcas/{$marca->id}/comentarios", [
                'cuerpo' => 'Los vi patrocinando el torneo del sábado.',
            ]);

        $respuesta->assertStatus(201);
        $this->assertSame('Otro Vendedor', $respuesta->json('data.autorNombre'));
    }

    public function test_el_hilo_se_lee_en_orden_cronologico(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = Marca::create(['nombre_marca' => 'Marca con hilo']);

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Primera llamada'])
            ->assertStatus(201);

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Segunda llamada'])
            ->assertStatus(201);

        $hilo = $this->actingAs($comercial)
            ->getJson("/api/marcas/{$marca->id}/comentarios")
            ->json('data');

        $this->assertCount(2, $hilo);
        $this->assertSame('Primera llamada', $hilo[0]['cuerpo']);
        $this->assertSame('Segunda llamada', $hilo[1]['cuerpo']);
    }

    public function test_un_comentario_vacio_se_rechaza(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = Marca::create(['nombre_marca' => 'Marca cualquiera']);

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => ''])
            ->assertStatus(422);
    }

    public function test_cada_quien_borra_solo_sus_comentarios(): void
    {
        $autor = $this->crearUsuario(RolUsuario::Vendedor, 'Autor Del Comentario');
        $otraPersona = $this->crearUsuario(RolUsuario::Comercial, 'Otra Persona');

        $marca = Marca::create(['nombre_marca' => 'Marca con hilo']);

        $idDelComentario = $this->actingAs($autor)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Apunte mío'])
            ->json('data.id');

        // Ni siquiera un comercial borra el apunte de otro.
        $this->actingAs($otraPersona)
            ->deleteJson("/api/marcas/{$marca->id}/comentarios/{$idDelComentario}")
            ->assertStatus(403);

        $this->actingAs($autor)
            ->deleteJson("/api/marcas/{$marca->id}/comentarios/{$idDelComentario}")
            ->assertOk();

        $this->assertDatabaseCount('comentarios_marca', 0);
    }

    public function test_un_administrador_puede_borrar_cualquier_comentario(): void
    {
        $autor = $this->crearUsuario(RolUsuario::Vendedor);
        $administrador = $this->crearUsuario(RolUsuario::Admin, 'La Administradora');

        $marca = Marca::create(['nombre_marca' => 'Marca con hilo']);

        $idDelComentario = $this->actingAs($autor)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Apunte a moderar'])
            ->json('data.id');

        $this->actingAs($administrador)
            ->deleteJson("/api/marcas/{$marca->id}/comentarios/{$idDelComentario}")
            ->assertOk();

        $this->assertDatabaseCount('comentarios_marca', 0);
    }

    public function test_borrar_la_marca_se_lleva_su_bitacora(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = Marca::create(['nombre_marca' => 'Marca que se elimina']);

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Un apunte'])
            ->assertStatus(201);

        $this->actingAs($comercial)
            ->deleteJson("/api/marcas/{$marca->id}")
            ->assertOk();

        $this->assertDatabaseCount('comentarios_marca', 0);
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
