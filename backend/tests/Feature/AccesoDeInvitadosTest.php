<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\AccesoDeInvitados;
use App\Models\Propiedad;
use App\Models\RegistroActividad;
use App\Models\User;
use App\Support\LlaveDelCatalogo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * El catálogo de la web, con usuario y contraseña de invitado.
 * ---------------------------------------------------------------------
 * Desde el 2026-09-30 el catálogo de propiedades de la web no lo ve
 * cualquiera. Lo que se prueba aquí:
 *
 *   1. **Sin llave no se ve nada**, y la respuesta es un 403: un 401
 *      echaría del panel a quien lo tenga abierto en el mismo navegador.
 *   2. **La pareja buena da una llave que abre; la mala, nada**, y con el
 *      mismo mensaje falle el usuario o la contraseña.
 *   3. **Cambiar la contraseña echa a todos** los que entraron antes.
 *   4. **La ven y la cambian solo admin y comercial**, y la auditoría
 *      anota el cambio sin la contraseña.
 *   5. **La llave no abre el panel.**
 */
class AccesoDeInvitadosTest extends TestCase
{
    use RefreshDatabase;

    public function test_sin_llave_el_catalogo_no_se_ve_y_no_es_un_401(): void
    {
        $this->publicarUnaPropiedad();
        $this->crearAcceso();

        $this->getJson('/api/propiedades-en-la-web')->assertForbidden()->assertJsonMissingPath('data');
        $this->getJson('/api/propiedades-en-la-web', [LlaveDelCatalogo::CABECERA => 'inventada'])->assertForbidden();
    }

    public function test_la_pareja_buena_da_una_llave_que_abre_el_catalogo(): void
    {
        $this->publicarUnaPropiedad();
        $this->crearAcceso();

        // El usuario no distingue mayúsculas: se copia de un mensaje.
        $llave = $this->postJson('/api/propiedades-en-la-web/entrar', [
            'usuario' => ' Invitado ',
            'contrasena' => 'clave-del-catalogo',
        ])->assertOk()->json('llave');

        $this->getJson('/api/propiedades-en-la-web', [LlaveDelCatalogo::CABECERA => $llave])
            ->assertOk()
            ->assertJsonPath('data.0.nombre', 'Kombat Challenge');
    }

    public function test_la_pareja_mala_no_entra_y_no_dice_cual_de_los_dos_falla(): void
    {
        $this->crearAcceso();

        $conLaContrasenaMala = $this->postJson('/api/propiedades-en-la-web/entrar', [
            'usuario' => 'invitado',
            'contrasena' => 'otra-cosa',
        ])->assertUnprocessable()->json('errores.contrasena.0');

        $conElUsuarioMalo = $this->postJson('/api/propiedades-en-la-web/entrar', [
            'usuario' => 'administrador',
            'contrasena' => 'clave-del-catalogo',
        ])->assertUnprocessable()->json('errores.contrasena.0');

        $this->assertSame($conLaContrasenaMala, $conElUsuarioMalo);
    }

    public function test_sin_acceso_configurado_nadie_entra(): void
    {
        $this->postJson('/api/propiedades-en-la-web/entrar', [
            'usuario' => 'invitado',
            'contrasena' => 'clave-del-catalogo',
        ])->assertUnprocessable();
    }

    public function test_cambiar_la_contrasena_echa_a_los_que_ya_entraron(): void
    {
        $this->publicarUnaPropiedad();
        $acceso = $this->crearAcceso();
        $llaveVieja = LlaveDelCatalogo::emitir($acceso)['llave'];

        $this->actingAs($this->crearUsuario(RolUsuario::Comercial))
            ->putJson('/api/acceso-de-invitados', ['usuario' => 'invitado', 'contrasena' => 'clave-nueva-2026'])
            ->assertOk();
        $this->app['auth']->forgetGuards();

        $this->getJson('/api/propiedades-en-la-web', [LlaveDelCatalogo::CABECERA => $llaveVieja])->assertForbidden();

        $llaveNueva = $this->postJson('/api/propiedades-en-la-web/entrar', [
            'usuario' => 'invitado',
            'contrasena' => 'clave-nueva-2026',
        ])->assertOk()->json('llave');

        $this->getJson('/api/propiedades-en-la-web', [LlaveDelCatalogo::CABECERA => $llaveNueva])->assertOk();
    }

    /** Guardar sin cambiar nada no puede dejar a los clientes fuera. */
    public function test_guardar_la_misma_pareja_no_echa_a_nadie(): void
    {
        $this->publicarUnaPropiedad();
        $acceso = $this->crearAcceso();
        $llave = LlaveDelCatalogo::emitir($acceso)['llave'];

        $this->actingAs($this->crearUsuario(RolUsuario::Admin))
            ->putJson('/api/acceso-de-invitados', ['usuario' => 'invitado', 'contrasena' => 'clave-del-catalogo'])
            ->assertOk();
        $this->app['auth']->forgetGuards();

        $this->getJson('/api/propiedades-en-la-web', [LlaveDelCatalogo::CABECERA => $llave])->assertOk();
    }

