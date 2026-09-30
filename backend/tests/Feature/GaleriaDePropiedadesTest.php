<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\ArchivoDePropiedad;
use App\Models\ArchivoMedia;
use App\Models\Propiedad;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * La galería de las propiedades: fotos, planos y dossier.
 * ---------------------------------------------------------------------
 * Lo que se fija aquí, por orden de lo que más daño haría si se torciera:
 *
 *   1. **Quien no gestiona el catálogo no toca la galería.** Es material
 *      de venta que se enseña a clientes y acaba en la web.
 *   2. **Ni SVG ni nada que no sea lo que dice ser.** El tipo se decide
 *      por el contenido del fichero; un SVG puede llevar código dentro.
 *   3. **Borrar una propiedad se lleva sus ficheros**, no solo sus filas.
 *   4. La portada es una sola y siempre una foto, y se hereda al borrarla.
 */
class GaleriaDePropiedadesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        Storage::fake('local');
    }

    /* ------------------------------------------------------------------
     | Permisos
     |-----------------------------------------------------------------*/

    public function test_un_agente_no_puede_tocar_la_galeria(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $propiedad = $this->crearPropiedad('Comité Olímpico');

        $pieza = $this->subir($comercial, $propiedad, $this->foto())->assertCreated()->json('data.id');

        $this->subir($agente, $propiedad, $this->foto())->assertForbidden();

        $this->actingAs($agente)
            ->patchJson("/api/propiedades/{$propiedad->id}/galeria/{$pieza}", ['titulo' => 'Otra cosa'])
            ->assertForbidden();

        $this->actingAs($agente)
            ->putJson("/api/propiedades/{$propiedad->id}/galeria/{$pieza}/portada")
            ->assertForbidden();

        $this->actingAs($agente)
            ->putJson("/api/propiedades/{$propiedad->id}/galeria/orden", ['ids' => [$pieza]])
            ->assertForbidden();

        $this->actingAs($agente)
            ->deleteJson("/api/propiedades/{$propiedad->id}/galeria/{$pieza}")
            ->assertForbidden();

        $this->assertSame(1, ArchivoDePropiedad::query()->count());
    }

    /**
     * Verla sí la ve todo el equipo: el checklist de la ficha la necesita
     * para enseñar las fotos delante del cliente.
     */
    public function test_la_galeria_viaja_con_la_propiedad_para_todo_el_equipo(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor);
        $propiedad = $this->crearPropiedad('Deportivo Táchira');

        $this->subir($comercial, $propiedad, $this->foto(), $this->foto('miniatura.jpg'))->assertCreated();
        $this->subir($comercial, $propiedad, $this->pdf())->assertCreated();

        $respuesta = $this->actingAs($agente)
            ->getJson('/api/propiedades?soloActivas=1')
            ->assertOk();

        $this->assertCount(2, $respuesta->json('data.0.galeria'));
        $this->assertSame('imagen', $respuesta->json('data.0.galeria.0.tipo'));
        $this->assertSame('documento', $respuesta->json('data.0.galeria.1.tipo'));
        // La portada de la tarjeta es la miniatura, no la foto entera.
        $this->assertStringContainsString('-miniatura.', (string) $respuesta->json('data.0.portadaUrl'));
    }

    /* ------------------------------------------------------------------
     | Qué entra
     |-----------------------------------------------------------------*/

    public function test_entran_fotos_y_pdf_con_su_miniatura(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = $this->crearPropiedad('Kombat Challenge');

        $foto = $this->subir($comercial, $propiedad, $this->foto('tribuna.png'), $this->foto('min.jpg'), 'Vista desde tribuna este')
            ->assertCreated()
            ->assertJsonPath('data.tipo', 'imagen')
            ->assertJsonPath('data.titulo', 'Vista desde tribuna este')
            ->assertJsonPath('data.nombre', 'tribuna.png')
            // La primera foto estrena la portada.
            ->assertJsonPath('data.esPortada', true);

        $this->subir($comercial, $propiedad, $this->pdf('dossier.pdf'))
            ->assertCreated()
            ->assertJsonPath('data.tipo', 'documento')
            ->assertJsonPath('data.esPortada', false)
            // Un documento no sale nunca en la web.
            ->assertJsonPath('data.enLaWeb', false)
            ->assertJsonPath('data.urlMiniatura', null);

        $archivoDeLaFoto = ArchivoMedia::query()->where('nombre_original', 'tribuna.png')->firstOrFail();

        $this->assertSame(ArchivoMedia::DISCO_PUBLICO, $archivoDeLaFoto->disco);
        Storage::disk('public')->assertExists($archivoDeLaFoto->ruta_relativa);
        Storage::disk('public')->assertExists((string) $archivoDeLaFoto->ruta_miniatura);
        $this->assertNotNull($foto->json('data.urlMiniatura'));
    }

    /**
     * Un SVG puede llevar código dentro, y esto se enseña a clientes y en
     * la web. Los logos lo siguen admitiendo; la galería, no.
     */
    public function test_un_svg_no_entra_en_la_galeria(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = $this->crearPropiedad('Megafitness');

        $svg = UploadedFile::fake()->createWithContent(
            'plano.svg',
            '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        );

        $this->subir($comercial, $propiedad, $svg)
            ->assertUnprocessable()
            ->assertJsonPath('errores.archivo.0', 'Formatos admitidos: JPG, PNG, WebP, GIF o PDF.');

        $this->assertSame(0, ArchivoMedia::query()->count());
        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    /**
     * El nombre no decide nada: un «foto.png» que por dentro es otra cosa
     * se rechaza.
     */
    public function test_el_tipo_se_decide_por_el_contenido_y_no_por_el_nombre(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = $this->crearPropiedad('Sportbiz');

        $disfrazado = UploadedFile::fake()->createWithContent('foto.png', '<?php echo "hola";');

        $this->subir($comercial, $propiedad, $disfrazado)->assertUnprocessable();

        $this->assertSame(0, ArchivoMedia::query()->count());
    }

    /**
     * Una miniatura que no sirve no tumba la subida de la foto: se
     * descarta y las pantallas usan la foto entera.
     */
    public function test_una_miniatura_rota_se_descarta_sin_fallar(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = $this->crearPropiedad('Copa de Verano');

        $miniaturaRota = UploadedFile::fake()->createWithContent('min.jpg', 'esto no es una imagen');

        $this->subir($comercial, $propiedad, $this->foto(), $miniaturaRota)
            ->assertCreated()
            ->assertJsonPath('data.urlMiniatura', null);
    }

    /* ------------------------------------------------------------------
     | Portada y orden
     |-----------------------------------------------------------------*/

    public function test_la_portada_es_una_sola_y_siempre_una_foto(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = $this->crearPropiedad('Liga de Béisbol');

        $primera = $this->subir($comercial, $propiedad, $this->foto('a.png'))->json('data.id');
        $segunda = $this->subir($comercial, $propiedad, $this->foto('b.png'))->json('data.id');
        $documento = $this->subir($comercial, $propiedad, $this->pdf())->json('data.id');

        $this->actingAs($comercial)
            ->putJson("/api/propiedades/{$propiedad->id}/galeria/{$segunda}/portada")
            ->assertOk();

        $this->assertSame(
            [$segunda],
            ArchivoDePropiedad::query()->where('es_portada', true)->pluck('id')->all(),
        );

        $this->actingAs($comercial)
            ->putJson("/api/propiedades/{$propiedad->id}/galeria/{$documento}/portada")
            ->assertUnprocessable();

        $this->assertFalse(ArchivoDePropiedad::query()->findOrFail($primera)->es_portada);
    }

    public function test_al_borrar_la_portada_la_hereda_la_siguiente_foto(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = $this->crearPropiedad('Maratón');

        $this->subir($comercial, $propiedad, $this->pdf());
        $portada = $this->subir($comercial, $propiedad, $this->foto('a.png'))->json('data.id');
        $siguiente = $this->subir($comercial, $propiedad, $this->foto('b.png'))->json('data.id');

        $this->actingAs($comercial)
            ->deleteJson("/api/propiedades/{$propiedad->id}/galeria/{$portada}")
            ->assertOk();

        // Se salta el PDF, que va antes pero no puede ser portada.
        $this->assertTrue(ArchivoDePropiedad::query()->findOrFail($siguiente)->es_portada);
    }

    /**
     * El orden nuevo trae la galería entera. Si alguien subió o borró
     * algo mientras tanto, se rechaza en vez de dejar una pieza fuera.
     */
    public function test_reordenar_exige_la_galeria_entera(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = $this->crearPropiedad('Vuelta Ciclista');

        $ids = collect(['a.png', 'b.png', 'c.png'])
            ->map(fn (string $nombre): string => $this->subir($comercial, $propiedad, $this->foto($nombre))->json('data.id'))
            ->all();

        $alReves = array_reverse($ids);

        $respuesta = $this->actingAs($comercial)
            ->putJson("/api/propiedades/{$propiedad->id}/galeria/orden", ['ids' => $alReves])
            ->assertOk();

        $this->assertSame($alReves, array_column($respuesta->json('data'), 'id'));

        $this->actingAs($comercial)
            ->putJson("/api/propiedades/{$propiedad->id}/galeria/orden", ['ids' => [$ids[0], $ids[1]]])
            ->assertUnprocessable();
    }

    /**
     * Una pieza se toca desde SU propiedad: con la ruta de otra, 404.
     */
    public function test_no_se_toca_una_pieza_desde_otra_propiedad(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $una = $this->crearPropiedad('Una');
        $otra = $this->crearPropiedad('Otra');

        $pieza = $this->subir($comercial, $una, $this->foto())->json('data.id');

        $this->actingAs($comercial)
            ->deleteJson("/api/propiedades/{$otra->id}/galeria/{$pieza}")
            ->assertNotFound();

        $this->assertSame(1, ArchivoDePropiedad::query()->count());
    }

    /* ------------------------------------------------------------------
     | Borrar
     |-----------------------------------------------------------------*/

    public function test_borrar_una_propiedad_se_lleva_su_galeria_y_sus_ficheros(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin);
        $propiedad = $this->crearPropiedad('Evento que ya pasó');

        $this->subir($administrador, $propiedad, $this->foto(), $this->foto('min.jpg'))->assertCreated();
        $this->subir($administrador, $propiedad, $this->pdf())->assertCreated();

        $this->assertNotEmpty(Storage::disk('public')->allFiles());

        $this->actingAs($administrador)
            ->deleteJson("/api/propiedades/{$propiedad->id}")
            ->assertOk();

        $this->assertSame(0, ArchivoDePropiedad::query()->count());
        $this->assertSame(0, ArchivoMedia::query()->count());
        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    /**
     * La ruta de las imágenes sueltas (logos, web) no sirve para borrar
     * una pieza de la galería: se saltaría los permisos de la propiedad.
     */
    public function test_la_ruta_de_imagenes_sueltas_no_borra_piezas_de_la_galeria(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $propiedad = $this->crearPropiedad('Protegida');

        $this->subir($comercial, $propiedad, $this->foto())->assertCreated();

        $archivo = ArchivoMedia::query()->firstOrFail();

        $this->actingAs($comercial)
            ->deleteJson("/api/media/{$archivo->id}")
            ->assertForbidden();

        $this->assertSame(1, ArchivoDePropiedad::query()->count());
        Storage::disk('public')->assertExists($archivo->ruta_relativa);
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    private function subir(
        User $quien,
        Propiedad $propiedad,
        UploadedFile $archivo,
        ?UploadedFile $miniatura = null,
        ?string $titulo = null,
    ): TestResponse {
        return $this->actingAs($quien)->post(
            "/api/propiedades/{$propiedad->id}/galeria",
            array_filter([
                'archivo' => $archivo,
                'miniatura' => $miniatura,
                'titulo' => $titulo,
            ]),
            ['Accept' => 'application/json'],
        );
    }

    /** Un PNG de un píxel, de verdad: finfo lo reconoce como imagen. */
    private function foto(string $nombre = 'foto.png'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent(
            $nombre,
            base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
        );
    }

    private function pdf(string $nombre = 'dossier.pdf'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent(
            $nombre,
            "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
        );
    }

    private function crearPropiedad(string $nombre): Propiedad
    {
        return Propiedad::create([
            'nombre' => $nombre,
            'monto_total_usd' => 100000,
            'porcentaje_forecast' => 20,
            'asignada_a_todos' => true,
            'orden' => 0,
            'activa' => true,
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
