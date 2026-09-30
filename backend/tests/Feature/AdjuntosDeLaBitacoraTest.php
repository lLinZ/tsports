<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\ArchivoMedia;
use App\Models\ComentarioMarca;
use App\Models\Marca;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Los adjuntos de la bitácora: lo que se envió, junto a lo que se habló.
 * ---------------------------------------------------------------------
 * Lo que se fija aquí, por orden de lo que más daño haría si se torciera:
 *
 *   1. **Un adjunto no tiene dirección pública.** Vive en el disco
 *      privado y se abre con un enlace firmado que caduca: una marca no
 *      la ve todo el equipo (regla 6), y su contrato tampoco.
 *   2. **Nadie cuelga en su entrada un fichero ajeno**, ni uno que ya
 *      está en otra entrada.
 *   3. **Eliminar la entrada borra sus ficheros**, igual que vacía el
 *      texto (regla 19).
 *   4. El histórico exportado lista lo que se adjuntó.
 */
class AdjuntosDeLaBitacoraTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        Storage::fake('local');
    }

    /* ------------------------------------------------------------------
     | Adjuntar y publicar
     |-----------------------------------------------------------------*/

    /**
     * Un fichero solo, sin texto, también es una entrada: «el dossier que
     * se mandó» se entiende por sí mismo.
     */
    public function test_se_adjunta_un_pdf_y_se_publica_sin_texto(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = $this->crearMarca('Bebidas del Sur', $agente);

        $idDelAdjunto = $this->adjuntar($agente, $marca, $this->pdf('propuesta.pdf'))
            ->assertCreated()
            ->assertJsonPath('data.tipo', 'documento')
            ->assertJsonPath('data.nombre', 'propuesta.pdf')
            ->json('data.id');

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/comentarios", [
                'cuerpo' => '',
                'adjuntos' => [$idDelAdjunto],
            ])
            ->assertCreated()
            ->assertJsonPath('data.cuerpo', '')
            ->assertJsonPath('data.adjuntos.0.nombre', 'propuesta.pdf');

        $archivo = ArchivoMedia::query()->findOrFail($idDelAdjunto);

        $this->assertSame(ArchivoMedia::DISCO_PRIVADO, $archivo->disco);
        $this->assertNull($archivo->url_publica);
        Storage::disk('local')->assertExists($archivo->ruta_relativa);
        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    public function test_una_entrada_sin_texto_ni_adjuntos_no_vale(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = $this->crearMarca('Vacía', $agente);

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => '   '])
            ->assertUnprocessable()
            ->assertJsonPath('errores.cuerpo.0', 'Escribe algo antes de comentar.');
    }

    public function test_un_agente_no_adjunta_en_una_marca_ajena(): void
    {
        $dueno = $this->crearUsuario(RolUsuario::Vendedor);
        $ajeno = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = $this->crearMarca('De otro', $dueno);

        $this->adjuntar($ajeno, $marca, $this->foto())->assertForbidden();

        $this->assertSame(0, ArchivoMedia::query()->count());
    }

    public function test_no_entra_un_svg_ni_un_fichero_disfrazado(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = $this->crearMarca('Prudente', $agente);

        $svg = UploadedFile::fake()->createWithContent(
            'logo.svg',
            '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        );
        $disfrazado = UploadedFile::fake()->createWithContent('contrato.pdf', '<?php echo "hola";');

        $this->adjuntar($agente, $marca, $svg)->assertUnprocessable();
        $this->adjuntar($agente, $marca, $disfrazado)->assertUnprocessable();

        $this->assertSame(0, ArchivoMedia::query()->count());
    }

    /* ------------------------------------------------------------------
     | De quién es cada fichero
     |-----------------------------------------------------------------*/

    /**
     * Si bastara con saber el id de un fichero ajeno para colgarlo en una
     * entrada propia, cualquiera podría sacar a su hilo lo que otro subió.
     */
    public function test_no_se_cuelga_un_fichero_que_subio_otra_persona(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = $this->crearMarca('Compartida', $agente);

        $idDelAdjunto = $this->adjuntar($comercial, $marca, $this->pdf())->json('data.id');

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/comentarios", [
                'cuerpo' => 'Me lo quedo yo',
                'adjuntos' => [$idDelAdjunto],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrorFor('adjuntos', 'errores');

        $this->assertSame(0, ComentarioMarca::query()->count());
    }

    public function test_un_fichero_ya_publicado_no_se_cuelga_en_otra_entrada(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = $this->crearMarca('Una sola vez', $agente);

        $idDelAdjunto = $this->adjuntar($agente, $marca, $this->pdf())->json('data.id');

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Primera', 'adjuntos' => [$idDelAdjunto]])
            ->assertCreated();

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Segunda', 'adjuntos' => [$idDelAdjunto]])
            ->assertUnprocessable();
    }

    /* ------------------------------------------------------------------
     | El enlace firmado
     |-----------------------------------------------------------------*/

    /**
     * Una etiqueta <img> no manda el token de sesión: lo que abre el
     * fichero es la firma, y esa solo la reparte el servidor.
     */
    public function test_el_enlace_firmado_abre_el_fichero_sin_sesion(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = $this->crearMarca('Con foto', $agente);

        $url = $this->adjuntar($agente, $marca, $this->foto('activacion.png'), $this->foto('min.png'))
            ->json('data.url');

        $this->assertStringStartsWith('/api/adjuntos/', (string) $url);

        $this->app['auth']->forgetGuards();

        $respuesta = $this->get((string) $url)->assertOk();

        $this->assertSame('image/png', $respuesta->headers->get('Content-Type'));
        $this->assertSame('nosniff', $respuesta->headers->get('X-Content-Type-Options'));
        $this->assertStringStartsWith("\x89PNG", $respuesta->streamedContent());
    }

    public function test_un_enlace_manipulado_o_caducado_no_abre_nada(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = $this->crearMarca('Protegida', $agente);

        $url = (string) $this->adjuntar($agente, $marca, $this->pdf())->json('data.url');
        $idDelAdjunto = ArchivoMedia::query()->firstOrFail()->id;

        $this->app['auth']->forgetGuards();

        // Sin firma.
        $this->get("/api/adjuntos/{$idDelAdjunto}")->assertForbidden();

        // Con la firma de otro fichero no vale.
        $otro = (string) $this->adjuntar($agente, $marca, $this->foto())->json('data.url');
        $firmaDelOtro = substr($otro, (int) strpos($otro, '?'));
        $this->app['auth']->forgetGuards();
        $this->get("/api/adjuntos/{$idDelAdjunto}{$firmaDelOtro}")->assertForbidden();

        // Caducado: dura como mucho dos días.
        $this->travel(3)->days();
        $this->get($url)->assertForbidden();
    }

    /**
     * La descarga es el mismo fichero, pero con su nombre original y
     * como descarga, no abierto en el navegador.
     */
    public function test_la_descarga_lleva_el_nombre_original(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = $this->crearMarca('Con PDF', $agente);

        $urlDescarga = (string) $this->adjuntar($agente, $marca, $this->pdf('Propuesta 2026.pdf'))
            ->json('data.urlDescarga');

        $disposicion = (string) $this->get($urlDescarga)->assertOk()->headers->get('Content-Disposition');

        $this->assertStringStartsWith('attachment', $disposicion);
        $this->assertStringContainsString('Propuesta 2026.pdf', $disposicion);
    }

    /* ------------------------------------------------------------------
     | Borrar
     |-----------------------------------------------------------------*/

    public function test_eliminar_la_entrada_borra_sus_ficheros(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = $this->crearMarca('Se arrepiente', $agente);

        $idDelAdjunto = $this->adjuntar($agente, $marca, $this->foto(), $this->foto('min.png'))->json('data.id');
        $archivo = ArchivoMedia::query()->findOrFail($idDelAdjunto);

        $idDelComentario = $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'La foto', 'adjuntos' => [$idDelAdjunto]])
            ->json('data.id');

        $this->actingAs($agente)
            ->deleteJson("/api/marcas/{$marca->id}/comentarios/{$idDelComentario}")
            ->assertOk();

        Storage::disk('local')->assertMissing($archivo->ruta_relativa);
        Storage::disk('local')->assertMissing((string) $archivo->ruta_miniatura);
        $this->assertNull(ArchivoMedia::query()->find($idDelAdjunto));

        // El hueco sigue, sin nada dentro.
        $this->actingAs($agente)
            ->getJson("/api/marcas/{$marca->id}/comentarios")
            ->assertJsonPath('data.0.eliminado', true)
            ->assertJsonPath('data.0.adjuntos', []);
    }

    public function test_borrar_la_marca_se_lleva_los_ficheros_de_su_bitacora(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $marca = $this->crearMarca('Cerrada', $comercial);

        $idDelAdjunto = $this->adjuntar($comercial, $marca, $this->pdf())->json('data.id');

        $this->actingAs($comercial)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Contrato', 'adjuntos' => [$idDelAdjunto]])
            ->assertCreated();

        $this->actingAs($comercial)->deleteJson("/api/marcas/{$marca->id}")->assertOk();

        $this->assertSame(0, ArchivoMedia::query()->count());
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    /**
     * Lo que se subió y nunca llegó a una entrada se barre solo, sin
     * necesidad de ninguna tarea programada en el servidor.
     */
    public function test_los_adjuntos_abandonados_se_barren_solos(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = $this->crearMarca('A medias', $agente);

        $abandonado = $this->adjuntar($agente, $marca, $this->pdf('olvidado.pdf'))->json('data.id');
        $rutaDelAbandonado = ArchivoMedia::query()->findOrFail($abandonado)->ruta_relativa;

        $this->travel(3)->days();

        $this->adjuntar($agente, $marca, $this->pdf('nuevo.pdf'))->assertCreated();

        $this->assertNull(ArchivoMedia::query()->find($abandonado));
        Storage::disk('local')->assertMissing($rutaDelAbandonado);
        $this->assertSame(1, ArchivoMedia::query()->count());
    }

    /**
     * La ruta de las imágenes sueltas no borra un adjunto: vaciaría una
     * entrada del registro sin dejar rastro.
     */
    public function test_la_ruta_de_imagenes_sueltas_no_borra_adjuntos(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $marca = $this->crearMarca('Registro', $administrador);

        $idDelAdjunto = $this->adjuntar($administrador, $marca, $this->pdf())->json('data.id');

        $this->actingAs($administrador)->deleteJson("/api/media/{$idDelAdjunto}")->assertForbidden();

        $this->assertNotNull(ArchivoMedia::query()->find($idDelAdjunto));
    }

    /* ------------------------------------------------------------------
     | El histórico
     |-----------------------------------------------------------------*/

    public function test_el_historico_lista_lo_que_se_adjunto(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $marca = $this->crearMarca('Con histórico', $agente);

        $idDelAdjunto = $this->adjuntar($agente, $marca, $this->pdf('dossier.pdf'))->json('data.id');

        $this->actingAs($agente)
            ->postJson("/api/marcas/{$marca->id}/comentarios", ['cuerpo' => 'Enviado el dossier', 'adjuntos' => [$idDelAdjunto]])
            ->assertCreated();

        $this->actingAs($agente)
            ->getJson("/api/marcas/{$marca->id}/bitacora/exportacion")
            ->assertOk()
            ->assertJsonPath('entradas.0.adjuntos.0.nombre', 'dossier.pdf')
            ->assertJsonPath('entradas.0.adjuntos.0.tipo', 'documento');
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    private function adjuntar(User $quien, Marca $marca, UploadedFile $archivo, ?UploadedFile $miniatura = null): TestResponse
    {
        return $this->actingAs($quien)->post(
            "/api/marcas/{$marca->id}/adjuntos",
            array_filter(['archivo' => $archivo, 'miniatura' => $miniatura]),
            ['Accept' => 'application/json'],
        );
    }

    private function foto(string $nombre = 'foto.png'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent(
            $nombre,
            base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
        );
    }

    private function pdf(string $nombre = 'documento.pdf'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent(
            $nombre,
            "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
        );
    }

    private function crearMarca(string $nombre, ?User $vendedor = null): Marca
    {
        return Marca::create([
            'nombre_marca' => $nombre,
            'vendedor_asignado_id' => $vendedor?->id,
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
