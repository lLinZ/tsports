<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\ArchivoMedia;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/**
 * GuardadoDeArchivos — la única puerta por la que un fichero entra al disco.
 * ---------------------------------------------------------------------
 * La usan la subida de logos e imágenes de la web (MediaController), la
 * galería de las propiedades, los adjuntos de la bitácora y los reportes
 * de cierre de mes. Las reglas son las mismas para todos y viven aquí:
 *
 *   · El tipo se decide por el CONTENIDO del fichero, leído con finfo,
 *     nunca por el nombre ni por lo que diga el navegador. Un
 *     «dossier.pdf» que por dentro es otra cosa se rechaza.
 *   · El nombre en disco es aleatorio y la extensión sale de ese tipo
 *     real. Un «plano.php.png» no puede acabar siendo ejecutable.
 *   · Carpeta por propósito y por mes, para que el disco no degenere en
 *     un directorio con decenas de miles de ficheros.
 *   · Qué admite cada propósito, cuánto puede pesar y en qué disco va,
 *     en `reglasDe()`. **Ninguno admite SVG**: un SVG lleva código dentro
 *     y, servido desde /storage, se abre en el mismo origen que el panel,
 *     con acceso a la sesión de quien lo abra. Un agente podría subir un
 *     logo así y pasarle el enlace a un administrador. La regla `image`
 *     de Laravel ya lo rechazaba en /api/media; desde el 2026-10-01 esta
 *     lista lo dice también, para que nadie lo abra por descuido.
 *
 * LOS TRES LÍMITES DE TAMAÑO se suben juntos o no se sube ninguno: el de
 * aquí, el de PHP (deploy/php-tsports.ini) y el de nginx
 * (`client_max_body_size`). Si solo se sube este, nginx o PHP cortan la
 * petición antes de que Laravel la vea y el usuario recibe un error sin
 * explicación.
 */
final class GuardadoDeArchivos
{
    /** Un logo, un avatar o una imagen de la web. */
    public const TAMANO_MAXIMO_DE_IMAGEN_KB = 5 * 1024;

    /**
     * Una foto o un PDF de la galería o de la bitácora. Un dossier
     * comercial con fotos pesa bastante más que una imagen suelta.
     */
    public const TAMANO_MAXIMO_DE_DOCUMENTO_KB = 20 * 1024;

    /** La miniatura que hace el navegador: una de 960 px ronda los 150 KB. */
    public const TAMANO_MAXIMO_DE_MINIATURA_KB = 1024;

