<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\ComentarioMarca;
use App\Models\Marca;
use App\Models\Notificacion;
use App\Models\RegistroActividad;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * La bitácora como conversación: responder, reaccionar y etiquetar.
 * ---------------------------------------------------------------------
 * Las reglas que se fijan aquí, por orden de lo que más daño haría si se
 * torciera:
 *
 *   1. **Etiquetar a alguien que no ve la marca no se puede.** Un agente
 *      solo ve lo suyo (regla 6) y la notificación de una mención lleva
 *      el nombre de la marca dentro: si se pudiera mencionar a
 *      cualquiera, etiquetarlo en una marca ajena se lo filtraría.
 *   2. **Un comentario borrado no desaparece del histórico**, y por eso
 *      el histórico exportado sigue valiendo.
 *   3. **Un agente no exporta el histórico completo.**
 *   4. Un solo nivel de respuestas, y no se responde al hilo de otra
 *      marca.
 */
class BitacoraConversacionTest extends TestCase
{
    use RefreshDatabase;

    /* ------------------------------------------------------------------
     | Etiquetar
     |-----------------------------------------------------------------*/

    /**
     * El selector solo ofrece a quien ya puede ver esa marca.
     *
     * Es la lista que alimenta el desplegable, y sale de los permisos
     * sobre la marca, no de «el equipo».
     */
    public function test_solo_se_ofrece_etiquetar_a_quien_ve_la_marca(): void
    {
        $dueno = $this->crearUsuario(RolUsuario::Vendedor, 'Agente Dueño');
        $ajeno = $this->crearUsuario(RolUsuario::Vendedor, 'Agente Ajeno');
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'La Comercial');

        $marca = $this->crearMarca('Marca del dueño', $dueno);

        $nombres = array_column(
            $this->actingAs($dueno)
                ->getJson("/api/marcas/{$marca->id}/mencionables")
                ->assertOk()
                ->json('data'),
            'nombre',
        );

        sort($nombres);

