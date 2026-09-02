<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pruebas de la gestión de cuentas.
 * ---------------------------------------------------------------------
 * Se centran en lo que de verdad puede hacer daño: que alguien se dé a
 * sí mismo permisos que no le corresponden, o que edite la cuenta de
 * otra persona sin ser administrador.
 *
 * La regla de "nadie cambia su propio rol" incluye a los propios
 * administradores, y es deliberada: si el único administrador se
 * rebajase por error, no quedaría nadie capaz de volver a dar permisos y
 * habría que arreglarlo a mano en la base de datos.
 */
class PermisosDeCuentasTest extends TestCase
{
    use RefreshDatabase;

    /* ------------------------------------------------------------------
     | Escalada de privilegios
     |-----------------------------------------------------------------*/

    public function test_un_vendedor_no_puede_ascenderse_a_administrador(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor);

        // La ruta de administración está fuera de su alcance por completo.
        $this->actingAs($vendedor)
            ->putJson("/api/admin/usuarios/{$vendedor->id}", ['rol' => 'admin'])
            ->assertStatus(403);

        $this->assertSame(RolUsuario::Vendedor, $vendedor->fresh()->rol);
    }

    public function test_un_administrador_tampoco_puede_cambiarse_el_rol_a_si_mismo(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);

        // La petición se acepta (puede editar sus datos), pero el rol se
        // ignora: es el único campo que no puede tocarse en uno mismo.
        $this->actingAs($administrador)
            ->putJson("/api/admin/usuarios/{$administrador->id}", [
                'nombre' => 'Nombre nuevo',
                'rol' => 'vendedor',
            ])
            ->assertOk();

        $administradorActualizado = $administrador->fresh();

        $this->assertSame('Nombre nuevo', $administradorActualizado->name);
        $this->assertSame(
            RolUsuario::Admin,
            $administradorActualizado->rol,
            'Un administrador no debe poder rebajarse a sí mismo.',
        );
    }

    public function test_un_administrador_si_puede_cambiar_el_rol_de_otra_persona(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $this->actingAs($administrador)
            ->putJson("/api/admin/usuarios/{$comercial->id}", [
                'rol' => 'vendedor',
                'zona' => 'Caracas',
            ])
            ->assertOk();

        $comercialActualizado = $comercial->fresh();

        $this->assertSame(RolUsuario::Vendedor, $comercialActualizado->rol);
        $this->assertSame('Caracas', $comercialActualizado->zona);
    }

    public function test_un_comercial_no_puede_crear_cuentas(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $this->actingAs($comercial)
            ->postJson('/api/admin/usuarios', [
                'nombre' => 'Cuenta colada',
                'email' => 'colada@test.test',
                'password' => 'clave-larga-123',
                'rol' => 'admin',
            ])
            ->assertStatus(403);

        $this->assertDatabaseMissing('users', ['email' => 'colada@test.test']);
    }

    /* ------------------------------------------------------------------
     | Perfil propio
     |-----------------------------------------------------------------*/

    public function test_cualquiera_puede_cambiar_su_tema_y_su_color_de_perfil(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor);

        $this->actingAs($vendedor)
            ->putJson('/api/mi-perfil/apariencia', [
                'tema' => 'oscuro',
                'colorAcento' => '#7c3aed',
            ])
            ->assertOk();

        $vendedorActualizado = $vendedor->fresh();

        $this->assertSame('oscuro', $vendedorActualizado->tema->value);
        $this->assertSame('#7c3aed', $vendedorActualizado->color_acento);
    }

    public function test_el_color_de_perfil_tiene_que_ser_un_hexadecimal_valido(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor);

        $this->actingAs($vendedor)
            ->putJson('/api/mi-perfil/apariencia', ['colorAcento' => 'azul bonito'])
            ->assertStatus(422);
    }

    public function test_nadie_puede_quedarse_con_el_correo_de_otra_persona(): void
    {
        $primerUsuario = $this->crearUsuario(RolUsuario::Comercial);
        $segundoUsuario = $this->crearUsuario(RolUsuario::Vendedor);

        $this->actingAs($segundoUsuario)
            ->putJson('/api/mi-perfil', ['email' => $primerUsuario->email])
            ->assertStatus(422);
    }

    /* ------------------------------------------------------------------
     | Acceso
     |-----------------------------------------------------------------*/

    public function test_una_cuenta_desactivada_no_puede_entrar(): void
    {
        $usuarioDadoDeBaja = $this->crearUsuario(RolUsuario::Comercial);
        $usuarioDadoDeBaja->forceFill([
            'activo' => false,
            'password' => 'clave-conocida-123',
        ])->save();

        $respuesta = $this->postJson('/api/auth/login', [
            'email' => $usuarioDadoDeBaja->email,
            'password' => 'clave-conocida-123',
        ]);

        $respuesta->assertStatus(422);
        $this->assertStringContainsString(
            'desactivada',
            $respuesta->json('errores.email.0') ?? '',
        );
    }

    public function test_el_correo_no_distingue_mayusculas_al_entrar(): void
    {
        // Este fue un problema real de la versión anterior: una cuenta
        // creada con mayúsculas no podía entrar escribiéndola en
        // minúsculas, y parecía que la contraseña estaba mal.
        $usuario = $this->crearUsuario(RolUsuario::Comercial);
        $usuario->forceFill([
            'email' => 'persona@tssports.com',
            'password' => 'clave-conocida-123',
        ])->save();

        $this->postJson('/api/auth/login', [
            'email' => 'PERSONA@TSSPORTS.COM',
            'password' => 'clave-conocida-123',
        ])->assertOk();
    }

    public function test_el_login_devuelve_el_correo_del_usuario(): void
    {
        // Sin esto, la pantalla de perfil aparecía con el campo del
        // correo vacío nada más entrar.
        $usuario = $this->crearUsuario(RolUsuario::Comercial);
        $usuario->forceFill(['password' => 'clave-conocida-123'])->save();

        $respuesta = $this->postJson('/api/auth/login', [
            'email' => $usuario->email,
            'password' => 'clave-conocida-123',
        ]);

        $respuesta->assertOk();
        $this->assertSame($usuario->email, $respuesta->json('usuario.email'));
        $this->assertNotEmpty($respuesta->json('token'));
    }

    /* ------------------------------------------------------------------
     | Ayudante
     |-----------------------------------------------------------------*/

    private function crearUsuario(RolUsuario $rol): User
    {
        return User::create([
            'name' => 'Usuario '.$rol->value,
            'email' => $rol->value.'-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            'activo' => true,
        ]);
    }
}