    private const IMAGENES = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    ];

    private const PDF = ['application/pdf' => 'pdf'];

    /**
     * Hojas de cálculo, documentos y presentaciones de Office: el reporte
     * de cierre de mes casi siempre es un Excel. Solo para ese propósito;
     * nada de esto se enseña fuera del equipo.
     */
    private const OFFICE = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' => 'pptx',
        'application/vnd.ms-excel' => 'xls',
        'application/msword' => 'doc',
        'application/vnd.ms-powerpoint' => 'ppt',
    ];

    /** Lo único que se acepta como miniatura: lo que sabe hacer un canvas. */
    private const TIPOS_DE_MINIATURA = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];

    /**
     * @return array{disco: string, tipos: array<string,string>, maximoKb: int, formatos: string}
     */
    public static function reglasDe(string $proposito): array
    {
        return match ($proposito) {
            ArchivoMedia::PROPOSITO_LOGO_MARCA,
            ArchivoMedia::PROPOSITO_CONTENIDO_WEB,
            ArchivoMedia::PROPOSITO_AVATAR => [
                'disco' => ArchivoMedia::DISCO_PUBLICO,
                'tipos' => self::IMAGENES,
                'maximoKb' => self::TAMANO_MAXIMO_DE_IMAGEN_KB,
                'formatos' => 'JPG, PNG, WebP o GIF',
            ],
            // Pública porque está hecha para enseñarse, también en la web.
            ArchivoMedia::PROPOSITO_GALERIA_PROPIEDAD => [
                'disco' => ArchivoMedia::DISCO_PUBLICO,
                'tipos' => self::IMAGENES + self::PDF,
                'maximoKb' => self::TAMANO_MAXIMO_DE_DOCUMENTO_KB,
                'formatos' => 'JPG, PNG, WebP, GIF o PDF',
            ],
            // Privada: es de una marca, y la marca no la ve todo el equipo.
            ArchivoMedia::PROPOSITO_ADJUNTO_COMENTARIO => [
                'disco' => ArchivoMedia::DISCO_PRIVADO,
                'tipos' => self::IMAGENES + self::PDF,
                'maximoKb' => self::TAMANO_MAXIMO_DE_DOCUMENTO_KB,
                'formatos' => 'JPG, PNG, WebP, GIF o PDF',
            ],
            // Privada: es un reporte interno de la agencia.
            ArchivoMedia::PROPOSITO_CIERRE_DE_MES => [
                'disco' => ArchivoMedia::DISCO_PRIVADO,
                'tipos' => self::PDF + self::OFFICE + self::IMAGENES,
                'maximoKb' => self::TAMANO_MAXIMO_DE_DOCUMENTO_KB,
                'formatos' => 'PDF, Excel, Word, PowerPoint o una imagen',
            ],
            default => throw new RuntimeException("Propósito de fichero desconocido: {$proposito}"),
        };
    }

    /**
     * Guarda el fichero y deja constancia en `archivos_media`.
     *
     * La miniatura es opcional y nunca hace fallar la subida: si llega
     * rota o con un tipo raro se descarta, y las pantallas usan la foto
     * entera.
     *
     * @throws ValidationException si el contenido no es de un tipo admitido.
     */
    public function guardar(
        UploadedFile $fichero,
        string $proposito,
        User $quienSube,
        ?UploadedFile $miniatura = null,
    ): ArchivoMedia {
        $reglas = self::reglasDe($proposito);

        $tipoReal = self::tipoReal($fichero);

        if ($tipoReal === null || ! isset($reglas['tipos'][$tipoReal])) {
            throw ValidationException::withMessages([
                'archivo' => 'Formatos admitidos: '.$reglas['formatos'].'.',
            ]);
        }

        $carpeta = $proposito.'/'.now()->format('Y-m');
        $nombreBase = Str::uuid()->toString();

        $ruta = $fichero->storeAs($carpeta, $nombreBase.'.'.$reglas['tipos'][$tipoReal], $reglas['disco']);

        if ($ruta === false) {
            throw new RuntimeException('No se pudo escribir el fichero en el disco.');
        }

        $rutaDeLaMiniatura = $miniatura !== null && str_starts_with($tipoReal, 'image/')
            ? $this->guardarMiniatura($miniatura, $carpeta, $nombreBase, $reglas['disco'])
            : null;

        return ArchivoMedia::create([
            'ruta_relativa' => $ruta,
            'disco' => $reglas['disco'],
            'ruta_miniatura' => $rutaDeLaMiniatura,
            'nombre_original' => self::nombreLimpio($fichero->getClientOriginalName()),
            'tipo_mime' => $tipoReal,
            'tamano_bytes' => (int) $fichero->getSize(),
            'proposito' => $proposito,
            'subido_por_id' => $quienSube->id,
        ]);
    }

    private function guardarMiniatura(
        UploadedFile $miniatura,
        string $carpeta,
        string $nombreBase,
        string $disco,
    ): ?string {
        $tipoReal = self::tipoReal($miniatura);

        if ($tipoReal === null
            || ! isset(self::TIPOS_DE_MINIATURA[$tipoReal])
            || $miniatura->getSize() > self::TAMANO_MAXIMO_DE_MINIATURA_KB * 1024) {
            return null;
        }

        $ruta = $miniatura->storeAs(
            $carpeta,
            $nombreBase.'-miniatura.'.self::TIPOS_DE_MINIATURA[$tipoReal],
            $disco,
        );

        return $ruta === false ? null : $ruta;
    }

    /**
     * El tipo que dice el CONTENIDO del fichero.
     *
     * Se lee con finfo directamente y no con `getMimeType()`: ese, en los
     * ficheros de prueba de Laravel, se fía del nombre, y aquí lo que se
     * quiere comprobar es justo lo que el nombre no garantiza.
     */
    private static function tipoReal(UploadedFile $fichero): ?string
    {
        $ruta = $fichero->getRealPath();

        if ($ruta === false || ! is_file($ruta)) {
            return null;
        }

        $tipo = (new \finfo(FILEINFO_MIME_TYPE))->file($ruta);

        if (! is_string($tipo)) {
            return null;
        }

        $tipo = strtolower($tipo);

        // Un Excel, un Word o un PowerPoint modernos son un ZIP por dentro.
        // finfo los reconoce por la primera pieza del ZIP, y algunos
        // programas (exportar desde Google, por ejemplo) las guardan en
        // otro orden: ahí dice «zip» a secas. Se mira entonces qué piezas
        // lleva dentro, que sigue siendo el contenido y no el nombre.
        if (in_array($tipo, ['application/zip', 'application/octet-stream'], true)) {
            return self::tipoDeOfficeDentroDelZip($ruta) ?? $tipo;
        }

        return $tipo;
    }

    /**
     * El tipo de Office de un ZIP, por las piezas que lleva: un .xlsx
     * tiene `xl/workbook.xml`, un .docx `word/document.xml` y un .pptx
     * `ppt/presentation.xml`, además del `[Content_Types].xml` de todos.
     */
    private static function tipoDeOfficeDentroDelZip(string $ruta): ?string
    {
        if (! class_exists(\ZipArchive::class)) {
            return null;
        }

        $zip = new \ZipArchive();

        if ($zip->open($ruta, \ZipArchive::RDONLY) !== true) {
            return null;
        }

        try {
            if ($zip->locateName('[Content_Types].xml') === false) {
                return null;
            }

            return match (true) {
                $zip->locateName('xl/workbook.xml') !== false => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                $zip->locateName('word/document.xml') !== false => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                $zip->locateName('ppt/presentation.xml') !== false => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                default => null,
            };
        } finally {
            $zip->close();
        }
    }

    /**
     * El nombre con el que se subió, para enseñarlo y para la descarga.
     * Nunca se usa en el disco; aquí solo se le quitan las barras y los
     * caracteres de control, que no pintan nada en un nombre y romperían
     * la cabecera de la descarga.
     */
    private static function nombreLimpio(string $nombreOriginal): string
    {
        $sinRuta = basename(str_replace('\\', '/', $nombreOriginal));
        $sinControl = preg_replace('/[\x00-\x1F\x7F]/u', '', $sinRuta) ?? '';

        $limpio = trim($sinControl);

        return mb_substr($limpio !== '' ? $limpio : 'archivo', 0, 200);
    }
}
