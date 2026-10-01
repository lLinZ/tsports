<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\AccesoDeInvitados;
use App\Models\Marca;
use App\Models\Notificacion;
use App\Models\Propiedad;
use App\Models\User;
use App\Support\LlaveDelCatalogo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * El catálogo de propiedades en la web pública.
 * ---------------------------------------------------------------------
 * Es una ruta sin sesión del panel (se entra con el usuario de
 * invitado, que prueba AccesoDeInvitadosTest), así que lo primero es lo
 * que NO sale:
 *
 *   1. **Solo las propiedades activas que alguien publicó.** El catálogo
 *      de la web no es un volcado del CRM.
 *   2. **Ni montos, ni documentos, ni las fotos apagadas para la web.**
 *   3. **Guardar la propiedad desde una pestaña vieja no la despublica.**
 *
 * Y el camino de vuelta: quien escribe desde la tarjeta de una propiedad
 * entra en el CRM como lead con esa propiedad ya en su checklist.
 */
class CatalogoEnLaWebTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
    }

    public function test_solo_salen_las_activas_que_se_publicaron(): void
    {
        $this->crearPropiedad('Publicada', publicada: true);
        $this->crearPropiedad('Sin publicar', publicada: false);
        $this->crearPropiedad('Publicada pero desactivada', publicada: true, activa: false);

        $nombres = array_column(
            $this->pedirElCatalogo()->assertOk()->json('data'),
            'nombre',
        );

        $this->assertSame(['Publicada'], $nombres);
    }

    public function test_no_sale_ningun_monto_ni_documento_ni_foto_apagada(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = $this->crearPropiedad('Comité Olímpico', publicada: true);

        $fotoPublica = $this->subir($comercial, $propiedad, $this->foto('estadio.png'))->json('data.id');
        $fotoApagada = $this->subir($comercial, $propiedad, $this->foto('precios.png'))->json('data.id');
        $this->subir($comercial, $propiedad, $this->pdf())->assertCreated();

        $this->actingAs($comercial)
            ->patchJson("/api/propiedades/{$propiedad->id}/galeria/{$fotoApagada}", ['enLaWeb' => false])
            ->assertOk()
            ->assertJsonPath('data.enLaWeb', false);

        // Sin sesión: lo que ve cualquiera.
        $this->app['auth']->forgetGuards();

        $respuesta = $this->pedirElCatalogo()->assertOk();

        $this->assertSame([$fotoPublica], array_column($respuesta->json('data.0.fotos'), 'id'));

        $propiedadPublica = $respuesta->json('data.0');

        foreach (['montoTotalUsd', 'forecastDeVentaUsd', 'porcentajeForecast', 'ovpAcumuladoUsd', 'descripcion', 'prospectores', 'galeria'] as $campoInterno) {
            $this->assertArrayNotHasKey($campoInterno, $propiedadPublica, "«{$campoInterno}» no debería salir en la web.");
        }
    }

    public function test_sin_texto_en_ingles_sale_el_espanol(): void
    {
        $propiedad = $this->crearPropiedad('Kombat Challenge', publicada: true);
        $propiedad->update(['texto_web_es' => 'El torneo de artes marciales más visto del país.']);

        $this->pedirElCatalogo()
            ->assertOk()
            ->assertJsonPath('data.0.texto.es', 'El torneo de artes marciales más visto del país.')
            ->assertJsonPath('data.0.texto.en', 'El torneo de artes marciales más visto del país.');
    }

    /**
     * Una pestaña abierta con la versión anterior del panel manda la
     * propiedad sin los campos de la web. Faltar no es decir que no.
     */
    public function test_guardar_sin_los_campos_de_la_web_no_despublica(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = $this->crearPropiedad('Deportivo Táchira', publicada: true);
        $propiedad->update(['texto_web_es' => 'Texto para la web']);

        $this->actingAs($comercial)
            ->putJson("/api/propiedades/{$propiedad->id}", [
                'nombre' => 'Deportivo Táchira',
                'montoTotalUsd' => 50000,
                'porcentajeForecast' => 20,
                'asignadaATodos' => true,
                'prospectoresIds' => [],
                'orden' => 0,
                'activa' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.publicadaEnLaWeb', true)
            ->assertJsonPath('data.textoWebEs', 'Texto para la web');
    }

    public function test_publicar_se_hace_desde_la_ficha_de_la_propiedad(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = $this->crearPropiedad('Sportbiz', publicada: false);

        $this->actingAs($comercial)
            ->putJson("/api/propiedades/{$propiedad->id}", [
                'nombre' => 'Sportbiz',
                'asignadaATodos' => true,
                'activa' => true,
                'publicadaEnLaWeb' => true,
                'textoWebEs' => '  El congreso del negocio del deporte.  ',
                'textoWebEn' => '',
            ])
            ->assertOk()
            ->assertJsonPath('data.publicadaEnLaWeb', true)
            ->assertJsonPath('data.textoWebEs', 'El congreso del negocio del deporte.')
            ->assertJsonPath('data.textoWebEn', null);
    }

    /**
     * El interruptor de la pantalla «Catálogo web»: publica o retira sin
     * tocar nada más de la propiedad, y solo quien gestiona el catálogo.
     */
    public function test_el_interruptor_publica_y_retira_sin_tocar_lo_demas(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $propiedad = $this->crearPropiedad('Sportbiz', publicada: false);

        $this->actingAs($agente)
            ->patchJson("/api/propiedades/{$propiedad->id}/publicada", ['publicada' => true])
            ->assertForbidden();

        $this->actingAs($comercial)
            ->patchJson("/api/propiedades/{$propiedad->id}/publicada", ['publicada' => true])
            ->assertOk()
            ->assertJsonPath('data.publicadaEnLaWeb', true)
            ->assertJsonPath('data.montoTotalUsd', 162000);

        $this->pedirElCatalogo()->assertOk()->assertJsonPath('data.0.nombre', 'Sportbiz');

        $this->actingAs($comercial)
            ->patchJson("/api/propiedades/{$propiedad->id}/publicada", ['publicada' => false])
            ->assertOk();

        $this->pedirElCatalogo()->assertOk()->assertJsonCount(0, 'data');

        $this->assertSame(
            ['Publicó en la web la propiedad Sportbiz', 'Retiró de la web la propiedad Sportbiz'],
            \App\Models\RegistroActividad::query()->orderBy('id')->pluck('descripcion')->all(),
        );
    }

    /* ------------------------------------------------------------------
     | El contacto desde una tarjeta
     |-----------------------------------------------------------------*/

    public function test_escribir_desde_una_propiedad_la_pone_en_el_checklist_del_lead(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = $this->crearPropiedad('Comité Olímpico', publicada: true);

        $this->postJson('/api/contacto', [
            'nombre' => 'Laura Pérez',
            'email' => 'laura@empresa.test',
            'empresa' => 'Bebidas del Sur',
            'mensaje' => 'Quiero la propuesta.',
            'propiedadId' => $propiedad->id,
        ])->assertCreated();

        $marca = Marca::query()->with('propiedadesOfrecidas')->firstOrFail();

        $this->assertNull($marca->vendedor_asignado_id);
        $this->assertSame([$propiedad->id], $marca->propiedadesOfrecidas->pluck('propiedad_id')->all());
        $this->assertSame(0.0, (float) $marca->propiedadesOfrecidas->first()->ovp_usd);
        $this->assertStringContainsString('Comité Olímpico', (string) $marca->notas);

        $aviso = Notificacion::query()->where('destinatario_id', $comercial->id)->firstOrFail();
        $this->assertStringContainsString('Pregunta por Comité Olímpico', (string) $aviso->cuerpo);
    }

    /**
     * Una propiedad que no está publicada no se ata al lead, pero el
     * mensaje entra igual: perder el contacto por eso sería absurdo.
     */
    public function test_una_propiedad_sin_publicar_no_se_ata_pero_el_lead_entra(): void
    {
        $propiedad = $this->crearPropiedad('Secreta', publicada: false);

        $this->postJson('/api/contacto', [
            'nombre' => 'Mario',
            'email' => 'mario@empresa.test',
            'mensaje' => 'Hola.',
            'propiedadId' => $propiedad->id,
        ])->assertCreated();

        $marca = Marca::query()->with('propiedadesOfrecidas')->firstOrFail();

        $this->assertCount(0, $marca->propiedadesOfrecidas);
        $this->assertStringNotContainsString('Secreta', (string) $marca->notas);
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    /** El catálogo, como lo pide un invitado que ya entró. */
    private function pedirElCatalogo(): TestResponse
    {
        $acceso = AccesoDeInvitados::elVigente()
            ?? AccesoDeInvitados::create(['usuario' => 'invitado', 'contrasena' => 'clave-del-catalogo', 'version' => 1]);

        return $this->getJson('/api/propiedades-en-la-web', [
            LlaveDelCatalogo::CABECERA => LlaveDelCatalogo::emitir($acceso)['llave'],
        ]);
    }

    private function subir(User $quien, Propiedad $propiedad, UploadedFile $archivo): TestResponse
    {
        return $this->actingAs($quien)->post(
            "/api/propiedades/{$propiedad->id}/galeria",
            ['archivo' => $archivo],
            ['Accept' => 'application/json'],
        );
    }

    private function foto(string $nombre): UploadedFile
    {
        return UploadedFile::fake()->createWithContent(
            $nombre,
            base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
        );
    }

    private function pdf(): UploadedFile
    {
        return UploadedFile::fake()->createWithContent(
            'rate-card.pdf',
            "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
        );
    }

    private function crearPropiedad(string $nombre, bool $publicada, bool $activa = true): Propiedad
    {
        return Propiedad::create([
            'nombre' => $nombre,
            'descripcion' => 'Nota interna: negociar con el presidente.',
            'monto_total_usd' => 162000,
            'porcentaje_forecast' => 20,
            'asignada_a_todos' => true,
            'orden' => 0,
            'activa' => $activa,
            'publicada_en_la_web' => $publicada,
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
