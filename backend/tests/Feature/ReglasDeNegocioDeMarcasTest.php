<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\Marca;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pruebas de las reglas de negocio del CRM.
 * ---------------------------------------------------------------------
 * Cubren exactamente las reglas que el cliente pidió y las que en la
 * versión de Supabase fallaban en silencio. Cada prueba comprueba una
 * sola cosa y su nombre dice cuál.
 *
 * La más importante es la de permisos: allí, cuando una política
 * filtraba una fila, el update afectaba a cero filas y respondía
 * "correcto", así que la interfaz cantaba "Guardado ✔" sin haber
 * guardado nada. Aquí eso tiene que ser un 403 explícito.
 */
class ReglasDeNegocioDeMarcasTest extends TestCase
{
    use RefreshDatabase;

    /* ------------------------------------------------------------------
     | Prospección calculada
     |-----------------------------------------------------------------*/

    public function test_la_prospeccion_se_completa_sola_cuando_estan_los_cinco_datos(): void
    {
        $marca = Marca::create([
            'nombre_marca' => 'Refrescos del Caribe',
            'logo_url' => 'https://ejemplo.test/logo.png',
            'persona_contacto' => 'Rodrigo Salas',
            'cargo_contacto' => 'Gerente de mercadeo',
            'email_contacto' => 'rodrigo@ejemplo.test',
        ]);

        $this->assertTrue($marca->fase_prospeccion_completada);
        $this->assertSame([], $marca->datosQueFaltanParaProspeccion());
    }

    public function test_la_prospeccion_queda_incompleta_si_falta_algun_dato(): void
    {
        $marca = Marca::create([
            'nombre_marca' => 'Snacks Lara',
            // Sin logo, sin contacto, sin cargo y sin correo.
        ]);

        $this->assertFalse($marca->fase_prospeccion_completada);
        $this->assertSame(
            ['logo', 'persona de contacto', 'cargo', 'email'],
            $marca->datosQueFaltanParaProspeccion(),
        );
    }

    public function test_la_prospeccion_no_se_puede_forzar_a_mano(): void
    {
        // Se intenta guardarla como completa sin tener los datos: el
        // modelo la recalcula al guardar y la deja como está de verdad.
        $marca = new Marca(['nombre_marca' => 'Marca incompleta']);
        $marca->fase_prospeccion_completada = true;
        $marca->save();

        $this->assertFalse($marca->fresh()->fase_prospeccion_completada);
    }

    /* ------------------------------------------------------------------
     | El valor solo cuenta con propuesta enviada
     |-----------------------------------------------------------------*/

    public function test_el_valor_se_pone_a_cero_si_no_hay_propuesta_enviada(): void
    {
        $marca = Marca::create([
            'nombre_marca' => 'Telecom Andina',
            'fase_propuesta_completada' => false,
            'valor_anual_usd' => 50000,
        ]);

        $this->assertEquals(0, $marca->valor_anual_usd);
    }

    public function test_el_valor_se_conserva_cuando_si_hay_propuesta(): void
    {
        $marca = Marca::create([
            'nombre_marca' => 'Banco Metropolitano',
            'fase_propuesta_completada' => true,
            'descripcion_propuesta' => 'Naming rights del torneo juvenil.',
            'valor_anual_usd' => 96000,
        ]);

        $this->assertEquals(96000, $marca->valor_anual_usd);
    }

    /* ------------------------------------------------------------------
     | Validación de las fases
     |-----------------------------------------------------------------*/

    public function test_no_se_puede_marcar_aproximacion_sin_indicar_la_via(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $respuesta = $this->actingAs($comercial)->postJson('/api/marcas', [
            'nombreMarca' => 'Marca de prueba',
            'faseAproximacionCompletada' => true,
            // Falta viaAproximacion.
        ]);

        $respuesta->assertStatus(422);
        $this->assertArrayHasKey('viaAproximacion', $respuesta->json('errores'));
    }

    public function test_no_se_puede_marcar_propuesta_sin_describirla(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        $respuesta = $this->actingAs($comercial)->postJson('/api/marcas', [
            'nombreMarca' => 'Marca de prueba',
            'fasePropuestaCompletada' => true,
            // Falta descripcionPropuesta.
        ]);

        $respuesta->assertStatus(422);
        $this->assertArrayHasKey('descripcionPropuesta', $respuesta->json('errores'));
    }

    /* ------------------------------------------------------------------
     | Permisos por rol
     |-----------------------------------------------------------------*/

