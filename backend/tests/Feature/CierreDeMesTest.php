<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Events\CambioEnLosDatos;
use App\Events\NotificacionNueva;
use App\Models\CierreDeMes;
use App\Models\RegistroActividad;
use App\Models\User;
use App\Support\CambiosEnVivo;
use Carbon\CarbonImmutable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * «Cierre de mes»: los reportes que el comercial sube al acabar cada mes.
 * ---------------------------------------------------------------------
 * Lo que tiene que cumplirse siempre:
 *
 *   · Lo ven y lo suben admin y comercial; el agente, ni lo uno ni lo
 *     otro.
 *   · El fichero entra por GuardadoDeArchivos (regla 21): el tipo se mira
 *     por el contenido, va al disco privado y se abre con enlace firmado.
 *   · Borrar es de quien lo subió y del administrador.
 *   · Subir y borrar quedan en la auditoría, y el aviso de «cambiaron los
 *     datos» solo le llega a quien ve los cierres.
 */
class CierreDeMesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        Storage::fake('local');

        $this->travelTo(CarbonImmutable::parse('2026-10-01 15:00:00', 'UTC'));
    }

    public function test_el_comercial_sube_su_reporte_y_queda_en_su_mes(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'Homero Perozo');

        $respuesta = $this->subir($comercial, $this->pdf('Cierre septiembre.pdf'), '2026-09')
            ->assertCreated()
            ->assertJsonPath('data.mes', '2026-09')
            // Sin título, el del fichero sin la extensión.
            ->assertJsonPath('data.titulo', 'Cierre septiembre')
            ->assertJsonPath('data.subidoPor', 'Homero Perozo')
            ->assertJsonPath('data.archivo.formato', 'pdf')
            ->assertJsonPath('data.puedoEliminarlo', true);

        // Privado: sin dirección pública, solo el enlace firmado.
        $this->assertStringStartsWith('/api/adjuntos/', (string) $respuesta->json('data.archivo.url'));

        $cierre = CierreDeMes::query()->with('archivo')->sole();
        Storage::disk('local')->assertExists($cierre->archivo->ruta_relativa);
        Storage::disk('public')->assertMissing($cierre->archivo->ruta_relativa);

        $this->actingAs($comercial)
            ->getJson('/api/cierres-de-mes')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->assertDatabaseHas('registros_actividad', [
            'entidad_tipo' => 'cierre_de_mes',
            'descripcion' => 'Subió el cierre de septiembre de 2026: Cierre septiembre',
        ]);
    }

    public function test_el_agente_no_ve_ni_sube_cierres(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Agente');

        $this->actingAs($agente)->getJson('/api/cierres-de-mes')->assertForbidden();
        $this->subir($agente, $this->pdf(), '2026-09')->assertForbidden();

        $this->assertSame(0, CierreDeMes::query()->count());
    }

    public function test_salen_del_mes_mas_reciente_al_mas_antiguo(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin, 'Admin');

        $this->subir($administrador, $this->pdf('Agosto.pdf'), '2026-08')->assertCreated();
        $this->subir($administrador, $this->pdf('Septiembre.pdf'), '2026-09')->assertCreated();
        $this->subir($administrador, $this->pdf('Julio.pdf'), '2026-07')->assertCreated();

        $meses = array_column(
            $this->actingAs($administrador)->getJson('/api/cierres-de-mes')->json('data'),
            'mes',
        );

        $this->assertSame(['2026-09', '2026-08', '2026-07'], $meses);
    }

    /**
     * Un Excel se reconoce por lo que lleva dentro. Un fichero que se
     * llama .xlsx y no lo es se rechaza, igual que un PDF falso.
     */
    public function test_un_excel_se_acepta_por_su_contenido_y_uno_falso_no(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'Comercial');

        $this->subir($comercial, $this->excel('Ventas septiembre.xlsx'), '2026-09')
            ->assertCreated()
            ->assertJsonPath('data.archivo.formato', 'hoja');

        $this->subir(
            $comercial,
            UploadedFile::fake()->createWithContent('Ventas.xlsx', '<?php echo "hola";'),
            '2026-09',
        )->assertUnprocessable()->assertJsonValidationErrors('archivo', 'errores');

        $this->assertSame(1, CierreDeMes::query()->count());
    }

    public function test_el_enlace_firmado_abre_el_reporte_y_sin_firma_no(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'Comercial');

        $datos = $this->subir($comercial, $this->pdf('Cierre.pdf'), '2026-09')->json('data');

        $this->get($datos['archivo']['url'])->assertOk();

        $disposicion = (string) $this->get($datos['archivo']['urlDescarga'])->assertOk()->headers->get('Content-Disposition');
        $this->assertStringContainsString('attachment', $disposicion);
        $this->assertStringContainsString('Cierre.pdf', $disposicion);

        $idDelArchivo = CierreDeMes::query()->sole()->archivo_media_id;
        $this->get("/api/adjuntos/{$idDelArchivo}")->assertForbidden();
    }

    public function test_un_mes_que_no_ha_empezado_se_rechaza(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'Comercial');

        $this->subir($comercial, $this->pdf(), '2026-11')
            ->assertUnprocessable()
            ->assertJsonPath('errores.mes.0', 'Ese mes todavía no ha empezado.');

        // El mes en curso sí vale: hay quien lo adelanta.
        $this->subir($comercial, $this->pdf(), '2026-10')->assertCreated();
    }

    public function test_solo_quien_lo_subio_o_el_administrador_lo_borra(): void
    {
        $homero = $this->crearUsuario(RolUsuario::Comercial, 'Homero');
        $edgar = $this->crearUsuario(RolUsuario::Comercial, 'Edgar');
        $administrador = $this->crearUsuario(RolUsuario::Admin, 'Admin');

        $delDeHomero = $this->subir($homero, $this->pdf('De Homero.pdf'), '2026-09')->json('data.id');
        $otroDeHomero = $this->subir($homero, $this->pdf('Otro de Homero.pdf'), '2026-09')->json('data.id');

        // Edgar lo ve, pero no puede borrarlo.
        $this->actingAs($edgar)
            ->getJson('/api/cierres-de-mes')
            ->assertJsonPath('data.0.puedoEliminarlo', false);
        $this->actingAs($edgar)->deleteJson("/api/cierres-de-mes/{$delDeHomero}")->assertForbidden();

        // Homero borra el suyo, y el fichero se va con él.
        $ruta = CierreDeMes::query()->with('archivo')->findOrFail($delDeHomero)->archivo->ruta_relativa;
        $this->actingAs($homero)->deleteJson("/api/cierres-de-mes/{$delDeHomero}")->assertOk();
        Storage::disk('local')->assertMissing($ruta);
        $this->assertDatabaseMissing('archivos_media', ['ruta_relativa' => $ruta]);

        // Y el administrador puede con cualquiera.
        $this->actingAs($administrador)->deleteJson("/api/cierres-de-mes/{$otroDeHomero}")->assertOk();

        $this->assertSame(0, CierreDeMes::query()->count());
        $this->assertSame(2, RegistroActividad::query()->where('accion', RegistroActividad::ACCION_ELIMINO)->count());
    }

    public function test_el_aviso_en_vivo_solo_le_llega_a_quien_ve_los_cierres(): void
    {
        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'clave-de-prueba',
            'broadcasting.connections.reverb.secret' => 'secreto-de-prueba',
            'broadcasting.connections.reverb.app_id' => 'app-de-prueba',
        ]);
        Event::fake([CambioEnLosDatos::class, NotificacionNueva::class]);

        $administrador = $this->crearUsuario(RolUsuario::Admin, 'Admin');
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'Comercial');
        $this->crearUsuario(RolUsuario::Vendedor, 'Agente');
        $this->app->make(CambiosEnVivo::class)->descartar();

        $this->subir($comercial, $this->pdf(), '2026-09')->assertCreated();

        $esperados = ['private-usuario.'.$administrador->id, 'private-usuario.'.$comercial->id];
        sort($esperados);

        Event::assertDispatched(
            CambioEnLosDatos::class,
            function (CambioEnLosDatos $aviso) use ($esperados): bool {
                $canales = array_map(fn ($canal): string => $canal->name, $aviso->broadcastOn());
                sort($canales);

                return $canales === $esperados
                    && $aviso->broadcastWith()['cambios'] === [['entidad' => 'cierres', 'id' => null]];
            },
        );
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    private function subir(User $quien, UploadedFile $archivo, string $mes): TestResponse
    {
        return $this->actingAs($quien)->post(
            '/api/cierres-de-mes',
            ['archivo' => $archivo, 'mes' => $mes],
            ['Accept' => 'application/json'],
        );
    }

    private function pdf(string $nombre = 'reporte.pdf'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent(
            $nombre,
            "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
        );
    }

    /**
     * Un .xlsx mínimo de verdad: un ZIP con las piezas de un libro de
     * Excel. Se arma a mano, sin ZipArchive, porque la extensión no está
     * en todas las máquinas donde corren estas pruebas.
     */
    private function excel(string $nombre): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($nombre, self::zipSinComprimir([
            '[Content_Types].xml' => '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
            '_rels/.rels' => '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
            'xl/workbook.xml' => '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>',
        ]));
    }

    /**
     * @param  array<string,string>  $ficheros
     */
    private static function zipSinComprimir(array $ficheros): string
    {
        $cuerpo = '';
        $directorio = '';

        foreach ($ficheros as $nombre => $contenido) {
            $desplazamiento = strlen($cuerpo);
            $crc = crc32($contenido);
            $tamano = strlen($contenido);

            $cuerpo .= pack('VvvvvvVVVvv', 0x04034B50, 20, 0, 0, 0, 0, $crc, $tamano, $tamano, strlen($nombre), 0)
                .$nombre.$contenido;

            $directorio .= pack('VvvvvvvVVVvvvvvVV', 0x02014B50, 20, 20, 0, 0, 0, 0, $crc, $tamano, $tamano, strlen($nombre), 0, 0, 0, 0, 0, $desplazamiento)
                .$nombre;
        }

        return $cuerpo.$directorio
            .pack('VvvvvVVv', 0x06054B50, 0, 0, count($ficheros), count($ficheros), strlen($directorio), strlen($cuerpo), 0);
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