        // Están el dueño y quien ve todas las marcas. El otro agente no.
        $this->assertSame(['Agente Dueño', 'La Comercial'], $nombres);
        $this->assertNotContains($ajeno->nombreParaMostrar(), $nombres);
    }

    /**
     * Y si alguien se salta el selector escribiendo la petición a mano,
     * el servidor lo filtra igual.
     *
     * La mención simplemente no existe, y a esa persona no le llega
     * ningún aviso con el nombre de una marca que no puede ver.
     */
    public function test_etiquetar_a_quien_no_ve_la_marca_no_hace_nada(): void
    {
        $dueno = $this->crearUsuario(RolUsuario::Vendedor, 'Agente Dueño');
        $ajeno = $this->crearUsuario(RolUsuario::Vendedor, 'Agente Ajeno');

        $marca = $this->crearMarca('Marca del dueño', $dueno);

        $respuesta = $this->actingAs($dueno)
            ->postJson("/api/marcas/{$marca->id}/comentarios", [
                'cuerpo' => 'Te etiqueto a ver qué pasa',
                'menciones' => [$ajeno->id],
            ])
            ->assertCreated();

        $this->assertSame([], $respuesta->json('data.mencionados'));

        $this->assertSame(
            0,
            Notificacion::query()->where('destinatario_id', $ajeno->id)->count(),
        );
    }

    public function test_etiquetar_a_quien_si_la_ve_le_manda_un_aviso(): void
    {
        $dueno = $this->crearUsuario(RolUsuario::Vendedor, 'Agente Dueño');
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'La Comercial');

        $marca = $this->crearMarca('Marca del dueño', $dueno);

        $this->actingAs($dueno)
            ->postJson("/api/marcas/{$marca->id}/comentarios", [
                'cuerpo' => 'Mira esto cuando puedas',
                'menciones' => [$comercial->id],
            ])
            ->assertCreated()
            ->assertJsonPath('data.mencionados.0.nombre', 'La Comercial');

        $aviso = Notificacion::query()->where('destinatario_id', $comercial->id)->first();

        $this->assertNotNull($aviso);
        $this->assertSame(Notificacion::TIPO_MENCION, $aviso->tipo);
        $this->assertStringContainsString('Marca del dueño', $aviso->titulo);
        // El aviso lleva un adelanto del texto, para no tener que abrir
        // la ficha solo para saber de qué va.
        $this->assertStringContainsString('Mira esto cuando puedas', (string) $aviso->cuerpo);
    }

    public function test_etiquetarse_a_uno_mismo_no_manda_aviso(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'La Comercial');
        $marca = $this->crearMarca('Marca cualquiera');

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", [
                'cuerpo' => 'Nota para mí',
                'menciones' => [$comercial->id],
            ])
            ->assertCreated();

        $this->assertSame(0, Notificacion::query()->count());
    }

    /* ------------------------------------------------------------------
     | Responder
     |-----------------------------------------------------------------*/

    public function test_una_respuesta_cuelga_de_su_entrada(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = $this->crearMarca('Marca con hilo');

        $idDeLaRaiz = $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Llamé y no contestan'])
            ->json('data.id');

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", [
                'cuerpo' => 'Yo probé por WhatsApp',
                'comentarioPadreId' => $idDeLaRaiz,
            ])
            ->assertCreated();

        $hilo = $this->actingAs($comercial)
            ->getJson("/api/marcas/{$marca->id}/comentarios")
            ->assertOk()
            ->json('data');

        // El listado trae SOLO las raíces, con sus respuestas dentro: si
        // las respuestas salieran sueltas, el hilo se leería desordenado.
        $this->assertCount(1, $hilo);
        $this->assertCount(1, $hilo[0]['respuestas']);
        $this->assertSame('Yo probé por WhatsApp', $hilo[0]['respuestas'][0]['cuerpo']);
    }

    /**
     * La ficha de una marca con conversación se abre.
     *
     * Hasta septiembre de 2026 la ficha cargaba además todos los
     * comentarios sin sus reacciones ni respuestas: en producción eso era
     * una consulta por comentario al abrir cada ficha, y aquí (con la
     * carga perezosa bloqueada) un 500. Se vio al abrir una marca desde
     * el chat. La bitácora se pide aparte; la ficha solo trae cuántos hay.
     */
    public function test_la_ficha_de_una_marca_con_conversacion_se_abre(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = $this->crearMarca('Marca con hilo');

        $idDeLaRaiz = $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Llamé y no contestan'])
            ->json('data.id');

        $this->actingAs($comercial)->postJson("/api/marcas/{$marca->id}/comentarios", [
            'cuerpo' => 'Yo probé por WhatsApp',
            'comentarioPadreId' => $idDeLaRaiz,
        ]);
        $this->actingAs($comercial)
            ->putJson("/api/marcas/{$marca->id}/comentarios/{$idDeLaRaiz}/reacciones", ['emoji' => '👍']);

        $this->actingAs($comercial)
            ->getJson("/api/marcas/{$marca->id}")
            ->assertOk()
            ->assertJsonPath('data.totalComentarios', 2)
            ->assertJsonMissingPath('data.comentarios');
    }

    /**
     * No se responde a una respuesta.
     *
     * Anidar sin límite hace la bitácora ilegible en tres semanas, y
     * existe justamente para leerse de corrido dentro de seis meses.
     */
    public function test_no_se_puede_responder_a_una_respuesta(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = $this->crearMarca('Marca con hilo');

        $idDeLaRaiz = $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Raíz'])
            ->json('data.id');

        $idDeLaRespuesta = $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", [
                'cuerpo' => 'Respuesta',
                'comentarioPadreId' => $idDeLaRaiz,
            ])
            ->json('data.id');

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", [
                'cuerpo' => 'Respuesta de la respuesta',
                'comentarioPadreId' => $idDeLaRespuesta,
            ])
            ->assertStatus(422);
    }

    public function test_no_se_puede_responder_al_hilo_de_otra_marca(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $unaMarca = $this->crearMarca('Una marca');
        $otraMarca = $this->crearMarca('Otra marca');

        $idEnLaOtra = $this->actingAs($comercial)
            ->postJson("/api/marcas/{$otraMarca->id}/comentarios", ['cuerpo' => 'Apunte de la otra'])
            ->json('data.id');

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$unaMarca->id}/comentarios", [
                'cuerpo' => 'Me cuelgo del hilo ajeno',
                'comentarioPadreId' => $idEnLaOtra,
            ])
            ->assertStatus(422);
    }

    /* ------------------------------------------------------------------
     | Reaccionar
     |-----------------------------------------------------------------*/

    public function test_la_misma_reaccion_dos_veces_la_quita(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = $this->crearMarca('Marca con hilo');

        $idDelComentario = $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Cerramos'])
            ->json('data.id');

        $ruta = "/api/marcas/{$marca->id}/comentarios/{$idDelComentario}/reacciones";

        $this->actingAs($comercial)->putJson($ruta, ['emoji' => '🎉'])
            ->assertOk()
            ->assertJsonPath('data.reacciones.0.emoji', '🎉')
            ->assertJsonPath('data.reacciones.0.total', 1)
            ->assertJsonPath('data.reacciones.0.laMia', true);

        $this->actingAs($comercial)->putJson($ruta, ['emoji' => '🎉'])
            ->assertOk()
            ->assertJsonPath('data.reacciones', []);
    }

    public function test_dos_personas_suman_en_la_misma_reaccion(): void
    {
        $unaPersona = $this->crearUsuario(RolUsuario::Comercial, 'Una Persona');
        $otraPersona = $this->crearUsuario(RolUsuario::Admin, 'Otra Persona');

        $marca = $this->crearMarca('Marca con hilo');

        $idDelComentario = $this->actingAs($unaPersona)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Cerramos'])
            ->json('data.id');

        $ruta = "/api/marcas/{$marca->id}/comentarios/{$idDelComentario}/reacciones";

        $this->actingAs($unaPersona)->putJson($ruta, ['emoji' => '👍'])->assertOk();

        $this->actingAs($otraPersona)->putJson($ruta, ['emoji' => '👍'])
            ->assertOk()
            ->assertJsonPath('data.reacciones.0.total', 2)
            ->assertJsonPath('data.reacciones.0.laMia', true);

        // Para quien no la puso, la misma reacción NO es suya.
        $hilo = $this->actingAs($unaPersona)
            ->getJson("/api/marcas/{$marca->id}/comentarios")
            ->json('data');

        $this->assertSame(2, $hilo[0]['reacciones'][0]['total']);
        $this->assertTrue($hilo[0]['reacciones'][0]['laMia']);
    }

    /* ------------------------------------------------------------------
     | Editar
     |-----------------------------------------------------------------*/

    public function test_editar_lo_propio_queda_marcado(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = $this->crearMarca('Marca con hilo');

        $idDelComentario = $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Llamé el lunes'])
            ->assertCreated()
            ->assertJsonPath('data.editadoEn', null)
            ->json('data.id');

        $this->actingAs($comercial)
            ->patchJson("/api/marcas/{$marca->id}/comentarios/{$idDelComentario}", [
                'cuerpo' => 'Llamé el martes',
            ])
            ->assertOk()
            ->assertJsonPath('data.cuerpo', 'Llamé el martes');

        $this->assertNotNull(ComentarioMarca::find($idDelComentario)?->editado_en);
    }

    /**
     * Ni un administrador cambia las palabras de otro.
     *
     * En un registro que se exporta, reescribir lo que dijo alguien es
     * peor que no poder corregir una errata. Eliminar sí puede, y eso
     * deja rastro de quién fue.
     */
    public function test_nadie_edita_el_comentario_de_otro_ni_siendo_administrador(): void
    {
        $autor = $this->crearUsuario(RolUsuario::Comercial, 'El Autor');
        $administrador = $this->crearUsuario(RolUsuario::Admin, 'La Administradora');

        $marca = $this->crearMarca('Marca con hilo');

        $idDelComentario = $this->actingAs($autor)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Lo que dije'])
            ->json('data.id');

        $this->actingAs($administrador)
            ->patchJson("/api/marcas/{$marca->id}/comentarios/{$idDelComentario}", [
                'cuerpo' => 'Lo que me gustaría que hubiera dicho',
            ])
            ->assertStatus(403);

        $this->assertSame('Lo que dije', ComentarioMarca::find($idDelComentario)?->cuerpo);
    }

    /* ------------------------------------------------------------------
     | Exportar
     |-----------------------------------------------------------------*/

    /**
     * Un comentario borrado no desaparece del histórico exportado.
     *
     * Es lo que sostiene todo lo demás: si al borrar se fuera la fila,
     * bastaría con limpiar lo incómodo antes de exportar para que el
     * histórico dijese otra cosa.
     */
    public function test_un_comentario_borrado_sigue_en_el_historico_exportado(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'La Comercial');
        $marca = $this->crearMarca('Marca con hilo');

        $idDelComentario = $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Algo incómodo'])
            ->json('data.id');

        $this->actingAs($comercial)
            ->deleteJson("/api/marcas/{$marca->id}/comentarios/{$idDelComentario}")
            ->assertOk();

        $entradas = $this->actingAs($comercial)
            ->getJson("/api/marcas/{$marca->id}/bitacora/exportacion")
            ->assertOk()
            ->json('entradas');

        $this->assertCount(1, $entradas);
        $this->assertTrue($entradas[0]['eliminado']);
        $this->assertSame('La Comercial', $entradas[0]['eliminadoPorNombre']);
        // El texto sí se va: eliminar tiene que eliminar lo escrito. Lo
        // que se conserva es el hueco y el rastro.
        $this->assertSame('', $entradas[0]['cuerpo']);
    }

    public function test_exportar_una_bitacora_queda_anotado_en_la_auditoria(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'La Comercial');
        $marca = $this->crearMarca('Marca con hilo');

        $this->actingAs($comercial)
            ->getJson("/api/marcas/{$marca->id}/bitacora/exportacion")
            ->assertOk();

        $this->assertDatabaseHas('registros_actividad', [
            'accion' => RegistroActividad::ACCION_EXPORTO,
            'entidad_tipo' => 'marca',
            'entidad_id' => $marca->id,
            'usuario_nombre' => 'La Comercial',
        ]);
    }

    public function test_un_agente_no_exporta_el_historico_completo(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $administrador = $this->crearUsuario(RolUsuario::Admin);

        $this->actingAs($agente)
            ->getJson('/api/admin/bitacora/exportacion')
            ->assertForbidden();

        // Un comercial tampoco: es la conversación entera de la agencia.
        $this->actingAs($comercial)
            ->getJson('/api/admin/bitacora/exportacion')
            ->assertForbidden();

        $this->actingAs($administrador)
            ->getJson('/api/admin/bitacora/exportacion')
            ->assertOk();
    }

    public function test_el_agente_no_exporta_la_bitacora_de_una_marca_ajena(): void
    {
        $dueno = $this->crearUsuario(RolUsuario::Vendedor, 'Dueño');
        $ajeno = $this->crearUsuario(RolUsuario::Vendedor, 'Ajeno');

        $marca = $this->crearMarca('Marca del dueño', $dueno);

        $this->actingAs($ajeno)
            ->getJson("/api/marcas/{$marca->id}/bitacora/exportacion")
            ->assertForbidden();
    }

    /**
     * En el documento, cada respuesta va justo debajo de su entrada.
     *
     * El orden ES el documento: un histórico donde las respuestas salen
     * al final, lejos de aquello a lo que contestan, no se puede leer
     * seis meses después.
     */
    public function test_el_historico_pone_cada_respuesta_bajo_su_entrada(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = $this->crearMarca('Marca con hilo');

        $primera = $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Primera'])
            ->json('data.id');

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Segunda'])
            ->assertCreated();

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", [
                'cuerpo' => 'Respuesta a la primera',
                'comentarioPadreId' => $primera,
            ])
            ->assertCreated();

        $entradas = $this->actingAs($comercial)
            ->getJson("/api/marcas/{$marca->id}/bitacora/exportacion")
            ->json('entradas');

        $this->assertSame(
            ['Primera', 'Respuesta a la primera', 'Segunda'],
            array_column($entradas, 'cuerpo'),
        );

        $this->assertTrue($entradas[1]['esRespuesta']);
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

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
