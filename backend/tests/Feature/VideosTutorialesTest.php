<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\ArchivoMedia;
use App\Models\User;
use App\Models\VideoTutorial;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * La pantalla «Vídeos»: los tutoriales de cada rol.
 * ---------------------------------------------------------------------
 * Lo que tiene que cumplirse siempre:
 *
 *   · El agente ve solo la serie del agente; el comercial, la del agente
 *     y la suya; el administrador, las tres. Lo decide el servidor.
 *   · El vídeo vive en el disco privado y se abre con enlace firmado: sin
 *     la firma no se sirve, aunque se sepa el id.
 *   · Se sirve por trozos (Range → 206), que es lo que pide Safari.
 *   · Importar dos veces no duplica; un fichero nuevo sustituye al viejo
 *     y el viejo se borra del disco.
 *   · Un manifiesto con un fichero que falta no carga nada.
 */
class VideosTutorialesTest extends TestCase
{
    use RefreshDatabase;

    private string $carpeta;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        Storage::fake('local');

        $this->carpeta = sys_get_temp_dir().DIRECTORY_SEPARATOR.'videos-'.uniqid();
        File::ensureDirectoryExists($this->carpeta);

        // El comando necesita un administrador que figure como quien sube.
        $this->crearUsuario(RolUsuario::Admin, 'Gabriel Soto');
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->carpeta);

        parent::tearDown();
    }

    public function test_cada_rol_ve_las_series_que_le_tocan_y_en_orden(): void
    {
        $this->prepararCarpeta([
            ['clave' => 'administrador-01', 'guia' => 'administrador', 'orden' => 1],
            ['clave' => 'comercial-01', 'guia' => 'comercial', 'orden' => 1],
            ['clave' => 'agente-02', 'guia' => 'agente', 'orden' => 2],
            ['clave' => 'agente-01', 'guia' => 'agente', 'orden' => 1],
        ]);
        $this->artisan('videos:importar', ['carpeta' => $this->carpeta])->assertSuccessful();

        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Carla Méndez');
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'Lucía Herrera');
        $admin = User::query()->where('rol', 'admin')->sole();

        $this->assertSame(['agente-01', 'agente-02'], $this->clavesQueVe($agente));
        $this->assertSame(['agente-01', 'agente-02', 'comercial-01'], $this->clavesQueVe($comercial));
        $this->assertSame(['agente-01', 'agente-02', 'comercial-01', 'administrador-01'], $this->clavesQueVe($admin));
    }

    public function test_el_video_va_al_disco_privado_y_solo_se_abre_con_la_firma(): void
    {
        $this->prepararCarpeta([['clave' => 'agente-01', 'guia' => 'agente', 'orden' => 1]]);
        $this->artisan('videos:importar', ['carpeta' => $this->carpeta])->assertSuccessful();

        $video = VideoTutorial::query()->with('archivo')->sole();
        Storage::disk('local')->assertExists($video->archivo->ruta_relativa);
        Storage::disk('public')->assertMissing($video->archivo->ruta_relativa);

        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Carla Méndez');
        $url = (string) $this->actingAs($agente)->getJson('/api/videos')->json('data.0.url');
        $this->assertStringStartsWith('/api/adjuntos/', $url);

        // Con la firma, por trozos: lo que pide Safari para reproducirlo.
        $this->get($url, ['Range' => 'bytes=0-9'])
            ->assertStatus(206)
            ->assertHeader('Content-Type', 'video/mp4')
            ->assertHeader('Content-Range', 'bytes 0-9/'.$video->archivo->tamano_bytes);

        // Sin la firma, nada, aunque se sepa el id.
        $this->get('/api/adjuntos/'.$video->archivo->id)->assertForbidden();
    }

    public function test_importar_otra_vez_no_duplica_y_un_video_nuevo_sustituye_al_viejo(): void
    {
        $this->prepararCarpeta([['clave' => 'agente-01', 'guia' => 'agente', 'orden' => 1]]);
        $this->artisan('videos:importar', ['carpeta' => $this->carpeta])->assertSuccessful();
        $this->artisan('videos:importar', ['carpeta' => $this->carpeta])->assertSuccessful();

        $this->assertSame(1, VideoTutorial::query()->count());
        $viejo = VideoTutorial::query()->with('archivo')->sole()->archivo;

        // Se vuelve a grabar: mismo nombre, otro contenido.
        file_put_contents($this->carpeta.'/agente-01.mp4', $this->mp4('otra toma'));
        $this->artisan('videos:importar', ['carpeta' => $this->carpeta])->assertSuccessful();

        $nuevo = VideoTutorial::query()->with('archivo')->sole()->archivo;
        $this->assertNotSame($viejo->id, $nuevo->id);
        $this->assertNull(ArchivoMedia::query()->find($viejo->id));
        Storage::disk('local')->assertMissing($viejo->ruta_relativa);
    }

    public function test_un_manifiesto_con_un_fichero_que_falta_no_carga_nada(): void
    {
        $this->prepararCarpeta([
            ['clave' => 'agente-01', 'guia' => 'agente', 'orden' => 1],
            ['clave' => 'agente-02', 'guia' => 'agente', 'orden' => 2],
        ]);
        unlink($this->carpeta.'/agente-02.mp4');

        $this->artisan('videos:importar', ['carpeta' => $this->carpeta])->assertFailed();

        $this->assertSame(0, VideoTutorial::query()->count());
    }

    public function test_sin_sesion_no_hay_lista(): void
    {
        $this->getJson('/api/videos')->assertUnauthorized();
    }

    /* ---------------------------------------------------------------- */

    /** @param  list<array{clave: string, guia: string, orden: int}>  $videos */
    private function prepararCarpeta(array $videos): void
    {
        $manifiesto = [];

        foreach ($videos as $video) {
            file_put_contents("{$this->carpeta}/{$video['clave']}.mp4", $this->mp4($video['clave']));
            $manifiesto[] = $video + [
                'titulo' => 'Vídeo '.$video['clave'],
                'descripcion' => 'De qué va.',
                'duracionSegundos' => 150,
                'fichero' => "{$video['clave']}.mp4",
            ];
        }

        file_put_contents("{$this->carpeta}/videos.json", json_encode(['videos' => $manifiesto]));
    }

    /** Lo justo para que finfo lo reconozca como MP4: la caja `ftyp` y datos. */
    private function mp4(string $relleno): string
    {
        $datos = str_pad($relleno, 64, '.');

        return pack('N', 24).'ftypisom'.pack('N', 512).'isomiso2avc1mp41'
            .pack('N', 8 + strlen($datos)).'mdat'.$datos;
    }

    /** @return list<string> */
    private function clavesQueVe(User $persona): array
    {
        return array_column($this->actingAs($persona)->getJson('/api/videos')->assertOk()->json('data'), 'clave');
    }

    private function crearUsuario(RolUsuario $rol, string $nombre): User
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