    public function test_un_vendedor_no_puede_editar_una_marca_de_otro(): void
    {
        $vendedorPropietario = $this->crearUsuario(RolUsuario::Vendedor);
        $otroVendedor = $this->crearUsuario(RolUsuario::Vendedor);

        $marca = Marca::create([
            'nombre_marca' => 'Marca ajena',
            'vendedor_asignado_id' => $vendedorPropietario->id,
        ]);

        $respuesta = $this->actingAs($otroVendedor)->putJson("/api/marcas/{$marca->id}", [
            'nombreMarca' => 'Nombre cambiado a la fuerza',
        ]);

        // Un 403 explícito, no un "correcto" que no guardó nada.
        $respuesta->assertStatus(403);
        $this->assertSame('Marca ajena', $marca->fresh()->nombre_marca);
    }

    public function test_un_vendedor_si_puede_editar_la_marca_que_tiene_asignada(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor);

        $marca = Marca::create([
            'nombre_marca' => 'Marca propia',
            'vendedor_asignado_id' => $vendedor->id,
        ]);

        $respuesta = $this->actingAs($vendedor)->putJson("/api/marcas/{$marca->id}", [
            'nombreMarca' => 'Marca propia actualizada',
        ]);

        $respuesta->assertOk();
        $this->assertSame('Marca propia actualizada', $marca->fresh()->nombre_marca);
    }

    public function test_un_vendedor_no_puede_borrar_marcas(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor);

        $marca = Marca::create([
            'nombre_marca' => 'Marca asignada',
            'vendedor_asignado_id' => $vendedor->id,
        ]);

        // Ni siquiera la suya: borrar es cosa de admin y comercial.
        $this->actingAs($vendedor)
            ->deleteJson("/api/marcas/{$marca->id}")
            ->assertStatus(403);

        $this->assertDatabaseCount('marcas', 1);
    }

    public function test_un_comercial_puede_editar_cualquier_marca(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $vendedorAjeno = $this->crearUsuario(RolUsuario::Vendedor);

        $marca = Marca::create([
            'nombre_marca' => 'Marca de otro',
            'vendedor_asignado_id' => $vendedorAjeno->id,
        ]);

        $this->actingAs($comercial)
            ->putJson("/api/marcas/{$marca->id}", ['nombreMarca' => 'Editada por el comercial'])
            ->assertOk();
    }

    /* ------------------------------------------------------------------
     | Adopción de leads de la web
     |-----------------------------------------------------------------*/

    public function test_un_lead_de_la_web_queda_a_nombre_de_quien_lo_trabaja(): void
    {
        $vendedor = $this->crearUsuario(RolUsuario::Vendedor, 'Ana Vendedora');

        // Un lead entrante nace sin vendedor asignado.
        $lead = Marca::create([
            'nombre_marca' => 'Lead de la web',
            'origen' => 'web',
        ]);

        $this->assertTrue($lead->estaSinDuenio());

        $this->actingAs($vendedor)
            ->putJson("/api/marcas/{$lead->id}", ['nombreMarca' => 'Lead trabajado'])
            ->assertOk();

        $leadActualizado = $lead->fresh();

        $this->assertSame($vendedor->id, $leadActualizado->vendedor_asignado_id);
        $this->assertSame('Ana Vendedora', $leadActualizado->vendedor_asignado_nombre);
    }

    /* ------------------------------------------------------------------
     | Formulario público
     |-----------------------------------------------------------------*/

    public function test_el_formulario_de_la_web_crea_un_lead_sin_dueno(): void
    {
        $respuesta = $this->postJson('/api/contacto', [
            'nombre' => 'Pedro Visitante',
            'email' => 'pedro@empresa.test',
            'empresa' => 'Empresa Visitante',
            'mensaje' => 'Nos interesa patrocinar la liga.',
        ]);

        $respuesta->assertStatus(201);

        $lead = Marca::query()->firstOrFail();

        $this->assertSame('Empresa Visitante', $lead->nombre_marca);
        $this->assertSame('Pedro Visitante', $lead->persona_contacto);
        $this->assertSame('web', $lead->origen->value);
        $this->assertTrue($lead->estaSinDuenio());
    }

    public function test_la_trampa_para_robots_descarta_el_envio_sin_delatarse(): void
    {
        $respuesta = $this->postJson('/api/contacto', [
            'nombre' => 'Robot',
            'email' => 'robot@spam.test',
            'mensaje' => 'Compra seguidores baratos.',
            // Campo oculto que una persona nunca rellena.
            'sitioWeb' => 'https://sitio-de-spam.test',
        ]);

        // Hacia fuera parece que fue bien, pero no se guardó nada.
        $respuesta->assertStatus(201);
        $this->assertDatabaseCount('marcas', 0);
    }

    /* ------------------------------------------------------------------
     | Ayudante
     |-----------------------------------------------------------------*/

    private function crearUsuario(RolUsuario $rol, string $nombre = 'Usuario de prueba'): User
    {
        return User::create([
            'name' => $nombre,
            'email' => strtolower(str_replace(' ', '.', $nombre)).'-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            'activo' => true,
        ]);
    }
}