    public function test_la_llave_caduca_al_mes(): void
    {
        $this->publicarUnaPropiedad();
        $llave = LlaveDelCatalogo::emitir($this->crearAcceso())['llave'];

        $this->travel(LlaveDelCatalogo::DIAS_DE_VALIDEZ + 1)->days();

        $this->getJson('/api/propiedades-en-la-web', [LlaveDelCatalogo::CABECERA => $llave])->assertForbidden();
    }

    public function test_la_web_solo_ofrece_el_catalogo_si_hay_acceso_y_algo_publicado(): void
    {
        $this->getJson('/api/propiedades-en-la-web/acceso')->assertOk()->assertJsonPath('hayCatalogo', false);

        $this->crearAcceso();
        $this->getJson('/api/propiedades-en-la-web/acceso')->assertJsonPath('hayCatalogo', false);

        $this->publicarUnaPropiedad();
        $this->getJson('/api/propiedades-en-la-web/acceso')->assertJsonPath('hayCatalogo', true);
    }

    public function test_solo_admin_y_comercial_ven_y_cambian_la_pareja(): void
    {
        $this->crearAcceso();

        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $this->actingAs($agente)->getJson('/api/acceso-de-invitados')->assertForbidden();
        $this->actingAs($agente)
            ->putJson('/api/acceso-de-invitados', ['usuario' => 'yo', 'contrasena' => 'me-la-quedo'])
            ->assertForbidden();

        // En claro: es la que se le manda a cada cliente nuevo.
        $this->actingAs($this->crearUsuario(RolUsuario::Comercial))
            ->getJson('/api/acceso-de-invitados')
            ->assertOk()
            ->assertJsonPath('data.usuario', 'invitado')
            ->assertJsonPath('data.contrasena', 'clave-del-catalogo');
    }

    public function test_la_contrasena_se_guarda_cifrada_y_la_auditoria_no_la_repite(): void
    {
        $this->actingAs($this->crearUsuario(RolUsuario::Admin))
            ->putJson('/api/acceso-de-invitados', ['usuario' => 'clientes', 'contrasena' => 'secreta-2026'])
            ->assertOk()
            ->assertJsonPath('data.contrasena', 'secreta-2026');

        $enLaTabla = (string) DB::table('acceso_de_invitados')->value('contrasena');
        $this->assertStringNotContainsString('secreta-2026', $enLaTabla);

        $anotacion = RegistroActividad::query()->where('entidad_tipo', 'acceso_de_invitados')->firstOrFail();
        $this->assertStringNotContainsString('secreta-2026', json_encode($anotacion->toArray(), JSON_UNESCAPED_UNICODE));
    }

    public function test_la_contrasena_necesita_ocho_caracteres_y_ningun_espacio(): void
    {
        $admin = $this->crearUsuario(RolUsuario::Admin);

        $this->actingAs($admin)
            ->putJson('/api/acceso-de-invitados', ['usuario' => 'invitado', 'contrasena' => 'corta'])
            ->assertUnprocessable()
            ->assertJsonValidationErrorFor('contrasena', 'errores');

        $this->actingAs($admin)
            ->putJson('/api/acceso-de-invitados', ['usuario' => 'el invitado', 'contrasena' => 'larga y con espacios'])
            ->assertUnprocessable()
            ->assertJsonValidationErrorFor('usuario', 'errores')
            ->assertJsonValidationErrorFor('contrasena', 'errores');
    }

    public function test_la_llave_del_catalogo_no_abre_el_panel(): void
    {
        $llave = LlaveDelCatalogo::emitir($this->crearAcceso())['llave'];

        $this->getJson('/api/marcas', [LlaveDelCatalogo::CABECERA => $llave])->assertUnauthorized();
        $this->getJson('/api/marcas', ['Authorization' => 'Bearer '.$llave])->assertUnauthorized();
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    private function crearAcceso(): AccesoDeInvitados
    {
        return AccesoDeInvitados::create([
            'usuario' => 'invitado',
            'contrasena' => 'clave-del-catalogo',
            'version' => 1,
        ]);
    }

    private function publicarUnaPropiedad(): Propiedad
    {
        return Propiedad::create([
            'nombre' => 'Kombat Challenge',
            'monto_total_usd' => 50000,
            'porcentaje_forecast' => 20,
            'asignada_a_todos' => true,
            'orden' => 0,
            'activa' => true,
            'publicada_en_la_web' => true,
        ]);
    }

    private function crearUsuario(RolUsuario $rol): User
    {
        return User::create([
            'name' => 'Persona '.$rol->value,
            'email' => $rol->value.'-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            'zona' => null,
            'activo' => true,
        ]);
    }
}
