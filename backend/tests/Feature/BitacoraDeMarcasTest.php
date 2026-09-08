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
 *   · COMENTAR → cualquiera que pueda VER la marca. Como un agente solo
 *     ve su cartera, en la práctica comenta lo suyo; admin y comercial,
 *     cualquier marca.
 *   · BORRAR   → solo el autor de la entrada, o un administrador.
 *
 * La primera regla se escribió cuando el agente veía todas las marcas y
 * decía "aunque no pueda editarla". Al pasar el tablero a enseñarle solo
 * lo suyo, ese caso dejó de existir: lo que ve, lo edita. Estas pruebas
 * se actualizaron con el cambio en vez de relajarlo, que es lo que
 * convierte una regla de negocio en una promesa comprobable.
 */
class BitacoraDeMarcasTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_agente_comenta_en_su_marca(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'La Agente');

        $marca = Marca::create([
            'nombre_marca' => 'Marca suya',
            'vendedor_asignado_id' => $agente->id,
        ]);

        $respuesta = $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/comentarios", [
                'cuerpo' => 'Los vi patrocinando el torneo del sábado.',
            ]);

        $respuesta->assertStatus(201);
        $this->assertSame('La Agente', $respuesta->json('data.autorNombre'));
    }

    public function test_un_agente_no_comenta_en_la_marca_de_otro(): void
    {
        $duenia = $this->crearUsuario(RolUsuario::Vendedor, 'La Dueña');
        $otroAgente = $this->crearUsuario(RolUsuario::Vendedor, 'Otro Agente');

        $marca = Marca::create([
            'nombre_marca' => 'Marca ajena',
            'vendedor_asignado_id' => $duenia->id,
        ]);

        // Ni la ve en el tablero ni puede escribir en su hilo escribiendo
        // la dirección a mano.
        $this->actingAs($otroAgente)
            ->postJson("/api/marcas/{$marca->id}/comentarios", [
                'cuerpo' => 'Un apunte en una marca que no es mía.',
            ])
            ->assertForbidden();

        $this->assertDatabaseCount('comentarios_marca', 0);
    }

    public function test_un_comercial_comenta_en_la_marca_de_cualquiera(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'La Agente');
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'El Comercial');

        $marca = Marca::create([
            'nombre_marca' => 'Marca de la agente',
            'vendedor_asignado_id' => $agente->id,
        ]);

        // Quien reparte el trabajo sigue pudiendo avisar por el hilo.
        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", [
                'cuerpo' => 'Llamaron preguntando por la propuesta.',
            ])
            ->assertStatus(201);
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

        // Asignada al autor: un agente solo alcanza su propia cartera.
        $marca = Marca::create([
            'nombre_marca' => 'Marca con hilo',
            'vendedor_asignado_id' => $autor->id,
        ]);

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

        $marca = Marca::create([
            'nombre_marca' => 'Marca con hilo',
            'vendedor_asignado_id' => $autor->id,
        ]);

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
