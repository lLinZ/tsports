<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\ComentarioMarca;
use App\Models\Marca;
use App\Models\Notificacion;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Cada comentario de la bitácora avisa a los administradores y a quien
 * lleva la marca.
 * ---------------------------------------------------------------------
 * Pedido el 2026-09-30. Lo que se fija aquí:
 *
 *   1. **Solo el rol admin** recibe los de todas las marcas. El
 *      comercial no, aunque las vea todas: se decidió así.
 *   2. **La persona que lleva la marca** recibe los de las suyas, y
 *      ningún otro agente recibe nada (regla 6: el aviso lleva el nombre
 *      de la marca).
 *   3. **Nadie recibe aviso de lo que escribió él mismo**, y a quien
 *      además etiquetaron le llega un solo aviso: el de la mención.
 */
class AvisosDeComentariosTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_comentario_avisa_a_los_administradores_y_al_agente_de_la_marca(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin, 'La Administradora');
        $otroAdministrador = $this->crearUsuario(RolUsuario::Admin);
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'El Comercial');
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $otroAgente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = $this->crearMarca('Azúcar la Pastora', $agente);

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Mandamos la propuesta hoy.'])
            ->assertCreated();

        foreach ([$administrador, $otroAdministrador, $agente] as $destinatario) {
            $aviso = Notificacion::query()->where('destinatario_id', $destinatario->id)->sole();

            $this->assertSame(Notificacion::TIPO_COMENTARIO, $aviso->tipo);
            $this->assertSame('Comentario nuevo en Azúcar la Pastora', $aviso->titulo);
            $this->assertSame('El Comercial: «Mandamos la propuesta hoy.»', $aviso->cuerpo);
            $this->assertSame($marca->id, $aviso->entidad_id);
        }

        // Ni el comercial que escribió, ni un agente que no la lleva.
        $this->assertSame(0, Notificacion::query()->where('destinatario_id', $comercial->id)->count());
        $this->assertSame(0, Notificacion::query()->where('destinatario_id', $otroAgente->id)->count());
    }

    public function test_el_comercial_no_recibe_los_comentarios_de_otros(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = $this->crearMarca('Azúcar la Pastora', $agente);

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Me atendieron en recepción.'])
            ->assertCreated();

        // Ve todas las marcas, pero el aviso de cada comentario es solo
        // para el rol admin.
        $this->assertSame(0, Notificacion::query()->where('destinatario_id', $comercial->id)->count());
    }

    public function test_quien_escribe_no_recibe_su_propio_aviso(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $otroAdministrador = $this->crearUsuario(RolUsuario::Admin);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = $this->crearMarca('Azúcar la Pastora', $agente);

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Visitada.'])
            ->assertCreated();

        $this->actingAs($administrador)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Bien, sigue así.'])
            ->assertCreated();

        // El agente recibe solo el del administrador; el administrador,
        // solo el del agente; el otro administrador, los dos.
        $this->assertSame(1, Notificacion::query()->where('destinatario_id', $agente->id)->count());
        $this->assertSame(1, Notificacion::query()->where('destinatario_id', $administrador->id)->count());
        $this->assertSame(2, Notificacion::query()->where('destinatario_id', $otroAdministrador->id)->count());
    }

    public function test_a_quien_etiquetan_le_llega_un_solo_aviso(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = $this->crearMarca('Azúcar la Pastora');

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", [
                'cuerpo' => 'Mira esto cuando puedas',
                'menciones' => [$administrador->id],
            ])
            ->assertCreated();

        $aviso = Notificacion::query()->where('destinatario_id', $administrador->id)->sole();

        $this->assertSame(Notificacion::TIPO_MENCION, $aviso->tipo);
    }

    public function test_una_respuesta_tambien_avisa(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = $this->crearMarca('Azúcar la Pastora');

        $entrada = ComentarioMarca::create([
            'marca_id' => $marca->id,
            'autor_id' => $administrador->id,
            'autor_nombre' => 'La Administradora',
            'cuerpo' => '¿Cómo fue la reunión?',
        ]);

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", [
                'cuerpo' => 'Bien, piden el dossier.',
                'comentarioPadreId' => $entrada->id,
            ])
            ->assertCreated();

        $aviso = Notificacion::query()->where('destinatario_id', $administrador->id)->sole();

        $this->assertSame('Respuesta nueva en Azúcar la Pastora', $aviso->titulo);
    }

    public function test_editar_un_comentario_no_vuelve_a_avisar(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = $this->crearMarca('Azúcar la Pastora');

        $comentario = $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Mandamos la propuest'])
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($comercial)
            ->patchJson("/api/marcas/{$marca->id}/comentarios/{$comentario}", ['cuerpo' => 'Mandamos la propuesta'])
            ->assertOk();

        $this->assertSame(1, Notificacion::query()->where('destinatario_id', $administrador->id)->count());
    }

    public function test_un_administrador_desactivado_no_recibe_nada(): void
    {
        $desactivado = $this->crearUsuario(RolUsuario::Admin);
        $desactivado->update(['activo' => false]);
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = $this->crearMarca('Azúcar la Pastora');

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Hola'])
            ->assertCreated();

        $this->assertSame(0, Notificacion::query()->count());
    }

    private function crearMarca(string $nombre, ?User $vendedor = null): Marca
    {
        return Marca::create([
            'nombre_marca' => $nombre,
            'vendedor_asignado_id' => $vendedor?->id,
        ]);
    }

    private function crearUsuario(RolUsuario $rol, string $nombre = 'Persona de prueba'): User
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
